// Exists only so the member portal is installable (Chrome/Android requires
// a registered service worker with a fetch handler before it'll offer "Add
// to Home Screen"). It deliberately does no caching at all — every request
// passes straight through to the network, every time.
//
// This is intentional, not a missing feature: member financial data
// (balances, loans, deposits, dividends) must never be readable offline
// from a cache, since the portal can be installed on a shared or lost
// phone. See lib/types.ts / PortalPage.tsx — nothing here ever touches
// the Cache API.
self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  event.respondWith(fetch(event.request));
});
