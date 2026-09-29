import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { CONTROL_STATUSES, type RatedScenario } from "../../shared/risk";
import { CONTROL_BY_KEY, DOMAINS, DOMAIN_LABEL, THREATS, THREAT_BY_KEY, EXPOSURE_LABEL } from "../../shared/threatLibrary";
import type { Client, ClientSite, PortalData, SiteLevel, TmCamera, TmControl, TmElement, TmElementKind, TmIncident } from "../../shared/types";
import { DEFAULT_CAMERA } from "../../shared/cameras";
import type { FieldSpec, FormValues } from "../components/ui/FormDrawer";
import { useConfirm } from "../components/ui/Confirm";
import { useToast } from "../components/ui/Toast";
import { ApiError, send } from "../lib/api";
import { usePortalData } from "../lib/DataProvider";
import { compactAud, frequencyLabel, meanOf } from "../lib/riskModel";
import { OFFENCE_LABEL, threatLocation } from "../../shared/crime";
import { useActions } from "./ActionHost";
import { SUBTYPES, guessArea, siteFields, siteInitial } from "./threatFields";

const num = (v: unknown): number | null => (v === "" || v === undefined || v === null ? null : Number(v));
const KIND_LABEL: Record<TmElementKind, string> = { zone: "zone", asset: "asset", entry: "entry point" };

