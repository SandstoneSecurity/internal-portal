import { AnimatePresence, motion } from "motion/react";
import { useMemo, useState } from "react";
import type { Client } from "../../shared/types";
import { useActions } from "../actions/ActionHost";
import { Badge } from "../components/ui/Badge";
import { Empty, RowMenu, SectionHead, Tabs } from "../components/ui/Bits";
import { usePortal } from "../lib/DataProvider";
import { longDate, money, moneyValue } from "../lib/format";
import { list, row, swap } from "../lib/motion";
import { registerKeys, useSelection } from "../lib/selection";

const TABS = ["All", "Prospect", "Proposal", "Active", "Dormant"] as const;
const COLS = "minmax(0,1.6fr) minmax(0,1fr) 54px 96px 54px 110px 34px";

/** Opens the user's mail client with a one-page account brief, ready to address and send. */
function briefHref(c: Client, today: string, from: string): string {
  const lines = [
    `${c.org} — account brief`,
    `Prepared ${longDate(today)} by ${from}`,
    "",
    `Status: ${c.status}`,
    `Sector: ${c.sector}`,
    `Sites under order: ${c.sites}`,
    `Value per annum: ${c.value}`,
    `Account owner: ${c.owner}`,
    c.meta ? `Summary: ${c.meta}` : "",
    "",
    c.contacts.length ? "Contacts:" : "",
    ...c.contacts.map((p) => `  • ${p.name} — ${p.role}`),
    c.deal ? "" : "",
    c.deal ? `Open proposal: ${c.deal.name} · ${c.deal.value} · ${c.deal.stage.toLowerCase()} · review ${c.deal.review}` : "",
    "",
    c.activity.length ? "Recent activity:" : "",
    ...c.activity.slice(0, 5).map((a) => `  ${a.date} — ${a.text}`),
    "",
    "— Sandstone Security & Risk",
  ].filter((l, i, all) => !(l === "" && all[i - 1] === ""));
  return `mailto:?subject=${encodeURIComponent(`Sandstone brief — ${c.org}`)}&body=${encodeURIComponent(lines.join("\n"))}`;
}

