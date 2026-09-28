import { useEffect, useRef, useState } from "react";
import {
  AmbientLight,
  BoxGeometry,
  Color,
  CylinderGeometry,
  DirectionalLight,
  DoubleSide,
  EdgesGeometry,
  GridHelper,
  Group,
  HemisphereLight,
  InstancedMesh,
  LineBasicMaterial,
  LineSegments,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  OctahedronGeometry,
  PerspectiveCamera,
  PlaneGeometry,
  Raycaster,
  Scene,
  SphereGeometry,
  SRGBColorSpace,
  Texture,
  Vector2,
  Vector3,
  WebGLRenderer,
  type Object3D,
} from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { SiteLevel, TmElement } from "../../../shared/types";
import type { Hue } from "../../lib/hues";
import { ZONE_HUE } from "./PlanView";

/** Palette mid-tones that read on both the day and night backgrounds. */
const HEX: Record<Hue, number> = {
  brass: 0x96774c,
  clay: 0xb4553f,
  ochre: 0xc99a3e,
  euc: 0x4e7a5a,
  harbour: 0x3f7a94,
  jacaranda: 0x7b61a0,
  slate: 0x6e7f88,
};
const WALL = 0xc9bfb0;
const CELLS = 200;

/**
 * Reads a floor plan and turns its dark linework into wall runs: each row of
 * dark cells becomes one box. Isolated specks (text, hatching) are dropped by
 * requiring a dark neighbour.
 */
async function wallsFrom(url: string): Promise<{ image: HTMLImageElement; runs: { x: number; y: number; len: number }[]; cols: number; rows: number }> {
  const image = new Image();
  image.src = url;
  await image.decode();
  const cols = CELLS;
  const rows = Math.max(8, Math.round((CELLS * image.naturalHeight) / image.naturalWidth));
  const canvas = document.createElement("canvas");
  canvas.width = cols;
  canvas.height = rows;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, cols, rows);
  ctx.drawImage(image, 0, 0, cols, rows);
  const px = ctx.getImageData(0, 0, cols, rows).data;
  const dark = new Uint8Array(cols * rows);
  for (let i = 0; i < cols * rows; i++) {
    const l = (0.299 * px[i * 4]! + 0.587 * px[i * 4 + 1]! + 0.114 * px[i * 4 + 2]!) / 255;
    dark[i] = l < 0.42 ? 1 : 0;
  }
  const at = (x: number, y: number) => (x >= 0 && y >= 0 && x < cols && y < rows ? dark[y * cols + x]! : 0);
  const runs: { x: number; y: number; len: number }[] = [];
  for (let y = 0; y < rows; y++) {
    let start = -1;
    for (let x = 0; x <= cols; x++) {
      const wall = x < cols && at(x, y) === 1 && at(x - 1, y) + at(x + 1, y) + at(x, y - 1) + at(x, y + 1) >= 1;
      if (wall && start < 0) start = x;
      if (!wall && start >= 0) {
        runs.push({ x: start, y, len: x - start });
        start = -1;
      }
    }
  }
  return { image, runs, cols, rows };
}