export function useThreatActions() {
  const { data, refresh, mutate } = usePortalData();
  const actions = useActions();
  const toast = useToast();
  const confirm = useConfirm();
  const navigate = useNavigate();

  return useMemo(() => {
    const d = data as PortalData;
    const done = async (title: string, desc?: string) => {
      await refresh();
      toast({ title, desc, kind: "secure" });
    };
    const fail = (err: unknown) => toast({ title: "Change not saved", desc: (err as Error).message, kind: "breach" });
    const destroy = async (o: { title: string; body: string; path: string; toast: string; label?: string }) => {
      if (!(await confirm({ title: o.title, body: o.body, confirmLabel: o.label ?? "Delete", danger: true }))) return false;
      try {
        await send("DELETE", o.path);
        await done(o.toast);
        return true;
      } catch (err) {
        fail(err);
        return false;
      }
    };
    const sitesOf = (clientId: number) => d.sites.filter((s) => s.clientId === clientId);
    const siteOptions = (clientId: number) => sitesOf(clientId).map((s) => ({ value: String(s.id), label: s.name }));

    const t = {
      editProfile: (c: Client) =>
        actions.openForm({
          eyebrow: "Organisation profile",
          title: c.org,
          submitLabel: "Save profile",
          intro: "Size sets which loss ranges apply (ABS: small under 20 staff, medium 20–199, large 200+). Revenue, when known, scales consequence ratings. Incident history tells the model how many years your logged incidents cover.",
          fields: [
            { name: "staff", label: "Staff (headcount)", type: "number", half: true, hint: "Scales per-staff threats such as assault and psychological injury" },
            { name: "revenue", label: "Annual revenue (AUD)", type: "number", half: true, hint: "0 if unknown" },
            {
              name: "historyYears",
              label: "Incident history covers (years)",
              type: "number",
              hint: "Set this once you've logged the incidents from that period. With 0, frequencies stay at the library reference rates.",
            },
          ],
          initial: { staff: c.staff, revenue: c.revenue, historyYears: c.historyYears },
          submit: async (v) => {
            await send("PATCH", `/clients/${c.id}`, { staff: num(v.staff) ?? 0, revenue: num(v.revenue) ?? 0, historyYears: num(v.historyYears) ?? 0 });
            await done("Profile saved", c.org);
          },
        }),

      editSite: (s: ClientSite) =>
        actions.openForm({
          eyebrow: "Site",
          title: s.name,
          submitLabel: "Save site",
          fields: siteFields(undefined, d.crime.areas),
          initial: siteInitial(s),
          submit: async (v) => {
            await send("PATCH", `/sites/${s.id}`, { ...v, lga: v.lga || guessArea(d.crime.areas, v.suburb) });
            await done("Site saved", String(v.name));
          },
          danger: { label: "Delete site", run: () => t.deleteSite(s) },
        }),

      deleteSite: async (s: ClientSite) => {
        const ok = await destroy({
          title: `Delete ${s.name}?`,
          body: "Its floor plans, zones, assets, scenarios, controls and incidents will be deleted. Organisation-wide scenarios stay.",
          path: `/sites/${s.id}`,
          toast: "Site deleted",
        });
        if (ok) navigate(`/risk?client=${s.clientId}&tab=Sites`);
        return ok;
      },

      addLevel: (s: ClientSite) =>
        actions.openForm({
          eyebrow: s.name,
          title: "Add level",
          submitLabel: "Add level",
          fields: levelFields,
          initial: { name: `Level ${s.levels.length}`, order: s.levels.length, heightM: 3.6, widthM: s.levels[0]?.widthM ?? 40 },
          submit: async (v) => {
            await send("POST", `/sites/${s.id}/levels`, v);
            await done("Level added", String(v.name));
          },
        }),

      editLevel: (l: SiteLevel) =>
        actions.openForm({
          eyebrow: "Level",
          title: l.name,
          submitLabel: "Save level",
          fields: levelFields,
          initial: { name: l.name, order: l.order, heightM: l.heightM, widthM: l.widthM },
          submit: async (v) => {
            await send("PATCH", `/levels/${l.id}`, v);
            await done("Level saved", String(v.name));
          },
          danger: {
            label: "Delete level",
            run: () =>
              destroy({
                title: `Delete ${l.name}?`,
                body: "Its floor plan, walls and cameras are deleted. Zones, assets and entry points on it are kept but lose their place on the plan.",
                path: `/levels/${l.id}`,
                toast: "Level deleted",
              }),
          },
        }),

      removePlan: (l: SiteLevel) =>
        destroy({
          title: `Remove the ${l.name} plan?`,
          body: "Elements keep their positions, so a replacement plan of the same drawing lines up again.",
          path: `/levels/${l.id}/plan`,
          toast: "Floor plan removed",
          label: "Remove plan",
        }),

      addElement: (s: ClientSite, kind: TmElementKind, at?: { levelId?: number | null; x?: number; y?: number; w?: number; h?: number; zoneId?: number | null }) =>
        actions.openForm({
          eyebrow: s.name,
          title: `Add ${KIND_LABEL[kind]}`,
          submitLabel: `Add ${KIND_LABEL[kind]}`,
          fields: elementFields(kind, s, d.tmElements.filter((e) => e.siteId === s.id && e.kind === "zone")),
          initial: {
            name: "",
            subtype: SUBTYPES[kind][0]!.value,
            value: 0,
            criticality: 3,
            levelId: String(at?.levelId ?? s.levels[0]?.id ?? ""),
            zoneId: at?.zoneId ? String(at.zoneId) : "",
            notes: "",
          },
          submit: async (v) => {
            await send("POST", `/sites/${s.id}/elements`, {
              kind,
              name: v.name,
              subtype: v.subtype,
              value: num(v.value) ?? 0,
              criticality: num(v.criticality) ?? 3,
              levelId: num(v.levelId),
              zoneId: num(v.zoneId),
              notes: v.notes,
              x: at?.x ?? null,
              y: at?.y ?? null,
              w: at?.w ?? null,
              h: at?.h ?? null,
            });
            await done(`${KIND_LABEL[kind][0]!.toUpperCase()}${KIND_LABEL[kind].slice(1)} added`, String(v.name));
          },
        }),

      editElement: (e: TmElement) => {
        const s = d.sites.find((x) => x.id === e.siteId)!;
        actions.openForm({
          eyebrow: `${s.name} · ${KIND_LABEL[e.kind]}`,
          title: e.name,
          submitLabel: "Save",
          fields: elementFields(e.kind, s, d.tmElements.filter((z) => z.siteId === s.id && z.kind === "zone" && z.id !== e.id)),
          initial: { name: e.name, subtype: e.subtype, value: e.value, criticality: e.criticality, levelId: e.levelId ? String(e.levelId) : "", zoneId: e.zoneId ? String(e.zoneId) : "", notes: e.notes },
          submit: async (v) => {
            await send("PATCH", `/elements/${e.id}`, {
              name: v.name,
              subtype: v.subtype,
              value: num(v.value) ?? 0,
              criticality: num(v.criticality) ?? 3,
              levelId: num(v.levelId),
              zoneId: num(v.zoneId),
              notes: v.notes,
            });
            await done("Saved", String(v.name));
          },
          danger: {
            label: `Delete ${KIND_LABEL[e.kind]}`,
            run: () => destroy({ title: `Delete ${e.name}?`, body: "Scenarios aimed at it stay, without the link.", path: `/elements/${e.id}`, toast: "Deleted" }),
          },
        });
      },

      /** Drag on the plan: optimistic, then saved. */
      placeElement: async (e: TmElement, pos: { x: number | null; y: number | null; w?: number | null; h?: number | null; levelId?: number | null; zoneId?: number | null }) => {
        try {
          await mutate(
            (dd) => ({ ...dd, tmElements: dd.tmElements.map((k) => (k.id === e.id ? { ...k, ...pos } : k)) }),
            () => send("PATCH", `/elements/${e.id}`, pos)
          );
        } catch (err) {
          fail(err);
        }
      },

      /** Sets the plan's real width after a measurement, marking the scale as known. */
      setScale: async (l: SiteLevel, widthM: number) => {
        const w = Math.round(widthM * 100) / 100;
        try {
          await mutate(
            (dd) => ({ ...dd, sites: dd.sites.map((s) => (s.id !== l.siteId ? s : { ...s, levels: s.levels.map((x) => (x.id === l.id ? { ...x, widthM: w, scaleSet: true } : x)) })) }),
            () => send("PATCH", `/levels/${l.id}`, { widthM: w, scaleSet: true })
          );
          toast({ title: "Scale set", desc: `${l.name} is ${w.toLocaleString("en-AU")} m across`, kind: "secure" });
        } catch (err) {
          fail(err);
        }
      },

      addCamera: async (s: ClientSite, levelId: number | null, spec: Partial<TmCamera> & { x: number; y: number }) => {
        const n = d.tmCameras.filter((c) => c.siteId === s.id).length + 1;
        try {
          const r = await send<{ id: number }>("POST", `/sites/${s.id}/cameras`, { ...DEFAULT_CAMERA, name: `Camera ${n}`, ...spec, levelId });
          await refresh();
          return r.id;
        } catch (err) {
          fail(err);
          return null;
        }
      },

      updateCamera: async (c: TmCamera, patch: Partial<Omit<TmCamera, "id" | "siteId">>) => {
        try {
          await mutate(
            (dd) => ({ ...dd, tmCameras: dd.tmCameras.map((k) => (k.id === c.id ? { ...k, ...patch } : k)) }),
            () => send("PATCH", `/cameras/${c.id}`, patch)
          );
        } catch (err) {
          fail(err);
        }
      },

      deleteCamera: (c: TmCamera) =>
        destroy({ title: `Delete ${c.name}?`, body: "Its view and coverage are removed from the plan and 3D model.", path: `/cameras/${c.id}`, toast: "Camera deleted" }),

      addScenarios: async (clientId: number, items: { threatKey: string; siteId: number | null }[]) => {
        if (!items.length) return;
        try {
          const r = await send<{ added: number; skipped: number }>("POST", `/clients/${clientId}/scenarios/bulk`, { items });
          await done(`${r.added} ${r.added === 1 ? "scenario" : "scenarios"} added`, r.skipped ? `${r.skipped} already modelled` : undefined);
        } catch (err) {
          fail(err);
        }
      },

      refreshCrime: async () => {
        try {
          const r = await send<{ lgas: number; period: string }>("POST", "/crime/refresh");
          await done("Crime statistics refreshed", `${r.lgas} NSW LGAs · ${r.period}`);
        } catch (err) {
          fail(err);
        }
      },

      uploadCrime: async (file: File) => {
        try {
          const res = await fetch(`/api/crime/import?name=${encodeURIComponent(file.name)}`, {
            method: "PUT",
            credentials: "same-origin",
            headers: { "X-Sandstone-Portal": "1", "Content-Type": "application/octet-stream" },
            body: file,
          });
          const j = (await res.json().catch(() => ({}))) as { error?: string; lgas?: number; period?: string };
          if (!res.ok) throw new ApiError(j.error ?? `Import failed (${res.status}).`, res.status);
          await done("Crime statistics imported", `${j.lgas} NSW LGAs · ${j.period}`);
        } catch (err) {
          fail(err);
        }
      },

      /** One library threat, optionally aimed at an asset. */
      addScenario: async (clientId: number, body: { threatKey: string; siteId: number | null; elementId?: number | null }) => {
        try {
          await send("POST", `/clients/${clientId}/scenarios`, body);
          await done("Scenario added", THREAT_BY_KEY.get(body.threatKey)?.name);
        } catch (err) {
          fail(err);
        }
      },

      addCustomScenario: (clientId: number, siteId?: number | null) =>
        actions.openForm({
          eyebrow: "Scenario",
          title: "Custom scenario",
          submitLabel: "Add scenario",
          intro: "For a threat the library doesn't cover. Give your best range for how often it happens and what one event costs; the model treats it like any other scenario.",
          fields: [
            { name: "name", label: "Scenario", required: true, max: 120, placeholder: "e.g. Drone surveillance of the yard" },
            { name: "domain", label: "Domain", type: "select", required: true, half: true, options: DOMAINS.map((k) => ({ value: k, label: DOMAIN_LABEL[k] })) },
            { name: "siteId", label: "Where", type: "select", half: true, options: siteOptions(clientId), hint: "Leave blank for organisation-wide" },
            ...rangeFields(true),
            { name: "notes", label: "Basis", type: "textarea", max: 2000, placeholder: "Where the numbers come from" },
          ],
          initial: { name: "", domain: "physical", siteId: siteId ? String(siteId) : "", rateLow: "", rateTypical: "", rateHigh: "", lossLow: "", lossTypical: "", lossHigh: "", notes: "" },
          submit: async (v) => {
            await send("POST", `/clients/${clientId}/scenarios`, { threatKey: "custom", ...rangeBody(v), name: v.name, domain: v.domain, siteId: num(v.siteId), notes: v.notes });
            await done("Scenario added", String(v.name));
          },
        }),

      editScenario: (_clientId: number, r: RatedScenario) => {
        const sc = d.tmScenarios.find((x) => x.id === r.s.id)!;
        const threat = r.s.threat;
        const assets = sc.siteId ? d.tmElements.filter((e) => e.siteId === sc.siteId && e.kind === "asset") : [];
        const ref = r.s.referenceRate;
        const site = sc.siteId ? d.sites.find((x) => x.id === sc.siteId) : undefined;
        const loc = site && threat ? threatLocation(d.crime, site.lga, threat.key, site.kind) : null;
        actions.openForm({
          eyebrow: threat ? `${DOMAIN_LABEL[threat.domain]} · ${threat.category}` : "Custom scenario",
          title: r.s.name,
          submitLabel: "Save scenario",
          intro: threat ? (
            <>
              Library reference: {frequencyLabel(meanOf(ref))} ({EXPOSURE_LABEL[threat.exposure]} × exposure), {compactAud(meanOf(threat.loss.small))}–{compactAud(meanOf(threat.loss.large))} per event by size. Leave a box blank to keep the library or calibrated value.
              {loc && site && (
                <>
                  {" "}
                  Location: {site.lga} records {OFFENCE_LABEL[loc.offence].toLowerCase()} at {Math.round(loc.lgaRate).toLocaleString()} per 100,000 against {Math.round(loc.nswRate).toLocaleString()} for NSW, so this site
                  runs at ×{loc.factor.toFixed(2)}
                  {loc.raw !== loc.factor ? ` (×${loc.raw.toFixed(1)} held to the model's range)` : ""}.
                </>
              )}
            </>
          ) : undefined,
          fields: [
            ...(threat ? [] : [{ name: "name", label: "Scenario", required: true, max: 120 } as FieldSpec]),
            ...(assets.length ? [{ name: "elementId", label: "Aimed at asset", type: "select", options: assets.map((a) => ({ value: String(a.id), label: `${a.name}${a.value ? ` · ${compactAud(a.value)}` : ""}` })), hint: threat?.assetBound ? "Losses are capped at the asset's value" : undefined } as FieldSpec] : []),
            ...rangeFields(!threat),
            { name: "notes", label: "Notes", type: "textarea", max: 2000 },
          ],
          initial: {
            name: sc.name,
            elementId: sc.elementId ? String(sc.elementId) : "",
            rateLow: sc.rate.low ?? "",
            rateTypical: sc.rate.typical ?? "",
            rateHigh: sc.rate.high ?? "",
            lossLow: sc.loss.low ?? "",
            lossTypical: sc.loss.typical ?? "",
            lossHigh: sc.loss.high ?? "",
            notes: sc.notes,
          },
          submit: async (v) => {
            await send("PATCH", `/scenarios/${sc.id}`, {
              ...rangeBody(v),
              ...(threat ? {} : { name: v.name }),
              ...(assets.length ? { elementId: num(v.elementId) } : {}),
              notes: v.notes,
            });
            await done("Scenario saved", r.s.name);
          },
          danger: { label: "Remove scenario", run: () => t.removeScenario(r) },
        });
      },

      removeScenario: (r: RatedScenario) =>
        destroy({ title: `Remove ${r.s.name}?`, body: "It stops counting towards the risk profile. You can add it again from the library.", path: `/scenarios/${r.s.id}`, toast: "Scenario removed", label: "Remove" }),

      applyControl: (clientId: number, controlKey: string, siteId: number | null, status: TmControl["status"] = "In place") => {
        const def = CONTROL_BY_KEY.get(controlKey)!;
        actions.openForm({
          eyebrow: `${DOMAIN_LABEL[def.domain]} control${def.standard ? ` · ${def.standard}` : ""}`,
          title: def.name,
          submitLabel: "Apply control",
          intro: def.description,
          fields: [
            ...(def.scope === "site" ? [{ name: "siteId", label: "Site", type: "select", required: true, options: siteOptions(clientId) } as FieldSpec] : []),
            ...controlFields,
          ],
          initial: { siteId: siteId ? String(siteId) : sitesOf(clientId)[0] ? String(sitesOf(clientId)[0]!.id) : "", status, capex: def.capex, opex: def.opex, effectiveness: 100, notes: "" },
          submit: async (v) => {
            await send("POST", `/clients/${clientId}/controls`, {
              controlKey,
              siteId: def.scope === "site" ? num(v.siteId) : null,
              status: v.status,
              capex: num(v.capex) ?? 0,
              opex: num(v.opex) ?? 0,
              effectiveness: (num(v.effectiveness) ?? 100) / 100,
              notes: v.notes,
            });
            await done("Control applied", def.name);
          },
        });
      },

      editControl: (c: TmControl) => {
        const def = CONTROL_BY_KEY.get(c.controlKey);
        actions.openForm({
          eyebrow: def ? `${DOMAIN_LABEL[def.domain]} control` : "Control",
          title: def?.name ?? c.controlKey,
          submitLabel: "Save control",
          intro: def?.description,
          fields: controlFields,
          initial: { status: c.status, capex: c.capex, opex: c.opex, effectiveness: Math.round(c.effectiveness * 100), notes: c.notes },
          submit: async (v) => {
            await send("PATCH", `/tm-controls/${c.id}`, { status: v.status, capex: num(v.capex) ?? 0, opex: num(v.opex) ?? 0, effectiveness: (num(v.effectiveness) ?? 100) / 100, notes: v.notes });
            await done("Control saved", def?.name);
          },
          danger: { label: "Remove control", run: () => t.removeControl(c) },
        });
      },

      setControlStatus: async (c: TmControl, status: TmControl["status"]) => {
        try {
          await mutate(
            (dd) => ({ ...dd, tmControls: dd.tmControls.map((k) => (k.id === c.id ? { ...k, status } : k)) }),
            () => send("PATCH", `/tm-controls/${c.id}`, { status })
          );
        } catch (err) {
          fail(err);
        }
      },

      removeControl: (c: TmControl) =>
        destroy({ title: `Remove ${CONTROL_BY_KEY.get(c.controlKey)?.name ?? "control"}?`, body: "Its effect comes out of the model.", path: `/tm-controls/${c.id}`, toast: "Control removed", label: "Remove" }),

      logIncident: (clientId: number, o?: { threatKey?: string; siteId?: number | null }) =>
        actions.openForm({
          eyebrow: "Observed incident",
          title: "Log an incident",
          submitLabel: "Log incident",
          intro: "Real incidents calibrate the model: each scenario's frequency moves from the library rate towards what's actually happened, weighted by how many years of history you've recorded in the profile.",
          fields: incidentFields(clientId),
          initial: { threatKey: o?.threatKey ?? THREATS[0]!.key, siteId: o?.siteId ? String(o.siteId) : "", occurredOn: d.today, loss: 0, description: "" },
          submit: async (v) => {
            await send("POST", `/clients/${clientId}/incidents`, { threatKey: v.threatKey, siteId: num(v.siteId), occurredOn: v.occurredOn, loss: num(v.loss) ?? 0, description: v.description });
            await done("Incident logged", THREAT_BY_KEY.get(String(v.threatKey))?.name);
          },
        }),

      editIncident: (i: TmIncident) =>
        actions.openForm({
          eyebrow: "Observed incident",
          title: THREAT_BY_KEY.get(i.threatKey)?.name ?? "Incident",
          submitLabel: "Save incident",
          fields: incidentFields(i.clientId),
          initial: { threatKey: i.threatKey, siteId: i.siteId ? String(i.siteId) : "", occurredOn: i.occurredOn, loss: i.loss, description: i.description },
          submit: async (v) => {
            await send("PATCH", `/incidents/${i.id}`, { threatKey: v.threatKey, siteId: num(v.siteId), occurredOn: v.occurredOn, loss: num(v.loss) ?? 0, description: v.description });
            await done("Incident saved");
          },
          danger: { label: "Delete incident", run: () => destroy({ title: "Delete this incident?", body: "It stops calibrating the model.", path: `/incidents/${i.id}`, toast: "Incident deleted" }) },
        }),
    };

    const incidentFields = (clientId: number): FieldSpec[] => [
      {
        name: "threatKey",
        label: "What happened",
        type: "select",
        required: true,
        options: THREATS.map((x) => ({ value: x.key, label: `${DOMAIN_LABEL[x.domain]} · ${x.name}` })),
      },
      { name: "siteId", label: "Site", type: "select", options: siteOptions(clientId), hint: "Blank for organisation-wide threats (cyber, fraud)" },
      { name: "occurredOn", label: "Date", type: "date", required: true, half: true },
      { name: "loss", label: "Loss (AUD)", type: "number", half: true },
      { name: "description", label: "Details", type: "textarea", max: 1000, placeholder: "e.g. Roller door forced; two pallets taken" },
    ];
    return t;
  }, [data, refresh, mutate, actions, toast, confirm, navigate]);
}

