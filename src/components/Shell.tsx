import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { Building2, History, LayoutDashboard, LogOut, MapPin, Moon, Plus, Route, Search, Sun, UserPlus, Users } from "lucide-react";
import { useActions } from "../actions/ActionHost";
import { usePortal } from "../lib/DataProvider";
import { initialsOf, isoWeek, longDate } from "../lib/format";
import { useHotkey } from "../lib/hotkeys";
import { DUR, tween } from "../lib/motion";
import { useTheme } from "../lib/theme";
import { ActivityLog } from "./ActivityLog";
import { CommandPalette } from "./CommandPalette";
import { Kbd, ModKey } from "./ui/Bits";

const NAV = [
  { to: "/", label: "Control", icon: LayoutDashboard },
  { to: "/operations", label: "Operations", icon: Route },
  { to: "/recruitment", label: "Recruitment", icon: UserPlus },
  { to: "/employees", label: "Employees", icon: Users },
  { to: "/clients", label: "Clients", icon: Building2 },
  { to: "/intelligence", label: "Intelligence", icon: MapPin },
] as const;

const SEEN_KEY = "sandstone.audit.seen";

function useHeading(pathname: string): { title: string; meta: string } {
  const d = usePortal();
  const open = d.opsColumns.filter((c) => !c.done).reduce((n, c) => n + c.cards.length, 0);
  const late = d.opsColumns.flatMap((c) => c.cards).filter((c) => c.late).length;
  const onShift = d.employees.filter((e) => e.status === "On shift").length;
  const expiring = d.employees.filter((e) => e.expirySoon).length;
  const candidates = d.candidates.length;
  const breaches = d.feed.filter((f) => f.kind === "breach").length;
  const active = d.clients.filter((c) => c.status === "Active").length;
  const map: Record<string, { title: string; meta: string }> = {
    "/": { title: "Control", meta: `${longDate(d.today)} · week ${isoWeek(d.today)}` },
    "/operations": { title: "Operations", meta: `Order book · ${open} open · ${late} past due` },
    "/recruitment": { title: "Recruitment", meta: `${d.roles.length} roles · ${candidates} candidates · SLED licence checks tracked` },
    "/employees": { title: "Employees", meta: `Licensed personnel register · ${d.employees.length} on file · ${onShift} on shift · ${expiring} licences due` },
    "/clients": { title: "Clients", meta: `${d.clients.length} accounts · ${active} active` },
    "/intelligence": { title: "Intelligence", meta: `Monitored activity across New South Wales · ${d.feed.length} items · ${breaches} breach` },
  };
  return map[pathname] ?? map["/"]!;
}

