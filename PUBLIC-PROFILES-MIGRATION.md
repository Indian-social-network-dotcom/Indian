# Public Profiles Security Migration

## Scope

Separate mixed public profile documents into narrowly scoped Firestore collections without changing the live site or publishing Firestore Rules during the preparation phase.

Working branch: `security/public-profiles-migration`

Testing scope: currently three owner-controlled testing accounts. There are no public users yet, according to the project owner. We can use staged per-owner migration for these accounts rather than preparing a bulk migration for a large user base. Do not delete the three accounts or their legacy documents.

Authoritative Rules baseline: the current Rules file uploaded by the user on 2026-11-11. Its Personal Messages block intentionally has sender-only update/delete and does NOT grant receiver-side Read Receipt updates. Keep that behavior; do not add the separate Read Receipt update rule. Preserve Group Chat Rules unchanged.

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
6. Keep Personal Messages sender-only update/delete behavior (no receiver-side Read Receipt rule) and Group Chat rules unchanged.
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
- Personal Messages (sender-only update/delete; no receiver-side Read Receipt permission)
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
- The Personal Messages block was compared with the user's 2026-11-11 uploaded Rules file. The migration draft now matches its sender-only update/delete behavior; no receiver-side Read Receipt update rule is included.
- The complete Indian Group Chat block was compared with the authoritative user-supplied Rules file and is byte-for-byte unchanged.
- The story interaction existence check and `hasActiveStory` helper now point to `userStories/{uid}` in the draft.
- New collection Rules were added for stories, presence, recipient-scoped typing, live status, reactions, and private migration markers.
- The existing app still writes and reads the legacy `publicProfiles` fields directly. The new collections are not yet integrated into the live app code.
- The draft has not been compiled or tested with the Firestore Emulator. Query compatibility, exact field validation, and per-feature read/write behavior remain to be verified before publication.
- No Rules were published, no Firebase data was changed, and no application source file was modified in this review step.


## Compatibility audit — 2026-11-10

- Confirmed the global `publicProfiles` snapshot in `index.html` currently supplies identity, Stories, presence/typing, Live People, and shared message-reaction totals.
- Confirmed `group-chat.js` still reads `publicProfiles` to search group members. This must remain available for public identity fields throughout the migration.
- Confirmed the current app writes story, presence, typing, live-session and message-reaction data only to the legacy profile document. No separated-collection listeners or dual-write compatibility layer is installed yet.
- Important blocker: the current Rules draft's `hasActiveStory` helper checks only `userStories`, while the current website still stores active stories in `publicProfiles`. Publishing that draft before the app migration would break creation of Story view/like/reaction records for unmigrated accounts.
- Therefore the Rules draft remains review-only and must not be published. The compatibility implementation must first add new-collection readers with legacy fallback and safe transition writes, then be tested across the three accounts.
- Strengthened `public-profile-migration.js`: it now refuses to mark migration complete if an existing target document conflicts with the legacy data, and it re-reads and verifies every copied target record (including each reaction) before writing the completion marker. It still never deletes or overwrites legacy documents.
- The migration helper remains dormant and is not loaded by `index.html`.
- No application runtime code was changed in this Rules alignment step. No Firestore Rules were published. No Firebase data was changed or deleted. The receiver-side Read Receipt permission remains absent; Group Chat Rules were not edited.


## Compatibility implementation design — 2026-11-11

Before changing runtime code, the staged transition is clarified:

1. Keep `publicProfiles/{uid}` readable for public identity and legacy fallback. Keep its identity fields (`uid`, `displayName`, `bio`, `photoURL`) available to People, Uran and Group Chat.
2. Add independent listeners for `userStories`, `userPresence`, `userLiveStatus`, and `messageReactions`. During transition, combine new records with legacy values without duplicating stories or reactions; new records take precedence only when that owner's migration marker is verified.
3. Typing must not use a collection-wide listener: the draft explicitly denies `list` on `userTyping`. Read the specific sender's typing document only for the currently open conversation, with the recipient UID check enforced by Rules. Clear/unsubscribe on conversation change and sign-out.
4. Writes must be staged. Until the new Rules are published, new collection writes will be denied. Compatibility writes must catch that expected permission denial and preserve the legacy write path. After the transitional Rules are approved and published, test new writes and legacy fallback on all three accounts before any legacy fields are removed.
5. Do not change the story interaction Rules helper to depend exclusively on `userStories` until the story document exists for the owner; retain a safe legacy-aware transition check during staged migration.
6. The current migration scaffold is copy-only and dormant. It must run only after transitional Rules permit the owner to read/write the new collections and the owner-only migration marker. It must never clear legacy data.