const levelFields: FieldSpec[] = [
  { name: "name", label: "Level", required: true, max: 40, placeholder: "e.g. Level 1" },
  { name: "order", label: "Stack order", type: "number", half: true, hint: "0 = ground; basements below 0" },
  { name: "heightM", label: "Floor-to-floor height (m)", type: "number", step: 0.1, half: true },
  { name: "widthM", label: "Plan width in metres", type: "number", step: 0.5, hint: "The real distance the plan image spans left to right; sets the 3D scale." },
];

function elementFields(kind: TmElementKind, s: ClientSite, zones: TmElement[]): FieldSpec[] {
  return [
    { name: "name", label: "Name", required: true, max: 80, placeholder: kind === "zone" ? "e.g. Loading dock" : kind === "asset" ? "e.g. Tobacco cage" : "e.g. Roller door 3" },
    { name: "subtype", label: kind === "zone" ? "Zone class" : kind === "asset" ? "Asset type" : "Entry type", type: "select", required: true, half: true, options: SUBTYPES[kind] },
    { name: "criticality", label: "Criticality (1–5)", type: "select", required: true, half: true, options: ["1", "2", "3", "4", "5"].map((v) => ({ value: v, label: v })) },
    ...(kind === "asset" ? [{ name: "value", label: "Value at risk (AUD)", type: "number", hint: "Caps theft and damage losses aimed at this asset" } as FieldSpec] : []),
    { name: "levelId", label: "Level", type: "select", half: true, options: s.levels.map((l) => ({ value: String(l.id), label: l.name })) },
    { name: "zoneId", label: "Inside zone", type: "select", half: true, options: zones.map((z) => ({ value: String(z.id), label: z.name })) },
    { name: "notes", label: "Notes", type: "textarea", max: 1000 },
  ];
}

