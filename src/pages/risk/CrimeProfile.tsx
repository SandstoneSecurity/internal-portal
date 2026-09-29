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

/** A site's recorded-crime profile: each offence's LGA rate against NSW, as a factor on a log scale. */
export function SiteCrimeProfile({ site, onEdit }: { site: ClientSite; onEdit: () => void }) {
  const d = usePortal();
  const rows = OFFENCES.map((o) => ({ o, f: locationFactor(d.crime, site.lga, o.key) })).filter((x) => x.f);
  const pos = (v: number) => ((Math.log(Math.min(FACTOR_MAX, Math.max(FACTOR_MIN, v))) - Math.log(FACTOR_MIN)) / (Math.log(FACTOR_MAX) - Math.log(FACTOR_MIN))) * 100;
  return (
    <div className="pt-risk-cp">
      <SectionHead title="Crime profile" hint={<Term k="location" />} meta={site.lga ? `${site.lga} vs NSW` : undefined} />
      {!site.lga ? (
        <p className="pt-risk-note">
          Set the site's council area (LGA) to size its crime-driven threats from BOCSAR's recorded rates.{" "}
          <button className="pt-addlink" onClick={onEdit}>
            Set LGA
          </button>
        </p>
      ) : rows.length === 0 ? (
        <p className="pt-risk-note">
          {d.crime.areas.length ? `No BOCSAR rates found for "${site.lga}". Check the council name matches BOCSAR's list.` : "NSW crime statistics aren't loaded yet; the manual crime factor applies meanwhile."}{" "}
          <button className="pt-addlink" onClick={onEdit}>
            Edit site
          </button>
        </p>
      ) : (
        <>
          <ul className="pt-risk-cp__list">
            {rows.map(({ o, f }) => (
              <li key={o.key} title={`${o.label}: ${f!.lgaRate.toFixed(1)} per 100,000 in ${site.lga}, ${f!.nswRate.toFixed(1)} across NSW${f!.rank ? ` · ranked ${f!.rank}` : ""}`}>
                <span className="pt-risk-cp__label">{o.short}</span>
                <span className="pt-risk-cp__track">
                  <span className="pt-risk-cp__mid" style={{ left: `${pos(1)}%` }} />
                  <span className={`pt-risk-cp__dot${f!.raw >= 1.5 ? " is-high" : f!.raw <= 0.67 ? " is-low" : ""}`} style={{ left: `${pos(f!.raw)}%` }} />
                </span>
                <span className="pt-risk-cp__v">×{f!.raw >= 10 ? Math.round(f!.raw) : f!.raw.toFixed(1)}</span>
              </li>
            ))}
          </ul>
          <p className="pt-risk-note">
            Rate per 100,000 residents against NSW ({d.crime.meta?.period || "latest year"}). Residential rates overstate risk in business districts with few residents, so the model
            holds factors between ×{FACTOR_MIN} and ×{FACTOR_MAX}.
          </p>
        </>
      )}
    </div>
  );
}