### Detailed source audit findings
- The Firebase module already imports `doc`, `getDoc`, `getDocs`, `setDoc`, `updateDoc`, `collection`, `query`, `where`, `onSnapshot`, and `serverTimestamp`; no additional Firestore imports are needed in that module.
- Existing profile snapshot is at `loadFirebasePublicProfiles()`; it currently aggregates identity, presence, typing, stories, live sessions, and reactions from `publicProfiles`.
- Story creation and expiry cleanup read/write `activeStories` on the current user's legacy profile.
- Presence heartbeat and pagehide write presence fields on the legacy profile.
- Typing writes recipient UID and timestamp on the legacy profile; the current UI consumes it from the global profile array.
- Live status writes `liveSession` on the legacy profile.
- Message reaction writes an owner-scoped map on the legacy profile; the global profile snapshot calculates shared totals from that map.
- The code has not yet been modified for the compatibility layer. This is intentional: changing only the writer or only the listener would make the app inconsistent during the staged Rules transition.
- No Rules published and no Firebase data changed.


## Migration retry-safety fix — 2026-11-11

- Updated `public-profile-migration.js` in commit `f51ddd7b038a0318776913a8219f2bb330c18e87`.
- Reaction migration now uses a deterministic timestamp fallback from the legacy profile's update timestamp instead of `Date.now()`. An interrupted migration can therefore retry without inventing a different reaction record timestamp.
- Reaction document IDs are validated before writes; empty or oversized IDs stop the migration with an explicit error rather than creating an invalid target path.
- This is a migration-helper-only change. It does not run the helper, write Firebase data, alter Firestore Rules, change the live website, or touch Group Chat / Read Receipt code.
- Runtime compatibility remains blocked on completing and validating the transitional Rules and the read/write integration. Do not publish the current Rules draft or run the migration yet.


## Story Rules transition fix — 2026-11-11

- Updated only the story-validation helper and its create-condition in `firestore.rules.public-profiles-migration-DRAFT.txt` (commit `41d1e1dd6122234e074001dd3c9e387d1afcbd9b`).
- Story interactions now accept an active story found in either `userStories/{uid}` or the legacy `publicProfiles/{uid}.activeStories`. This avoids breaking views/likes/reactions for accounts that have not yet migrated.
- The Group Chat Rules and Personal Messages Read Receipt Rules were not edited in this commit; only the story helper and its call site were changed.
- This remains a draft only. It has not been compiled or tested in the Firestore Emulator and must not be published yet.


## Verified schema-version marker — 2026-11-11

- Updated `public-profile-migration.js` in commit `79efee089423a9d020fce7492995c68c3c597031`.
- After all separated target documents are re-read and verified, the helper writes the non-sensitive `profileSchemaVersion: 2` flag to the owner's existing public identity document. The private owner-only migration report is written afterward.
- Runtime readers can use this public flag to switch an owner from legacy fields to separated records only after the complete copy has been verified. This avoids treating partially copied collections as authoritative.
- The update uses merge semantics and does not remove or overwrite any legacy story, presence, typing, live-status or reaction fields. The existing public identity fields remain in the document.
- The flag is not written by this work session; the migration helper remains dormant. The Rules draft and app code are still not ready for publication or execution.


## Typing Rules first-read correction — 2026-11-11