export function Shell({ children }: { children: ReactNode }) {
  const d = usePortal();
  const { pathname } = useLocation();
  const actions = useActions();
  const { theme, toggle } = useTheme();
  const [palette, setPalette] = useState(false);
  const [log, setLog] = useState(false);
  const [seen, setSeen] = useState<number>(() => {
    try {
      return Number(localStorage.getItem(SEEN_KEY) ?? 0);
    } catch {
      return 0;
    }
  });
  const scroller = useRef<HTMLDivElement>(null);
  const heading = useHeading(pathname);
  const primary = actions.primaryFor(pathname);

  useHotkey("mod+k", () => setPalette((p) => !p));
  useHotkey("/", () => setPalette(true));
  useHotkey("n", () => primary?.run(), !!primary);

  useEffect(() => {
    scroller.current?.scrollTo({ top: 0 });
  }, [pathname]);

  const latestAudit = d.audit[0]?.id ?? 0;
  const openLog = () => {
    setLog(true);
    setSeen(latestAudit);
    try {
      localStorage.setItem(SEEN_KEY, String(latestAudit));
    } catch {
      // Unseen dot just won't persist.
    }
  };

  const open = d.opsColumns.filter((c) => !c.done).reduce((n, c) => n + c.cards.length, 0);
  const late = d.opsColumns.flatMap((c) => c.cards).filter((c) => c.late).length;
  const breaches = d.feed.filter((f) => f.kind === "breach").length;
  const counts: Record<string, { n: number; alert?: boolean } | undefined> = {
    "/operations": open ? { n: open, alert: late > 0 } : undefined,
    "/recruitment": d.candidates.length ? { n: d.candidates.length } : undefined,
    "/employees": d.employees.length ? { n: d.employees.length } : undefined,
    "/clients": d.clients.length ? { n: d.clients.length } : undefined,
    "/intelligence": breaches ? { n: breaches, alert: true } : undefined,
  };
  const onShift = d.employees.filter((e) => e.status === "On shift").length;

  return (
    <div className="pt-app">
      <aside className="pt-side">
        <div className="pt-side__brand">
          <div className="pt-side__lockup">
            <span className="sds-wordmark sds-wordmark--md">Sandstone</span>
            <motion.div className="pt-side__rule" initial={{ scaleX: 0 }} animate={{ scaleX: 1, transition: tween(DUR.reveal, 0.1) }} />
            <span className="pt-side__descriptor">Admin portal</span>
          </div>
        </div>
        <div className="pt-side__label">Modules</div>
        <nav className="pt-nav" aria-label="Modules">
          {NAV.map(({ to, label, icon: Icon }) => {
            const c = counts[to];
            const isActive = to === "/" ? pathname === "/" : pathname.startsWith(to);
            return (
              <NavLink key={to} to={to} end={to === "/"} className="pt-nav__item" title={label}>
                {isActive && <motion.span layoutId="nav-active" className="pt-nav__active" transition={tween(DUR.slow)} />}
                <Icon size={16} strokeWidth={1.75} />
                <span className="pt-nav__label">{label}</span>
                {c && <span className={`pt-nav__count${c.alert ? " pt-nav__count--alert" : ""}`}>{c.n}</span>}
              </NavLink>
            );
          })}
        </nav>
        <div className="pt-side__foot">
          <div className="pt-side__status">
            <span>ON SHIFT</span>
            <b>
              {onShift}/{d.employees.length}
            </b>
            <span>PAST DUE</span>
            <b style={late ? { color: "var(--clay-100)" } : undefined}>{late}</b>
          </div>
          <div className="pt-side__user">
            <span className="pt-side__avatar" title={d.me.email}>
              {initialsOf(d.me.email)}
            </span>
            <span className="pt-side__email">{d.me.email}</span>
            <a className="pt-iconbtn pt-iconbtn--inverse pt-iconbtn--sm" href="/cdn-cgi/access/logout" title="Sign out" aria-label="Sign out">
              <LogOut size={14} />
            </a>
          </div>
        </div>
      </aside>

      <div className="pt-main">
        <header className="pt-head">
          <div className="pt-head__titles">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div key={pathname} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0, transition: tween(DUR.base) }} exit={{ opacity: 0, transition: tween(DUR.fast) }}>
                <h1 className="pt-head__title">{heading.title}</h1>
                <div className="pt-head__meta">{heading.meta}</div>
              </motion.div>
            </AnimatePresence>
          </div>
          <div className="pt-head__tools">
            <button className="pt-search" onClick={() => setPalette(true)} aria-label="Search or jump to (command palette)">
              <Search size={14} />
              <span>Search or jump to…</span>
              <ModKey />
              <Kbd>K</Kbd>
            </button>
            {primary && (
              <button className="sds-btn sds-btn--md sds-btn--primary pt-head__primary" onClick={primary.run} title={`${primary.label} (N)`} aria-label={primary.label}>
                <Plus size={16} className="pt-head__primary-icon" aria-hidden />
                <span className="pt-head__primary-label">{primary.label}</span>
              </button>
            )}
            <span className="pt-head__sep" />
            <button className="pt-iconbtn" onClick={openLog} aria-label="Activity log" title="Activity log">
              <History size={17} strokeWidth={1.75} />
              {latestAudit > seen && <span className="pt-iconbtn__dot" />}
            </button>
            <button
              className="pt-iconbtn"
              onClick={toggle}
              aria-label={theme === "light" ? "Switch to operations mode" : "Switch to limestone mode"}
              title={theme === "light" ? "Operations mode (night)" : "Limestone mode (day)"}
            >
              <AnimatePresence mode="wait" initial={false}>
                <motion.span
                  key={theme}
                  style={{ display: "inline-flex" }}
                  initial={{ opacity: 0, rotate: -45 }}
                  animate={{ opacity: 1, rotate: 0, transition: tween(DUR.base) }}
                  exit={{ opacity: 0, rotate: 45, transition: tween(DUR.fast) }}
                >
                  {theme === "light" ? <Moon size={17} strokeWidth={1.75} /> : <Sun size={17} strokeWidth={1.75} />}
                </motion.span>
              </AnimatePresence>
            </button>
          </div>
        </header>
        <div className="pt-scroll" ref={scroller}>
          {children}
        </div>
      </div>

      <CommandPalette open={palette} onClose={() => setPalette(false)} onActivity={openLog} />
      <ActivityLog open={log} onClose={() => setLog(false)} />
    </div>
  );
}
