import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles/base.css";
import { App } from "./app/App";

// Until the backend exists, MSW answers /api requests in the browser (when: __MOCK_API_ENABLED__ in vite.config.ts).
async function enableMocking() {
  if (!__MOCK_API_ENABLED__) return; // literal at build time, so the mock code is dropped when false
  const { worker } = await import("./mocks/browser");
  await worker.start({ onUnhandledRequest: "bypass", quiet: true });
}

enableMocking().then(() => {
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
});