- Updated only the `userTyping/{uid}` get condition in the Rules draft (commit `67f0425dba3bc526a798ffc91db6f2f58154e95a`).
- A signed-in recipient can now read a missing sender typing document as an empty/nonexistent result; when the document exists, only its owner or the UID in `typingToUid` can read it.
- Collection listing remains denied. This does not grant a collection-wide typing listener or expose another user's typing document.
- Draft remains uncompiled and unpublished. Runtime typing listener has not yet been switched to the recipient-specific document.


## Duplicate Rules draft clarification — 2026-11-11

- The branch contained two similarly named Rules draft files. The older `firestore-rules-public-profiles-migration-draft.txt` has now been clearly marked obsolete and must not be published.
- The current working draft is only `firestore.rules.public-profiles-migration-DRAFT.txt`.
- Neither file is approved for publication. The current draft still requires Firestore Emulator compilation and compatibility tests.


## Runtime compatibility implementation — 2026-11-11

Updated `index.html` on the migration branch only:

- Added independent listeners for `userStories`, `userPresence`, `userLiveStatus`, and `messageReactions`.
- The public identity profile remains sourced from `publicProfiles`; Group Chat's public identity lookup is not changed.
- New separated records become authoritative only when that owner's public identity document contains `profileSchemaVersion: 2`. Until then, the legacy fields remain the fallback.
- Added dual writes for reactions, stories, live status, presence, and typing. A denied new-collection write is caught and the existing legacy write remains in place. This allows the branch code to run before the transition Rules are published.
- Typing is not globally listed. It is polled only for the UID belonging to the currently open personal conversation, and the watcher stops when that chat closes or the user signs out.
- Sign-out now unsubscribes separated collection listeners and clears their in-memory maps.
- Legacy fields are not deleted. Group Chat and the personal Read Receipt implementation were not edited.

### Not yet validated / rollout blockers

- Firestore Emulator Rules compilation and tests are still required. The draft must not be published before these pass.
- Browser/runtime tests are still required for three accounts: public People discovery, Story create/view/expiry/interactions, presence/last-seen, Live People, reactions, typing visibility to only the intended recipient, Group Chat member lookup, and confirm personal Messages retain the requested sender-only update/delete behavior without receiver-side Read Receipt permission.
- A listener that receives permission-denied before Rules publication terminates; reload the page after the reviewed Rules are deliberately published to establish the new listeners.
- No migration helper was executed, no Firebase document was changed by this work, and no production Rules were published.


### Dual-write retry consistency correction

- Message reaction writes now calculate one `reactionCreatedAtMs` value and use it in both the legacy profile map and the separated `messageReactions` document (commit `685ffc5caaca047c466b325fe1e5c476a0d52ef8`).
- This prevents the migration helper from detecting a false conflict caused by two timestamps generated milliseconds apart when it compares the old and new records.


### Legacy reaction timestamp fallback correction

- Migration now uses `createdAtMs: 0` for legacy reaction values that have no timestamp (commit `725e80f42935e545cc9b233078e26d59cd20b99b`).
- It no longer derives that fallback from the public profile's `updatedAt`, which can change during normal presence/story writes and otherwise create a false conflict on a later retry.


## Branch integrity check — 2026-11-11

- Current migration branch is 32 commits ahead of `main`; it has no commits behind `main` at the time of this check.
- Changed paths are limited to this migration plan, the current Rules review draft, the obsolete duplicate Rules warning file, `index.html`, and `public-profile-migration.js`.
- Verified `group-chat.js` has the same Git blob SHA on the migration branch and `main`.
- Static delimiter checks passed for the edited application sections, the Rules draft, and the migration helper. This is not a JavaScript parser check, Firestore Rules compilation, emulator test, or browser test.
- Production branch, live Firestore Rules, and Firebase data have not been changed by this work.


## Automated validation harness — 2026-11-11

