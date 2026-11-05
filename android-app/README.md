# Indian Native Android App

This folder is reserved for a separate native Android application. The existing GitHub Pages website remains unchanged.

## Current website integration facts

- Website: https://indian-social-network-dotcom.github.io/Indian/
- Firebase project: indian-84a86
- Firestore region: asia-south2
- Existing call documents are stored in the Firestore `calls` collection.
- Existing call fields include `callerId`, `calleeId`, `callerName`, `callerPhotoURL`, `callType`, and `status`.
- The existing Cloudflare Worker sends call push notifications through the existing OneSignal app.
- The existing website ringtone asset is at repository root: `incoming-ringtone.mp3.mpeg`.

## Planned native-app behavior

1. Keep the web app and native app as separate clients of the same Indian service.
2. Use Firebase Authentication for the signed-in user's identity.
3. Use the existing OneSignal app / external user identity only after confirming Android platform configuration and native SDK support.
4. Create a dedicated Android notification channel for incoming calls and package the ringtone as an Android raw resource. Android notification-channel sound is selected when the channel is first created; changing it later may require a new channel ID or clearing channel settings.
5. Open the native app's incoming-call screen when the notification is tapped.
6. Accept/decline must update and observe the same Firestore call document used by the website.
7. Do not change the website, Cloudflare Worker, Firebase Security Rules, Messages audio attachments, or Games as part of the initial scaffold.

## Before enabling real push delivery

- Register the final Android application ID in Firebase Console.
- Configure Android push credentials for the existing OneSignal app, if OneSignal is retained.
- Add the matching Firebase Android configuration file securely; do not commit service-account keys or private secrets.
- Confirm Android notification permission and test foreground, background, and force-stopped behavior on a real phone.
- Verify call cancellation, accept, decline, and end-call behavior across Android app and website.

## Proposed application ID

`com.indian.socialnetwork`

This ID is a proposal only. It must be confirmed before Firebase Android registration and before the first release; changing it later requires a new Firebase Android app registration.
