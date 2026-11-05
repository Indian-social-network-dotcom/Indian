/* Indian Web Push + Lite Cache worker. Scope: /Indian/css-test/ only. */
const INDIAN_PUSH_APP_URL = new URL("./", self.location.href).href;
const INDIAN_LITE_CACHE = "indian-lite-shell-v3";

// Register click behavior before loading Firebase Messaging.
self.addEventListener("notificationclick", function(event){
  event.notification.close();
  const targetUrl = (event.notification && event.notification.data && event.notification.data.url) || INDIAN_PUSH_APP_URL;
  event.waitUntil(self.clients.matchAll({type:"window", includeUncontrolled:true}).then(function(windowClients){
    for (const client of windowClients) {
      if (client.url && new URL(client.url).origin === self.location.origin) {
        return client.focus().then(function(){
          if (typeof client.navigate === "function") return client.navigate(targetUrl);
          return undefined;
        });
      }
    }
    return self.clients.openWindow(targetUrl);
  }));
});

self.addEventListener("install", function(event){ event.waitUntil(self.skipWaiting()); });
self.addEventListener("activate", function(event){
  event.waitUntil(caches.keys().then(function(keys){
    return Promise.all(keys.filter(function(key){return key.indexOf("indian-lite-shell-")===0 && key!==INDIAN_LITE_CACHE;}).map(function(key){return caches.delete(key);}));
  }).then(function(){ return self.clients.claim(); }));
});

function isSameScopeStaticRequest(request, url){
  if (request.method !== "GET" || url.origin !== self.location.origin) return false;
  const scopePath = new URL(self.registration.scope).pathname;
  if (!url.pathname.startsWith(scopePath)) return false;
  if (url.pathname.endsWith("firebase-messaging-sw.js")) return false;
  if (request.destination === "document") return true;
  return ["style","script","image","font","manifest"].includes(request.destination);
}

self.addEventListener("fetch", function(event){
  const request = event.request;
  let url;
  try { url = new URL(request.url); } catch(e) { return; }
  if (!isSameScopeStaticRequest(request, url)) return;
  event.respondWith((async function(){
    const cache = await caches.open(INDIAN_LITE_CACHE);
    const cached = await cache.match(request);
    const forceRefresh = request.cache === "reload" || (request.headers.get("cache-control")||"").indexOf("no-cache") !== -1;
    // Cache-first keeps repeat visits light on 2G/3G. A hard reload bypasses cache for updates.
    if (cached && !forceRefresh) return cached;
    try {
      const fresh = await fetch(request);
      if (fresh && fresh.ok && fresh.type === "basic") await cache.put(request, fresh.clone());
      return fresh;
    } catch(e) {
      if (cached) return cached;
      if (request.mode === "navigate") {
        const fallback = await cache.match(new URL("./index.html", INDIAN_PUSH_APP_URL).href);
        if (fallback) return fallback;
      }
      return Response.error();
    }
  })());
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
  if (payload && payload.notification) return;
  const data = payload && payload.data ? payload.data : {};
  const title = data.title || "Indian";
  const options = { body: data.body || "You have a new notification on Indian.", data: {url: data.url || INDIAN_PUSH_APP_URL} };
  if (data.icon) options.icon = data.icon;
  return self.registration.showNotification(title, options);
});
