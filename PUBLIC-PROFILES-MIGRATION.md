# Public Profiles Security Migration

## Scope

Separate mixed public profile documents into narrowly scoped Firestore collections without changing the live site or publishing Firestore Rules during the preparation phase.

Working branch: `security/public-profiles-migration`

Testing scope: currently three owner-controlled testing accounts. There are no public users yet, according to the project owner. We can use staged per-owner migration for these accounts rather than preparing a bulk migration for a large user base. Do not delete the three accounts or their legacy documents.

Authoritative Rules baseline: the user's downloaded `indian-firestore-rules-read-receipt.txt`. Preserve its personal Messages Read Receipt rules and all Group Chat rules unchanged unless a separately reviewed migration requires a specific helper change.

## Current data and code dependencies

### `publicProfiles/{uid}`

Currently contains or may contain:
- `uid`, `displayName`, `bio`, `photoURL`
- `activeStories` (story media, captions, music/audio data, timestamps and expiry)
- `liveSession`
- `presenceOnline`, `presenceAtMs`, `lastSeenAtMs`
- `typingToUid`, `typingAtMs`
- `messageReactions`

Current app dependencies found:
- `index.html`: People discovery, own profile hydration, presence/typing display, story viewer, live people, reaction totals, story creation/cleanup, profile editing, Uran profile/view/comment/follow functions.
- `group-chat.js`: searches `publicProfiles` to find group members by display name.
- Firestore Rules: `hasActiveStory(ownerUid, storyId)` reads `publicProfiles/{ownerUid}.activeStories` for `storyInteractions` creation.
- Uran reads public profile fields for creator details, views, comments and follow records.

## Proposed target collections

- `publicProfiles/{uid}`: only public identity fields: `uid`, `displayName`, `bio`, `photoURL`, and timestamps.
- `userStories/{uid}`: active story records and last-story timestamp. Keep existing max-three and 24-hour expiry behavior.
- `userPresence/{uid}`: online and last-seen timestamps.
- `userTyping/{uid}`: recipient-targeted typing state; reads must be scoped to the intended recipient.
- `userLiveStatus/{uid}`: live-session state and title.
- `messageReactions/{uid_messageId}`: one user's reaction for one message, with an owner UID and message ID.
- `publicProfileMigrations/{uid}`: per-owner migration completion marker and verification report. This collection is internal and must not be publicly readable.

## Migration constraints

1. Do not delete or overwrite legacy fields until the new records have been copied and verified.
2. Do not switch legacy `publicProfiles` to owner-only reads while the app still relies on it for People, Stories, presence, live status, reactions, Uran, or Group Chat member search.
3. A signed-in browser client can safely copy only its own legacy document under owner-only write rules. With only three owner-controlled testing accounts, run the migration separately while each account is signed in.
4. During a staged migration, the app must tolerate users who have not yet migrated. The final restrictive Rules phase must not happen until all three accounts are verified.
5. Story interaction Rules must check `userStories` after story migration.
6. Keep personal Messages Read Receipt rules and Group Chat rules unchanged.
7. Never expose typing records to users other than the intended recipient.
8. Keep old and new data synchronized during the transition, with explicit rollback instructions.
9. Do not delete any Firebase Authentication account or legacy `publicProfiles` document as a shortcut.

## Required implementation phases

### Phase A — audit and migration scaffold
- Enumerate every read/write of the legacy fields and all consumers of the global profile arrays.
- Define the new collection shapes and a copy-only per-owner migration routine.
- Verify copied records before writing the completion marker.
- Keep the routine dormant until the new Firestore Rules are reviewed and approved.
- Do not tighten legacy read Rules yet.

### Phase B — compatibility and feature migration
- Add new-collection readers with legacy fallback and dual writes for the current user's data.
- Move Stories and update the story viewer, cleanup, and `hasActiveStory` Rules helper.
- Move presence and recipient-targeted typing.
- Move live status.
- Move message reactions and shared totals.
- Keep public profile fields available to People, Uran, and Group Chat member search.

### Phase C — verification
Test all three controlled accounts and at least two devices:
- Sign-up/login and profile name, bio, photo
- People search and Group Chat member search
- Story photo, video, music, expiry, views, likes and emoji reactions
- Online/last-seen and typing visibility to the correct recipient only
- Live status start/end and Live People
- Message reaction totals and synchronization
- Uran creator profile, views, comments and follow
- Personal Messages and Read Receipt
- Group Chat create, member search, send, receive and delete
- Migration behavior for each of the three accounts and rollback

### Phase D — final security tightening
- Verify migration coverage for all three existing test profiles.
- Verify legacy documents no longer contain story, presence, typing, live or reaction data.
- Only then restrict legacy collection access and remove compatibility reads/writes.
- Publish Rules only after explicit user approval.

## Current status

- Separate working branch: `security/public-profiles-migration`.
- Full dependency audit completed for the known `index.html` and `group-chat.js` consumers.
- Added a standalone copy-only migration scaffold; it is not loaded by the live page and cannot run yet.
- No application behavior has changed.
- No Firestore Rules have been published.
- No Firebase data has been migrated, overwritten or deleted.


## Rules draft review — 2026-11-10

- Added `firestore.rules.public-profiles-migration-DRAFT.txt` as a review-only draft. It is not published and is not ready to paste into Firebase yet.
- The personal Messages Read Receipt block was compared with the authoritative user-supplied Rules file and is byte-for-byte unchanged.
- The complete Indian Group Chat block was compared with the authoritative user-supplied Rules file and is byte-for-byte unchanged.
- The story interaction existence check and `hasActiveStory` helper now point to `userStories/{uid}` in the draft.
- New collection Rules were added for stories, presence, recipient-scoped typing, live status, reactions, and private migration markers.
- The existing app still writes and reads the legacy `publicProfiles` fields directly. The new collections are not yet integrated into the live app code.
- The draft has not been compiled or tested with the Firestore Emulator. Query compatibility, exact field validation, and per-feature read/write behavior remain to be verified before publication.
- No Rules were published, no Firebase data was changed, and no application source file was modified in this review step.
