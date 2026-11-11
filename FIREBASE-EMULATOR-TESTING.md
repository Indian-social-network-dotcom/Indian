# Indian local Firebase Emulator testing

This setup is isolated from the production Firebase project.

- Emulator project ID: `demo-indian-public-profile-migration`
- Auth Emulator: `127.0.0.1:9099`
- Firestore Emulator: `127.0.0.1:8080`
- Rules source: `firestore.rules.public-profiles-migration-DRAFT.txt`
- Production Firebase project: `indian-84a86` (not used in Emulator mode)

## Safety

Open the app with `?indianEmulator=1` only when the local emulators are running. In this mode the app uses a demo Firebase config and connects Auth/Firestore to localhost. Calls to the production Firestore/Auth endpoints, Cloudinary uploads, Cloudflare push Worker and FCM registration are blocked or disabled. OneSignal initialization and profile-photo uploads are disabled. The public GitHub Pages URL without this query parameter continues to use the existing production config.

The emulator data is local and disposable. It is not copied to or synchronized with production.

## Windows PowerShell test

1. Download or clone the migration branch and open PowerShell in the repository folder.
2. Start Auth and Firestore emulators:

   ```powershell
   npx --yes firebase-tools emulators:start --only auth,firestore --config firebase.emulator.json --project demo-indian-public-profile-migration
   ```

3. Open a second PowerShell window in the same repository folder and start a local static web server:

   ```powershell
   py -m http.server 8000
   ```

4. Open this local URL in the browser:

   `http://127.0.0.1:8000/?indianEmulator=1`

5. Create test accounts using email addresses that are only for local testing. These accounts exist only in the Auth Emulator.
6. Test sign-in, profile creation, People, personal messages, group features, Stories and other Firestore flows. Uploads and push notifications are intentionally unavailable in this mode.
7. Stop both PowerShell processes with Ctrl+C when finished. Emulator data is local; restarting without an export starts with a clean emulator state.

## Existing automated Rules tests

From the `firestore-rules-tests` folder:

```powershell
npm install
npm test
```

These automated tests validate Rules behavior. The browser smoke test above is separate and is still required to validate actual app flows.
