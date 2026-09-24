import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { MotionConfig } from "motion/react";
import { App } from "./App";
import { ConfirmProvider } from "./components/ui/Confirm";
import { ToastProvider } from "./components/ui/Toast";
import { DataProvider } from "./lib/DataProvider";
import { ThemeProvider } from "./lib/theme";
import "./styles/global.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {/* reducedMotion="user": Motion honours prefers-reduced-motion everywhere. */}
    <MotionConfig reducedMotion="user">
      <ThemeProvider>
        <BrowserRouter>
          <DataProvider>
            <ToastProvider>
              <ConfirmProvider>
                <App />
              </ConfirmProvider>
            </ToastProvider>
          </DataProvider>
        </BrowserRouter>
      </ThemeProvider>
    </MotionConfig>
  </StrictMode>
);
