import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./localization/i18n";
import { App } from "./ui/App";
import ContentStudio from "./ui/ContentStudio";
import { UiSoundEffects } from "./ui/UiSoundEffects";
import "./ui/styles.css";

const showContentStudio = import.meta.env.DEV && new URLSearchParams(window.location.search).has("contentStudio");

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <UiSoundEffects />
    {showContentStudio ? <ContentStudio /> : <App />}
  </StrictMode>,
);
