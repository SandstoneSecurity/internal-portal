import { useRef, useState } from "react";
import { RefreshCw, Upload } from "lucide-react";
import { FACTOR_MAX, FACTOR_MIN, OFFENCES, locationFactor } from "../../../shared/crime";
import type { ClientSite } from "../../../shared/types";
import { useThreatActions } from "../../actions/threatActions";
import { SectionHead } from "../../components/ui/Bits";
import { usePortal } from "../../lib/DataProvider";
import { relativeTime } from "../../lib/format";
import { Term } from "./Guide";

/** Where the NSW crime statistics stand, with refresh and upload. */
export function CrimeStatus() {
  const d = usePortal();
  const t = useThreatActions();
  const [busy, setBusy] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const m = d.crime.meta;
  const loaded = d.crime.areas.length > 0;
  const run = async (f: () => Promise<void>) => {
    setBusy(true);
    await f();
    setBusy(false);
  };
  return (
    <section className={`pt-risk-crime${loaded ? "" : " is-empty"}`} aria-label="NSW crime statistics">
      <div className="pt-risk-crime__text">
        <span className="pt-eyebrow">NSW crime statistics</span>
        {loaded ? (
          <p>
            <b>{d.crime.areas.length} LGAs</b> from {m?.source || "BOCSAR"}
            {m?.period ? ` · ${m.period}` : ""}
            {m?.fetchedAt ? ` · updated ${relativeTime(m.fetchedAt)}` : ""}. Sites with a council area take their break-in, theft, damage, robbery and assault rates from
            their LGA against the NSW rate.
            {m?.status === "error" && <span className="pt-risk-crime__warn"> Last refresh failed: {m.message}</span>}
          </p>
        ) : (
          <p>
            {m?.status === "error" ? `Not loaded: ${m.message} ` : "Not loaded yet. The portal fetches BOCSAR's Local area rankings automatically; "}
            you can also download the Local area rankings workbook from BOCSAR and upload it here. Until then, sites use their manual crime factor.
          </p>
        )}
      </div>
      <div className="pt-risk-crime__actions">
        <input ref={file} type="file" accept=".xlsx,.xlsm,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" hidden onChange={(e) => e.target.files?.[0] && void run(() => t.uploadCrime(e.target.files![0]!))} />
        <button className="sds-btn sds-btn--sm sds-btn--ghost" disabled={busy} onClick={() => void run(t.refreshCrime)}>
          <RefreshCw size={13} /> Refresh from BOCSAR
        </button>
        <button className="sds-btn sds-btn--sm sds-btn--secondary" disabled={busy} onClick={() => file.current?.click()}>
          <Upload size={13} /> Upload workbook
        </button>
      </div>
    </section>
  );
}

/** "January 2025 to December 2025" → "2025"; "July 2024 to June 2025" → "2024–25". */
function shortPeriod(p: string | undefined): string {
  const years = [...(p ?? "").matchAll(/\b(19|20)\d{2}\b/g)].map((m) => m[0]);
  if (!years.length) return p ?? "";
  const [a, b] = [years[0]!, years[years.length - 1]!];
  return a === b ? a : `${a}–${b.slice(2)}`;
}

/**
 * A site's recorded-crime profile: each offence's rate in the site's council
 * area against the NSW rate, on a log scale centred on NSW.
 */
export function SiteCrimeProfile({ site, onEdit }: { site: ClientSite; onEdit: () => void }) {
  const d = usePortal();
  const rows = OFFENCES.map((o) => ({ o, f: locationFactor(d.crime, site.lga, o.key) })).filter((x) => x.f);
  const pos = (v: number) => ((Math.log(Math.min(FACTOR_MAX, Math.max(FACTOR_MIN, v))) - Math.log(FACTOR_MIN)) / (Math.log(FACTOR_MAX) - Math.log(FACTOR_MIN))) * 100;
  const fmt = (v: number) => (v >= 10 ? String(Math.round(v)) : v.toFixed(1));
  const period = shortPeriod(d.crime.meta?.period);
  return (
    <div className="pt-risk-cp">
      <SectionHead title="Crime profile" hint={<Term k="location" />} />
      {site.lga && (
        <p className="pt-risk-cp__ctx">
          <b>{site.lga}</b>
          <span>
            vs NSW{period ? ` · ${period}` : ""}
          </span>
        </p>
      )}
      {!site.lga ? (
        <p className="pt-risk-note">
          Set the site's council area to size break-ins, theft and assault from local recorded crime.{" "}
          <button className="pt-addlink" onClick={onEdit}>
            Set council area
          </button>
        </p>
      ) : rows.length === 0 ? (
        <p className="pt-risk-note">
          {d.crime.areas.length ? `No BOCSAR rates for this council area. Check the name matches BOCSAR's list.` : "Waiting for NSW crime statistics; the manual crime factor applies meanwhile."}{" "}
          <button className="pt-addlink" onClick={onEdit}>
            Edit site
          </button>
        </p>
      ) : (
        <>
          <ul className="pt-risk-cp__list">
            {rows.map(({ o, f }) => {
              const level = f!.raw >= 1.5 ? "is-high" : f!.raw <= 0.67 ? "is-low" : "";
              return (
                <li key={o.key} title={`${o.label}: ${f!.lgaRate.toFixed(1)} per 100,000 in ${site.lga}, ${f!.nswRate.toFixed(1)} across NSW${f!.rank ? ` · ranked ${f!.rank}` : ""}`}>
                  <span className="pt-risk-cp__label">{o.short}</span>
                  <span className={`pt-risk-cp__v ${level}`}>×{fmt(f!.raw)}</span>
                  <span className="pt-risk-cp__track" aria-hidden>
                    <i className="pt-risk-cp__mid" style={{ left: `${pos(1)}%` }} />
                    <i className={`pt-risk-cp__bar ${level}`} style={{ left: `${Math.min(pos(1), pos(f!.raw))}%`, width: `${Math.abs(pos(f!.raw) - pos(1))}%` }} />
                  </span>
                </li>
              );
            })}
          </ul>
          <p className="pt-risk-cp__axis" aria-hidden>
            <span>Lower</span>
            <span>NSW</span>
            <span>Higher</span>
          </p>
        </>
      )}
    </div>
  );
}
