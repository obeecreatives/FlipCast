# FlipCast Security Specification

## 1. Data Invariants
1. **Authenticated Session (Zero-Email Anonymous + Optional Google)**: FlipCast explicitly supports Firebase Anonymous Authentication (`signInAnonymously`) alongside Google Sign-In so Laptop and Tablet devices sync instantly without email login. Every read/write strictly requires `request.auth != null` (unauthenticated requests are always denied).
2. **Owner Immutability**: Once a `/rooms/{roomId}`, `/rooms/{roomId}/pages/{pageId}`, or `/users/{userId}/templates/{templateId}` document is created, `ownerId`/`userId`, `roomId`, `pageId`, and `createdAt` can never be mutated.
3. **Master Gate Membership**: Every read/write to `/rooms/{roomId}/pages/{pageId}` and `/rooms/{roomId}/liveStroke/current` requires the parent room to exist AND the caller to be either the room owner or a registered presenter in `/rooms/{roomId}/editors/{uid}`. Room owners can revoke any editor at any time by deleting their editor record.
4. **Bounded Structures, Device Identity & Temporal Integrity**: Every string has explicit `.size()` bounds, optional `sourceDeviceId` (`boardDeviceId`) is strictly validated (`^[a-zA-Z0-9_\-]+$`, `1..64` chars), every array has explicit `.size()` caps (`pageOrder <= 50`, `elements <= 400`, `blocks <= 20`), and all `createdAt`/`updatedAt`/`joinedAt` fields must equal `request.time`.
5. **Secure List Queries**: No `allow list` uses `get()` or `exists()`, and every `allow list` enforces `existing().ownerId == request.auth.uid` (or `existing().userId == request.auth.uid` / `existing().uid == request.auth.uid`).

## 2. "Dirty Dozen" Adversarial Payloads
See `firestore.rules.test.ts` for all 12 adversarial payloads testing Identity Spoofing, Shadow Field Injection, Unauthenticated Access, Oversized `sourceDeviceId`, Role Escalation, Orphaned Pages, Revoked Editors, Value Poisoning, ID Poisoning, Forged Timestamps, and Cross-User Template Exfiltration.
