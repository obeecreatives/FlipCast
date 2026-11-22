# FlipCast Security Specification

## 1. Data Invariants
1. **Verified Identity**: Every authenticated read/write requires `request.auth != null && request.auth.token.email_verified == true`.
2. **Owner Immutability**: Once a `/rooms/{roomId}`, `/rooms/{roomId}/pages/{pageId}`, or `/users/{userId}/templates/{templateId}` document is created, `ownerId`/`userId`, `roomId`, `pageId`, and `createdAt` can never be mutated.
3. **Master Gate Membership**: Every read/write to `/rooms/{roomId}/pages/{pageId}` and `/rooms/{roomId}/liveStroke/current` requires the parent room to exist AND the caller to be either the room owner or a registered presenter in `/rooms/{roomId}/editors/{uid}`. Room owners can revoke any editor at any time by deleting their editor record.
4. **Bounded Structures & Temporal Integrity**: Every string has explicit `.size()` bounds, every array has explicit `.size()` caps (`pageOrder <= 50`, `elements <= 400`, `blocks <= 20`), and all `createdAt`/`updatedAt`/`joinedAt` fields must equal `request.time`.
5. **Secure List Queries**: No `allow list` uses `get()` or `exists()`, and every `allow list` enforces `existing().ownerId == request.auth.uid` (or `existing().userId == request.auth.uid` / `existing().uid == request.auth.uid`).
