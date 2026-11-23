import Peer, { DataConnection } from 'peerjs';
import { CanvasElement, FlipchartPage } from '../types/whiteboard';

export type P2PConnectionState =
  | 'idle'
  | 'initializing'
  | 'ready'
  | 'connecting'
  | 'connected'
  | 'not-found'
  | 'error';

export interface RoomSyncSnapshot {
  roomId: string;
  title: string;
  activePageId: string;
  pages: FlipchartPage[];
  updatedAtMs: number;
}

type PeerPacket =
  | {
      type: 'request-sync';
      senderId: string;
      roomId: string;
    }
  | {
      type: 'host-sync';
      senderId: string;
      roomId: string;
      payload: RoomSyncSnapshot;
    }
  | {
      type: 'state';
      senderId: string;
      roomId: string;
      payload: RoomSyncSnapshot;
    }
  | {
      type: 'upsert-element';
      senderId: string;
      roomId: string;
      payload: {
        pageId: string;
        element: CanvasElement;
        updatedAtMs: number;
      };
    }
  | {
      type: 'remove-element';
      senderId: string;
      roomId: string;
      payload: {
        pageId: string;
        elementId: string;
        updatedAtMs: number;
      };
    }
  | {
      type: 'liveStroke';
      senderId: string;
      roomId: string;
      payload: {
        pageId: string;
        element: CanvasElement | null;
      };
    }
  | {
      type: 'ping' | 'pong';
      senderId: string;
      roomId: string;
    }
  | {
      type: 'chunk';
      senderId: string;
      roomId: string;
      msgId: string;
      index: number;
      total: number;
      data: string;
    };

export interface RoomPeerBridgeOptions {
  roomId: string;
  role: 'host' | 'client';
  deviceId: string;
  getSnapshot: () => RoomSyncSnapshot;
  onStateChange: (state: P2PConnectionState, peerCount: number, detail: string) => void;
  onReceiveHostSync: (snapshot: RoomSyncSnapshot) => void;
  onReceiveState: (snapshot: RoomSyncSnapshot, senderId: string) => void;
  onReceiveElementUpsert: (
    pageId: string,
    element: CanvasElement,
    updatedAtMs: number,
    senderId: string
  ) => void;
  onReceiveElementRemove: (
    pageId: string,
    elementId: string,
    updatedAtMs: number,
    senderId: string
  ) => void;
  onReceiveLiveStroke: (pageId: string, element: CanvasElement | null, senderId: string) => void;
}

const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
  { urls: 'stun:stun.cloudflare.com:3478' },
];

// Keep every single WebRTC JSON frame well below SCTP max message size (~64KB on mobile browsers)
const CHUNK_CHAR_LIMIT = 12_000;
const KEEPALIVE_INTERVAL_MS = 15_000;

interface ChunkBuffer {
  total: number;
  parts: (string | undefined)[];
  received: number;
  createdAt: number;
}

export function getHostPeerId(roomId: string): string {
  const clean = roomId.toLowerCase().replace(/[^a-z0-9-]/g, '');
  return `flipcast-room-v1-${clean}`;
}

function isValidSnapshot(value: unknown): value is RoomSyncSnapshot {
  if (!value || typeof value !== 'object') return false;
  const v = value as Partial<RoomSyncSnapshot>;
  return typeof v.roomId === 'string' && Array.isArray(v.pages) && v.pages.length > 0;
}

export class RoomPeerBridge {
  private readonly opts: RoomPeerBridgeOptions;
  private readonly hostPeerId: string;
  private peer: Peer | null = null;
  private effectiveRole: 'host' | 'client';
  private hostConnections = new Map<string, DataConnection>();
  private clientConn: DataConnection | null = null;
  private retryIntervalId: number | null = null;
  private keepaliveIntervalId: number | null = null;
  private connectTimeoutId: number | null = null;
  private fallbackSyncRequestTimerId: number | null = null;
  private gotHostSyncForCurrentConn = false;
  private chunkBuffers = new Map<string, ChunkBuffer>();
  private msgSeq = 0;
  private destroyed = false;
  private isConnectingAttempt = false;

