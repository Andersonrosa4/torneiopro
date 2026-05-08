import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

createRoot(document.getElementById("root")!).render(<App />);

// Register service worker + auto-reload on new version (prevents stale bug-fixes)
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/service-worker.js")
      .then((reg) => {
        // When a new SW takes control, reload once so the user gets fresh code.
        let refreshing = false;
        navigator.serviceWorker.addEventListener("controllerchange", () => {
          if (refreshing) return;
          refreshing = true;
          window.location.reload();
        });
        // Detect waiting worker (new version available) and activate it.
        const promote = (sw: ServiceWorker | null) => {
          if (sw && sw.state === "installed" && navigator.serviceWorker.controller) {
            sw.postMessage({ type: "SKIP_WAITING" });
          }
        };
        if (reg.waiting) promote(reg.waiting);
        reg.addEventListener("updatefound", () => {
          const nw = reg.installing;
          nw?.addEventListener("statechange", () => promote(nw));
        });
        // Periodic update check (catches users with the tab open all day).
        setInterval(() => reg.update().catch(() => {}), 60_000);
      })
      .catch(() => {
        // SW registration failed — non-critical
      });
  });
}
