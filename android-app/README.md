# Indian Native Android App

This is a separate native Android application project. The existing Indian website and its current production features remain unchanged.

## Application identity

- App display name: Indian
- Android application ID / package name: `indian.socialnetwork.app`
- Firebase project to connect: `indian-84a86`
- Existing OneSignal App ID: `019d756d-8ff5-4c09-bcab-75ace208d8da` (Google Android FCM credentials were configured in the existing OneSignal app on 2026-11-06)

The application ID is now selected for this project. Register this exact, case-sensitive ID in Firebase before downloading `google-services.json`. Firebase does not allow changing the package name of an already registered Android app.

## Current project status

The native Android scaffold is in progress. Native OneSignal initialization and Firebase-user identity linking have now been added on the `feature/native-onesignal-2026-11-06` branch. A successful build and real-device push test are still required. This work does not change the production website or Cloudflare Worker.

## Existing website integration facts

- Website: https://indian-social-network-dotcom.github.io/Indian/
- Firebase project: `indian-84a86`
- Firestore region: `asia-south2`
- Existing call documents are stored in the Firestore `calls` collection.
- Existing call fields include `callerId`, `calleeId`, `callerName`, `callerPhotoURL`, `callType`, and `status`.
- The existing Cloudflare Worker sends call push notifications through the existing OneSignal app.
- The current website ringtone file is at repository root: `incoming-ringtone.mp3.mpeg`.

## Planned native-app behavior

1. Keep the web app and native app as separate clients of the same Indian service.
2. Use Firebase Authentication for the signed-in user's identity.
3. Use Cloud Firestore to observe and update the existing call documents.
4. Initialize the native OneSignal SDK with the existing Indian OneSignal App ID. The Android app reads the signed-in Firebase UID from the existing WebView page's `window.firebaseCurrentUid` value and logs in to OneSignal using the same `indian_firebase_<UID>` external ID as the website. On sign-out, it logs out of OneSignal.
5. Create a dedicated Android notification channel for incoming calls and package the ringtone as `app/src/main/res/raw/incoming_ringtone.mp3`.
6. Open the native app's incoming-call screen when the notification is tapped.
7. Accept/decline must update and observe the same Firestore call document used by the website.

## Android build setup

- Open the `android-app` folder in Android Studio.
- Use JDK 17 and Android Gradle Plugin 8.13.2 (Gradle 8.13).
- The starter app uses minSdk 24 and targetSdk 35.
- Register `indian.socialnetwork.app` in Firebase Console under project `indian-84a86`, then place the downloaded `google-services.json` inside `app/`. The existing file is already present in this repository.
- Add the ringtone file at `app/src/main/res/raw/incoming_ringtone.mp3`. Android resource filenames must be lowercase with underscores.

## Safety boundaries

- Do not change the production website, Cloudflare Worker, Firebase Security Rules, Messages audio attachments, or Games as part of this initial native-app scaffold.
- Do not commit service-account keys, OneSignal REST API keys, or other private secrets.
- A native notification channel can use a packaged custom ringtone, but Android notification permission, channel settings, device manufacturer restrictions, battery settings, and force-stop behavior must be tested on the actual phone. Do not promise that a ringtone will always play in every OS state.