  constructor(opts: RoomPeerBridgeOptions) {
    this.opts = opts;
    this.effectiveRole = opts.role;
    this.hostPeerId = getHostPeerId(opts.roomId);

    this.handleVisibilityOrOnline = this.handleVisibilityOrOnline.bind(this);
    if (typeof window !== 'undefined') {
      window.addEventListener('online', this.handleVisibilityOrOnline);
      document.addEventListener('visibilitychange', this.handleVisibilityOrOnline);
    }

    this.startKeepaliveLoop();
    this.start();
  }

  private start() {
    if (this.destroyed) return;
    this.cleanupPeerOnly();
    this.opts.onStateChange(
      'initializing',
      0,
      this.effectiveRole === 'host'
        ? 'Menyiapkan saluran koneksi langsung...'
        : `Mencari papan aktif PC/Laptop (${this.opts.roomId})...`
    );

    try {
      const peerOptions = {
        debug: 0,
        config: { iceServers: ICE_SERVERS },
      };

      const peer =
        this.effectiveRole === 'host'
          ? new Peer(this.hostPeerId, peerOptions)
          : new Peer(peerOptions);

      this.peer = peer;

      peer.on('open', () => {
        if (this.destroyed || this.peer !== peer) return;
        if (this.effectiveRole === 'host') {
          this.opts.onStateChange(
            'ready',
            this.hostConnections.size,
            'Siap menerima Remote Tablet/HP (tanpa login email)'
          );
        } else {
          this.connectToHost();
          this.startClientRetryLoop();
        }
      });

      peer.on('connection', (conn) => {
        if (this.destroyed || this.peer !== peer) {
          conn.close();
          return;
        }
        this.attachHostConnection(conn);
      });

      peer.on('disconnected', () => {
        if (this.destroyed || this.peer !== peer) return;
        try {
          peer.reconnect();
        } catch {
          // Will retry via loop
        }
      });

      peer.on('error', (err) => {
        if (this.destroyed || this.peer !== peer) return;
        const errType = (err as { type?: string })?.type || '';

        // If another tab on the same PC already claimed the Host ID, join as client seamlessly
        if (errType === 'unavailable-id' && this.effectiveRole === 'host') {
          this.effectiveRole = 'client';
          this.start();
          return;
        }

        if (errType === 'peer-unavailable') {
          this.clearConnectTimeout();
          this.isConnectingAttempt = false;
          if (this.clientConn && !this.clientConn.open) {
            try {
              this.clientConn.close();
            } catch {
              // Ignore
            }
            this.clientConn = null;
          }
          this.opts.onStateChange(
            'not-found',
            0,
            `Menunggu PC/Laptop membuka kode ${this.opts.roomId}... (mencoba otomatis)`
          );
          return;
        }

        if (
          errType === 'network' ||
          errType === 'server-error' ||
          errType === 'socket-error' ||
          errType === 'socket-closed'
        ) {
          this.opts.onStateChange(
            'error',
            this.getOpenCount(),
            'Koneksi sinyal terputus sementara, menyambung ulang...'
          );
          window.setTimeout(() => {
            if (!this.destroyed && this.peer === peer && peer.disconnected) {
              try {
                peer.reconnect();
              } catch {
                this.start();
              }
            }
          }, 2500);
        }
      });
    } catch {
      this.opts.onStateChange('error', 0, 'Gagal memulai saluran langsung browser.');
    }
  }

