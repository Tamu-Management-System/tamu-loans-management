import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles/base.css";
import { App } from "./app/App";

// The client's form loads its code on demand; start that now, alongside the rest, so the page is ready when the app draws
if (location.pathname.startsWith("/forms/")) void import("./modules/online-application/OnlineApplicationPage");

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
