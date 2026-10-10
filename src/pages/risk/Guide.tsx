import { useState, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { BookOpen, Building2, Check, ListChecks, Map, ShieldCheck, X } from "lucide-react";
import { CONTROLS, THREATS } from "../../../shared/threatLibrary";
import { Hint } from "../../components/ui/Hint";
import { Drawer } from "../../components/ui/Overlay";

/**
 * Plain-English explanations for the threat model. The same wording appears in
 * the hints beside each figure and in the guide, so a term means one thing
 * wherever it's read.
 */
export const GLOSSARY = {
  ale: {
    term: "Expected loss a year",
    text: "What a threat costs in an average year: how often it happens × what it costs when it does. Add them up for the client's total. Money figures are before insurance.",
  },
  inherent: {
    term: "Unprotected, current and target",
    text: "Unprotected is the loss with no controls at all. Current counts the controls in place. Target adds the planned and proposed ones, to show where the plan gets you.",
  },
  frequency: {
    term: "How often",
    text: "Events expected a year. It starts from Australian incident data for this kind of organisation or site, then scales with staff numbers, site type, local crime and the client's own incident history.",
  },
  loss: {
    term: "Loss per event",
    text: "A low, most likely and high cost for one event, by organisation size. The model draws from the whole range rather than using a single figure, so rare expensive events are counted.",
  },
  chance: {
    term: "Chance a year",
    text: "The chance of at least one event in the next 12 months.",
  },
  simulation: {
    term: "Simulated years",
    text: "The model plays out thousands of possible years, drawing how many events happen and what each costs. That shows the spread of outcomes, not just the average.",
  },
  exceedance: {
    term: "Loss exceedance curve",
    text: "Pick a loss on the bottom axis and read up to the chance of losing at least that much in a year. The brass line is with today's controls, the grey dashed line with none, and the green dotted line with planned and proposed controls too.",
  },
  p90: { term: "1-in-10-year loss", text: "A yearly loss exceeded one year in ten (the 90th percentile of simulated years). A reasonable 'bad year' for budgeting." },
  p99: { term: "1-in-100-year loss", text: "A yearly loss exceeded one year in a hundred. Use it to test insurance limits and reserves." },
  rating: {
    term: "Risk rating",
    text: "Likelihood (the chance of an event this year) against consequence (the typical loss, judged against revenue when it's set, otherwise in dollars), on a 5 × 5 matrix: Low, Medium, High or Extreme.",
  },
  controls: {
    term: "How controls reduce risk",
    text: "Each control makes a threat less likely to succeed, cheaper when it does, or both. Effectiveness scales that for partial rollout. Several controls on one threat combine, each acting on what the others leave.",
  },
  rosi: {
    term: "Return on security investment",
    text: "Loss the control removes each year, less what it costs a year (capital over 5 years plus running costs), divided by that cost. Above 0 it pays for itself; 1.0 means it returns twice its cost.",
  },
  calibration: {
    term: "Calibration from incidents",
    text: "Logged incidents move each scenario's frequency from the national reference towards this client's own record. The library rate counts as three years of evidence, so a few years of real incidents soon outweigh it.",
  },
  location: {
    term: "Location factor",
    text: "For NSW sites with a council area set, crime-driven threats (break-ins, theft, damage, robbery, assault) scale by that council's BOCSAR recorded-crime rate against the NSW rate, held between ×0.25 and ×6.",
  },
  anchored: {
    term: "Anchored and estimated figures",
    text: "Anchored figures are derived from a cited Australian source, with the arithmetic shown. Estimated ones are analyst starting points; replace them as evidence arrives, or log incidents to calibrate them.",
  },
  scale: {
    term: "Plan scale",
    text: "How many metres the plan is across. Measure a wall you know the length of and enter its real length: the model, camera ranges and coverage are then true to size.",
  },
  dori: {
    term: "Camera detail (DORI)",
    text: "Pixels a camera puts across one metre of scene, from IEC 62676-4: Detect 25 px/m (someone is there), Observe 62.5 (what they're doing), Recognise 125 (someone you know), Identify 250 (a stranger, to evidential standard).",
  },
  paths: {
    term: "Attack paths",
    text: "Routes from each threat through an entry point and the zones behind it to the assets it's after, built from what's placed on the plan. Controls on the route show where it's broken.",
  },
  expected: {
    term: "Expected cost",
    text: "The threat's expected loss a year for this client before any controls, from its frequency and loss range. Use it to see which threats matter most.",
  },
} as const;
export type TermKey = keyof typeof GLOSSARY;

/** A hint for a glossary term. */
export function Term({ k }: { k: TermKey }) {
  return <Hint title={GLOSSARY[k].term} text={GLOSSARY[k].text} />;
}

export type GuideTopic = "start" | "numbers" | "site" | "sources" | "glossary";
const TOPICS: { key: GuideTopic; label: string }[] = [
  { key: "start", label: "How it works" },
  { key: "numbers", label: "Reading the numbers" },
  { key: "site", label: "Site models & cameras" },
  { key: "sources", label: "Where figures come from" },
  { key: "glossary", label: "Glossary" },
];

export const STEPS = [
  { icon: Building2, title: "Profile the client", text: "Staff and revenue set which loss ranges apply and how big a hit is. Incident history lets real events calibrate the model." },
  { icon: Map, title: "Map each site", text: "Upload the floor plan (PDF is best), detect or draw its walls, then place zones, assets, entry points, cameras and security items. The site is modelled to scale in 3D." },
  { icon: ListChecks, title: "Add threats", text: "Pick from the library of physical, personnel and cyber threats. Each is priced for this client from Australian incident data and the site's local crime." },
  { icon: ShieldCheck, title: "Apply controls", text: "Record what's in place and what's proposed. The model shows the loss each removes, its return on spend, and the best next step." },
] as const;

/** Opens the guide at a topic, from anywhere in Threat Modelling. */
export function useGuide() {
  const [params, setParams] = useSearchParams();
  const topic = (TOPICS.find((t) => t.key === params.get("guide"))?.key ?? null) as GuideTopic | null;
  const open = (t: GuideTopic = "start") =>
    setParams((p) => {
      const n = new URLSearchParams(p);
      n.set("guide", t);
      return n;
    });
  const close = () =>
    setParams((p) => {
      const n = new URLSearchParams(p);
      n.delete("guide");
      return n;
    });
  return { topic, open, close };
}

export function GuideButton({ topic = "start", label = "Guide" }: { topic?: GuideTopic; label?: string }) {
  const g = useGuide();
  return (
    <button className="sds-btn sds-btn--sm sds-btn--ghost pt-guide-btn" onClick={() => g.open(topic)}>
      <BookOpen size={14} /> {label}
    </button>
  );
}

const HIDE_KEY = "pt-risk-howitworks-hidden";
const readHidden = () => {
  try {
    return localStorage.getItem(HIDE_KEY) === "1";
  } catch {
    return false;
  }
};

/** Four-step explainer at the top of Threat Modelling; hides once read, the guide stays a click away. */
export function HowItWorks() {
  const g = useGuide();
  const [hidden, setHidden] = useState(readHidden);
  if (hidden) return null;
  const hide = () => {
    setHidden(true);
    try {
      localStorage.setItem(HIDE_KEY, "1");
    } catch {
      // Private mode: it just shows again next time.
    }
  };
  return (
    <section className="pt-howto" aria-label="How threat modelling works">
      <header>
        <span className="pt-eyebrow">How it works</span>
        <span className="pt-howto__actions">
          <button className="pt-addlink" onClick={() => g.open("start")}>
            Read the guide
          </button>
          <button className="pt-iconbtn pt-iconbtn--sm" onClick={hide} aria-label="Hide how it works">
            <X size={14} />
          </button>
        </span>
      </header>
      <ol className="pt-howto__steps">
        {STEPS.map((s, i) => (
          <li key={s.title}>
            <span className="pt-howto__n pt-mono">{String(i + 1).padStart(2, "0")}</span>
            <s.icon size={16} className="pt-howto__icon" />
            <b>{s.title}</b>
            <p>{s.text}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

function Def({ k }: { k: TermKey }) {
  return (
    <div className="pt-guide__def">
      <dt>{GLOSSARY[k].term}</dt>
      <dd>{GLOSSARY[k].text}</dd>
    </div>
  );
}

function Keys({ rows }: { rows: [string, string][] }) {
  return (
    <table className="pt-guide__keys">
      <tbody>
        {rows.map(([k, v]) => (
          <tr key={k}>
            <th>
              {k.split(" ").map((x, i) => (
                <kbd key={i}>{x}</kbd>
              ))}
            </th>
            <td>{v}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="pt-guide__sec">
      <h3>{title}</h3>
      {children}
    </section>
  );
}

/** The guide: how the model works, how to read it, how to build a site, and what every term means. */
export function GuideDrawer() {
  const g = useGuide();
  const topic = g.topic ?? "start";
  return (
    <Drawer open={g.topic !== null} onClose={g.close} eyebrow="Threat Modelling" title="Guide" width={620}>
      <nav className="pt-guide__nav" aria-label="Guide topics">
        {TOPICS.map((t) => (
          <button key={t.key} className={`pt-guide__tab${topic === t.key ? " is-on" : ""}`} aria-current={topic === t.key} onClick={() => g.open(t.key)}>
            {t.label}
          </button>
        ))}
      </nav>
      <div className="pt-guide">
        {topic === "start" && (
          <>
            <p className="pt-guide__lede">
              Threat modelling turns a client's threats into dollars a year, on one scale for physical, personnel and cyber risk, so you can show which risks matter and which controls are worth paying for.
            </p>
            <ol className="pt-guide__steps">
              {STEPS.map((s, i) => (
                <li key={s.title}>
                  <span className="pt-mono">{String(i + 1).padStart(2, "0")}</span>
                  <div>
                    <b>{s.title}</b>
                    <p>{s.text}</p>
                  </div>
                </li>
              ))}
            </ol>
            <Section title="Tips">
              <ul className="pt-guide__list">
                <li>Start broad: “Select recommended” in the threat library picks the threats that make up most of the expected cost.</li>
                <li>Aim a threat at a specific asset from the asset's inspector to cap losses at what it's worth.</li>
                <li>Log real incidents as they happen. After a few years the model reflects the client, not the national average.</li>
                <li>
                  Look for{" "}
                  <span className="pt-hint pt-hint--static" aria-label="the info mark">
                    <svg viewBox="0 0 16 16" aria-hidden>
                      <rect x="7" y="3.2" width="2" height="2" />
                      <rect x="7" y="6.6" width="2" height="6.2" />
                    </svg>
                  </span>{" "}
                  beside figures: hover or tap for what they mean.
                </li>
              </ul>
            </Section>
          </>
        )}
        {topic === "numbers" && (
          <>
            <Section title="The headline figures">
              <dl>
                <Def k="ale" />
                <Def k="inherent" />
                <Def k="p90" />
                <Def k="p99" />
              </dl>
            </Section>
            <Section title="Each scenario">
              <dl>
                <Def k="frequency" />
                <Def k="loss" />
                <Def k="chance" />
                <Def k="rating" />
              </dl>
            </Section>
            <Section title="Charts and controls">
              <dl>
                <Def k="exceedance" />
                <Def k="simulation" />
                <Def k="controls" />
                <Def k="rosi" />
              </dl>
            </Section>
          </>
        )}
        {topic === "site" && (
          <>
            <Section title="1. Get the plan in">
              <p>
                Upload the drawing as a PDF, PNG or JPEG. Architects' PDFs are best: they're vector drawings, rendered sharp. If it shows more than one level (a page per floor, or floors drawn side by side), you're offered a level for each, named and ordered from the titles on the drawing ("Ground floor", "Level 1") with their walls already found. Separate buildings on one site plan stay together.
              </p>
            </Section>
            <Section title="2. Set the scale">
              <p>
                Choose <b>Measure</b>, click both ends of a wall you know the length of, and enter its real length. Detect walls also suggests a scale from the width of the doors it finds. Until the scale is set, lengths show with ≈.
              </p>
            </Section>
            <Section title="3. Walls, doors and windows">
              <p>
                <b>Detect walls</b> reads the plan's heaviest lines as walls and the gaps in them as doors (with a swing arc) or windows (with glazing lines). Check the brass preview, adjust the detail slider if thin partitions are missed or text is picked up, then accept. Draw
                anything it missed with <b>Wall</b>, and add openings with <b>Door</b> and <b>Window</b>. Select a wall to change its type, thickness or height.
              </p>
            </Section>
            <Section title="4. Cameras">
              <p>
                Choose <b>Camera</b>, click where it's mounted, then click where it looks. In the inspector set the lens, resolution, mounting height and tilt. The plan shades what it sees, stopped by walls and closed doors, in four bands of detail. <b>View through camera</b> shows its
                picture in 3D. Attach a <b>snapshot</b> from the real camera and its <b>live feed</b> link: viewing through the camera then lays the real picture over the model, with a slider between the two, so you can check the model against what the camera really sees.
              </p>
              <dl>
                <Def k="dori" />
              </dl>
            </Section>
            <Section title="Security items and photos">
              <p>
                Choose <b>Security item</b>, pick one from the list (bollards, barriers, gates, readers, keypads, intercoms, locks, sensors, alarms, floodlights, guard posts, safes, signs) and click to place it. Runs such as bollards, vehicle barriers, gates, boom gates and IR beams go from where you click first to where you click second. Motion sensors, glass-break sensors and floodlights show how far they reach. Each item is modelled at real size in 3D.
              </p>
              <p>
                Choose <b>Photo</b> to pin a photo of the site to the plan: pick the image, click where it was taken, then click the way it looks. In 3D it stands at that spot as a framed print; click it to see it full size.
              </p>
            </Section>
            <Section title="5. Security layers">
              <p>
                Draw <b>zones</b> (public through secure), place <b>assets</b> with their value and <b>entry points</b>. The site's coverage summary shows how much of each zone cameras can recognise people in, and which entries they identify.
              </p>
              <dl>
                <Def k="paths" />
              </dl>
            </Section>
            <Section title="Keyboard">
              <Keys
                rows={[
                  ["V", "Select"],
                  ["W", "Draw walls"],
                  ["D", "Door"],
                  ["N", "Window"],
                  ["M", "Measure / set scale"],
                  ["C", "Camera"],
                  ["S", "Security item"],
                  ["P", "Site photo"],
                  ["Z A E", "Zone, asset, entry point"],
                  ["4.5 Enter", "While drawing: a wall exactly 4.5 m long"],
                  ["Shift", "While drawing: snap to 45°"],
                  ["Esc", "Finish drawing, then back to Select"],
                  ["Delete", "Remove the selected wall, opening, camera, item or photo"],
                  ["Ctrl Z", "Undo (Ctrl Shift Z to redo)"],
                  ["Ctrl scroll", "Zoom the plan (or pinch)"],
                ]}
              />
            </Section>
          </>
        )}
        {topic === "sources" && (
          <>
            <p className="pt-guide__lede">
              The library has {THREATS.length} threats and {CONTROLS.length} controls. Each threat's frequency and loss is labelled anchored or estimated, with its evidence in the Library tab.
            </p>
            <Section title="Australian sources">
              <ul className="pt-guide__list">
                <li>ASD Annual Cyber Threat Report: cybercrime report volumes and average cost per business report by size.</li>
                <li>OAIC Notifiable Data Breaches statistics and IBM Cost of a Data Breach (Australia): data breach frequency and cost.</li>
                <li>Safe Work Australia: workers' compensation claims for assault, violence and harassment, and their median cost.</li>
                <li>NSW BOCSAR: recorded crime by council area, used for break-ins, theft, damage, robbery and assault at each NSW site.</li>
                <li>ABS business counts, PwC economic crime survey and ASIO's threat assessments for base rates.</li>
              </ul>
            </Section>
            <dl>
              <Def k="anchored" />
              <Def k="calibration" />
              <Def k="location" />
            </dl>
            <p className="pt-risk-note">Estimates support decisions; they aren't actuarial pricing. Record the basis for any figure you change in the scenario's notes.</p>
          </>
        )}
        {topic === "glossary" && (
          <dl>
            {(Object.keys(GLOSSARY) as TermKey[])
              .sort((a, b) => GLOSSARY[a].term.localeCompare(GLOSSARY[b].term))
              .map((k) => (
                <Def key={k} k={k} />
              ))}
          </dl>
        )}
      </div>
    </Drawer>
  );
}

export interface SetupItem {
  label: string;
  done: boolean;
  hint: string;
  action?: { label: string; run: () => void };
}

/** Progress towards a model good enough to decide on, with the next step for each gap. */
export function SetupChecklist({ items, clientId }: { items: SetupItem[]; clientId: number }) {
  const key = `pt-risk-setup-hidden-${clientId}`;
  const [hidden, setHidden] = useState(() => {
    try {
      return localStorage.getItem(key) === "1";
    } catch {
      return false;
    }
  });
  const done = items.filter((i) => i.done).length;
  if (hidden || done === items.length) return null;
  const next = items.find((i) => !i.done);
  return (
    <section className="pt-setup" aria-label="Model setup">
      <header>
        <span className="pt-eyebrow">
          Model setup · {done} of {items.length}
        </span>
        <span className="pt-setup__bar" aria-hidden>
          <i style={{ width: `${(done / items.length) * 100}%` }} />
        </span>
        <button
          className="pt-iconbtn pt-iconbtn--sm"
          aria-label="Hide setup checklist"
          onClick={() => {
            setHidden(true);
            try {
              localStorage.setItem(key, "1");
            } catch {
              // Shows again next visit.
            }
          }}
        >
          <X size={14} />
        </button>
      </header>
      <ol className="pt-setup__items">
        {items.map((i) => (
          <li key={i.label} className={i.done ? "is-done" : i === next ? "is-next" : ""}>
            <span className="pt-setup__tick" aria-hidden>
              {i.done ? <Check size={11} strokeWidth={3} /> : null}
            </span>
            <span className="pt-setup__text">
              <b>{i.label}</b>
              <span>{i.hint}</span>
            </span>
            {!i.done && i.action && (
              <button className={`sds-btn sds-btn--sm ${i === next ? "sds-btn--primary" : "sds-btn--ghost"}`} onClick={i.action.run}>
                {i.action.label}
              </button>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}