  private attachHostConnection(conn: DataConnection) {
    const connKey = conn.connectionId || conn.peer;

    conn.on('open', () => {
      if (this.destroyed) {
        conn.close();
        return;
      }
      this.hostConnections.set(connKey, conn);

      // Push the PC/Laptop's active board state ONCE using chunk-safe framing
      const snapshot = this.opts.getSnapshot();
      this.sendPacketToConn(conn, {
        type: 'host-sync',
        senderId: this.opts.deviceId,
        roomId: this.opts.roomId,
        payload: snapshot,
      });

      const count = this.hostConnections.size;
      this.opts.onStateChange(
        'connected',
        count,
        `Terhubung langsung dengan ${count} Remote Tablet/HP (Real-Time)`
      );
    });

    conn.on('data', (raw) => {
      if (this.destroyed) return;
      this.handleIncomingPacket(raw, connKey);
    });

    const removeConn = () => {
      this.hostConnections.delete(connKey);
      if (this.destroyed) return;
      const count = this.hostConnections.size;
      this.opts.onStateChange(
        count > 0 ? 'connected' : 'ready',
        count,
        count > 0
          ? `Terhubung langsung dengan ${count} Remote Tablet/HP (Real-Time)`
          : 'Siap menerima Remote Tablet/HP (tanpa login email)'
      );
    };

    conn.on('close', removeConn);
    conn.on('error', removeConn);
  }

  private connectToHost() {
    if (this.destroyed || !this.peer || this.peer.destroyed) return;
    if (this.clientConn?.open) return;
    if (this.isConnectingAttempt) return;

    if (this.peer.disconnected) {
      try {
        this.peer.reconnect();
      } catch {
        // Ignore
      }
      return;
    }

    this.isConnectingAttempt = true;
    this.opts.onStateChange(
      'connecting',
      0,
      `Menghubungkan ke papan aktif PC/Laptop (${this.opts.roomId})...`
    );

    if (this.clientConn) {
      try {
        this.clientConn.close();
      } catch {
        // Ignore
      }
      this.clientConn = null;
    }

    try {
      const conn = this.peer.connect(this.hostPeerId, {
        reliable: true,
        serialization: 'json',
      });
      this.clientConn = conn;

      this.clearConnectTimeout();
      this.connectTimeoutId = window.setTimeout(() => {
        if (this.destroyed || this.clientConn !== conn || conn.open) return;
        this.isConnectingAttempt = false;
        try {
          conn.close();
        } catch {
          // Ignore
        }
        this.clientConn = null;
        this.opts.onStateChange(
          'not-found',
          0,
          `Papan PC/Laptop berkode ${this.opts.roomId} belum merespons — pastikan terbuka di PC/Laptop. Mencoba ulang...`
        );
      }, 6000);

      conn.on('open', () => {
        if (this.destroyed || this.clientConn !== conn) {
          conn.close();
          return;
        }
        this.clearConnectTimeout();
        this.isConnectingAttempt = false;
        this.gotHostSyncForCurrentConn = false;
        this.opts.onStateChange(
          'connected',
          1,
          `Terhubung langsung ke papan aktif PC/Laptop (${this.opts.roomId})`
        );

        // Fallback request-sync ONLY if host's initial host-sync didn't arrive within 1200ms (avoids double sync race)
        this.clearFallbackSyncTimer();
        this.fallbackSyncRequestTimerId = window.setTimeout(() => {
          if (
            this.destroyed ||
            this.clientConn !== conn ||
            !conn.open ||
            this.gotHostSyncForCurrentConn
          ) {
            return;
          }
          this.sendPacketToConn(conn, {
            type: 'request-sync',
            senderId: this.opts.deviceId,
            roomId: this.opts.roomId,
          });
        }, 1200);
      });

      conn.on('data', (raw) => {
        if (this.destroyed || this.clientConn !== conn) return;
        this.handleIncomingPacket(raw);
      });

      const handleDisconnect = () => {
        if (this.clientConn === conn) {
          this.clientConn = null;
        }
        this.clearConnectTimeout();
        this.clearFallbackSyncTimer();
        this.isConnectingAttempt = false;
        if (!this.destroyed) {
          this.opts.onStateChange(
            'not-found',
            0,
            `Koneksi ke PC/Laptop terputus. Menyambung ulang ke ${this.opts.roomId}...`
          );
        }
      };

      conn.on('close', handleDisconnect);
      conn.on('error', handleDisconnect);
    } catch {
      this.isConnectingAttempt = false;
      this.opts.onStateChange('error', 0, 'Gagal membuka koneksi ke PC/Laptop.');
    }
  }