- Added an isolated test project under `firestore-rules-tests/`; it uses a demo-only Firestore Emulator project ID and loads the migration Rules draft directly.
- Added allow/deny tests for separated profile collections, recipient-only typing reads, private migration markers, new/legacy Story interaction lookup, sender-only personal Messages update/delete (receiver Read Receipt update denied), and Group Chat membership/message access.
- Added a syntax-check script for inline JavaScript modules in `index.html` and `public-profile-migration.js`.
- Added GitHub Actions workflow `.github/workflows/firestore-rules-emulator-tests.yml` to run syntax checks and Firestore Emulator tests on changes to the draft/harness.
- These files do not connect to the production Firebase project and contain no production credentials.
- The workflow run result has not yet been independently confirmed in this review. Do not treat the harness as passing until GitHub Actions reports success and any test failures are resolved.
- No production Rules were published; no migration helper was run; no Firestore data was changed.


## Firestore Emulator validation — 2026-11-11

- GitHub Actions Run #12 completed successfully: https://github.com/Indian-social-network-dotcom/Indian/actions/runs/42972026133
- The workflow copied the current Rules draft into the emulator project before startup. The emulator log contained no missing-Rules-file warning and no default allow-all fallback warning.
- JavaScript syntax validation passed for all 4 inline module scripts in `index.html`; `public-profile-migration.js` also passed `node --check`.
- Firestore Emulator executed 11 tests; all 11 passed and 0 failed.
- Coverage includes public profile owner writes, separated collections, recipient-only typing reads, private migration markers, separated and legacy Story interaction checks, sender-only personal Messages update/delete with receiver Read Receipt update denied, and Group Chat membership/message access.
- Run #11 is not counted as a valid Rules test result: it started without the copied Rules file and the emulator warned it would default to allowing all reads/writes. Run #12 includes the corrected preparation step and is the valid result.
- This is Rules/emulator and JavaScript syntax validation only. It is not a browser/device feature test, not a production Rules deployment, and not proof that the migration helper has been run.
- npm install reported 5 high-severity dependency advisories in the test dependency tree. Do not use `npm audit fix --force`; review the advisory paths and compatible upgrades separately.
- Production Rules remain unpublished. Migration helper remains dormant. No Firebase data was migrated, overwritten or deleted. `main` and the live website were not changed.


## Follow-up security review — 2026-11-11

- Confirmed that Firestore Rules cannot hide selected fields within a readable document. Therefore, while publicProfiles remains readable to signed-in users, old private fields left inside a migrated profile document (presence, typing, live status, stories, and reactions) remain readable even if the app stops using them.
- The migration must therefore have a separate, explicitly approved cleanup phase: only after each separated copy is verified, remove the migrated private fields from that owner's legacy publicProfiles document. This cleanup has NOT been run or authorized. Do not delete fields or documents yet.
- Runtime dual-write review found that several paths still wrote private fields to publicProfiles after schema version 2. Added guards so migrated accounts write reactions, stories, live status, presence, and typing only to separated collections. Story cleanup now reads from the separated story document after migration.
- Added a startup schema-version read before presence heartbeat starts, avoiding a race where a migrated account could briefly write presence back into its public profile before the public profile listener loads.
- Tightened message reaction create validation: exact four-field schema, owner UID, string message ID, emoji length <= 8, numeric timestamp. Added negative emulator tests for oversized emoji and unexpected fields.
- Upgraded test-only dependencies to firebase@13.2.0 and @firebase/rules-unit-testing@6.0.0 based on current package releases. The next CI run must confirm that this removes the advisories and that the test APIs remain compatible.
- These changes remain isolated to the migration branch. Production Rules are unpublished; no Firebase data has been migrated or deleted.


## Latest validation and dependency hardening — 2026-11-11

- GitHub Actions Run #21 completed successfully: https://github.com/Indian-social-network-dotcom/Indian/actions/runs/42974336708
- The latest run includes the schema-version startup-race fix, Node.js 24, Firebase test SDK 13.2.0, Rules Unit Testing 6.0.0, and the pinned @grpc/grpc-js 1.14.7 override.
- npm audit now reports 0 vulnerabilities (0 high, 0 moderate, 0 low, 0 critical).
- All 4 inline module scripts and the migration helper passed JavaScript syntax validation.
- Historical Firestore Emulator run: 11 passed, 0 failed. The current test suite now checks that receiver-side Read Receipt updates are denied, as requested.
- npm still reports some deprecation and install-script review warnings; these are not npm audit vulnerabilities. Do not blindly approve install scripts. The emulator workflow completed successfully despite these warnings.
- Runtime/browser testing with the three test accounts is still outstanding. Production Rules are not published, migration helper has not run, and no Firestore data was changed or deleted.


