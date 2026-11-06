# Indian Native Android App

This is a separate native Android application project. The existing Indian website and its current production features remain unchanged.

## Application identity

- App display name: Indian
- Android application ID / package name: `indian.socialnetwork.app`
- Firebase project to connect: `indian-84a86`
- Existing OneSignal App ID: `019d756d-8ff5-4c09-bcab-75ace208d8da` (Google Android FCM credentials were configured in the existing OneSignal app on 2026-11-06)

The application ID is now selected for this project. Register this exact, case-sensitive ID in Firebase before downloading `google-services.json`. Firebase does not allow changing the package name of an already registered Android app.

## Current project status

Native OneSignal initialization and Firebase-user identity linking are present in the Android app. The app polls the website's `window.firebaseCurrentUid` value and uses the same `indian_firebase_<UID>` OneSignal external ID as the website. A fresh build and real-device push subscription/delivery test are still required. The production website and Cloudflare Worker are not changed by this Android build.

## Existing website integration facts

- Website: https://indian-social-network-dotcom.github.io/Indian/
- Firebase project: `indian-84a86`
- Firestore region: `asia-south2`
- Existing call documents are stored in the Firestore `calls` collection.
- Existing call fields include `callerId`, `calleeId`, `callerName`, `callerPhotoURL`, `callType`, and `status`.
- The existing Cloudflare Worker sends call push notifications through the existing OneSignal app.
- The current website ringtone file is at repository root: `incoming-ringtone.mp3.mpeg`.

## Android build setup

- Build with JDK 17 and Gradle 8.14.4 using the repository GitHub Actions workflow.
- The starter app uses minSdk 24 and targetSdk 35.
- Firebase config file `app/google-services.json` is already present for package `indian.socialnetwork.app`.
- Native OneSignal SDK version 5.10.2 is included in Gradle dependencies.
- The workflow produces the `Indian-debug-apk` artifact.

## Safety boundaries

- Do not change the production website, Cloudflare Worker, Firebase Security Rules, Messages audio attachments, or Games as part of this Android build.
- Do not commit service-account keys, OneSignal REST API keys, or other private secrets.
- Android notification permission, OneSignal subscription state, channel settings, device manufacturer restrictions, battery settings, and force-stop behavior must be tested on the actual phone. Do not promise that a notification will always arrive in every OS state.