  private handleIncomingPacket(raw: unknown, sourceConnKey?: string) {
    if (!raw || typeof raw !== 'object') return;
    const packet = raw as Partial<PeerPacket>;
    if (packet.roomId !== this.opts.roomId) return;
    if (packet.senderId === this.opts.deviceId) return;

    // Reassemble chunked large packets transparently
    if (
      packet.type === 'chunk' &&
      typeof packet.msgId === 'string' &&
      typeof packet.index === 'number' &&
      typeof packet.total === 'number' &&
      typeof packet.data === 'string' &&
      packet.total > 0 &&
      packet.total <= 256 &&
      packet.index >= 0 &&
      packet.index < packet.total
    ) {
      this.pruneStaleChunkBuffers();
      let buf = this.chunkBuffers.get(packet.msgId);
      if (!buf || buf.total !== packet.total) {
        buf = {
          total: packet.total,
          parts: new Array<string | undefined>(packet.total),
          received: 0,
          createdAt: Date.now(),
        };
        this.chunkBuffers.set(packet.msgId, buf);
      }
      if (buf.parts[packet.index] === undefined) {
        buf.parts[packet.index] = packet.data;
        buf.received += 1;
      }
      if (buf.received === buf.total) {
        this.chunkBuffers.delete(packet.msgId);
        try {
          const parsed = JSON.parse(buf.parts.join('')) as unknown;
          this.handleIncomingPacket(parsed, sourceConnKey);
        } catch {
          // Ignore malformed reassembled payload
        }
      }
      return;
    }

    if (packet.type === 'ping') {
      if (this.effectiveRole === 'host' && sourceConnKey) {
        const conn = this.hostConnections.get(sourceConnKey);
        if (conn?.open) {
          this.sendPacketToConn(conn, {
            type: 'pong',
            senderId: this.opts.deviceId,
            roomId: this.opts.roomId,
          });
        }
      } else if (this.clientConn?.open) {
        this.sendPacketToConn(this.clientConn, {
          type: 'pong',
          senderId: this.opts.deviceId,
          roomId: this.opts.roomId,
        });
      }
      return;
    }

    if (packet.type === 'pong') {
      return;
    }

    if (packet.type === 'request-sync' && this.effectiveRole === 'host' && sourceConnKey) {
      const conn = this.hostConnections.get(sourceConnKey);
      if (conn?.open) {
        this.sendPacketToConn(conn, {
          type: 'host-sync',
          senderId: this.opts.deviceId,
          roomId: this.opts.roomId,
          payload: this.opts.getSnapshot(),
        });
      }
      return;
    }

    if (packet.type === 'host-sync' && isValidSnapshot(packet.payload)) {
      this.gotHostSyncForCurrentConn = true;
      this.clearFallbackSyncTimer();
      this.opts.onReceiveHostSync(packet.payload);
      return;
    }

    if (
      packet.type === 'upsert-element' &&
      packet.payload &&
      typeof packet.payload === 'object' &&
      typeof packet.payload.pageId === 'string' &&
      packet.payload.element &&
      typeof packet.payload.element === 'object' &&
      packet.senderId
    ) {
      this.opts.onReceiveElementUpsert(
        packet.payload.pageId,
        packet.payload.element,
        typeof packet.payload.updatedAtMs === 'number' ? packet.payload.updatedAtMs : Date.now(),
        packet.senderId
      );
      if (this.effectiveRole === 'host') {
        this.relayToOthers(packet as PeerPacket, sourceConnKey);
      }
      return;
    }

    if (
      packet.type === 'remove-element' &&
      packet.payload &&
      typeof packet.payload === 'object' &&
      typeof packet.payload.pageId === 'string' &&
      typeof packet.payload.elementId === 'string' &&
      packet.senderId
    ) {
      this.opts.onReceiveElementRemove(
        packet.payload.pageId,
        packet.payload.elementId,
        typeof packet.payload.updatedAtMs === 'number' ? packet.payload.updatedAtMs : Date.now(),
        packet.senderId
      );
      if (this.effectiveRole === 'host') {
        this.relayToOthers(packet as PeerPacket, sourceConnKey);
      }
      return;
    }

    if (packet.type === 'state' && isValidSnapshot(packet.payload) && packet.senderId) {
      this.opts.onReceiveState(packet.payload, packet.senderId);
      // If we are Host, relay to all other connected Remotes / Extend screens
      if (this.effectiveRole === 'host') {
        this.relayToOthers(packet as PeerPacket, sourceConnKey);
      }
      return;
    }

    if (
      packet.type === 'liveStroke' &&
      packet.payload &&
      typeof packet.payload === 'object' &&
      typeof packet.payload.pageId === 'string' &&
      packet.senderId
    ) {
      this.opts.onReceiveLiveStroke(
        packet.payload.pageId,
        packet.payload.element ?? null,
        packet.senderId
      );
      if (this.effectiveRole === 'host') {
        this.relayToOthers(packet as PeerPacket, sourceConnKey);
      }
    }
  }

