import { useEffect, useMemo, useRef, useState } from "react";
import {
  ACESFilmicToneMapping,
  AmbientLight,
  BoxGeometry,
  BufferGeometry,
  CanvasTexture,
  Color,
  CylinderGeometry,
  DirectionalLight,
  DoubleSide,
  EdgesGeometry,
  Float32BufferAttribute,
  GridHelper,
  Group,
  HemisphereLight,
  LinearFilter,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  OctahedronGeometry,
  PCFSoftShadowMap,
  PerspectiveCamera,
  PlaneGeometry,
  PMREMGenerator,
  Raycaster,
  Scene,
  SphereGeometry,
  SRGBColorSpace,
  TextureLoader,
  Vector2,
  Vector3,
  WebGLRenderer,
  type Material,
  type Object3D,
} from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { DORI, basis, isFisheye, reachFor, vfovOf } from "../../../shared/cameras";
import { FENCE_HEIGHT, OPENING_HEIGHTS, ceilingOf, frameOf, wallRun, type Frame, type LevelGeometry } from "../../../shared/geometry";
import type { SiteLevel, TmCamera, TmElement } from "../../../shared/types";
import type { Hue } from "../../lib/hues";
import { DoriLegend, ZONE_HUE, paintCoverage, placed } from "./PlanView";

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
const PLASTER = 0xefeae1;
const POCHE = 0x3b362f;

/** A box from (x0, z0) to (x1, z1) along a wall, y from y0 to y1, thickness t — as world geometry. */
function wallBox(ax: number, az: number, dx: number, dz: number, s0: number, s1: number, y0: number, y1: number, t: number): BufferGeometry | null {
  const len = s1 - s0;
  const h = y1 - y0;
  if (len <= 0.005 || h <= 0.005) return null;
  const g = new BoxGeometry(len, h, t);
  g.rotateY(-Math.atan2(dz, dx));
  const mid = (s0 + s1) / 2;
  g.translate(ax + dx * mid, y0 + h / 2, az + dz * mid);
  return g;
}

interface Built {
  plaster: BufferGeometry[];
  caps: BufferGeometry[];
  glass: BufferGeometry[];
  leaves: BufferGeometry[];
  shutters: BufferGeometry[];
  fence: BufferGeometry[];
}

/** Walls, openings and fences of one level, at world scale (x right, z down the plan, y up). */
function buildWalls(geo: LevelGeometry, f: Frame, ceiling: number, cut: number | null): Built {
  const out: Built = { plaster: [], caps: [], glass: [], leaves: [], shutters: [], fence: [] };
  const push = (list: BufferGeometry[], g: BufferGeometry | null) => g && list.push(g);
  for (const w of geo.walls) {
    const run = wallRun(w, geo.openings, f);
    const ax = run.a[0] - f.W / 2;
    const az = run.a[1] - f.D / 2;
    const [dx, dz] = run.dir;
    if (w.kind === "fence") {
      const h = Math.min(w.h ?? FENCE_HEIGHT, cut ?? Infinity);
      push(out.fence, wallBox(ax, az, dx, dz, 0, run.len, 0.05, h, 0.03));
      for (let s = 0; s <= run.len + 0.01; s += 2.5) push(out.plaster, wallBox(ax, az, dx, dz, Math.max(0, s - 0.03), Math.min(run.len, s + 0.03), 0, h, 0.06));
      continue;
    }
    const full = w.h ?? ceiling;
    const top = Math.min(full, cut ?? Infinity);
    const list = w.kind === "glass" ? out.glass : out.plaster;
    for (const p of run.solid) {
      // The wall's own ends run on by half a thickness so corners close.
      const s0 = p.s0 === 0 ? -w.t / 2 : p.s0;
      const s1 = Math.abs(p.s1 - run.len) < 1e-6 ? run.len + w.t / 2 : p.s1;
      push(list, wallBox(ax, az, dx, dz, s0, s1, 0, top, w.t));
      if (cut != null && top < full && w.kind !== "glass") push(out.caps, wallBox(ax, az, dx, dz, s0, s1, top, top + 0.02, w.t + 0.002));
    }
    for (const g of run.gaps) {
      const { sill, head } = OPENING_HEIGHTS[g.opening.kind];
      const hd = Math.min(head, full);
      // Wall above the head and below the sill.
      push(list, wallBox(ax, az, dx, dz, g.s0, g.s1, hd, top, w.t));
      if (sill > 0) push(list, wallBox(ax, az, dx, dz, g.s0, g.s1, 0, Math.min(sill, top), w.t));
      if (g.opening.kind === "window" && top > sill) push(out.glass, wallBox(ax, az, dx, dz, g.s0, g.s1, sill, Math.min(hd, top), 0.02));
      if (g.opening.kind === "roller") push(out.shutters, wallBox(ax, az, dx, dz, g.s0, g.s1, Math.min(hd, top) * 0.55, Math.min(hd, top), 0.06));
      if (g.opening.kind === "door" || g.opening.kind === "double") {
        // Leaves stand ajar at 60° so doorways read at a glance.
        const leaves = g.opening.kind === "door" ? [{ at: g.s0, len: g.s1 - g.s0, sign: 1 }] : [{ at: g.s0, len: (g.s1 - g.s0) / 2, sign: 1 }, { at: g.s1, len: (g.s1 - g.s0) / 2, sign: -1 }];
        for (const l of leaves) {
          const hx = ax + dx * l.at;
          const hz = az + dz * l.at;
          const leaf = new BoxGeometry(l.len, Math.min(hd, top) - 0.01, 0.04);
          leaf.translate((l.len / 2) * l.sign, (Math.min(hd, top) - 0.01) / 2, 0);
          leaf.rotateY(-Math.atan2(dz, dx) + (l.sign * Math.PI) / 3);
          leaf.translate(hx, 0, hz);
          out.leaves.push(leaf);
        }
      }
    }
  }
  return out;
}

