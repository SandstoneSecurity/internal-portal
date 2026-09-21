import { Navigate, Outlet, Route, Routes, useLocation } from "react-router-dom";
import { Shell } from "./components/Shell";
import { DataProvider, usePortalData } from "./lib/DataProvider";
import { ControlPage } from "./pages/ControlPage";
import { OperationsPage } from "./pages/OperationsPage";
import { RecruitmentPage } from "./pages/RecruitmentPage";
import { EmployeesPage } from "./pages/EmployeesPage";
import { ClientsPage } from "./pages/ClientsPage";
import { IntelligencePage } from "./pages/IntelligencePage";

function Layout() {
  const { data, loading, error } = usePortalData();
  const { pathname } = useLocation();

  const openWorkItems = data ? data.opsColumns.filter((c) => !c.done).reduce((n, c) => n + c.cards.length, 0) : 0;
  const breachCount = data ? data.feed.filter((f) => f.kind === "breach").length : 0;

  const heads: Record<string, [string, string, string]> = {
    "/": ["Control", "Saturday 30 August 2026 · week 35 · all sites reporting", "Raise work"],
    "/operations": [
      "Operations",
      "Order book work items across 27 sites under standing orders",
      "Raise work",
    ],
    "/recruitment": [
      "Recruitment",
      "Open positions and candidate pipeline · SLED licence checks tracked",
      "Post a role",
    ],
    "/employees": [
      "Employees",
      `Licensed personnel register · ${data ? data.employees.length : "—"} officers, 6 head office`,
      "Add employee",
    ],
    "/clients": ["Clients", "Accounts, proposals and activity across five service lines", "New account"],
    "/intelligence": [
      "Intelligence",
      "Monitored activity across New South Wales · sources reviewed 05:40",
      "Log an item",
    ],
  };
  const [pageTitle, pageMeta, pageAction] = heads[pathname] ?? heads["/"];

  if (loading) {
    return (
      <div style={{ display: "flex", height: "100vh", alignItems: "center", justifyContent: "center", color: "var(--text-tertiary)", fontFamily: "var(--font-mono)", fontSize: 12 }}>
        LOADING PORTAL DATA…
      </div>
    );
  }
  if (error || !data) {
    return (
      <div style={{ display: "flex", height: "100vh", alignItems: "center", justifyContent: "center", color: "var(--status-breach-fg)", fontFamily: "var(--font-mono)", fontSize: 12 }}>
        FAILED TO LOAD PORTAL DATA{error ? ` — ${error}` : ""}
      </div>
    );
  }

  return (
    <Shell
      pageTitle={pageTitle}
      pageMeta={pageMeta}
      pageAction={pageAction}
      navCounts={{
        "/operations": String(openWorkItems),
        "/intelligence": breachCount > 0 ? String(breachCount) : undefined,
      }}
    >
      <Outlet />
    </Shell>
  );
}

export function App() {
  return (
    <DataProvider>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<ControlPage />} />
          <Route path="/operations" element={<OperationsPage />} />
          <Route path="/recruitment" element={<RecruitmentPage />} />
          <Route path="/employees" element={<EmployeesPage />} />
          <Route path="/clients" element={<ClientsPage />} />
          <Route path="/intelligence" element={<IntelligencePage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </DataProvider>
  );
}
