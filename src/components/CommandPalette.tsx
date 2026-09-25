import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowRight,
  Briefcase,
  Building2,
  History,
  LayoutDashboard,
  LogOut,
  MapPin,
  Moon,
  Plus,
  Route,
  Search,
  Sun,
  UserPlus,
  Users,
} from "lucide-react";
import { useActions } from "../actions/ActionHost";
import { usePortal } from "../lib/DataProvider";
import { matches } from "../lib/format";
import { useTheme } from "../lib/theme";
import { EnterKey, Kbd } from "./ui/Bits";
import { Modal } from "./ui/Overlay";

interface Command {
  id: string;
  group: string;
  label: string;
  hint?: string;
  icon: ReactNode;
  keywords?: string;
  run: () => void;
}

const MAX_PER_GROUP = 6;

export function CommandPalette({ open, onClose, onActivity }: { open: boolean; onClose: () => void; onActivity: () => void }) {
  const data = usePortal();
  const actions = useActions();
  const navigate = useNavigate();
  const { theme, toggle } = useTheme();
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      setQ("");
      setActive(0);
    }
  }, [open]);

  const all = useMemo<Command[]>(() => {
    const go = (path: string) => () => navigate(path);
    const cmds: Command[] = [
      { id: "nav-control", group: "Jump to", label: "Control", icon: <LayoutDashboard size={15} />, run: go("/"), keywords: "home dashboard" },
      { id: "nav-ops", group: "Jump to", label: "Operations", icon: <Route size={15} />, run: go("/operations"), keywords: "board work timeline" },
      { id: "nav-rec", group: "Jump to", label: "Recruitment", icon: <UserPlus size={15} />, run: go("/recruitment"), keywords: "roles candidates hiring" },
      { id: "nav-emp", group: "Jump to", label: "Employees", icon: <Users size={15} />, run: go("/employees"), keywords: "staff officers register" },
      { id: "nav-cli", group: "Jump to", label: "Clients", icon: <Building2 size={15} />, run: go("/clients"), keywords: "accounts crm" },
      { id: "nav-int", group: "Jump to", label: "Intelligence", icon: <MapPin size={15} />, run: go("/intelligence"), keywords: "feed map incidents" },
      { id: "act-work", group: "Actions", label: "Raise work", icon: <Plus size={15} />, run: () => actions.raiseWork(), keywords: "new task item op" },
      { id: "act-role", group: "Actions", label: "Create job", icon: <Plus size={15} />, run: actions.postRole, keywords: "job vacancy role post" },
      { id: "act-cand", group: "Actions", label: "Add candidate", icon: <Plus size={15} />, run: () => actions.addCandidate(), keywords: "applicant" },
      { id: "act-emp", group: "Actions", label: "Add employee", icon: <Plus size={15} />, run: actions.addEmployee, keywords: "officer staff hire" },
      { id: "act-cli", group: "Actions", label: "Create company", icon: <Plus size={15} />, run: actions.newClient, keywords: "client customer account" },
      { id: "act-deal", group: "Actions", label: "Create deal", icon: <Plus size={15} />, run: () => actions.newDeal(), keywords: "opportunity pipeline proposal" },
      { id: "act-int", group: "Actions", label: "Log an intelligence item", icon: <Plus size={15} />, run: () => actions.logIntel(), keywords: "incident report breach advisory" },
      { id: "act-log", group: "Actions", label: "Open activity log", icon: <History size={15} />, run: onActivity, keywords: "audit history changes" },
      {
        id: "act-theme",
        group: "Actions",
        label: theme === "light" ? "Switch to operations mode (night)" : "Switch to limestone mode (day)",
        icon: theme === "light" ? <Moon size={15} /> : <Sun size={15} />,
        run: toggle,
        keywords: "theme dark light night day",
      },
      { id: "act-out", group: "Actions", label: "Sign out", icon: <LogOut size={15} />, run: () => (window.location.href = "/cdn-cgi/access/logout"), keywords: "logout" },
    ];
    for (const e of data.employees)
      cmds.push({ id: `emp-${e.id}`, group: "Employees", label: e.name, hint: `${e.role} · ${e.status}`, icon: <Users size={15} />, keywords: `${e.site} ${e.cls}`, run: go(`/employees?id=${e.id}`) });
    for (const c of data.clients)
      cmds.push({ id: `cli-${c.id}`, group: "Clients", label: c.org, hint: `${c.sector} · ${c.status}`, icon: <Building2 size={15} />, keywords: c.meta, run: go(`/clients?id=${c.id}`) });
    for (const col of data.opsColumns)
      for (const k of col.cards)
        cmds.push({ id: `op-${k.id}`, group: "Work items", label: `${k.ref} — ${k.title}`, hint: col.label, icon: <Route size={15} />, keywords: `${k.site} ${k.line} ${k.who}`, run: go(`/operations?card=${k.id}`) });
    for (const r of data.roles)
      cmds.push({ id: `role-${r.id}`, group: "Jobs", label: r.title, hint: `${r.status} · ${r.location || r.department}`, icon: <Briefcase size={15} />, keywords: `${r.meta} ${r.department}`, run: go(`/recruitment?role=${r.id}`) });
    for (const c of data.candidates)
      cmds.push({ id: `cand-${c.id}`, group: "Candidates", label: c.name, hint: c.headline || c.lic, icon: <UserPlus size={15} />, keywords: `${c.email} ${c.source} ${c.location}`, run: go(`/recruitment?role=${c.roleId}&candidate=${c.id}`) });
    for (const x of data.deals)
      cmds.push({ id: `deal-${x.id}`, group: "Deals", label: x.name, hint: x.stage, icon: <Building2 size={15} />, keywords: data.clients.find((c) => c.id === x.clientId)?.org, run: go(`/clients?view=deals&deal=${x.id}`) });
    for (const f of data.feed)
      cmds.push({ id: `int-${f.id}`, group: "Intelligence", label: f.headline, hint: `${f.sev} · ${f.region}`, icon: <MapPin size={15} />, keywords: f.source, run: go(`/intelligence?item=${f.id}`) });
    return cmds;
  }, [data, actions, navigate, theme, toggle, onActivity]);

  const results = useMemo(() => {
    const hits = q.trim()
      ? all.filter((c) => matches(q, c.label, c.hint, c.keywords, c.group))
      : all.filter((c) => c.group === "Jump to" || c.group === "Actions");
    const counts = new Map<string, number>();
    return hits.filter((c) => {
      const n = counts.get(c.group) ?? 0;
      counts.set(c.group, n + 1);
      return n < MAX_PER_GROUP;
    });
  }, [all, q]);

  useEffect(() => setActive(0), [q]);
  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const run = (c: Command | undefined) => {
    if (!c) return;
    onClose();
    // Let the palette close first so a drawer opened by the command gets focus.
    window.setTimeout(c.run, 60);
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(results.length - 1, a + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(0, a - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      run(results[active]);
    }
  };

  let lastGroup = "";
  return (
    <Modal open={open} onClose={onClose} label="Command palette" className="pt-palette" top>
      <div className="pt-palette__input">
        <Search size={17} className="pt-dim" />
        <input
          data-autofocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={onKey}
          placeholder="Search people, clients, work — or type a command"
          aria-label="Search"
          aria-controls="pt-palette-list"
          aria-activedescendant={results[active] ? `pt-cmd-${results[active]!.id}` : undefined}
        />
        <Kbd>Esc</Kbd>
      </div>
      <div className="pt-palette__list" id="pt-palette-list" role="listbox" ref={listRef}>
        {results.length === 0 && <div className="pt-palette__none">Nothing matches “{q}”.</div>}
        {results.map((c, i) => {
          const header = c.group !== lastGroup ? <div className="pt-palette__group">{c.group}</div> : null;
          lastGroup = c.group;
          return (
            <div key={c.id}>
              {header}
              <div
                id={`pt-cmd-${c.id}`}
                data-index={i}
                role="option"
                aria-selected={i === active}
                className="pt-palette__item"
                onMouseMove={() => setActive(i)}
                onClick={() => run(c)}
              >
                {c.icon}
                <span className="pt-palette__label">{c.label}</span>
                {c.hint && <span className="pt-palette__hint">{c.hint}</span>}
                {i === active && <ArrowRight size={14} />}
              </div>
            </div>
          );
        })}
      </div>
      <div className="pt-palette__foot">
        <span>
          <Kbd>↑</Kbd>
          <Kbd>↓</Kbd> move
        </span>
        <span>
          <EnterKey /> open
        </span>
        <span>
          <Kbd>N</Kbd> new on any page
        </span>
      </div>
    </Modal>
  );
}