## Final runtime and helper audit follow-up — 2026-11-11

- Fixed a schema-version fallback issue in `index.html` (commit `4bb2409c9990d6c128644acf378a38976f423b01`): for a profile marked schema version 2, missing separated Stories, Presence, or Live Status documents now resolve to empty/offline/null state. The app no longer falls back to legacy private fields in `publicProfiles` merely because a separated document is absent.
- Fixed a migration-helper / Rules mismatch in `public-profile-migration.js` (commit `efbead4439c15bd75f64effba6cdc99e928252c8`): the helper previously added a `migratedFromPublicProfilesAt` field to every copied record. That extra field violates the exact four-field create schema for `messageReactions`. The helper now writes the exact source data fields; the reaction Rules schema remains strict.
- These two changes are on the migration branch only. GitHub Actions validation for these latest commits must complete successfully before treating the fixes as validated.
- No browser test has been run. No production Rules have been published, no migration helper has been executed, no Firestore data or legacy fields have been changed, and `main` remains untouched.


- Additional helper hardening (commit `896019c8159c6f64570251f8a156bd261f936c7e`): legacy reaction emoji values are now validated as strings within the Rules limit. The helper stops safely on malformed or oversized values instead of silently truncating them and potentially changing a user's reaction.
- At the time of this earlier check, the GitHub connector did not expose the newest workflow run, so the latest three fixes were temporarily marked **not yet CI-verified**. This historical status is superseded by the confirmed Run #24 result recorded below.

## Confirmed latest CI result — 2026-11-11

- GitHub Actions Run #24 completed successfully on the current migration-branch head commit `896019c8159c6f64570251f8a156bd261f936c7e`.
- Run URL: https://github.com/Indian-social-network-dotcom/Indian/actions/runs/42975202945
- The workflow completed all steps successfully, including dependency installation, npm audit, JavaScript syntax checks, Rules file preparation, Firestore Emulator startup, Rules compilation and tests.
- npm audit reported 0 vulnerabilities (0 info, 0 low, 0 moderate, 0 high, 0 critical).
- JavaScript syntax check passed for all 4 inline module scripts in `index.html`; `public-profile-migration.js` passed `node --check`.
- Run #26 passed on 2026-11-11 for the revised personal Messages Rules and tests: 11 passed, 0 failed, 0 skipped; npm audit 0 vulnerabilities; all 4 inline app modules and the migration helper passed syntax checks. Run #25 was an intermediate push where the revised Rules arrived before the matching revised test, so its old Read Receipt test failed as expected. Run #27 was triggered after a comment-only draft-header correction and is being checked separately.
- The log contains expected permission-denied messages from negative security tests; the test runner reports all 11 tests passed and the job conclusion is success.
- This confirms emulator and syntax validation for the latest helper fix. It does not replace browser/device testing with the three test accounts.
- No production Rules were published, no migration helper was run, no Firestore data or legacy fields were changed or deleted, and `main` remains untouched.

## Production Rules source-of-truth check required before rollout

- The 2026-11-11 uploaded Rules file is now the comparison baseline for this revision. It intentionally omits receiver-side Read Receipt updates; do not add that permission back into the migration draft.
- Therefore, do not assume the migration draft is byte-for-byte based on the Rules currently active in production. Before any production publication, obtain/export the actually active Firebase Rules and compare them with this draft.
- Preserve all live-only changes from the active Rules, including current Messages, Group Chat, notifications, games, and other collections. Do not replace live Rules with this draft until a complete three-way review (active production Rules, user-supplied baseline, migration draft) is complete.
- This check is a rollout blocker; emulator success does not establish that the draft is safe to publish over the currently active production Rules.
