import React from "react";
import ReactDOM from "react-dom/client";

import { App } from "@/app/App";
import { scheduleOfflineApp } from "@/data/offline/app-cache";
import "@/styles/tokens.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

scheduleOfflineApp();