function Record({ c, today, me }: { c: Client; today: string; me: string }) {
  const actions = useActions();
  return (
    <div className="pt-file__pad">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span className="pt-eyebrow">Client record</span>
        <Badge kind={c.kind} label={c.status} />
      </div>
      <div className="pt-file__title">{c.org}</div>
      <div className="pt-file__sub">{c.meta}</div>

      <div className="pt-facts">
        {[
          ["Sector", c.sector.toUpperCase()],
          ["Sites", String(c.sites)],
          ["Value p.a.", c.value],
          ["Owner", c.owner],
        ].map(([k, v]) => (
          <div key={k} className="pt-fact">
            <span className="pt-fact__k">{k}</span>
            <span className="pt-fact__v">{v}</span>
          </div>
        ))}
      </div>

      <div className="pt-file__block">
        <div className="pt-file__blockhead">
          <span className="pt-meta">Contacts</span>
          <button className="pt-addlink" onClick={() => actions.addContact(c)}>
            + Add
          </button>
        </div>
        {c.contacts.length === 0 ? (
          <div style={{ font: "var(--type-small)", color: "var(--text-tertiary)", padding: "6px 0" }}>No contacts recorded.</div>
        ) : (
          c.contacts.map((p, i) => (
            <div key={i} className="pt-line">
              <span style={{ flex: 1 }}>{p.name}</span>
              <span style={{ font: "var(--type-small)", color: "var(--text-tertiary)" }}>{p.role}</span>
            </div>
          ))
        )}
      </div>

      <div className="pt-file__block">
        {c.deal ? (
          <button
            onClick={() => actions.recordProposal(c)}
            style={{ width: "100%", textAlign: "left", border: "1px solid var(--border-subtle)", background: "var(--surface-sunken)", padding: "14px 16px", cursor: "pointer", color: "inherit" }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <span className="pt-meta" style={{ color: "var(--text-secondary)" }}>
                Open proposal
              </span>
              <span className="pt-mono" style={{ color: "var(--text-brand)", fontSize: 11 }}>
                {c.deal.stage}
              </span>
            </div>
            <div style={{ marginTop: 8, fontSize: 13.5 }}>{c.deal.name}</div>
            <div className="pt-mono" style={{ display: "flex", justifyContent: "space-between", marginTop: 8, fontSize: 11, color: "var(--text-secondary)" }}>
              <span>{c.deal.value}</span>
              <span>REVIEW {c.deal.review}</span>
            </div>
          </button>
        ) : (
          <button className="pt-addlink" onClick={() => actions.recordProposal(c)}>
            + Record a proposal
          </button>
        )}
      </div>

      <div className="pt-file__block">
        <div className="pt-file__blockhead">
          <span className="pt-meta">Activity</span>
          <button className="pt-addlink" onClick={() => actions.logActivity(c)}>
            + Log
          </button>
        </div>
        {c.activity.length === 0 ? (
          <div style={{ font: "var(--type-small)", color: "var(--text-tertiary)", padding: "6px 0" }}>No activity logged.</div>
        ) : (
          c.activity.slice(0, 6).map((a, i) => (
            <div key={i} style={{ padding: "9px 0", borderBottom: "1px solid var(--border-subtle)" }}>
              <div className="pt-mono pt-dim" style={{ fontSize: 10 }}>
                {a.date}
              </div>
              <div style={{ fontSize: 13, marginTop: 3, lineHeight: 1.45 }}>{a.text}</div>
            </div>
          ))
        )}
      </div>

      <div className="pt-file__actions">
        <a className="sds-btn sds-btn--sm sds-btn--secondary" href={briefHref(c, today, me)}>
          Send brief
        </a>
        <button className="sds-btn sds-btn--sm sds-btn--ghost" onClick={() => actions.logActivity(c)}>
          Log activity
        </button>
        <button className="sds-btn sds-btn--sm sds-btn--ghost" onClick={() => actions.editClient(c)}>
          Edit
        </button>
      </div>
    </div>
  );
}

export function ClientsPage() {
  const d = usePortal();
  const actions = useActions();
  const [tab, setTab] = useState<(typeof TABS)[number]>("All");
  const [idParam, setId] = useSelection("id");

  const counts = useMemo(() => {
    const out: Record<string, number> = { All: d.clients.length };
    for (const t of TABS.slice(1)) out[t] = d.clients.filter((c) => c.status === t).length;
    return out;
  }, [d.clients]);
  const shown = d.clients.filter((c) => tab === "All" || c.status === tab);
  const selId = d.clients.some((c) => c.id === idParam) ? idParam : shown[0]?.id ?? null;
  const sel = d.clients.find((c) => c.id === selId);
  const value = money(d.clients.filter((c) => c.status === "Active").reduce((n, c) => n + moneyValue(c.value), 0));

  if (d.clients.length === 0)
    return (
      <Empty
        index="00"
        title="No client accounts yet."
        body="Open an account for each client — prospects included. Record contacts, proposals and activity against it, and send a one-page brief from the record."
        action={
          <button className="sds-btn sds-btn--md sds-btn--primary" onClick={actions.newClient}>
            New account
          </button>
        }
      />
    );

  return (
    <div className="pt-split">
      <div style={{ minWidth: 0 }}>
        <Tabs
          id="clients"
          tabs={TABS}
          value={tab}
          onChange={setTab}
          counts={counts}
          trailing={<span className="pt-meta">Active contract value {value} p.a.</span>}
        />
        <SectionHead title="Accounts" meta={`Showing ${shown.length} of ${d.clients.length}`} />
        <div className="pt-reg">
          <div className="pt-reg__head" style={{ gridTemplateColumns: COLS }}>
            <span>Organisation</span>
            <span className="pt-hide-sm">Sector</span>
            <span>Sites</span>
            <span>Value p.a.</span>
            <span>Owner</span>
            <span>Status</span>
            <span />
          </div>
          {shown.length === 0 ? (
            <div style={{ padding: "16px 12px", font: "var(--type-small)", color: "var(--text-tertiary)" }}>No {tab.toLowerCase()} accounts.</div>
          ) : (
            <motion.div variants={list} initial="initial" animate="animate" key={tab}>
              {shown.map((c) => (
                <motion.div
                  key={c.id}
                  variants={row}
                  className="pt-reg__row"
                  style={{ gridTemplateColumns: COLS }}
                  aria-selected={c.id === selId}
                  tabIndex={0}
                  onClick={() => setId(c.id)}
                  onKeyDown={(e) => registerKeys(e, () => setId(c.id))}
                >
                  <span className="pt-reg__name">{c.org}</span>
                  <span className="pt-reg__text pt-hide-sm">{c.sector}</span>
                  <span className="pt-reg__mono">{c.sites}</span>
                  <span className="pt-reg__mono">{c.value}</span>
                  <span className="pt-owner">{c.owner}</span>
                  <span>
                    <Badge kind={c.kind} label={c.status} />
                  </span>
                  <RowMenu
                    items={[
                      { label: "Log activity", onSelect: () => actions.logActivity(c) },
                      { label: c.deal ? "Update proposal" : "Record proposal", onSelect: () => actions.recordProposal(c) },
                      { label: "Add contact", onSelect: () => actions.addContact(c) },
                      { label: "Edit account", onSelect: () => actions.editClient(c) },
                      { label: "Close account", onSelect: () => void actions.closeClient(c), danger: true },
                    ]}
                  />
                </motion.div>
              ))}
            </motion.div>
          )}
        </div>
      </div>

      {sel && (
        <aside className="pt-file">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div key={sel.id} variants={swap} initial="initial" animate="animate" exit="exit">
              <Record c={sel} today={d.today} me={d.me.email} />
            </motion.div>
          </AnimatePresence>
        </aside>
      )}
    </div>
  );
}
