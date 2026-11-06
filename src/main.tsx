import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import App from "./App";
import "./styles.css";
import { loadCollection } from "./store/collection";

registerSW({ immediate: true });

const container = document.getElementById("root");
if (!container) throw new Error("Missing #root element");

void loadCollection();

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);