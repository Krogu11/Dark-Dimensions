import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./localization/i18n";
import { App } from "./ui/App";
import "./ui/styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