  private pruneStaleChunkBuffers() {
    const cutoff = Date.now() - 15_000;
    for (const [id, buf] of this.chunkBuffers.entries()) {
      if (buf.createdAt < cutoff) {
        this.chunkBuffers.delete(id);
      }
    }
  }

  private relayToOthers(packet: PeerPacket, excludeKey?: string) {
    for (const [key, conn] of this.hostConnections.entries()) {
      if (key === excludeKey || !conn.open) continue;
      this.sendPacketToConn(conn, packet);
    }
  }

  private sendPacketToConn(conn: DataConnection, packet: PeerPacket): boolean {
    if (!conn.open) return false;
    try {
      const serialized = JSON.stringify(packet);
      if (serialized.length <= CHUNK_CHAR_LIMIT) {
        conn.send(packet);
        return true;
      }

      // Split large payloads (e.g. multi-page flipchart snapshot) into safe 12KB WebRTC chunks
      const total = Math.ceil(serialized.length / CHUNK_CHAR_LIMIT);
      if (total > 256) return false;
      this.msgSeq = (this.msgSeq + 1) % 1_000_000;
      const msgId = `${this.opts.deviceId.slice(-6)}-${Date.now().toString(36)}-${this.msgSeq}`;
      for (let i = 0; i < total; i++) {
        const chunkData = serialized.slice(i * CHUNK_CHAR_LIMIT, (i + 1) * CHUNK_CHAR_LIMIT);
        conn.send({
          type: 'chunk',
          senderId: this.opts.deviceId,
          roomId: this.opts.roomId,
          msgId,
          index: i,
          total,
          data: chunkData,
        } satisfies PeerPacket);
      }
      return true;
    } catch {
      return false;
    }
  }

  private startClientRetryLoop() {
    if (this.retryIntervalId !== null) {
      window.clearInterval(this.retryIntervalId);
    }
    this.retryIntervalId = window.setInterval(() => {
      if (this.destroyed || this.effectiveRole !== 'client') return;
      if (!this.clientConn?.open && !this.isConnectingAttempt) {
        this.connectToHost();
      }
    }, 2500);
  }

  private startKeepaliveLoop() {
    if (this.keepaliveIntervalId !== null) {
      window.clearInterval(this.keepaliveIntervalId);
    }
    this.keepaliveIntervalId = window.setInterval(() => {
      if (this.destroyed) return;
      const ping: PeerPacket = {
        type: 'ping',
        senderId: this.opts.deviceId,
        roomId: this.opts.roomId,
      };
      this.sendRaw(ping);
    }, KEEPALIVE_INTERVAL_MS);
  }

  private handleVisibilityOrOnline() {
    if (this.destroyed) return;
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
    if (this.peer && !this.peer.destroyed && this.peer.disconnected) {
      try {
        this.peer.reconnect();
      } catch {
        // Ignore
      }
    }
    if (this.effectiveRole === 'client' && !this.clientConn?.open && !this.isConnectingAttempt) {
      this.connectToHost();
    }
  }

