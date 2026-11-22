/**
 * Phase 0 Security Test Specification for FlipCast Firestore Rules.
 * Verifies all 12 "Dirty Dozen" adversarial payloads are rejected (PERMISSION_DENIED).
 *
 * Run with Firebase Emulator Suite (`@firebase/rules-unit-testing`) when testing locally.
 */

export interface AdversarialPayloadCase {
  id: number;
  name: string;
  operation: 'get' | 'list' | 'create' | 'update' | 'delete';
  path: string;
  actor: {
    uid: string;
    email_verified: boolean;
  };
  payload?: Record<string, unknown>;
  expected: 'PERMISSION_DENIED';
  violatedPillar: string;
}

export const DIRTY_DOZEN_PAYLOADS: AdversarialPayloadCase[] = [
  {
    id: 1,
    name: 'Identity Spoofing on Room Create',
    operation: 'create',
    path: '/rooms/ROOM-1001',
    actor: { uid: 'attacker-uid', email_verified: true },
    payload: {
      roomId: 'ROOM-1001',
      ownerId: 'victim-uid',
      title: 'Hijacked Board',
      pinEnabled: true,
      pinVersion: 1,
      activePageId: 'page-1',
      pageOrder: ['page-1'],
      updatedBy: 'attacker-uid',
    },
    expected: 'PERMISSION_DENIED',
    violatedPillar: 'Pillar 2: Identity Integrity',
  },
  {
    id: 2,
    name: 'Shadow Field Injection on Room Update',
    operation: 'update',
    path: '/rooms/ROOM-1001',
    actor: { uid: 'owner-uid', email_verified: true },
    payload: {
      title: 'Updated Title',
      isAdmin: true,
    },
    expected: 'PERMISSION_DENIED',
    violatedPillar: 'Pillar 2 & 5: Strict Keys / Shadow Update Test',
  },
  {
    id: 3,
    name: 'Unverified Email Write Attempt',
    operation: 'create',
    path: '/rooms/ROOM-2002',
    actor: { uid: 'unverified-uid', email_verified: false },
    payload: {
      roomId: 'ROOM-2002',
      ownerId: 'unverified-uid',
      title: 'Unverified Board',
      pinEnabled: false,
      pinVersion: 1,
      activePageId: 'page-1',
      pageOrder: ['page-1'],
      updatedBy: 'unverified-uid',
    },
    expected: 'PERMISSION_DENIED',
    violatedPillar: 'Verified User Gate (Email Spoofing Test)',
  },
  {
    id: 4,
    name: 'Secret PIN Hash Exfiltration by Non-Owner',
    operation: 'get',
    path: '/rooms/ROOM-1001/security/pin',
    actor: { uid: 'co-presenter-uid', email_verified: true },
    expected: 'PERMISSION_DENIED',
    violatedPillar: 'Pillar 6: Secret & PII Isolation',
  },
  {
    id: 5,
    name: 'Wrong PIN Proof on Editor Join',
    operation: 'create',
    path: '/rooms/ROOM-1001/editors/attacker-uid',
    actor: { uid: 'attacker-uid', email_verified: true },
    payload: {
      uid: 'attacker-uid',
      roomId: 'ROOM-1001',
      role: 'presenter',
      pinProof: '0'.repeat(64),
      pinVersion: 1,
    },
    expected: 'PERMISSION_DENIED',
    violatedPillar: 'Pillar 1: Cryptographic Master Gate',
  },
  {
    id: 6,
    name: 'Role Escalation on Editor Join',
    operation: 'create',
    path: '/rooms/ROOM-1001/editors/attacker-uid',
    actor: { uid: 'attacker-uid', email_verified: true },
    payload: {
      uid: 'attacker-uid',
      roomId: 'ROOM-1001',
      role: 'owner',
      pinProof: 'a'.repeat(64),
      pinVersion: 1,
    },
    expected: 'PERMISSION_DENIED',
    violatedPillar: 'Pillar 4: Tiered Identity Logic',
  },
  {
    id: 7,
    name: 'Orphaned Flipchart Page Creation',
    operation: 'create',
    path: '/rooms/NONEXISTENT/pages/page-1',
    actor: { uid: 'attacker-uid', email_verified: true },
    payload: {
      pageId: 'page-1',
      roomId: 'NONEXISTENT',
      ownerId: 'attacker-uid',
      name: 'Orphan Page',
      background: 'white',
      order: 0,
      elements: [],
      updatedBy: 'attacker-uid',
    },
    expected: 'PERMISSION_DENIED',
    violatedPillar: 'Pillar 1: Parent Room Existence Check',
  },
  {
    id: 8,
    name: 'Revoked Editor Writing After PIN Rotation',
    operation: 'update',
    path: '/rooms/ROOM-1001/pages/page-1',
    actor: { uid: 'revoked-editor-uid', email_verified: true },
    payload: {
      elements: [],
      updatedBy: 'revoked-editor-uid',
    },
    expected: 'PERMISSION_DENIED',
    violatedPillar: 'Pillar 1: Synchronous Membership Revocation',
  },
  {
    id: 9,
    name: 'Value Poisoning on Flipchart Background Enum',
    operation: 'update',
    path: '/rooms/ROOM-1001/pages/page-1',
    actor: { uid: 'owner-uid', email_verified: true },
    payload: {
      background: 'malicious-theme',
      updatedBy: 'owner-uid',
    },
    expected: 'PERMISSION_DENIED',
    violatedPillar: 'Pillar 2: Value Poisoning Test',
  },
  {
    id: 10,
    name: 'ID Poisoning & Oversized Page Name (Denial of Wallet)',
    operation: 'create',
    path: `/rooms/ROOM-1001/pages/${'x'.repeat(200)}`,
    actor: { uid: 'owner-uid', email_verified: true },
    payload: {
      pageId: 'x'.repeat(200),
      roomId: 'ROOM-1001',
      ownerId: 'owner-uid',
      name: 'A'.repeat(5000),
      background: 'white',
      order: 1,
      elements: [],
      updatedBy: 'owner-uid',
    },
    expected: 'PERMISSION_DENIED',
    violatedPillar: 'Pillar 3: Path Variable & String Size Hardening',
  },
  {
    id: 11,
    name: 'Client-Forged Timestamp on Update',
    operation: 'update',
    path: '/rooms/ROOM-1001',
    actor: { uid: 'owner-uid', email_verified: true },
    payload: {
      activePageId: 'page-2',
      updatedBy: 'owner-uid',
      updatedAt: new Date('2020-01-01T00:00:00Z'),
    },
    expected: 'PERMISSION_DENIED',
    violatedPillar: 'Temporal Integrity (Strict request.time)',
  },
  {
    id: 12,
    name: 'Cross-User Private Template Exfiltration',
    operation: 'get',
    path: '/users/victim-uid/templates/tpl-1',
    actor: { uid: 'attacker-uid', email_verified: true },
    expected: 'PERMISSION_DENIED',
    violatedPillar: 'Pillar 6 & 8: Private User Isolation',
  },
];
