import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

if (!window.location.hash) {
  window.location.hash = "#/";
}

// Global error boundary — prevent white screen on uncaught errors
window.addEventListener("error", (e) => {
  console.error("Uncaught error:", e.error);
  const root = document.getElementById("root");
  if (root && !root.hasChildNodes()) {
    root.innerHTML = `
      <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;font-family:sans-serif;padding:2rem;">
        <div style="text-align:center;max-width:400px;">
          <h2 style="margin-bottom:0.5rem;">Something went wrong</h2>
          <p style="color:#666;font-size:14px;">Please refresh the page or try opening in a new tab.</p>
          <button onclick="location.reload()" style="margin-top:1rem;padding:8px 20px;border-radius:6px;border:1px solid #ccc;cursor:pointer;">
            Refresh
          </button>
        </div>
      </div>
    `;
  }
});

window.addEventListener("unhandledrejection", (e) => {
  console.error("Unhandled promise rejection:", e.reason);
});

try {
  createRoot(document.getElementById("root")!).render(<App />);
} catch (err) {
  console.error("Failed to render app:", err);
  const root = document.getElementById("root");
  if (root) {
    root.innerHTML = `
      <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;font-family:sans-serif;padding:2rem;">
        <div style="text-align:center;max-width:400px;">
          <h2 style="margin-bottom:0.5rem;">Failed to load dashboard</h2>
          <p style="color:#666;font-size:14px;">Please refresh or try a different browser.</p>
          <button onclick="location.reload()" style="margin-top:1rem;padding:8px 20px;border-radius:6px;border:1px solid #ccc;cursor:pointer;">
            Refresh
          </button>
        </div>
      </div>
    `;
  }
}