  private clearConnectTimeout() {
    if (this.connectTimeoutId !== null) {
      window.clearTimeout(this.connectTimeoutId);
      this.connectTimeoutId = null;
    }
  }

  private clearFallbackSyncTimer() {
    if (this.fallbackSyncRequestTimerId !== null) {
      window.clearTimeout(this.fallbackSyncRequestTimerId);
      this.fallbackSyncRequestTimerId = null;
    }
  }

  private getOpenCount(): number {
    if (this.effectiveRole === 'host') return this.hostConnections.size;
    return this.clientConn?.open ? 1 : 0;
  }

  public isConnected(): boolean {
    return this.getOpenCount() > 0;
  }

  public sendState(snapshot: RoomSyncSnapshot): boolean {
    if (this.destroyed) return false;
    const packet: PeerPacket = {
      type: 'state',
      senderId: this.opts.deviceId,
      roomId: this.opts.roomId,
      payload: snapshot,
    };
    return this.sendRaw(packet);
  }

  public sendElementUpsert(
    pageId: string,
    element: CanvasElement,
    updatedAtMs: number
  ): boolean {
    if (this.destroyed) return false;
    const packet: PeerPacket = {
      type: 'upsert-element',
      senderId: this.opts.deviceId,
      roomId: this.opts.roomId,
      payload: { pageId, element, updatedAtMs },
    };
    return this.sendRaw(packet);
  }

  public sendElementRemove(pageId: string, elementId: string, updatedAtMs: number): boolean {
    if (this.destroyed) return false;
    const packet: PeerPacket = {
      type: 'remove-element',
      senderId: this.opts.deviceId,
      roomId: this.opts.roomId,
      payload: { pageId, elementId, updatedAtMs },
    };
    return this.sendRaw(packet);
  }

  public sendLiveStroke(pageId: string, element: CanvasElement | null): boolean {
    if (this.destroyed) return false;
    const packet: PeerPacket = {
      type: 'liveStroke',
      senderId: this.opts.deviceId,
      roomId: this.opts.roomId,
      payload: { pageId, element },
    };
    return this.sendRaw(packet);
  }

  private sendRaw(packet: PeerPacket): boolean {
    if (this.effectiveRole === 'host') {
      let sentAny = false;
      for (const conn of this.hostConnections.values()) {
        if (conn.open && this.sendPacketToConn(conn, packet)) {
          sentAny = true;
        }
      }
      return sentAny;
    }
    if (this.clientConn?.open) {
      return this.sendPacketToConn(this.clientConn, packet);
    }
    return false;
  }

  private cleanupPeerOnly() {
    this.clearConnectTimeout();
    this.clearFallbackSyncTimer();
    this.isConnectingAttempt = false;
    this.gotHostSyncForCurrentConn = false;
    this.chunkBuffers.clear();

    for (const conn of this.hostConnections.values()) {
      try {
        conn.close();
      } catch {
        // Ignore
      }
    }
    this.hostConnections.clear();

    if (this.clientConn) {
      try {
        this.clientConn.close();
      } catch {
        // Ignore
      }
      this.clientConn = null;
    }

    if (this.peer) {
      try {
        this.peer.destroy();
      } catch {
        // Ignore
      }
      this.peer = null;
    }
  }

  public destroy() {
    this.destroyed = true;
    if (this.retryIntervalId !== null) {
      window.clearInterval(this.retryIntervalId);
      this.retryIntervalId = null;
    }
    if (this.keepaliveIntervalId !== null) {
      window.clearInterval(this.keepaliveIntervalId);
      this.keepaliveIntervalId = null;
    }
    if (typeof window !== 'undefined') {
      window.removeEventListener('online', this.handleVisibilityOrOnline);
      document.removeEventListener('visibilitychange', this.handleVisibilityOrOnline);
    }
    this.cleanupPeerOnly();
  }
}