export default function Site3D({
  levels,
  elements,
  risk,
  selected,
  onSelect,
}: {
  levels: SiteLevel[];
  elements: TmElement[];
  risk: Map<number, Hue>;
  selected: number | null;
  onSelect: (id: number | null) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const labels = useRef<HTMLDivElement>(null);
  const [explode, setExplode] = useState(4);
  const [ready, setReady] = useState(false);
  const selectRef = useRef(onSelect);
  selectRef.current = onSelect;
  /** Markers by element id, so selection can be restyled without rebuilding the scene. */
  const markers = useRef(new Map<number, { mat: MeshStandardMaterial | null; pin: Object3D | null; tag: HTMLElement | null; base: number }>());

  useEffect(() => {
    const el = host.current!;
    let disposed = false;
    const renderer = new WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    renderer.outputColorSpace = SRGBColorSpace;
    el.appendChild(renderer.domElement);
    const scene = new Scene();
    const camera = new PerspectiveCamera(40, 1, 0.1, 5000);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.maxPolarAngle = Math.PI / 2.05;
    scene.add(new HemisphereLight(0xffffff, 0xb8ad9c, 1.4));
    scene.add(new AmbientLight(0xffffff, 0.35));
    const sun = new DirectionalLight(0xffffff, 1.2);
    sun.position.set(40, 80, 30);
    scene.add(sun);

    const sorted = [...levels].sort((a, b) => a.order - b.order);
    const root = new Group();
    scene.add(root);
    const pickable: Object3D[] = [];
    const labelled: { id: number; name: string; obj: Object3D; kind: string }[] = [];
    let maxW = 20;
    let maxD = 14;
    let top = 0;

    const build = async () => {
      let y0 = 0;
      for (const level of sorted) {
        const W = level.widthM;
        const plan = level.plan;
        const D = plan ? (W * plan.h) / plan.w : W * 0.625;
        maxW = Math.max(maxW, W);
        maxD = Math.max(maxD, D);
        const g = new Group();
        g.position.y = y0;
        root.add(g);
        if (plan) {
          try {
            const { image, runs, cols, rows } = await wallsFrom(`/api/plans/${plan.fileId}`);
            if (disposed) return;
            const tex = new Texture(image);
            tex.needsUpdate = true;
            tex.colorSpace = SRGBColorSpace;
            tex.anisotropy = 4;
            const floor = new Mesh(new PlaneGeometry(W, D), new MeshBasicMaterial({ map: tex, side: DoubleSide, transparent: true, opacity: level === sorted[0] ? 0.96 : 0.7, depthWrite: level === sorted[0] }));
            floor.rotation.x = -Math.PI / 2;
            g.add(floor);
            const cw = W / cols;
            const cd = D / rows;
            const wallH = Math.min(level.heightM * 0.62, 2.4);
            const walls = new InstancedMesh(new BoxGeometry(1, 1, 1), new MeshStandardMaterial({ color: WALL, roughness: 0.92 }), Math.max(1, runs.length));
            const mtx = new Matrix4();
            runs.forEach((r, i) => {
              mtx.makeScale(r.len * cw, wallH, cd);
              mtx.setPosition((r.x + r.len / 2) * cw - W / 2, wallH / 2, (r.y + 0.5) * cd - D / 2);
              walls.setMatrixAt(i, mtx);
            });
            walls.count = runs.length;
            g.add(walls);
          } catch {
            // A plan that can't be read still gets a slab below.
          }
        }
        // The ground slab is solid; upper floors are glass so the levels below stay visible.
        const ground = level === sorted[0];
        const slab = new Mesh(
          new BoxGeometry(W, 0.08, D),
          new MeshStandardMaterial({ color: 0xe9e3d9, roughness: 1, transparent: !ground, opacity: ground ? 1 : plan ? 0.35 : 0.18, depthWrite: ground })
        );
        slab.position.y = -0.05;
        g.add(slab);
        if (!ground) {
          const rim = new LineSegments(new EdgesGeometry(new BoxGeometry(W, 0.08, D)), new LineBasicMaterial({ color: 0xa89c89 }));
          rim.position.y = -0.05;
          g.add(rim);
        }
        if (!plan) {
          const grid = new GridHelper(Math.max(W, D), Math.round(Math.max(W, D) / 4), 0xb8ad9c, 0xd9d1c4);
          (grid.material as LineBasicMaterial).transparent = true;
          (grid.material as LineBasicMaterial).opacity = level === sorted[0] ? 1 : 0.35;
          grid.position.y = 0.01;
          g.add(grid);
        }

        // Markers are sized for a ~30 m floor; bigger sites get proportionally bigger pins.
        const ms = Math.max(1, W / 30);
        for (const e of elements.filter((x) => x.levelId === level.id && x.x != null && x.y != null)) {
          const x = (e.x! - 0.5) * W;
          const z = (e.y! - 0.5) * D;
          if (e.kind === "zone") {
            const w = (e.w ?? 0.1) * W;
            const d = (e.h ?? 0.1) * D;
            const hue = HEX[ZONE_HUE[e.subtype] ?? "slate"];
            const pad = new Mesh(new PlaneGeometry(w, d), new MeshBasicMaterial({ color: hue, transparent: true, opacity: 0.2, side: DoubleSide, depthWrite: false }));
            pad.rotation.x = -Math.PI / 2;
            pad.position.set(x + w / 2, 0.04, z + d / 2);
            pad.userData.elementId = e.id;
            g.add(pad);
            const edge = new LineSegments(new EdgesGeometry(new BoxGeometry(w, 0.02, d)), new LineBasicMaterial({ color: hue }));
            edge.position.copy(pad.position);
            g.add(edge);
            pickable.push(pad);
            labelled.push({ id: e.id, name: e.name, obj: pad, kind: "zone" });
            markers.current.set(e.id, { mat: null, pin: null, tag: null, base: 1 });
          } else {
            const hue = HEX[risk.get(e.id) ?? (e.kind === "entry" ? "harbour" : "slate")];
            const mat = new MeshStandardMaterial({ color: hue, roughness: 0.5, emissive: new Color(hue), emissiveIntensity: 0.12 });
            const pin = new Group();
            pin.position.set(x, 0, z);
            if (e.kind === "asset") {
              const stem = new Mesh(new CylinderGeometry(0.06, 0.06, 1.5, 8), new MeshStandardMaterial({ color: 0x8a8175 }));
              stem.position.y = 0.75;
              const head = new Mesh(new SphereGeometry(0.28 + e.criticality * 0.06, 20, 14), mat);
              head.position.y = 1.65;
              head.userData.elementId = e.id;
              pin.add(stem, head);
              pickable.push(head);
            } else {
              const gem = new Mesh(new OctahedronGeometry(0.42), mat);
              gem.position.y = 0.6;
              gem.userData.elementId = e.id;
              pin.add(gem);
              pickable.push(gem);
            }
            pin.scale.setScalar(ms);
            g.add(pin);
            markers.current.set(e.id, { mat, pin, tag: null, base: ms });
            labelled.push({ id: e.id, name: e.name, obj: pin, kind: e.kind });
          }
        }
        top = y0 + level.heightM;
        y0 += level.heightM + explode;
      }
      // Frame the whole stack: fit its bounding sphere in the view, looking down at about 40°.
      const radius = 0.5 * Math.sqrt(maxW * maxW + maxD * maxD + top * top);
      // Fit against the narrower of the vertical and horizontal fields of view.
      const vHalf = ((camera.fov / 2) * Math.PI) / 180;
      const hHalf = Math.atan(Math.tan(vHalf) * Math.max(0.3, el.clientWidth / Math.max(1, el.clientHeight)));
      const dist = (radius / Math.sin(Math.min(vHalf, hHalf))) * 0.9;
      const dir = new Vector3(0.55, 0.72, 0.85).normalize();
      controls.target.set(0, top / 2, 0);
      camera.position.copy(dir.multiplyScalar(dist)).add(controls.target);
      camera.far = dist * 10;
      camera.updateProjectionMatrix();
      controls.maxDistance = dist * 3;
      controls.update();
      if (!disposed) setReady(true);
    };

    const size = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      renderer.setSize(w, h, false);
      camera.aspect = w / Math.max(1, h);
      camera.updateProjectionMatrix();
    };
    const ro = new ResizeObserver(size);
    ro.observe(el);
    size();

    const v = new Vector3();
    const tick = () => {
      if (disposed) return;
      controls.update();
      renderer.render(scene, camera);
      const box = labels.current;
      if (box) {
        const w = el.clientWidth;
        const h = el.clientHeight;
        const kids = box.children;
        labelled.forEach((l, i) => {
          const tag = kids[i] as HTMLElement | undefined;
          if (!tag) return;
          l.obj.getWorldPosition(v);
          v.y += (l.kind === "asset" ? 2.3 : l.kind === "entry" ? 1.2 : 0.2) * (l.obj.scale.x || 1);
          v.project(camera);
          const visible = v.z < 1 && Math.abs(v.x) < 1.1 && Math.abs(v.y) < 1.1;
          tag.style.transform = `translate(${((v.x + 1) / 2) * w}px, ${((1 - v.y) / 2) * h}px) translate(-50%, -100%)`;
          tag.style.opacity = visible ? "1" : "0";
        });
      }
      raf = requestAnimationFrame(tick);
    };
    let raf = requestAnimationFrame(tick);

    // Click (not drag) picks the element under the pointer.
    const ray = new Raycaster();
    const ndc = new Vector2();
    let down: { x: number; y: number } | null = null;
    const onDown = (e: PointerEvent) => (down = { x: e.clientX, y: e.clientY });
    const onUp = (e: PointerEvent) => {
      if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 4) return;
      const r = renderer.domElement.getBoundingClientRect();
      ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, camera);
      const hit = ray.intersectObjects(pickable, false)[0];
      selectRef.current(hit ? (hit.object.userData.elementId as number) : null);
    };
    renderer.domElement.addEventListener("pointerdown", onDown);
    renderer.domElement.addEventListener("pointerup", onUp);

    void build().then(() => {
      if (disposed || !labels.current) return;
      labels.current.replaceChildren(
        ...labelled.map((l) => {
          const tag = document.createElement("span");
          tag.className = `pt-risk-3d__tag pt-risk-3d__tag--${l.kind}`;
          tag.textContent = l.name;
          const m = markers.current.get(l.id);
          if (m) m.tag = tag;
          return tag;
        })
      );
    });

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
      controls.dispose();
      renderer.domElement.removeEventListener("pointerdown", onDown);
      renderer.domElement.removeEventListener("pointerup", onUp);
      scene.traverse((o) => {
        const m = o as Mesh;
        m.geometry?.dispose();
        const mat = m.material as MeshBasicMaterial | MeshBasicMaterial[] | undefined;
        (Array.isArray(mat) ? mat : mat ? [mat] : []).forEach((x) => {
          x.map?.dispose();
          x.dispose();
        });
      });
      renderer.dispose();
      renderer.domElement.remove();
      markers.current.clear();
      setReady(false);
    };
  }, [levels, elements, risk, explode]);

  useEffect(() => {
    for (const [id, m] of markers.current) {
      const on = id === selected;
      if (m.mat) m.mat.emissiveIntensity = on ? 0.55 : 0.12;
      m.pin?.scale.setScalar((on ? 1.35 : 1) * m.base);
      m.tag?.classList.toggle("is-sel", on);
    }
  }, [selected, ready]);

  return (
    <div className="pt-risk-3d">
      <div ref={host} className="pt-risk-3d__canvas" data-testid="site-3d" data-ready={ready ? "1" : "0"} />
      <div ref={labels} className="pt-risk-3d__labels" aria-hidden />
      <div className="pt-risk-3d__controls">
        <label>
          <span className="pt-meta">Level spacing</span>
          <input type="range" min={0} max={16} step={1} value={explode} onChange={(e) => setExplode(Number(e.target.value))} aria-label="Level spacing" />
        </label>
        <span className="pt-meta">Drag to orbit · scroll to zoom · click a marker to inspect</span>
      </div>
      {!levels.some((l) => l.plan) && <div className="pt-risk-3d__note">Upload a floor plan to raise its walls in 3D. Elements are shown on a grid until then.</div>}
    </div>
  );
}
