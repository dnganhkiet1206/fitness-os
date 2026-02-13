import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Prevent unhandled promise rejections from crashing the app on iOS
window.addEventListener("unhandledrejection", (event) => {
  console.error("[ASCND] Unhandled rejection:", event.reason);
  event.preventDefault();
});

window.addEventListener("error", (event) => {
  console.error("[ASCND] Uncaught error:", event.error);
});

createRoot(document.getElementById("root")!).render(<App />);
