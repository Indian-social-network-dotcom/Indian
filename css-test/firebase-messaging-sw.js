/* Indian Web Push test service worker. Scope: /Indian/css-test/ only. */
const INDIAN_PUSH_APP_URL = new URL("./", self.location.href).href;

// Register click behavior before loading Firebase Messaging, as recommended by Firebase.
self.addEventListener("notificationclick", function(event){
  event.notification.close();
  const targetUrl = (event.notification && event.notification.data && event.notification.data.url) || INDIAN_PUSH_APP_URL;
  event.waitUntil(self.clients.matchAll({type:"window", includeUncontrolled:true}).then(function(windowClients){
    for(const client of windowClients){
      if(client.url && new URL(client.url).origin === self.location.origin){
        return client.focus().then(function(){
          if(typeof client.navigate === "function") return client.navigate(targetUrl);
          return undefined;
        });
      }
    }
    return self.clients.openWindow(targetUrl);
  }));
});

importScripts("https://www.gstatic.com/firebasejs/12.19.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/12.19.0/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey: "AIzaSyDyXo7dNZXnSZkRKFnLujjiElMIjcuRQUs",
  authDomain: "indian-84a86.firebaseapp.com",
  projectId: "indian-84a86",
  storageBucket: "indian-84a86.firebasestorage.app",
  messagingSenderId: "333987809341",
  appId: "1:333987809341:web:27a351f770aa7b4e808254"
});

const indianPushMessaging = firebase.messaging();
indianPushMessaging.onBackgroundMessage(function(payload){
  // FCM automatically displays notification payloads in the background.
  // For data-only payloads, display one notification ourselves.
  if(payload && payload.notification) return;
  const data = payload && payload.data ? payload.data : {};
  const title = data.title || "Indian";
  const options = {
    body: data.body || "You have a new notification on Indian.",
    data: {url: data.url || INDIAN_PUSH_APP_URL}
  };
  if(data.icon) options.icon = data.icon;
  return self.registration.showNotification(title, options);
});