function rangeFields(required: boolean): FieldSpec[] {
  return [
    { name: "rateLow", label: "Events a year · low", type: "number", step: 0.001, half: true },
    { name: "rateTypical", label: "Most likely", type: "number", step: 0.001, half: true, required },
    { name: "rateHigh", label: "High", type: "number", step: 0.001, half: true },
    { name: "lossLow", label: "Loss per event (AUD) · low", type: "number", half: true },
    { name: "lossTypical", label: "Most likely", type: "number", half: true, required },
    { name: "lossHigh", label: "High", type: "number", half: true },
  ];
}

function rangeBody(v: FormValues) {
  return {
    rateLow: num(v.rateLow),
    rateTypical: num(v.rateTypical),
    rateHigh: num(v.rateHigh),
    lossLow: num(v.lossLow),
    lossTypical: num(v.lossTypical),
    lossHigh: num(v.lossHigh),
  };
}

const controlFields: FieldSpec[] = [
  { name: "status", label: "Status", type: "select", required: true, half: true, options: CONTROL_STATUSES.map((s) => ({ value: s, label: s })) },
  { name: "effectiveness", label: "Implementation quality (%)", type: "number", half: true, hint: "100 = as designed; lower if partly deployed or poorly maintained" },
  { name: "capex", label: "Capital cost (AUD)", type: "number", half: true },
  { name: "opex", label: "Running cost a year (AUD)", type: "number", half: true },
  { name: "notes", label: "Notes", type: "textarea", max: 2000 },
];

