import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// Registers the pass-through service worker (public/sw.js) that makes the
// member portal installable — see that file for why it deliberately never
// caches anything. Skipped outside a secure context (e.g. plain HTTP in
// some local setups), where the browser wouldn't allow registration anyway.
if ("serviceWorker" in navigator && window.isSecureContext) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Installability is a progressive enhancement, not a requirement —
      // the portal works the same either way, so a failed registration
      // (e.g. an unsupported browser) is silently ignored.
    });
  });
}
