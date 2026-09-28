import { Navigate, useLocation, useSearchParams } from "react-router-dom";
import { Tabs } from "../components/ui/Bits";
import { usePortal } from "../lib/DataProvider";
import { EmployeesPage } from "./EmployeesPage";
import { RecruitmentPage } from "./RecruitmentPage";

const VIEWS = ["Employees", "Recruitment"] as const;
type View = (typeof VIEWS)[number];
export const peopleView = (search: string): "employees" | "recruitment" =>
  new URLSearchParams(search).get("view") === "recruitment" ? "recruitment" : "employees";

/** Employees and recruitment in one place: the register of people you have, and the pipeline of people you're hiring. */
export function PeoplePage() {
  const d = usePortal();
  const [params, setParams] = useSearchParams();
  const view: View = params.get("view") === "recruitment" ? "Recruitment" : "Employees";
  return (
    <div className="pt-people">
      <Tabs
        id="people"
        tabs={VIEWS}
        value={view}
        onChange={(v) => setParams({ view: v.toLowerCase() })}
        counts={{ Employees: d.employees.length, Recruitment: d.candidates.filter((c) => !c.disqualified).length }}
      />
      {view === "Employees" ? <EmployeesPage /> : <RecruitmentPage />}
    </div>
  );
}

/** Old addresses (/employees?id=3, /recruitment?role=2) keep working. */
export function PeopleRedirect({ view }: { view: "employees" | "recruitment" }) {
  const { search } = useLocation();
  const next = new URLSearchParams(search);
  next.set("view", view);
  return <Navigate to={`/people?${next.toString()}`} replace />;
}
