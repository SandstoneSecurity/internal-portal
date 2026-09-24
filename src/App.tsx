import { AnimatePresence, motion } from "motion/react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { ActionProvider } from "./actions/ActionHost";
import { Shell } from "./components/Shell";
import { usePortalData } from "./lib/DataProvider";
import { page } from "./lib/motion";
import { ClientsPage } from "./pages/ClientsPage";
import { ControlPage } from "./pages/ControlPage";
import { EmployeesPage } from "./pages/EmployeesPage";
import { IntelligencePage } from "./pages/IntelligencePage";
import { OperationsPage } from "./pages/OperationsPage";
import { RecruitmentPage } from "./pages/RecruitmentPage";

function Boot() {
  return (
    <div className="pt-boot" aria-busy="true" aria-label="Loading the portal">
      <div className="pt-boot__side">
        <span className="sds-wordmark sds-wordmark--md sds-wordmark--inverse">Sandstone</span>
      </div>
      <div className="pt-boot__main">
        <div className="pt-skeleton" style={{ height: 34, width: 240 }} />
        <div className="pt-skeleton" style={{ height: 14, width: 380 }} />
        <div className="pt-skeleton" style={{ height: 150, marginTop: 20 }} />
        <div className="pt-skeleton" style={{ height: 320 }} />
      </div>
    </div>
  );
}

function Fatal({ message }: { message: string }) {
  return (
    <div className="pt-fatal">
      <div className="pt-fatal__card" role="alert">
        <span className="pt-eyebrow">Portal unavailable</span>
        <h2 style={{ fontSize: "var(--text-xl)", marginTop: 12 }}>The portal couldn't load its records.</h2>
        <p style={{ marginTop: 10, color: "var(--text-secondary)", fontSize: 14 }}>{message}</p>
        <button className="sds-btn sds-btn--md sds-btn--primary" onClick={() => window.location.reload()}>
          Reload
        </button>
      </div>
    </div>
  );
}

export function App() {
  const { data, loading, error } = usePortalData();
  const location = useLocation();
  if (loading && !data) return <Boot />;
  if (!data) return <Fatal message={error ?? "Unknown error."} />;

  return (
    <ActionProvider>
      <Shell>
        <AnimatePresence mode="wait" initial={false}>
          <motion.main key={location.pathname} className="pt-page" variants={page} initial="initial" animate="animate" exit="exit">
            <Routes location={location}>
              <Route path="/" element={<ControlPage />} />
              <Route path="/operations" element={<OperationsPage />} />
              <Route path="/recruitment" element={<RecruitmentPage />} />
              <Route path="/employees" element={<EmployeesPage />} />
              <Route path="/clients" element={<ClientsPage />} />
              <Route path="/intelligence" element={<IntelligencePage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </motion.main>
        </AnimatePresence>
      </Shell>
    </ActionProvider>
  );
}
