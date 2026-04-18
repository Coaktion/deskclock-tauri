import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { getCurrentWindow } from "@tauri-apps/api/window";
import "./index.css";
import App from "./App";
import { OverlayApp } from "@presentation/overlays/OverlayApp";
import { ToastApp } from "@presentation/overlays/ToastApp";
import { CommandPaletteApp } from "@presentation/overlays/CommandPaletteApp";

const label = getCurrentWindow().label;

const root = createRoot(document.getElementById("root")!);

if (label === "overlay") {
  root.render(
    <StrictMode>
      <OverlayApp />
    </StrictMode>
  );
} else if (label === "toast") {
  root.render(
    <StrictMode>
      <ToastApp />
    </StrictMode>
  );
} else if (label === "command-palette") {
  root.render(
    <StrictMode>
      <CommandPaletteApp />
    </StrictMode>
  );
} else {
  root.render(
    <StrictMode>
      <App />
    </StrictMode>
  );
}