export default function Site3D({
  levels,
  elements,
  risk,
  selected,
  onSelect,
  cameras,
  camView,
  onCamView,
  onPickCamera,
  pickedCamera,
}: {
  levels: SiteLevel[];
  elements: TmElement[];
  risk: Map<number, Hue>;
  selected: number | null;
  onSelect: (id: number | null) => void;
  cameras: TmCamera[];
  /** Camera whose view is shown in the inset, if any. */
  camView: number | null;
  onCamView: (id: number | null) => void;
  onPickCamera: (id: number) => void;
  pickedCamera: number | null;
}) {
  const host = useRef<HTMLDivElement>(null);
  const labels = useRef<HTMLDivElement>(null);
  const [explode, setExplode] = useState(4);
  const [cutMode, setCutMode] = useState<"cut" | "full">("cut");
  const [cutH, setCutH] = useState(1.4);
  const [showCov, setShowCov] = useState(true);
  const [planFloor, setPlanFloor] = useState(true);
  const [bigView, setBigView] = useState(false);
  const [ready, setReady] = useState(false);
  const selectRef = useRef(onSelect);
  selectRef.current = onSelect;
  const pickCamRef = useRef(onPickCamera);
  pickCamRef.current = onPickCamera;
  const camViewRef = useRef<{ id: number | null; big: boolean }>({ id: camView, big: bigView });
  camViewRef.current = { id: camView, big: bigView };
  const markers = useRef(new Map<number, { mat: MeshStandardMaterial | null; pin: Object3D | null; tag: HTMLElement | null; base: number }>());
  const sorted = useMemo(() => [...levels].sort((a, b) => a.order - b.order), [levels]);
  const modelled = sorted.some((l) => l.geometry.walls.length > 0);
  const viewed = cameras.find((c) => c.id === camView) ?? null;

  useEffect(() => {
    const el = host.current!;
    let disposed = false;
    const renderer = new WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    renderer.outputColorSpace = SRGBColorSpace;
    renderer.toneMapping = ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = PCFSoftShadowMap;
    el.appendChild(renderer.domElement);
    const scene = new Scene();
    const pmrem = new PMREMGenerator(renderer);
    const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = env;
    const camera = new PerspectiveCamera(40, 1, 0.1, 5000);
    camera.layers.enable(1);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.maxPolarAngle = Math.PI / 2.05;
    scene.add(new HemisphereLight(0xffffff, 0xb8ad9c, 0.9));
    scene.add(new AmbientLight(0xffffff, 0.15));
    const sun = new DirectionalLight(0xfff6e8, 1.6);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.02;
    sun.shadow.camera.layers.enable(1);
    scene.add(sun, sun.target);

    const root = new Group();
    scene.add(root);
    const pickable: Object3D[] = [];
    const labelled: { id: string; name: string; obj: Object3D; kind: string; lift: number }[] = [];
    const camRigs = new Map<number, { pos: Vector3; dir: Vector3; up: Vector3; fov: number; aspect: number }>();
    const mats: Material[] = [];
    const mat = <T extends Material>(m: T) => {
      mats.push(m);
      return m;
    };
    const plaster = mat(new MeshStandardMaterial({ color: PLASTER, roughness: 0.92, metalness: 0 }));
    const poche = mat(new MeshStandardMaterial({ color: POCHE, roughness: 0.8 }));
    const glassM = mat(new MeshStandardMaterial({ color: 0x9fc3d1, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.28, depthWrite: false }));
    const leafM = mat(new MeshStandardMaterial({ color: 0xb89f7c, roughness: 0.7 }));
    const shutterM = mat(new MeshStandardMaterial({ color: 0x9aa1a6, roughness: 0.45, metalness: 0.6 }));
    const fenceM = mat(new MeshStandardMaterial({ color: 0x7d858a, roughness: 0.6, metalness: 0.4, transparent: true, opacity: 0.35, side: DoubleSide, depthWrite: false }));
    const edgeM = mat(new LineBasicMaterial({ color: 0x6f675c, transparent: true, opacity: 0.55 }));
    let maxW = 20;
    let maxD = 14;
    let top = 0;
    // What's actually modelled (walls, elements, cameras), for framing the view.
    const content = { x0: Infinity, x1: -Infinity, z0: Infinity, z1: -Infinity };
    const grow = (x: number, z: number) => {
      content.x0 = Math.min(content.x0, x);
      content.x1 = Math.max(content.x1, x);
      content.z0 = Math.min(content.z0, z);
      content.z1 = Math.max(content.z1, z);
    };
    const loader = new TextureLoader();

    let y0 = 0;
    for (const level of sorted) {
      const f = frameOf(level);
      const { W, D } = f;
      maxW = Math.max(maxW, W);
      maxD = Math.max(maxD, D);
      const g = new Group();
      g.position.y = y0;
      root.add(g);
      const ground = level === sorted[0];
      const ceiling = ceilingOf(level.heightM);
      const hasWalls = level.geometry.walls.length > 0;

      // Slab under the walls (or the whole plan when nothing is modelled yet).
      let bx0 = -W / 2;
      let bx1 = W / 2;
      let bz0 = -D / 2;
      let bz1 = D / 2;
      if (hasWalls) {
        const xs = level.geometry.walls.flatMap((w) => [w.a[0], w.b[0]].map((v) => v * W - W / 2));
        const zs = level.geometry.walls.flatMap((w) => [w.a[1], w.b[1]].map((v) => v * D - D / 2));
        xs.forEach((x, i) => grow(x, zs[i]!));
        bx0 = Math.min(...xs) - 0.6;
        bx1 = Math.max(...xs) + 0.6;
        bz0 = Math.min(...zs) - 0.6;
        bz1 = Math.max(...zs) + 0.6;
      }
      // A level with nothing on it yet is a ghost slab, so it doesn't hide the floors that are modelled.
      const empty = !hasWalls && !level.plan && sorted.length > 1;
      const slab = new Mesh(
        new BoxGeometry(bx1 - bx0, empty ? 0.04 : 0.16, bz1 - bz0),
        mat(new MeshStandardMaterial({ color: 0xd8d0c2, roughness: 1, transparent: !ground || empty, opacity: empty ? 0.12 : ground ? 1 : 0.5, depthWrite: ground && !empty }))
      );
      slab.position.set((bx0 + bx1) / 2, -0.08, (bz0 + bz1) / 2);
      slab.receiveShadow = !empty;
      g.add(slab);
      if (empty) {
        const rim = new LineSegments(new EdgesGeometry(new BoxGeometry(bx1 - bx0, 0.04, bz1 - bz0)), mat(new LineBasicMaterial({ color: 0xa89c89, transparent: true, opacity: 0.5 })));
        rim.position.copy(slab.position);
        g.add(rim);
      }
      if (ground) {
        const lawn = new Mesh(new PlaneGeometry(W * 3, D * 3), mat(new MeshStandardMaterial({ color: 0xd9d2c4, roughness: 1 })));
        lawn.rotation.x = -Math.PI / 2;
        lawn.position.y = -0.17;
        lawn.receiveShadow = true;
        g.add(lawn);
      }
      if (level.plan && planFloor) {
        const tex = loader.load(`/api/plans/${level.plan.fileId}`, () => !disposed && undefined);
        tex.colorSpace = SRGBColorSpace;
        tex.anisotropy = 8;
        const floor = new Mesh(new PlaneGeometry(W, D), mat(new MeshBasicMaterial({ map: tex, transparent: true, opacity: hasWalls ? 0.45 : 0.95, depthWrite: false, toneMapped: false })));
        floor.rotation.x = -Math.PI / 2;
        floor.position.y = 0.006;
        g.add(floor);
      } else if (!hasWalls && !empty) {
        const grid = new GridHelper(Math.max(W, D), Math.round(Math.max(W, D)), 0xb8ad9c, 0xd9d1c4);
        grid.position.y = 0.01;
        g.add(grid);
      }

      if (hasWalls) {
        const add = (list: BufferGeometry[], m: Material, shadow: boolean, layer: number, edges = false) => {
          if (!list.length) return;
          const merged = mergeGeometries(list, false);
          list.forEach((x) => x.dispose());
          if (!merged) return;
          const mesh = new Mesh(merged, m);
          mesh.castShadow = shadow;
          mesh.receiveShadow = shadow;
          mesh.layers.set(layer);
          g.add(mesh);
          if (edges) {
            const e = new LineSegments(new EdgesGeometry(merged, 30), edgeM);
            e.layers.set(layer);
            g.add(e);
          }
        };
        const addAll = (built: Built, layer: number) => {
          add(built.plaster, plaster, true, layer, true);
          add(built.caps, poche, false, layer);
          add(built.glass, glassM, false, layer, true);
          add(built.leaves, leafM, true, layer);
          add(built.shutters, shutterM, true, layer, true);
          add(built.fence, fenceM, false, layer);
        };
        if (cutMode === "cut") {
          // The model view is cut away; a camera still sees walls to the ceiling.
          addAll(buildWalls(level.geometry, f, ceiling, cutH), 1);
          addAll(buildWalls(level.geometry, f, ceiling, null), 2);
        } else addAll(buildWalls(level.geometry, f, ceiling, null), 0);
      }

      // Camera coverage on the floor, with walls blocking each view.
      const levelCams = cameras.filter((c) => c.levelId === level.id);
      if (showCov && levelCams.length) {
        const cv = document.createElement("canvas");
        paintCoverage(cv, placed(levelCams, f), level.geometry, f);
        const tex = new CanvasTexture(cv);
        tex.colorSpace = SRGBColorSpace;
        tex.minFilter = LinearFilter;
        const cov = new Mesh(new PlaneGeometry(W, D), mat(new MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false })));
        cov.rotation.x = -Math.PI / 2;
        cov.position.y = 0.012;
        // Coverage is analysis, not something a lens would see.
        cov.layers.set(1);
        g.add(cov);
      }

      // Cameras: housing on a short bracket, aimed; the view's outline out to detection range.
      for (const c of levelCams) {
        const x = c.x * W - W / 2;
        const z = c.y * D - D / 2;
        grow(x, z);
        const { f: fw, u } = basis(c);
        const dir = new Vector3(fw[0], fw[2], fw[1]).normalize();
        // basis() gives the image-down vector; the view needs up.
        const up = new Vector3(-u[0], -u[2], -u[1]).normalize();
        const pos = new Vector3(x, y0 + c.heightM, z);
        camRigs.set(c.id, { pos, dir, up, fov: isFisheye(c) ? 120 : vfovOf(c), aspect: c.resW / c.resH });
        const rig = new Group();
        rig.position.set(x, c.heightM, z);
        const on = c.id === pickedCamera || c.id === camView;
        const bodyM = mat(new MeshStandardMaterial({ color: on ? HEX.brass : 0x2d2a26, roughness: 0.4, metalness: 0.3, emissive: new Color(on ? HEX.brass : 0x000000), emissiveIntensity: on ? 0.35 : 0 }));
        const mount = new Mesh(new CylinderGeometry(0.03, 0.03, 0.25, 8), mat(new MeshStandardMaterial({ color: 0x8a8175 })));
        mount.position.y = 0.12;
        rig.add(mount);
        const head = new Group();
        if (isFisheye(c)) {
          const dome = new Mesh(new SphereGeometry(0.13, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), bodyM);
          dome.rotation.x = Math.PI;
          head.add(dome);
        } else {
          const housing = new Mesh(new BoxGeometry(0.34, 0.13, 0.13), bodyM);
          housing.position.x = 0.12;
          const lens = new Mesh(new CylinderGeometry(0.045, 0.045, 0.04, 16), mat(new MeshStandardMaterial({ color: 0x111111, roughness: 0.1, metalness: 0.8 })));
          lens.rotation.z = Math.PI / 2;
          lens.position.x = 0.3;
          head.add(housing, lens);
          head.rotation.set(0, -(c.yaw * Math.PI) / 180, -(c.tilt * Math.PI) / 180, "YXZ");
        }
        head.traverse((o) => (o.userData.cameraId = c.id));
        rig.add(head);
        // Camera bodies live on layer 1: the model view shows them, the simulated eye doesn't.
        rig.traverse((o) => o.layers.set(1));
        head.children.forEach((m) => pickable.push(m));
        g.add(rig);
        // Frustum outline to where detection ends.
        if (!isFisheye(c)) {
          const reach = Math.min(reachFor(c, DORI[DORI.length - 1]!.ppm), 80);
          const th = Math.tan(((Math.min(c.hfov, 170) / 2) * Math.PI) / 180);
          const tv = Math.tan(((vfovOf(c) / 2) * Math.PI) / 180);
          const right = new Vector3().crossVectors(dir, up).normalize();
          const corners = [
            [1, 1],
            [1, -1],
            [-1, -1],
            [-1, 1],
          ].map(([a, b]) => {
            const v = dir.clone().add(right.clone().multiplyScalar(a! * th)).add(up.clone().multiplyScalar(b! * tv)).normalize();
            // Stop each edge at the floor if it gets there first.
            const tFloor = v.y < 0 ? c.heightM / -v.y : Infinity;
            return v.multiplyScalar(Math.min(reach, tFloor));
          });
          const pts: number[] = [];
          for (const k of corners) pts.push(0, 0, 0, k.x, k.y, k.z);
          for (let i = 0; i < 4; i++) pts.push(corners[i]!.x, corners[i]!.y, corners[i]!.z, corners[(i + 1) % 4]!.x, corners[(i + 1) % 4]!.y, corners[(i + 1) % 4]!.z);
          const fg = new BufferGeometry();
          fg.setAttribute("position", new Float32BufferAttribute(pts, 3));
          const lines = new LineSegments(fg, mat(new LineBasicMaterial({ color: HEX.brass, transparent: true, opacity: on ? 0.95 : 0.45 })));
          lines.layers.set(1);
          rig.add(lines);
        }
        labelled.push({ id: `c${c.id}`, name: c.name, obj: rig, kind: "camera", lift: 0.45 });
      }

      // Zones, assets and entry points.
      const ms = Math.max(1, W / 30);
      for (const e of elements.filter((x) => x.levelId === level.id && x.x != null && x.y != null)) {
        const x = (e.x! - 0.5) * W;
        const z = (e.y! - 0.5) * D;
        grow(x, z);
        if (e.kind === "zone") {
          const w = (e.w ?? 0.1) * W;
          const d = (e.h ?? 0.1) * D;
          const hue = HEX[ZONE_HUE[e.subtype] ?? "slate"];
          const pad = new Mesh(new PlaneGeometry(w, d), mat(new MeshBasicMaterial({ color: hue, transparent: true, opacity: 0.18, side: DoubleSide, depthWrite: false })));
          pad.rotation.x = -Math.PI / 2;
          pad.position.set(x + w / 2, 0.02, z + d / 2);
          pad.userData.elementId = e.id;
          // Zone tints are analysis: shown in the model, not through a camera.
          pad.layers.set(1);
          g.add(pad);
          const edge = new LineSegments(new EdgesGeometry(new BoxGeometry(w, 0.02, d)), mat(new LineBasicMaterial({ color: hue })));
          edge.position.copy(pad.position);
          edge.layers.set(1);
          g.add(edge);
          pickable.push(pad);
          labelled.push({ id: `e${e.id}`, name: e.name, obj: pad, kind: "zone", lift: 0.2 });
          markers.current.set(e.id, { mat: null, pin: null, tag: null, base: 1 });
        } else {
          const hue = HEX[risk.get(e.id) ?? (e.kind === "entry" ? "harbour" : "slate")];
          const m = mat(new MeshStandardMaterial({ color: hue, roughness: 0.5, emissive: new Color(hue), emissiveIntensity: 0.12 }));
          const pin = new Group();
          pin.position.set(x, 0, z);
          if (e.kind === "asset") {
            const stem = new Mesh(new CylinderGeometry(0.05, 0.05, 1.3, 8), mat(new MeshStandardMaterial({ color: 0x8a8175 })));
            stem.position.y = 0.65;
            const headM = new Mesh(new SphereGeometry(0.22 + e.criticality * 0.05, 20, 14), m);
            headM.position.y = 1.45;
            headM.castShadow = true;
            headM.userData.elementId = e.id;
            pin.add(stem, headM);
            pickable.push(headM);
          } else {
            const gem = new Mesh(new OctahedronGeometry(0.36), m);
            gem.position.y = 0.55;
            gem.castShadow = true;
            gem.userData.elementId = e.id;
            pin.add(gem);
            pickable.push(gem);
          }
          pin.scale.setScalar(ms);
          g.add(pin);
          markers.current.set(e.id, { mat: m, pin, tag: null, base: ms });
          labelled.push({ id: `e${e.id}`, name: e.name, obj: pin, kind: e.kind, lift: (e.kind === "asset" ? 2 : 1.1) * ms });
        }
      }
      top = y0 + level.heightM;
      y0 += level.heightM + explode;
    }

    // Sun and its shadow camera cover the whole site.
    const span = Math.max(maxW, maxD);
    sun.position.set(span * 0.6, span * 1.1 + top, span * 0.45);
    sun.target.position.set(0, 0, 0);
    const sc = sun.shadow.camera;
    sc.left = -span;
    sc.right = span;
    sc.top = span;
    sc.bottom = -span;
    sc.near = 0.5;
    sc.far = span * 4 + top * 2;
    sc.updateProjectionMatrix();

    // Frame what's modelled (or the whole plan): fit its bounding sphere, looking down at about 40°.
    const hasContent = Number.isFinite(content.x0);
    const fw = hasContent ? Math.max(8, content.x1 - content.x0 + 4) : maxW;
    const fd = hasContent ? Math.max(6, content.z1 - content.z0 + 4) : maxD;
    const cx = hasContent ? (content.x0 + content.x1) / 2 : 0;
    const cz = hasContent ? (content.z0 + content.z1) / 2 : 0;
    const radius = 0.5 * Math.sqrt(fw * fw + fd * fd + top * top);
    const vHalf = ((camera.fov / 2) * Math.PI) / 180;
    const hHalf = Math.atan(Math.tan(vHalf) * Math.max(0.3, el.clientWidth / Math.max(1, el.clientHeight)));
    const distance = (radius / Math.sin(Math.min(vHalf, hHalf))) * 0.9;
    controls.target.set(cx, top / 3, cz);
    camera.position.copy(new Vector3(0.55, 0.72, 0.85).normalize().multiplyScalar(distance)).add(controls.target);
    camera.far = distance * 10;
    camera.updateProjectionMatrix();
    controls.maxDistance = distance * 3;
    controls.update();

    // The simulated camera view.
    const eye = new PerspectiveCamera(50, 16 / 9, 0.05, 400);
    // Layers: 0 everything, 1 model view only (camera bodies, coverage, cut walls), 2 camera view only (full walls).
    eye.layers.enable(2);
    const size = () => {
      renderer.setSize(el.clientWidth, el.clientHeight, false);
      camera.aspect = el.clientWidth / Math.max(1, el.clientHeight);
      camera.updateProjectionMatrix();
    };
    const ro = new ResizeObserver(size);
    ro.observe(el);
    size();

    const v = new Vector3();
    const tick = () => {
      if (disposed) return;
      controls.update();
      const w = el.clientWidth;
      const h = el.clientHeight;
      const { id: viewId, big } = camViewRef.current;
      const rig = viewId != null ? camRigs.get(viewId) : undefined;
      if (rig) {
        eye.position.copy(rig.pos);
        eye.up.copy(rig.up);
        eye.lookAt(rig.pos.clone().add(rig.dir));
        eye.fov = rig.fov;
      }
      renderer.setScissorTest(false);
      renderer.setViewport(0, 0, w, h);
      if (rig && big) {
        eye.aspect = w / Math.max(1, h);
        eye.updateProjectionMatrix();
        renderer.render(scene, eye);
      } else {
        renderer.render(scene, camera);
        if (rig) {
          // Inset in the top left at the camera's aspect ratio.
          const iw = Math.round(Math.min(w * 0.42, 420));
          const ih = Math.round(iw / rig.aspect);
          renderer.setScissorTest(true);
          renderer.setScissor(12, h - ih - 12, iw, ih);
          renderer.setViewport(12, h - ih - 12, iw, ih);
          eye.aspect = rig.aspect;
          eye.updateProjectionMatrix();
          renderer.render(scene, eye);
          renderer.setScissorTest(false);
        }
      }
      const box = labels.current;
      if (box) {
        const kids = box.children;
        labelled.forEach((l, i) => {
          const tag = kids[i] as HTMLElement | undefined;
          if (!tag) return;
          l.obj.getWorldPosition(v);
          v.y += l.lift;
          v.project(rig && big ? eye : camera);
          const visible = v.z < 1 && Math.abs(v.x) < 1.1 && Math.abs(v.y) < 1.1;
          tag.style.transform = `translate(${((v.x + 1) / 2) * w}px, ${((1 - v.y) / 2) * h}px) translate(-50%, -100%)`;
          tag.style.opacity = visible ? "1" : "0";
        });
      }
      raf = requestAnimationFrame(tick);
    };
    let raf = requestAnimationFrame(tick);

    // Click (not drag) picks what's under the pointer.
    const ray = new Raycaster();
    ray.layers.enableAll();
    const ndc = new Vector2();
    let down: { x: number; y: number } | null = null;
    const onDown = (e: PointerEvent) => (down = { x: e.clientX, y: e.clientY });
    const onUp = (e: PointerEvent) => {
      if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 4) return;
      const r = renderer.domElement.getBoundingClientRect();
      ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, camera);
      const hit = ray.intersectObjects(pickable, false)[0];
      if (hit?.object.userData.cameraId != null) pickCamRef.current(hit.object.userData.cameraId as number);
      else selectRef.current(hit ? (hit.object.userData.elementId as number) : null);
    };
    renderer.domElement.addEventListener("pointerdown", onDown);
    renderer.domElement.addEventListener("pointerup", onUp);

    if (labels.current) {
      labels.current.replaceChildren(
        ...labelled.map((l) => {
          const tag = document.createElement("span");
          tag.className = `pt-risk-3d__tag pt-risk-3d__tag--${l.kind}`;
          tag.textContent = l.name;
          if (l.id.startsWith("e")) {
            const m = markers.current.get(Number(l.id.slice(1)));
            if (m) m.tag = tag;
          }
          return tag;
        })
      );
    }
    setReady(true);

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
      controls.dispose();
      renderer.domElement.removeEventListener("pointerdown", onDown);
      renderer.domElement.removeEventListener("pointerup", onUp);
      scene.traverse((o) => (o as Mesh).geometry?.dispose());
      mats.forEach((m) => {
        (m as MeshBasicMaterial).map?.dispose();
        m.dispose();
      });
      env.dispose();
      pmrem.dispose();
      renderer.dispose();
      renderer.domElement.remove();
      markers.current.clear();
      setReady(false);
    };
  }, [sorted, elements, risk, explode, cameras, cutMode, cutH, showCov, planFloor, pickedCamera, camView]);

  useEffect(() => {
    for (const [id, m] of markers.current) {
      const on = id === selected;
      if (m.mat) m.mat.emissiveIntensity = on ? 0.55 : 0.12;
      m.pin?.scale.setScalar((on ? 1.35 : 1) * m.base);
      m.tag?.classList.toggle("is-sel", on);
    }
  }, [selected, ready]);

  return (
    <div className={`pt-risk-3d${viewed && bigView ? " is-camview" : ""}`}>
      <div ref={host} className="pt-risk-3d__canvas" data-testid="site-3d" data-ready={ready ? "1" : "0"} />
      <div ref={labels} className="pt-risk-3d__labels" aria-hidden />
      {viewed && (
        <div className={`pt-risk-3d__camview${bigView ? " is-big" : ""}`}>
          <span className="pt-eyebrow">Camera view</span>
          <b>{viewed.name}</b>
          <span className="pt-meta">
            {isFisheye(viewed) ? "360° fisheye, shown as a wide view" : `${Math.round(viewed.hfov)}° lens`} · {viewed.resW}×{viewed.resH} · {viewed.heightM} m up
          </span>
          <span className="pt-risk-3d__camview-actions">
            <button className="sds-btn sds-btn--sm sds-btn--secondary" onClick={() => setBigView((b) => !b)}>
              {bigView ? "Back to model" : "Full view"}
            </button>
            <button className="sds-btn sds-btn--sm sds-btn--ghost" onClick={() => onCamView(null)}>
              Close
            </button>
          </span>
        </div>
      )}
      <div className="pt-risk-3d__controls">
        <span className="pt-seg" role="radiogroup" aria-label="Walls">
          {(
            [
              ["cut", "Cutaway"],
              ["full", "Full height"],
            ] as const
          ).map(([k, l]) => (
            <button key={k} type="button" role="radio" aria-checked={cutMode === k} className="pt-seg__btn pt-hue-slate" onClick={() => setCutMode(k)}>
              {l}
            </button>
          ))}
        </span>
        {cutMode === "cut" && (
          <label>
            <span className="pt-meta">Cut at {cutH.toFixed(1)} m</span>
            <input type="range" min={0.3} max={3} step={0.1} value={cutH} onChange={(e) => setCutH(Number(e.target.value))} aria-label="Cut height" />
          </label>
        )}
        {levels.length > 1 && (
          <label>
            <span className="pt-meta">Level spacing</span>
            <input type="range" min={0} max={16} step={1} value={explode} onChange={(e) => setExplode(Number(e.target.value))} aria-label="Level spacing" />
          </label>
        )}
        {levels.some((l) => l.plan) && (
          <label className="pt-pl-check">
            <input type="checkbox" checked={planFloor} onChange={(e) => setPlanFloor(e.target.checked)} /> Plan on floor
          </label>
        )}
        {cameras.length > 0 && (
          <label className="pt-pl-check">
            <input type="checkbox" checked={showCov} onChange={(e) => setShowCov(e.target.checked)} /> Coverage
          </label>
        )}
        {cameras.length > 0 && showCov && <DoriLegend />}
        <span className="pt-meta pt-risk-3d__help">Drag to orbit · right-drag to pan · scroll to zoom · click a camera or marker</span>
      </div>
      {!modelled && (
        <div className="pt-risk-3d__note">
          {levels.some((l) => l.plan)
            ? "Walls aren't modelled yet. On the Plan view, use Detect walls to read them from the floor plan, or draw them with the Wall tool."
            : "Upload a floor plan (PDF or image) on the Plan view, then detect or draw its walls to build the 3D model."}
        </div>
      )}
    </div>
  );
}
