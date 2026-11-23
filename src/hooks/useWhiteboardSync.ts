import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  Unsubscribe,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import {
  auth,
  db,
  handleFirestoreError,
  isPermissionError,
  isQuotaError,
  OperationType,
  sanitizeElementsForFirestore,
  signInAnonymousSession,
  signInWithGoogle,
  signInWithGoogleRedirect,
  signOutGoogle,
} from '../lib/firebase';
import { P2PConnectionState, RoomPeerBridge } from '../lib/peerSync';
import {
  BUILTIN_TEMPLATES,
  CanvasElement,
  createId,
  FlipchartPage,
  generateRoomCode,
  MAX_ELEMENTS_PER_PAGE,
  MAX_PAGES,
  MAX_TEMPLATE_BLOCKS,
  PaperBackground,
  QuickTemplate,
  sanitizeId,
  ViewMode,
} from '../types/whiteboard';

const LOCAL_STORAGE_PREFIX = 'flipcast_room_v1_';
const LOCAL_TEMPLATES_KEY = 'flipcast_custom_templates_v1';
const LAST_ROOM_KEY = 'flipcast_last_room_id';
const BOARD_DEVICE_ID_KEY = 'flipcast_board_device_id';

function getOrCreateBoardDeviceId(): string {
  try {
    const existing = sanitizeId(sessionStorage.getItem(BOARD_DEVICE_ID_KEY) || '', 48);
    if (existing.length >= 6) return existing;
    const generated = createId('dev').slice(0, 48);
    sessionStorage.setItem(BOARD_DEVICE_ID_KEY, generated);
    return generated;
  } catch {
    return createId('dev').slice(0, 48);
  }
}

interface PersistedRoomLocal {
  roomId: string;
  title: string;
  activePageId: string;
  pages: FlipchartPage[];
  updatedAtMs: number;
}

interface BroadcastPacket {
  senderId: string;
  type: 'state' | 'liveStroke';
  roomId: string;
  payload: unknown;
}

export type CloudSyncState =
  | 'local'
  | 'connecting'
  | 'synced'
  | 'room-not-found'
  | 'error';

const localRoomMemoryCache = new Map<string, { raw: string; data: PersistedRoomLocal }>();
let customTemplatesMemoryCache: { raw: string; data: QuickTemplate[] } | null = null;

function createInitialPage(index = 0): FlipchartPage {
  return {
    pageId: index === 0 ? 'lembar-1' : createId('lembar'),
    name: `Lembar ${index + 1}`,
    background: 'white',
    order: index,
    elements: [],
    updatedAtMs: Date.now(),
  };
}

function loadLocalRoom(roomId: string): PersistedRoomLocal {
  try {
    const raw = localStorage.getItem(`${LOCAL_STORAGE_PREFIX}${roomId}`);
    if (raw) {
      const cached = localRoomMemoryCache.get(roomId);
      if (cached && cached.raw === raw) {
        return cached.data;
      }
      const parsed = JSON.parse(raw) as PersistedRoomLocal;
      if (Array.isArray(parsed.pages) && parsed.pages.length > 0) {
        const normalized: PersistedRoomLocal = {
          roomId,
          title: parsed.title || 'Sesi Papan Tulis',
          activePageId: parsed.activePageId || parsed.pages[0].pageId,
          pages: parsed.pages,
          updatedAtMs: parsed.updatedAtMs || Date.now(),
        };
        localRoomMemoryCache.set(roomId, { raw, data: normalized });
        return normalized;
      }
    }
  } catch {
    // Ignore corrupt localStorage
  }

  const first = createInitialPage(0);
  return {
    roomId,
    title: 'Sesi Papan Tulis',
    activePageId: first.pageId,
    pages: [first],
    updatedAtMs: Date.now(),
  };
}

function loadCustomTemplatesLocal(): QuickTemplate[] {
  try {
    const raw = localStorage.getItem(LOCAL_TEMPLATES_KEY);
    if (raw) {
      if (customTemplatesMemoryCache && customTemplatesMemoryCache.raw === raw) {
        return customTemplatesMemoryCache.data;
      }
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        customTemplatesMemoryCache = { raw, data: parsed };
        return parsed;
      }
    }
  } catch {
    // Ignore
  }
  return [];
}

function isTouchMobileOrTabletDevice(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  if (/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile|Tablet/i.test(ua)) {
    return true;
  }
  // iPadOS 13+ reports Macintosh UA with multi-touch support
  if (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) {
    return true;
  }
  // Primary coarse pointer (touch/stylus-first devices) on tablet/phone viewport widths
  if (window.matchMedia?.('(pointer: coarse)').matches && window.innerWidth <= 1280) {
    return true;
  }
  return false;
}

function parseUrlParams(): { viewMode: ViewMode; roomId: string } {
  const params = new URLSearchParams(window.location.search);
  const rawView = (params.get('view') || '').toLowerCase();
  let viewMode: ViewMode;
  if (rawView === 'tablet' || rawView === 'remote') {
    viewMode = 'tablet';
  } else if (rawView === 'extend') {
    viewMode = 'extend';
  } else if (rawView === 'projector' || rawView === 'main' || rawView === 'slides') {
    viewMode = 'projector';
  } else {
    // Auto-detect: Phone / Tablet opens directly as Remote; Laptop / PC opens as Main Projector
    viewMode = isTouchMobileOrTabletDevice() ? 'tablet' : 'projector';
  }

  const rawRoom = sanitizeId(params.get('room') || '', 32).toUpperCase();
  if (rawRoom.length >= 4) {
    try {
      localStorage.setItem(LAST_ROOM_KEY, rawRoom);
    } catch {
      // Ignore
    }
    return { viewMode, roomId: rawRoom };
  }

  let savedRoom = '';
  try {
    savedRoom = sanitizeId(localStorage.getItem(LAST_ROOM_KEY) || '', 32).toUpperCase();
  } catch {
    // Ignore
  }

  const roomId = savedRoom.length >= 4 ? savedRoom : generateRoomCode();
  try {
    localStorage.setItem(LAST_ROOM_KEY, roomId);
  } catch {
    // Ignore
  }
  return { viewMode, roomId };
}

