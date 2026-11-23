import { initializeApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInAnonymously,
  signInWithPopup,
  signInWithRedirect,
  signOut,
} from 'firebase/auth';
import { doc, getDocFromServer, getFirestore } from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';
import { CanvasElement, MAX_ELEMENTS_PER_PAGE } from '../types/whiteboard';

const app = initializeApp(firebaseConfig);

// CRITICAL: Connect to the provisioned named Firestore database ID
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export function isPermissionError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  return msg.includes('permission-denied') || msg.includes('Missing or insufficient permissions');
}

export function isQuotaError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  return msg.toLowerCase().includes('quota exceeded');
}

export async function signInAnonymousSession() {
  return signInAnonymously(auth);
}

export async function signInWithGoogle() {
  return signInWithPopup(auth, googleProvider);
}

export async function signInWithGoogleRedirect() {
  return signInWithRedirect(auth, googleProvider);
}

export async function signOutGoogle() {
  return signOut(auth);
}

/**
 * Volumetric & structural sanitization strictly synchronized with firebase-blueprint.json:
 * - Caps elements array at MAX_ELEMENTS_PER_PAGE (400)
 * - Rounds coordinates to integers to keep Firestore document payload lightweight
 * - Caps text length & point density
 */
export function sanitizeElementsForFirestore(elements: CanvasElement[]): Record<string, unknown>[] {
  return elements.slice(-MAX_ELEMENTS_PER_PAGE).map((el) => {
    if (el.type === 'pen' || el.type === 'highlighter') {
      // Downsample very long strokes slightly if > 1600 numbers (800 pts) to keep doc compact
      let pts = el.points;
      if (pts.length > 1600) {
        const step = Math.ceil(pts.length / 1600) * 2;
        const sampled: number[] = [];
        for (let i = 0; i < pts.length; i += step) {
          sampled.push(Math.round(pts[i]), Math.round(pts[i + 1] ?? pts[pts.length - 1]));
        }
        if (pts.length >= 2) {
          sampled.push(Math.round(pts[pts.length - 2]), Math.round(pts[pts.length - 1]));
        }
        pts = sampled;
      } else {
        pts = pts.map((n) => Math.round(n));
      }
      return {
        id: el.id.slice(0, 64),
        type: el.type,
        color: el.color.slice(0, 16),
        size: Math.round(el.size),
        opacity: Number(el.opacity.toFixed(2)),
        points: pts,
      };
    }
    if (el.type === 'text') {
      return {
        id: el.id.slice(0, 64),
        type: 'text',
        color: el.color.slice(0, 16),
        size: Math.round(el.size),
        opacity: Number(el.opacity.toFixed(2)),
        x: Math.round(el.x),
        y: Math.round(el.y),
        text: el.text.slice(0, 1000),
        fontSize: Math.round(el.fontSize),
      };
    }
    if (el.type === 'sticky') {
      return {
        id: el.id.slice(0, 64),
        type: 'sticky',
        color: el.color.slice(0, 16),
        bgColor: el.bgColor.slice(0, 16),
        size: Math.round(el.size),
        opacity: Number(el.opacity.toFixed(2)),
        x: Math.round(el.x),
        y: Math.round(el.y),
        width: Math.max(120, Math.min(480, Math.round(el.width))),
        height: Math.max(100, Math.min(420, Math.round(el.height))),
        text: el.text.slice(0, 600),
        fontSize: Math.round(el.fontSize),
      };
    }
    if (el.type === 'line' || el.type === 'arrow' || el.type === 'rect' || el.type === 'ellipse') {
      return {
        id: el.id.slice(0, 64),
        type: el.type,
        color: el.color.slice(0, 16),
        size: Math.round(el.size),
        opacity: Number(el.opacity.toFixed(2)),
        x1: Math.round(el.x1),
        y1: Math.round(el.y1),
        x2: Math.round(el.x2),
        y2: Math.round(el.y2),
      };
    }
    return {};
  });
}

// Mandatory startup connectivity check
async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
  }
}
void testConnection();
