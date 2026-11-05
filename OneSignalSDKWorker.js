importScripts("https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.sw.js");

/* Indian app-shell cache. Keep OneSignal's own push handlers intact. */
const INDIAN_APP_CACHE = "indian-app-shell-v1";
self.addEventListener("install", function(event) {
  event.waitUntil(self.skipWaiting());
});
self.addEventListener("activate", function(event) {
  event.waitUntil(self.clients.claim());
});
self.addEventListener("fetch", function(event) {
  const request = event.request;
  if (request.method !== "GET") return;
  let url;
  try { url = new URL(request.url); } catch (e) { return; }
  if (url.origin !== self.location.origin || !url.pathname.startsWith("/Indian/")) return;
  if (url.pathname.includes("/fcm/") || /OneSignalSDKWorker\.js$/.test(url.pathname)) return;
  const eligible = request.mode === "navigate" ||
    ["style", "script", "image", "font", "manifest"].includes(request.destination);
  if (!eligible) return;
  event.respondWith((async function() {
    const cache = await caches.open(INDIAN_APP_CACHE);
    const cached = await cache.match(request);
    // Network-first keeps deployed fixes fresh; cached content is the offline fallback.
    try {
      const response = await fetch(request);
      if (response && response.ok && response.type === "basic") await cache.put(request, response.clone());
      return response;
    } catch (error) {
      if (cached) return cached;
      if (request.mode === "navigate") {
        const fallback = await cache.match(new URL("/Indian/index.html", self.location.origin).href);
        if (fallback) return fallback;
      }
      return Response.error();
    }
  })());
});