export function useWhiteboardSync() {
  const initial = useMemo(() => parseUrlParams(), []);
  const boardDeviceIdRef = useRef<string>(getOrCreateBoardDeviceId());
  const clientInstanceId = boardDeviceIdRef;

  const [viewMode, setViewMode] = useState<ViewMode>(initial.viewMode);
  const [roomId, setRoomId] = useState<string>(initial.roomId);

  const initialRoomData = useMemo(() => loadLocalRoom(initial.roomId), [initial.roomId]);

  const [roomTitle, setRoomTitle] = useState<string>(initialRoomData.title);
  const [pages, setPages] = useState<FlipchartPage[]>(initialRoomData.pages);
  const [activePageId, setActivePageId] = useState<string>(initialRoomData.activePageId);

  // Tablet Live Broadcast toggle (ON = syncs immediately to Projector, OFF = local draft)
  const [isLiveBroadcast, setIsLiveBroadcast] = useState<boolean>(true);

  // Laptop Mirror vs Direct Edit toggle
  const [laptopCanEdit, setLaptopCanEdit] = useState<boolean>(true);

  // Remote live in-progress stroke preview & active signal from another boardDeviceId
  const [remoteLiveElement, setRemoteLiveElement] = useState<CanvasElement | null>(null);
  const [remoteLivePageId, setRemoteLivePageId] = useState<string | null>(null);
  const [isRemoteTransmitting, setIsRemoteTransmitting] = useState<boolean>(false);
  const remoteSignalTimerRef = useRef<number | null>(null);

  // Per-page Undo & Redo history stacks
  const [undoStacks, setUndoStacks] = useState<Record<string, CanvasElement[][]>>({});
  const [redoStacks, setRedoStacks] = useState<Record<string, CanvasElement[][]>>({});

  // Firebase Auth & Cloud sync state (Zero-email automatic Anonymous Auth + optional Google)
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState<boolean>(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [anonymousProviderDisabled, setAnonymousProviderDisabled] = useState<boolean>(false);
  const [syncNonce, setSyncNonce] = useState<number>(0);
  const [cloudState, setCloudState] = useState<CloudSyncState>('connecting');
  const [cloudMessage, setCloudMessage] = useState<string>('Menyiapkan koneksi cloud otomatis...');
  const [p2pState, setP2pState] = useState<P2PConnectionState>('initializing');
  const [p2pPeerCount, setP2pPeerCount] = useState<number>(0);
  const [p2pMessage, setP2pMessage] = useState<string>('Menyiapkan koneksi langsung...');
  const [lastHostSyncedAt, setLastHostSyncedAt] = useState<number>(0);
  const [roomOwnerId, setRoomOwnerId] = useState<string | null>(null);
  const [customTemplates, setCustomTemplates] = useState<QuickTemplate[]>(() =>
    loadCustomTemplatesLocal()
  );

  // Refs to prevent stale closures and feedback loops
  const pagesRef = useRef(pages);
  pagesRef.current = pages;
  const activePageIdRef = useRef(activePageId);
  activePageIdRef.current = activePageId;
  const isLiveBroadcastRef = useRef(isLiveBroadcast);
  isLiveBroadcastRef.current = isLiveBroadcast;
  const roomOwnerIdRef = useRef(roomOwnerId);
  roomOwnerIdRef.current = roomOwnerId;
  const cloudStateRef = useRef(cloudState);
  cloudStateRef.current = cloudState;
  const userRef = useRef(user);
  userRef.current = user;
  const roomTitleRef = useRef(roomTitle);
  roomTitleRef.current = roomTitle;

  const anonAttemptedRef = useRef<boolean>(false);
  const channelRef = useRef<BroadcastChannel | null>(null);
  const peerBridgeRef = useRef<RoomPeerBridge | null>(null);
  const lastLiveStrokePushRef = useRef<number>(0);
  const lastPeerLiveStrokePushRef = useRef<number>(0);

  const pulseRemoteSignal = useCallback(() => {
    setIsRemoteTransmitting(true);
    if (remoteSignalTimerRef.current !== null) {
      window.clearTimeout(remoteSignalTimerRef.current);
    }
    remoteSignalTimerRef.current = window.setTimeout(() => {
      setIsRemoteTransmitting(false);
    }, 8000);
  }, []);

  useEffect(() => {
    return () => {
      if (remoteSignalTimerRef.current !== null) {
        window.clearTimeout(remoteSignalTimerRef.current);
      }
    };
  }, []);

  // Sync URL query params cleanly without full page reload (strip anti-cache &v after load)
  useEffect(() => {
    const url = new URL(window.location.href);
    url.searchParams.set('room', roomId);
    url.searchParams.delete('v');
    if (viewMode === 'projector' && !isTouchMobileOrTabletDevice()) {
      url.searchParams.delete('view');
    } else {
      url.searchParams.set('view', viewMode);
    }
    window.history.replaceState({}, '', url.toString());
    try {
      localStorage.setItem(LAST_ROOM_KEY, roomId);
    } catch {
      // Ignore
    }
  }, [roomId, viewMode]);

  // Listen to Firebase Auth state
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setAuthReady(true);
      if (u) {
        setAnonymousProviderDisabled(false);
        setAuthError(null);
      }
    });
    return () => unsub();
  }, []);

  // Automatically create an invisible anonymous Firebase session (no email/login required)
  const ensureAnonymousSession = useCallback(async () => {
    if (auth.currentUser) return true;
    setCloudState('connecting');
    setCloudMessage('Menyambungkan sesi cloud otomatis tanpa login...');
    try {
      await signInAnonymousSession();
      setAnonymousProviderDisabled(false);
      setAuthError(null);
      return true;
    } catch (error: unknown) {
      const code =
        typeof error === 'object' && error !== null && 'code' in error
          ? String((error as { code?: unknown }).code || '')
          : '';
      if (
        code === 'auth/admin-restricted-operation' ||
        code === 'auth/operation-not-allowed'
      ) {
        setAnonymousProviderDisabled(true);
        setCloudState('local');
        setCloudMessage(
          'Mode Anonim belum diaktifkan di Firebase Console. Aktifkan Anonymous di Authentication → Sign-in method (1 klik) agar langsung konek tanpa email.'
        );
      } else {
        setCloudState('local');
        setCloudMessage('Belum tersambung ke cloud. Periksa koneksi internet lalu coba sambung ulang.');
      }
      return false;
    }
  }, []);

  useEffect(() => {
    if (!authReady || user) return;
    if (anonAttemptedRef.current) return;
    anonAttemptedRef.current = true;
    void ensureAnonymousSession();
  }, [authReady, user, ensureAnonymousSession]);

  // Persist local room state
  const saveToLocal = useCallback(
    (nextPages: FlipchartPage[], nextActiveId: string, overrides?: Partial<PersistedRoomLocal>) => {
      const snapshot: PersistedRoomLocal = {
        roomId,
        title: overrides?.title ?? roomTitleRef.current,
        activePageId: nextActiveId,
        pages: nextPages,
        updatedAtMs: Date.now(),
      };
      try {
        localStorage.setItem(`${LOCAL_STORAGE_PREFIX}${roomId}`, JSON.stringify(snapshot));
      } catch {
        // Ignore storage quota errors
      }
      return snapshot;
    },
    [roomId]
  );

  // BroadcastChannel for zero-latency local multi-tab sync (e.g. ?view=extend on 2nd monitor)
  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return;
    const ch = new BroadcastChannel(`flipcast-sync-${roomId}`);
    channelRef.current = ch;

    ch.onmessage = (event: MessageEvent<BroadcastPacket>) => {
      const msg = event.data;
      if (!msg || msg.senderId === clientInstanceId.current || msg.roomId !== roomId) return;

      // In Tablet Draft mode (Live OFF), ignore incoming overwrites to avoid clobbering local draft
      if (viewMode === 'tablet' && !isLiveBroadcastRef.current) return;

      if (msg.type === 'state') {
        const incoming = msg.payload as PersistedRoomLocal;
        if (incoming && Array.isArray(incoming.pages) && incoming.pages.length > 0) {
          setPages(incoming.pages);
          setActivePageId(incoming.activePageId);
          setRoomTitle(incoming.title);
          setRemoteLiveElement(null);
        }
      } else if (msg.type === 'liveStroke') {
        const live = msg.payload as { pageId: string; element: CanvasElement | null };
        setRemoteLivePageId(live.pageId);
        setRemoteLiveElement(live.element);
      }
    };

    return () => {
      ch.close();
      channelRef.current = null;
    };
  }, [roomId, viewMode]);

  const broadcastLocalState = useCallback(
    (snapshot: PersistedRoomLocal) => {
      if (viewMode === 'tablet' && !isLiveBroadcastRef.current) return;
      channelRef.current?.postMessage({
        senderId: boardDeviceIdRef.current,
        type: 'state',
        roomId,
        payload: snapshot,
      } satisfies BroadcastPacket);
      peerBridgeRef.current?.sendState(snapshot);
    },
    [roomId, viewMode]
  );

  // Direct WebRTC P2P Real-Time Bridge (Zero email, zero login, works across Wi-Fi & 4G/5G)
  // PC/Laptop ('projector') acts as Host; Tablet/HP ('tablet') and remote Extend ('extend') connect directly to Host.
  useEffect(() => {
    const role: 'host' | 'client' = viewMode === 'projector' ? 'host' : 'client';
    const bridge = new RoomPeerBridge({
      roomId,
      role,
      deviceId: boardDeviceIdRef.current,
      getSnapshot: () => ({
        roomId,
        title: roomTitleRef.current,
        activePageId: activePageIdRef.current,
        pages: pagesRef.current,
        updatedAtMs: Date.now(),
      }),
      onStateChange: (nextState, count, detail) => {
        setP2pState(nextState);
        setP2pPeerCount(count);
        setP2pMessage(detail);
      },
      onReceiveHostSync: (incoming) => {
        // Initial handshake from PC/Laptop Host always loads the active board on Tablet/HP immediately
        if (!incoming || !Array.isArray(incoming.pages) || incoming.pages.length === 0) return;
        setPages(incoming.pages);
        setActivePageId(incoming.activePageId || incoming.pages[0].pageId);
        setRoomTitle(incoming.title || 'Sesi Papan Tulis');
        setRemoteLiveElement(null);
        setLastHostSyncedAt(Date.now());
        const saved = saveToLocal(incoming.pages, incoming.activePageId || incoming.pages[0].pageId, {
          title: incoming.title,
        });
        channelRef.current?.postMessage({
          senderId: boardDeviceIdRef.current,
          type: 'state',
          roomId,
          payload: saved,
        } satisfies BroadcastPacket);
      },
      onReceiveState: (incoming) => {
        if (viewMode === 'tablet' && !isLiveBroadcastRef.current) return;
        if (!incoming || !Array.isArray(incoming.pages) || incoming.pages.length === 0) return;
        pulseRemoteSignal();
        setPages(incoming.pages);
        setActivePageId(incoming.activePageId || incoming.pages[0].pageId);
        setRoomTitle(incoming.title || 'Sesi Papan Tulis');
        setRemoteLiveElement(null);
        const saved = saveToLocal(incoming.pages, incoming.activePageId || incoming.pages[0].pageId, {
          title: incoming.title,
        });
        // Forward immediately to same-PC Extend window (Monitor 2) via BroadcastChannel
        channelRef.current?.postMessage({
          senderId: boardDeviceIdRef.current,
          type: 'state',
          roomId,
          payload: saved,
        } satisfies BroadcastPacket);
      },
      onReceiveLiveStroke: (pageId, element) => {
        if (viewMode === 'tablet' && !isLiveBroadcastRef.current) return;
        if (element) {
          pulseRemoteSignal();
        }
        setRemoteLivePageId(pageId);
        setRemoteLiveElement(element);
        channelRef.current?.postMessage({
          senderId: boardDeviceIdRef.current,
          type: 'liveStroke',
          roomId,
          payload: { pageId, element },
        } satisfies BroadcastPacket);
      },
    });

    peerBridgeRef.current = bridge;
    return () => {
      bridge.destroy();
      if (peerBridgeRef.current === bridge) {
        peerBridgeRef.current = null;
      }
    };
  }, [roomId, viewMode, syncNonce, saveToLocal, pulseRemoteSignal]);

  // Load user's private custom templates from Firestore when authenticated (anonymous or Google)
  useEffect(() => {
    if (!authReady || !user) return;

    const tplPath = `users/${user.uid}/templates`;
    const q = query(collection(db, tplPath), where('userId', '==', user.uid));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const fetched: QuickTemplate[] = snap.docs.map((d) => {
          const data = d.data();
          return {
            templateId: String(data.templateId || d.id),
            title: String(data.title || 'Template'),
            category: String(data.category || 'Kustom'),
            background: (data.background as PaperBackground) || 'white',
            blocks: Array.isArray(data.blocks) ? data.blocks : [],
          };
        });
        setCustomTemplates(fetched);
        try {
          localStorage.setItem(LOCAL_TEMPLATES_KEY, JSON.stringify(fetched));
        } catch {
          // Ignore
        }
      },
      (error) => {
        if (!isPermissionError(error) && !isQuotaError(error)) {
          handleFirestoreError(error, OperationType.LIST, tplPath);
        }
      }
    );
    return () => unsub();
  }, [authReady, user]);

  // Firestore Room + Pages + LiveStroke Real-Time Synchronization (Zero Email, Zero PIN)
  useEffect(() => {
    if (!authReady) {
      setCloudState('connecting');
      setCloudMessage('Menyiapkan koneksi cloud otomatis...');
      return;
    }

    if (!user) {
      setRoomOwnerId(null);
      return;
    }

    let cancelled = false;
    const unsubs: Unsubscribe[] = [];
    const pageUnsubs = new Map<string, Unsubscribe>();
    const pagesMap = new Map<string, FlipchartPage>();
    let currentOrder: string[] = [];
    const myDeviceId = boardDeviceIdRef.current;

    const roomPath = `rooms/${roomId}`;
    const roomDocRef = doc(db, 'rooms', roomId);

    const ensureEditorMembership = async () => {
      const edRef = doc(db, 'rooms', roomId, 'editors', user.uid);
      const edSnap = await getDoc(edRef);
      if (!edSnap.exists()) {
        await setDoc(edRef, {
          uid: user.uid,
          roomId,
          role: 'presenter',
          joinedAt: serverTimestamp(),
        });
      }
    };

    const flushPagesFromMap = () => {
      if (cancelled) return;
      if (viewMode === 'tablet' && !isLiveBroadcastRef.current) return;
      const ordered: FlipchartPage[] = [];
      for (const pid of currentOrder) {
        const p = pagesMap.get(pid);
        if (p) ordered.push(p);
      }
      if (ordered.length > 0) {
        setPages(ordered);
        saveToLocal(ordered, activePageIdRef.current);
      }
    };

    const syncPageListeners = (orderIds: string[]) => {
      currentOrder = orderIds;
      const wanted = new Set(orderIds);

      for (const [pid, unsub] of pageUnsubs.entries()) {
        if (!wanted.has(pid)) {
          unsub();
          pageUnsubs.delete(pid);
          pagesMap.delete(pid);
        }
      }

      for (const pid of orderIds) {
        if (pageUnsubs.has(pid)) continue;
        const pagePath = `rooms/${roomId}/pages/${pid}`;
        const pRef = doc(db, 'rooms', roomId, 'pages', pid);
        const u = onSnapshot(
          pRef,
          (snap) => {
            if (cancelled || !snap.exists()) return;
            const d = snap.data();
            const incomingDeviceId = typeof d.sourceDeviceId === 'string' ? d.sourceDeviceId : '';
            if (incomingDeviceId && incomingDeviceId !== myDeviceId) {
              pulseRemoteSignal();
            }
            const pageObj: FlipchartPage = {
              pageId: String(d.pageId || pid),
              name: String(d.name || 'Lembar'),
              background: (d.background as PaperBackground) || 'white',
              order: typeof d.order === 'number' ? d.order : 0,
              elements: Array.isArray(d.elements) ? (d.elements as CanvasElement[]) : [],
              updatedAtMs: Date.now(),
            };
            pagesMap.set(pid, pageObj);
            flushPagesFromMap();
          },
          (error) => {
            if (isQuotaError(error)) {
              setCloudState('error');
              setCloudMessage('Kuota harian Firestore tercapai. Beralih ke mode lokal.');
            } else if (!isPermissionError(error)) {
              handleFirestoreError(error, OperationType.GET, pagePath);
            }
          }
        );
        pageUnsubs.set(pid, u);
      }
      flushPagesFromMap();
    };

    const attachLiveStrokeListener = () => {
      const livePath = `rooms/${roomId}/liveStroke/current`;
      const liveRef = doc(db, 'rooms', roomId, 'liveStroke', 'current');
      const u = onSnapshot(
        liveRef,
        (snap) => {
          if (cancelled || !snap.exists()) {
            setRemoteLiveElement(null);
            return;
          }
          const d = snap.data();
          const incomingDeviceId = typeof d.sourceDeviceId === 'string' ? d.sourceDeviceId : '';

          // Unique boardDeviceId echo guard: sender never overwrites its own active canvas
          if (incomingDeviceId) {
            if (incomingDeviceId === myDeviceId) return;
          } else if (d.updatedBy === user.uid && viewMode === 'tablet') {
            return;
          }

          if (d.active && d.element && typeof d.element === 'object' && d.element.type) {
            pulseRemoteSignal();
            setRemoteLivePageId(String(d.pageId || ''));
            setRemoteLiveElement(d.element as CanvasElement);
          } else {
            setRemoteLiveElement(null);
          }
        },
        (error) => {
          if (!isPermissionError(error) && !isQuotaError(error)) {
            handleFirestoreError(error, OperationType.GET, livePath);
          }
        }
      );
      unsubs.push(u);
    };

    const bootstrapRoom = async () => {
      setCloudState('connecting');
      setCloudMessage('Menghubungkan ke Firestore real-time...');
      try {
        const snap = await getDoc(roomDocRef);
        if (cancelled) return;

        if (!snap.exists()) {
          const batch = writeBatch(db);
          const localPages = pagesRef.current.length > 0 ? pagesRef.current : [createInitialPage(0)];
          const pageOrder = localPages.slice(0, MAX_PAGES).map((p) => p.pageId);
          const firstActiveId = pageOrder.includes(activePageIdRef.current)
            ? activePageIdRef.current
            : pageOrder[0];

          batch.set(roomDocRef, {
            roomId,
            ownerId: user.uid,
            title: roomTitleRef.current.slice(0, 120) || 'Sesi Papan Tulis',
            activePageId: firstActiveId,
            pageOrder,
            sourceDeviceId: myDeviceId,
            updatedBy: user.uid,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });

          localPages.slice(0, MAX_PAGES).forEach((p, idx) => {
            batch.set(doc(db, 'rooms', roomId, 'pages', p.pageId), {
              pageId: p.pageId,
              roomId,
              ownerId: user.uid,
              name: (p.name || `Lembar ${idx + 1}`).slice(0, 80),
              background: p.background,
              order: idx,
              elements: sanitizeElementsForFirestore(p.elements),
              sourceDeviceId: myDeviceId,
              updatedBy: user.uid,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            });
          });

          await batch.commit();
          if (cancelled) return;
        } else {
          // Ensure presenter membership exists BEFORE attaching subcollection listeners (zero race condition)
          const existingOwnerId = String(snap.data().ownerId || '');
          if (existingOwnerId && existingOwnerId !== user.uid) {
            await ensureEditorMembership();
            if (cancelled) return;
          }
        }

        const roomUnsub = onSnapshot(
          roomDocRef,
          async (roomSnap) => {
            if (cancelled) return;
            if (!roomSnap.exists()) {
              setCloudState('room-not-found');
              setCloudMessage('Ruang tidak ditemukan.');
              return;
            }
            const rd = roomSnap.data();
            const ownerUid = String(rd.ownerId || '');
            const rTitle = String(rd.title || 'Sesi Papan Tulis');
            const rActivePageId = String(rd.activePageId || '');
            const rOrder = Array.isArray(rd.pageOrder) ? (rd.pageOrder as string[]) : [];
            const incomingDeviceId = typeof rd.sourceDeviceId === 'string' ? rd.sourceDeviceId : '';

            if (incomingDeviceId && incomingDeviceId !== myDeviceId) {
              pulseRemoteSignal();
            }

            setRoomOwnerId(ownerUid);
            setRoomTitle(rTitle);

            if (ownerUid && ownerUid !== user.uid) {
              try {
                await ensureEditorMembership();
              } catch (err) {
                console.error('Auto-join room editor failed:', err);
              }
            }

            setCloudState('synced');
            setCloudMessage(
              user.isAnonymous
                ? 'Terhubung otomatis real-time tanpa login email'
                : 'Tersinkronisasi real-time via Firestore'
            );

            if (rActivePageId && !(viewMode === 'tablet' && !isLiveBroadcastRef.current)) {
              setActivePageId(rActivePageId);
            }
            syncPageListeners(rOrder);
            if (unsubs.length === 1) {
              attachLiveStrokeListener();
            }
          },
          (error) => {
            if (isQuotaError(error)) {
              setCloudState('error');
              setCloudMessage('Kuota harian Firestore tercapai. Beralih ke mode lokal.');
            } else {
              handleFirestoreError(error, OperationType.GET, roomPath);
            }
          }
        );
        unsubs.push(roomUnsub);
      } catch (error) {
        if (cancelled) return;
        if (isQuotaError(error)) {
          setCloudState('error');
          setCloudMessage('Kuota harian Firestore tercapai. Papan tulis berjalan di mode lokal.');
        } else {
          setCloudState('error');
          setCloudMessage('Gagal menyambung ke cloud. Beralih ke mode lokal.');
          console.error('Room bootstrap error:', error);
        }
      }
    };

    void bootstrapRoom();

    return () => {
      cancelled = true;
      unsubs.forEach((u) => u());
      pageUnsubs.forEach((u) => u());
    };
  }, [authReady, user, roomId, viewMode, saveToLocal, syncNonce, pulseRemoteSignal]);

  const activePage = useMemo(() => {
    return pages.find((p) => p.pageId === activePageId) || pages[0];
  }, [pages, activePageId]);

  const canPushCloud = useCallback(() => {
    if (!userRef.current) return false;
    if (cloudStateRef.current !== 'synced') return false;
    if (viewMode === 'tablet' && !isLiveBroadcastRef.current) return false;
    return true;
  }, [viewMode]);

  // --- Cloud Write Helpers ---
  const pushPageElementsToCloud = useCallback(
    async (pageId: string, elements: CanvasElement[]) => {
      if (!canPushCloud() || !userRef.current) return;
      const pagePath = `rooms/${roomId}/pages/${pageId}`;
      try {
        await updateDoc(doc(db, 'rooms', roomId, 'pages', pageId), {
          elements: sanitizeElementsForFirestore(elements),
          sourceDeviceId: boardDeviceIdRef.current,
          updatedBy: userRef.current.uid,
          updatedAt: serverTimestamp(),
        });
      } catch (error) {
        if (!isQuotaError(error)) {
          handleFirestoreError(error, OperationType.UPDATE, pagePath);
        }
      }
    },
    [canPushCloud, roomId]
  );

  const pushPageMetaToCloud = useCallback(
    async (page: FlipchartPage) => {
      if (!canPushCloud() || !userRef.current) return;
      const pagePath = `rooms/${roomId}/pages/${page.pageId}`;
      try {
        await updateDoc(doc(db, 'rooms', roomId, 'pages', page.pageId), {
          name: page.name.slice(0, 80),
          background: page.background,
          order: page.order,
          sourceDeviceId: boardDeviceIdRef.current,
          updatedBy: userRef.current.uid,
          updatedAt: serverTimestamp(),
        });
      } catch (error) {
        if (!isQuotaError(error)) {
          handleFirestoreError(error, OperationType.UPDATE, pagePath);
        }
      }
    },
    [canPushCloud, roomId]
  );

  const pushFullPageToCloud = useCallback(
    async (page: FlipchartPage) => {
      if (!canPushCloud() || !userRef.current) return;
      const pagePath = `rooms/${roomId}/pages/${page.pageId}`;
      try {
        await updateDoc(doc(db, 'rooms', roomId, 'pages', page.pageId), {
          name: page.name.slice(0, 80),
          background: page.background,
          order: page.order,
          elements: sanitizeElementsForFirestore(page.elements),
          sourceDeviceId: boardDeviceIdRef.current,
          updatedBy: userRef.current.uid,
          updatedAt: serverTimestamp(),
        });
      } catch (error) {
        if (!isQuotaError(error)) {
          handleFirestoreError(error, OperationType.UPDATE, pagePath);
        }
      }
    },
    [canPushCloud, roomId]
  );

  // Stream live stroke while drawing (~35ms on Direct P2P / BroadcastChannel, ~70ms on Firestore)
  const emitLiveStroke = useCallback(
    (element: CanvasElement | null, force = false) => {
      if (viewMode === 'tablet' && !isLiveBroadcastRef.current) return;
      const now = Date.now();
      const pid = activePageIdRef.current;

      if (force || element === null || now - lastPeerLiveStrokePushRef.current >= 35) {
        lastPeerLiveStrokePushRef.current = now;
        channelRef.current?.postMessage({
          senderId: boardDeviceIdRef.current,
          type: 'liveStroke',
          roomId,
          payload: { pageId: pid, element },
        } satisfies BroadcastPacket);
        peerBridgeRef.current?.sendLiveStroke(pid, element);
      }

      if (
        canPushCloud() &&
        userRef.current &&
        (force || element === null || now - lastLiveStrokePushRef.current >= 70)
      ) {
        lastLiveStrokePushRef.current = now;
        const sanitized = element ? sanitizeElementsForFirestore([element])[0] : {};
        setDoc(doc(db, 'rooms', roomId, 'liveStroke', 'current'), {
          roomId,
          pageId: pid,
          active: Boolean(element),
          element: sanitized,
          sourceDeviceId: boardDeviceIdRef.current,
          updatedBy: userRef.current.uid,
          updatedAt: serverTimestamp(),
        }).catch(() => {
          // Non-fatal for ephemeral live preview
        });
      }
    },
    [canPushCloud, roomId, viewMode]
  );

  // Commit elements change with per-page undo history
  const updateActivePageElements = useCallback(
    (updater: (prev: CanvasElement[]) => CanvasElement[], recordHistory = true) => {
      const targetId = activePageIdRef.current;
      const currentPages = pagesRef.current;
      const currentPage = currentPages.find((p) => p.pageId === targetId);
      if (!currentPage) return;

      const prevElements = currentPage.elements;
      const nextElements = updater(prevElements).slice(-MAX_ELEMENTS_PER_PAGE);

      if (recordHistory) {
        setUndoStacks((prev) => ({
          ...prev,
          [targetId]: [...(prev[targetId] || []).slice(-39), prevElements],
        }));
        setRedoStacks((prev) => ({
          ...prev,
          [targetId]: [],
        }));
      }

      const nextPages = currentPages.map((p) =>
        p.pageId === targetId ? { ...p, elements: nextElements, updatedAtMs: Date.now() } : p
      );
      setPages(nextPages);
      const snapshot = saveToLocal(nextPages, targetId);
      broadcastLocalState(snapshot);
      void pushPageElementsToCloud(targetId, nextElements);
    },
    [broadcastLocalState, pushPageElementsToCloud, saveToLocal]
  );

  const addElement = useCallback(
    (element: CanvasElement) => {
      updateActivePageElements((prev) => {
        if (prev.some((e) => e.id === element.id)) {
          return prev.map((e) => (e.id === element.id ? element : e));
        }
        return [...prev, element];
      }, true);
    },
    [updateActivePageElements]
  );

  const updateElement = useCallback(
    (element: CanvasElement) => {
      updateActivePageElements(
        (prev) => prev.map((e) => (e.id === element.id ? element : e)),
        true
      );
    },
    [updateActivePageElements]
  );

  const removeElementById = useCallback(
    (elementId: string) => {
      updateActivePageElements((prev) => prev.filter((e) => e.id !== elementId), true);
    },
    [updateActivePageElements]
  );

  const clearActivePage = useCallback(() => {
    updateActivePageElements(() => [], true);
  }, [updateActivePageElements]);

  // Undo & Redo per page
  const canUndo = Boolean(activePage && (undoStacks[activePage.pageId]?.length || 0) > 0);
  const canRedo = Boolean(activePage && (redoStacks[activePage.pageId]?.length || 0) > 0);

  const undo = useCallback(() => {
    const pid = activePageIdRef.current;
    const stack = undoStacks[pid] || [];
    if (stack.length === 0) return;

    const currentPage = pagesRef.current.find((p) => p.pageId === pid);
    if (!currentPage) return;

    const previousElements = stack[stack.length - 1];
    setUndoStacks((prev) => ({ ...prev, [pid]: stack.slice(0, -1) }));
    setRedoStacks((prev) => ({
      ...prev,
      [pid]: [...(prev[pid] || []).slice(-39), currentPage.elements],
    }));

    const nextPages = pagesRef.current.map((p) =>
      p.pageId === pid ? { ...p, elements: previousElements, updatedAtMs: Date.now() } : p
    );
    setPages(nextPages);
    const snapshot = saveToLocal(nextPages, pid);
    broadcastLocalState(snapshot);
    void pushPageElementsToCloud(pid, previousElements);
  }, [broadcastLocalState, pushPageElementsToCloud, saveToLocal, undoStacks]);

  const redo = useCallback(() => {
    const pid = activePageIdRef.current;
    const stack = redoStacks[pid] || [];
    if (stack.length === 0) return;

    const currentPage = pagesRef.current.find((p) => p.pageId === pid);
    if (!currentPage) return;

    const nextElements = stack[stack.length - 1];
    setRedoStacks((prev) => ({ ...prev, [pid]: stack.slice(0, -1) }));
    setUndoStacks((prev) => ({
      ...prev,
      [pid]: [...(prev[pid] || []).slice(-39), currentPage.elements],
    }));

    const nextPages = pagesRef.current.map((p) =>
      p.pageId === pid ? { ...p, elements: nextElements, updatedAtMs: Date.now() } : p
    );
    setPages(nextPages);
    const snapshot = saveToLocal(nextPages, pid);
    broadcastLocalState(snapshot);
    void pushPageElementsToCloud(pid, nextElements);
  }, [broadcastLocalState, pushPageElementsToCloud, redoStacks, saveToLocal]);

  // Multi-page Flipchart operations
  const selectPage = useCallback(
    async (pageId: string) => {
      if (!pagesRef.current.some((p) => p.pageId === pageId)) return;
      setActivePageId(pageId);
      setRemoteLiveElement(null);
      const snapshot = saveToLocal(pagesRef.current, pageId);
      broadcastLocalState(snapshot);

      if (canPushCloud() && userRef.current) {
        try {
          await updateDoc(doc(db, 'rooms', roomId), {
            activePageId: pageId,
            sourceDeviceId: boardDeviceIdRef.current,
            updatedBy: userRef.current.uid,
            updatedAt: serverTimestamp(),
          });
        } catch (error) {
          if (!isQuotaError(error)) {
            handleFirestoreError(error, OperationType.UPDATE, `rooms/${roomId}`);
          }
        }
      }
    },
    [broadcastLocalState, canPushCloud, roomId, saveToLocal]
  );

  const addPage = useCallback(async () => {
    if (pagesRef.current.length >= MAX_PAGES) return;
    const nextIdx = pagesRef.current.length;
    const newPage = createInitialPage(nextIdx);
    const nextPages = [...pagesRef.current, newPage];
    const nextOrder = nextPages.map((p) => p.pageId);

    setPages(nextPages);
    setActivePageId(newPage.pageId);
    const snapshot = saveToLocal(nextPages, newPage.pageId);
    broadcastLocalState(snapshot);

    if (canPushCloud() && userRef.current) {
      try {
        const batch = writeBatch(db);
        const ownerId = roomOwnerIdRef.current || userRef.current.uid;
        batch.set(doc(db, 'rooms', roomId, 'pages', newPage.pageId), {
          pageId: newPage.pageId,
          roomId,
          ownerId,
          name: newPage.name,
          background: newPage.background,
          order: newPage.order,
          elements: [],
          sourceDeviceId: boardDeviceIdRef.current,
          updatedBy: userRef.current.uid,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        batch.update(doc(db, 'rooms', roomId), {
          activePageId: newPage.pageId,
          pageOrder: nextOrder,
          sourceDeviceId: boardDeviceIdRef.current,
          updatedBy: userRef.current.uid,
          updatedAt: serverTimestamp(),
        });
        await batch.commit();
      } catch (error) {
        if (!isQuotaError(error)) {
          handleFirestoreError(error, OperationType.WRITE, `rooms/${roomId}/pages/${newPage.pageId}`);
        }
      }
    }
  }, [broadcastLocalState, canPushCloud, roomId, saveToLocal]);

  const renamePage = useCallback(
    async (pageId: string, newName: string) => {
      const cleaned = newName.trim().slice(0, 80);
      if (!cleaned) return;
      let updatedPage: FlipchartPage | null = null;
      const nextPages = pagesRef.current.map((p) => {
        if (p.pageId === pageId) {
          updatedPage = { ...p, name: cleaned, updatedAtMs: Date.now() };
          return updatedPage;
        }
        return p;
      });
      setPages(nextPages);
      const snapshot = saveToLocal(nextPages, activePageIdRef.current);
      broadcastLocalState(snapshot);
      if (updatedPage) {
        await pushPageMetaToCloud(updatedPage);
      }
    },
    [broadcastLocalState, pushPageMetaToCloud, saveToLocal]
  );

  const deletePage = useCallback(
    async (pageId: string) => {
      if (pagesRef.current.length <= 1) return;
      const filtered = pagesRef.current
        .filter((p) => p.pageId !== pageId)
        .map((p, i) => ({ ...p, order: i }));
      const nextActiveId =
        activePageIdRef.current === pageId ? filtered[0].pageId : activePageIdRef.current;

      setPages(filtered);
      setActivePageId(nextActiveId);
      const snapshot = saveToLocal(filtered, nextActiveId);
      broadcastLocalState(snapshot);

      if (canPushCloud() && userRef.current) {
        try {
          const batch = writeBatch(db);
          batch.delete(doc(db, 'rooms', roomId, 'pages', pageId));
          batch.update(doc(db, 'rooms', roomId), {
            activePageId: nextActiveId,
            pageOrder: filtered.map((p) => p.pageId),
            sourceDeviceId: boardDeviceIdRef.current,
            updatedBy: userRef.current.uid,
            updatedAt: serverTimestamp(),
          });
          await batch.commit();
        } catch (error) {
          if (!isQuotaError(error)) {
            handleFirestoreError(error, OperationType.DELETE, `rooms/${roomId}/pages/${pageId}`);
          }
        }
      }
    },
    [broadcastLocalState, canPushCloud, roomId, saveToLocal]
  );

  const setActivePageBackground = useCallback(
    async (background: PaperBackground) => {
      const targetId = activePageIdRef.current;
      let updatedPage: FlipchartPage | null = null;
      const nextPages = pagesRef.current.map((p) => {
        if (p.pageId === targetId) {
          updatedPage = { ...p, background, updatedAtMs: Date.now() };
          return updatedPage;
        }
        return p;
      });
      setPages(nextPages);
      const snapshot = saveToLocal(nextPages, targetId);
      broadcastLocalState(snapshot);
      if (updatedPage) {
        await pushPageMetaToCloud(updatedPage);
      }
    },
    [broadcastLocalState, pushPageMetaToCloud, saveToLocal]
  );

  // Apply quick template to active page
  const applyTemplateToActivePage = useCallback(
    async (template: QuickTemplate, mode: 'replace' | 'append' = 'append') => {
      const targetId = activePageIdRef.current;
      const current = pagesRef.current.find((p) => p.pageId === targetId);
      if (!current) return;

      const templateElements: CanvasElement[] = [
        ...(template.shapes || []).map((s) => ({ ...s, id: createId('shp') })),
        ...template.blocks.slice(0, MAX_TEMPLATE_BLOCKS).map((b) => ({
          id: createId('txt'),
          type: 'text' as const,
          x: b.x,
          y: b.y,
          text: b.text,
          fontSize: b.fontSize,
          color: b.color,
          size: 4,
          opacity: 1,
        })),
      ];

      setUndoStacks((prev) => ({
        ...prev,
        [targetId]: [...(prev[targetId] || []).slice(-39), current.elements],
      }));
      setRedoStacks((prev) => ({ ...prev, [targetId]: [] }));

      const nextElements =
        mode === 'replace'
          ? templateElements.slice(0, MAX_ELEMENTS_PER_PAGE)
          : [...current.elements, ...templateElements].slice(-MAX_ELEMENTS_PER_PAGE);

      const updatedPage: FlipchartPage = {
        ...current,
        background: template.background,
        elements: nextElements,
        updatedAtMs: Date.now(),
      };

      const nextPages = pagesRef.current.map((p) => (p.pageId === targetId ? updatedPage : p));
      setPages(nextPages);
      const snapshot = saveToLocal(nextPages, targetId);
      broadcastLocalState(snapshot);
      await pushFullPageToCloud(updatedPage);
    },
    [broadcastLocalState, pushFullPageToCloud, saveToLocal]
  );

  // Save current page text blocks as reusable custom template
  const saveActivePageAsTemplate = useCallback(
    async (title: string, category: string) => {
      const current = pagesRef.current.find((p) => p.pageId === activePageIdRef.current);
      if (!current) return;

      const blocks = current.elements
        .filter((el): el is Extract<CanvasElement, { type: 'text' }> => el.type === 'text')
        .slice(0, MAX_TEMPLATE_BLOCKS)
        .map((t) => ({
          x: Math.round(t.x),
          y: Math.round(t.y),
          text: t.text.slice(0, 300),
          fontSize: Math.round(t.fontSize),
          color: t.color,
        }));

      const newTpl: QuickTemplate = {
        templateId: createId('tpl'),
        title: title.trim().slice(0, 80) || current.name,
        category: category.trim().slice(0, 40) || 'Kustom',
        background: current.background,
        blocks,
      };

      const nextLocal = [newTpl, ...customTemplates];
      setCustomTemplates(nextLocal);
      try {
        localStorage.setItem(LOCAL_TEMPLATES_KEY, JSON.stringify(nextLocal));
      } catch {
        // Ignore
      }

      if (userRef.current) {
        const tplPath = `users/${userRef.current.uid}/templates/${newTpl.templateId}`;
        try {
          await setDoc(doc(db, 'users', userRef.current.uid, 'templates', newTpl.templateId), {
            templateId: newTpl.templateId,
            userId: userRef.current.uid,
            title: newTpl.title,
            category: newTpl.category,
            background: newTpl.background,
            blocks: newTpl.blocks,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        } catch (error) {
          if (!isQuotaError(error)) {
            handleFirestoreError(error, OperationType.CREATE, tplPath);
          }
        }
      }
    },
    [customTemplates]
  );

  const deleteCustomTemplate = useCallback(
    async (templateId: string) => {
      const nextLocal = customTemplates.filter((t) => t.templateId !== templateId);
      setCustomTemplates(nextLocal);
      try {
        localStorage.setItem(LOCAL_TEMPLATES_KEY, JSON.stringify(nextLocal));
      } catch {
        // Ignore
      }
      if (userRef.current) {
        try {
          await deleteDoc(doc(db, 'users', userRef.current.uid, 'templates', templateId));
        } catch {
          // Ignore if local-only
        }
      }
    },
    [customTemplates]
  );

  // Publish local Tablet draft immediately to Projector
  const publishDraftNow = useCallback(async () => {
    const targetId = activePageIdRef.current;
    const current = pagesRef.current.find((p) => p.pageId === targetId);
    if (!current) return;

    const snapshot = saveToLocal(pagesRef.current, targetId);
    channelRef.current?.postMessage({
      senderId: boardDeviceIdRef.current,
      type: 'state',
      roomId,
      payload: snapshot,
    } satisfies BroadcastPacket);
    peerBridgeRef.current?.sendState(snapshot);

    if (userRef.current && cloudStateRef.current === 'synced') {
      try {
        const batch = writeBatch(db);
        batch.update(doc(db, 'rooms', roomId, 'pages', current.pageId), {
          name: current.name.slice(0, 80),
          background: current.background,
          order: current.order,
          elements: sanitizeElementsForFirestore(current.elements),
          sourceDeviceId: boardDeviceIdRef.current,
          updatedBy: userRef.current.uid,
          updatedAt: serverTimestamp(),
        });
        batch.update(doc(db, 'rooms', roomId), {
          activePageId: current.pageId,
          sourceDeviceId: boardDeviceIdRef.current,
          updatedBy: userRef.current.uid,
          updatedAt: serverTimestamp(),
        });
        await batch.commit();
      } catch (error) {
        if (!isQuotaError(error)) {
          handleFirestoreError(error, OperationType.UPDATE, `rooms/${roomId}`);
        }
      }
    }
  }, [roomId, saveToLocal]);

  const toggleLiveBroadcast = useCallback(
    async (nextLive: boolean) => {
      setIsLiveBroadcast(nextLive);
      isLiveBroadcastRef.current = nextLive;
      if (nextLive) {
        await publishDraftNow();
      }
    },
    [publishDraftNow]
  );

  const switchRoom = useCallback(
    (
      nextRawRoomId: string,
      nextViewMode?: ViewMode
    ): { ok: boolean; roomId?: string; error?: string; needsSignIn?: boolean } => {
      const normalized = nextRawRoomId.trim().replace(/\s+/g, '-');
      const cleaned = sanitizeId(normalized, 32).toUpperCase();
      if (cleaned.length < 4) {
        return {
          ok: false,
          error: 'Kode ruang minimal 4 karakter (huruf, angka, atau tanda hubung).',
        };
      }
      const loaded = loadLocalRoom(cleaned);
      setRoomId(cleaned);
      if (nextViewMode) {
        setViewMode(nextViewMode);
        if (nextViewMode === 'tablet') {
          setIsLiveBroadcast(true);
          isLiveBroadcastRef.current = true;
        }
      }
      setRoomTitle(loaded.title);
      setPages(loaded.pages);
      setActivePageId(loaded.activePageId);
      setUndoStacks({});
      setRedoStacks({});
      setRemoteLiveElement(null);
      setSyncNonce((n) => n + 1);
      try {
        localStorage.setItem(LAST_ROOM_KEY, cleaned);
      } catch {
        // Ignore
      }
      return {
        ok: true,
        roomId: cleaned,
        needsSignIn: false,
      };
    },
    []
  );

  const createNewRoom = useCallback(() => {
    return switchRoom(generateRoomCode());
  }, [switchRoom]);

  const updateRoomTitle = useCallback(
    async (nextTitle: string) => {
      const cleaned = nextTitle.trim().slice(0, 120);
      if (!cleaned) return;
      setRoomTitle(cleaned);
      const snapshot = saveToLocal(pagesRef.current, activePageIdRef.current, { title: cleaned });
      broadcastLocalState(snapshot);

      if (
        userRef.current &&
        cloudStateRef.current === 'synced' &&
        roomOwnerIdRef.current === userRef.current.uid
      ) {
        try {
          await updateDoc(doc(db, 'rooms', roomId), {
            title: cleaned,
            sourceDeviceId: boardDeviceIdRef.current,
            updatedBy: userRef.current.uid,
            updatedAt: serverTimestamp(),
          });
        } catch {
          // Non-fatal
        }
      }
    },
    [broadcastLocalState, roomId, saveToLocal]
  );

  const retryCloudConnect = useCallback(async () => {
    setAuthError(null);
    if (!auth.currentUser) {
      anonAttemptedRef.current = true;
      const ok = await ensureAnonymousSession();
      if (!ok) return;
    }
    setSyncNonce((n) => n + 1);
  }, [ensureAnonymousSession]);

  const handleGoogleSignIn = useCallback(async () => {
    setAuthError(null);
    try {
      await signInWithGoogle();
    } catch (error: unknown) {
      const code =
        typeof error === 'object' && error !== null && 'code' in error
          ? String((error as { code?: unknown }).code || '')
          : '';
      if (
        code === 'auth/popup-blocked' ||
        code === 'auth/operation-not-supported-in-this-environment'
      ) {
        try {
          await signInWithGoogleRedirect();
          return;
        } catch (redirectErr) {
          console.error('Redirect sign in failed:', redirectErr);
        }
      }
      if (code === 'auth/unauthorized-domain') {
        const host = typeof window !== 'undefined' ? window.location.hostname : '';
        setAuthError(
          `Domain "${host}" belum didaftarkan di Firebase Console → Authentication → Settings → Authorized domains.`
        );
      } else if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
        setAuthError('Jendela login Google ditutup sebelum selesai.');
      } else {
        setAuthError('Gagal masuk dengan Google. Periksa koneksi internet atau izinkan popup browser.');
      }
      console.error('Sign in failed:', error);
    }
  }, []);

  const handleGoogleSignOut = useCallback(async () => {
    setAuthError(null);
    try {
      await signOutGoogle();
      // Fall back cleanly to a fresh anonymous session so real-time sync keeps working
      anonAttemptedRef.current = false;
    } catch (error) {
      console.error('Sign out failed:', error);
    }
  }, []);

  const allTemplates = useMemo(
    () => [...customTemplates, ...BUILTIN_TEMPLATES],
    [customTemplates]
  );

  return {
    viewMode,
    setViewMode,
    roomId,
    roomTitle,
    updateRoomTitle,
    switchRoom,
    createNewRoom,
    pages,
    activePage,
    activePageId,
    selectPage,
    addPage,
    renamePage,
    deletePage,
    setActivePageBackground,
    addElement,
    updateElement,
    removeElementById,
    clearActivePage,
    undo,
    redo,
    canUndo,
    canRedo,
    emitLiveStroke,
    remoteLiveElement: remoteLivePageId === activePage?.pageId ? remoteLiveElement : null,
    isRemoteTransmitting,
    boardDeviceId: boardDeviceIdRef.current,
    isLiveBroadcast,
    toggleLiveBroadcast,
    publishDraftNow,
    laptopCanEdit,
    setLaptopCanEdit,
    user,
    authReady,
    authError,
    anonymousProviderDisabled,
    cloudState,
    cloudMessage,
    p2pState,
    p2pPeerCount,
    p2pMessage,
    lastHostSyncedAt,
    retryCloudConnect,
    handleGoogleSignIn,
    handleGoogleSignOut,
    allTemplates,
    applyTemplateToActivePage,
    saveActivePageAsTemplate,
    deleteCustomTemplate,
  };
}
