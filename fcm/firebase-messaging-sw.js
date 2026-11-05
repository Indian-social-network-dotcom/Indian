/* Indian Firebase Messaging worker. Separate scope: /Indian/fcm/.
   OneSignal owns the parent /Indian/ scope. */
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
indianPushMessaging.onBackgroundMessage(function(payload) {
  const data = payload && payload.data ? payload.data : {};
  if (payload && payload.notification) return;
  const title = data.title || "Indian";
  const options = {
    body: data.body || "You have a new notification on Indian.",
    data: { url: data.url || new URL("../", self.location.href).href }
  };
  if (data.icon) options.icon = data.icon;
  return self.registration.showNotification(title, options);
});

self.addEventListener("notificationclick", function(event) {
  event.notification.close();
  const target = event.notification && event.notification.data && event.notification.data.url
    ? event.notification.data.url : new URL("../", self.location.href).href;
  event.waitUntil(self.clients.matchAll({type:"window", includeUncontrolled:true}).then(function(clients) {
    for (const client of clients) {
      if (client.url && new URL(client.url).origin === self.location.origin) {
        return client.focus().then(function() {
          if (typeof client.navigate === "function") return client.navigate(target);
        });
      }
    }
    return self.clients.openWindow(target);
  }));
});
