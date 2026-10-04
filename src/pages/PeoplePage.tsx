import { Navigate, useLocation, useSearchParams } from "react-router-dom";
import { Tabs } from "../components/ui/Bits";
import { usePortal } from "../lib/DataProvider";
import { BackgroundChecksPage } from "./BackgroundChecksPage";
import { EmployeesPage } from "./EmployeesPage";
import { RecruitmentPage } from "./RecruitmentPage";

const VIEWS = ["Employees", "Recruitment", "Background checks"] as const;
type View = (typeof VIEWS)[number];
export type PeopleView = "employees" | "recruitment" | "checks";
const KEYS: Record<View, PeopleView> = { Employees: "employees", Recruitment: "recruitment", "Background checks": "checks" };

export const peopleView = (search: string): PeopleView => {
  const v = new URLSearchParams(search).get("view");
  return v === "recruitment" || v === "checks" ? v : "employees";
};

/**
 * Employees, recruitment and background checks in one place: the people you have, the people you're
 * hiring, and the checks you run on people and companies for clients.
 */
export function PeoplePage() {
  const d = usePortal();
  const [params, setParams] = useSearchParams();
  const key = peopleView(`?${params.toString()}`);
  const view = (Object.keys(KEYS) as View[]).find((v) => KEYS[v] === key)!;
  return (
    <div className="pt-people">
      <Tabs
        id="people"
        tabs={VIEWS}
        value={view}
        onChange={(v) => setParams({ view: KEYS[v] })}
        counts={{
          Employees: d.employees.length,
          Recruitment: d.candidates.filter((c) => !c.disqualified).length,
          "Background checks": d.checks.filter((c) => !c.closedAt).length,
        }}
      />
      {view === "Employees" ? <EmployeesPage /> : view === "Recruitment" ? <RecruitmentPage /> : <BackgroundChecksPage />}
    </div>
  );
}

/** Old addresses (/employees?id=3, /recruitment?role=2) keep working. */
export function PeopleRedirect({ view }: { view: PeopleView }) {
  const { search } = useLocation();
  const next = new URLSearchParams(search);
  next.set("view", view);
  return <Navigate to={`/people?${next.toString()}`} replace />;
}
