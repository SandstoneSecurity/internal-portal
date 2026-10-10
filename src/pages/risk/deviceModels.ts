/**
 * Simple three.js models of physical security items, at real size (metres), for the site's 3D model.
 * Each is built at the origin facing +x and placed by the caller; a run (bollards, barrier, gate, boom,
 * beam) is built along its own length.
 */
import { BoxGeometry, CylinderGeometry, DoubleSide, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial, Shape, ShapeGeometry, SphereGeometry, type BufferGeometry, type Material, type Object3D } from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { BOLLARD_SPACING, GROUP_HUE, deviceDef, fanOf, type Device } from "../../../shared/devices";
import { toM, type Frame } from "../../../shared/geometry";

const HEX = { slate: 0x6e7f88, harbour: 0x3f7a94, jacaranda: 0x7b61a0, clay: 0xb4553f, ochre: 0xc99a3e, euc: 0x4e7a5a } as const;

/** Materials, made once per scene and disposed with it. */
export function deviceMaterials(track: <T extends Material>(m: T) => T) {
  return {
    steel: track(new MeshStandardMaterial({ color: 0x3d3f42, roughness: 0.45, metalness: 0.7 })),
    galv: track(new MeshStandardMaterial({ color: 0x9aa1a6, roughness: 0.5, metalness: 0.6 })),
    concrete: track(new MeshStandardMaterial({ color: 0xc9c4ba, roughness: 0.95 })),
    white: track(new MeshStandardMaterial({ color: 0xf2efe9, roughness: 0.6 })),
    red: track(new MeshStandardMaterial({ color: 0xb4553f, roughness: 0.5, emissive: 0xb4553f, emissiveIntensity: 0.15 })),
    reflect: track(new MeshStandardMaterial({ color: 0xe8c547, roughness: 0.3, emissive: 0xe8c547, emissiveIntensity: 0.25 })),
    glass: track(new MeshStandardMaterial({ color: 0x9fc3d1, roughness: 0.05, transparent: true, opacity: 0.35, depthWrite: false })),
    lamp: track(new MeshStandardMaterial({ color: 0xfff1c9, emissive: 0xffe08a, emissiveIntensity: 1.2 })),
    beam: track(new MeshBasicMaterial({ color: 0xff3b2f, transparent: true, opacity: 0.75 })),
    sign: track(new MeshStandardMaterial({ color: 0xe8c547, roughness: 0.5, side: DoubleSide })),
    hue: Object.fromEntries(Object.entries(HEX).map(([k, v]) => [k, track(new MeshStandardMaterial({ color: v, roughness: 0.5, emissive: v, emissiveIntensity: 0.12 }))])) as Record<keyof typeof HEX, MeshStandardMaterial>,
    fan: Object.fromEntries(Object.entries(HEX).map(([k, v]) => [k, track(new MeshBasicMaterial({ color: v, transparent: true, opacity: 0.16, depthWrite: false, side: DoubleSide }))])) as Record<keyof typeof HEX, MeshBasicMaterial>,
  };
}
export type DeviceMats = ReturnType<typeof deviceMaterials>;

const box = (w: number, h: number, d: number, x: number, y: number, z: number) => new BoxGeometry(w, h, d).translate(x, y, z);
const cyl = (r: number, h: number, x: number, y: number, z: number, seg = 12) => new CylinderGeometry(r, r, h, seg).translate(x, y, z);
const mesh = (g: BufferGeometry | BufferGeometry[], m: Material, shadow = true) => {
  const one = Array.isArray(g) ? mergeGeometries(g)! : g;
  const o = new Mesh(one, m);
  o.castShadow = shadow;
  o.receiveShadow = shadow;
  return o;
};

/** A model of the device, placed on its level (x right, z down the plan, y up; level origin at its centre). */
export function buildDevice(d: Device, f: Frame, m: DeviceMats): Object3D {
  const def = deviceDef(d.kind);
  const g = new Group();
  const a = toM(d.a, f);
  const ax = a[0] - f.W / 2, az = a[1] - f.D / 2;
  g.position.set(ax, 0, az);
  const hueM = m.hue[GROUP_HUE[def.group]];

  if (d.b) {
    const b = toM(d.b, f);
    const dx = b[0] - a[0], dz = b[1] - a[1];
    const len = Math.max(0.1, Math.hypot(dx, dz));
    // Lay the run out along +x, then turn it onto its line.
    g.rotation.y = -Math.atan2(dz, dx);
    switch (d.kind) {
      case "bollards": {
        const n = Math.max(2, Math.floor(len / BOLLARD_SPACING) + 1);
        const posts: BufferGeometry[] = [], bands: BufferGeometry[] = [];
        for (let i = 0; i < n; i++) {
          const x = (len * i) / (n - 1);
          posts.push(cyl(0.1, 1.0, x, 0.5, 0, 14));
          bands.push(cyl(0.102, 0.06, x, 0.82, 0, 14));
        }
        g.add(mesh(posts, m.steel), mesh(bands, m.reflect, false));
        break;
      }
      case "barrier": {
        // Precast blocks, 3 m long, with a hand-width gap.
        const parts: BufferGeometry[] = [];
        for (let s = 0; s < len - 0.05; s += 3) {
          const l = Math.min(3, len - s) - 0.04;
          parts.push(box(l, 0.25, 0.6, s + l / 2, 0.125, 0), box(l, 0.55, 0.22, s + l / 2, 0.52, 0));
        }
        g.add(mesh(parts, m.concrete));
        break;
      }
      case "gate": {
        const bars: BufferGeometry[] = [box(len, 0.08, 0.06, len / 2, 0.15, 0), box(len, 0.08, 0.06, len / 2, 2.05, 0)];
        for (let x = 0.1; x < len; x += 0.18) bars.push(box(0.025, 1.9, 0.025, x, 1.1, 0));
        g.add(mesh(bars, m.galv), mesh([box(0.12, 2.3, 0.12, 0, 1.15, 0), box(0.12, 2.3, 0.12, len, 1.15, 0)], m.steel));
        break;
      }
      case "boom": {
        const stripes: BufferGeometry[] = [], white: BufferGeometry[] = [];
        for (let s = 0.3, i = 0; s < len; s += 0.5, i++) (i % 2 ? white : stripes).push(box(Math.min(0.5, len - s), 0.09, 0.06, s + Math.min(0.5, len - s) / 2, 1.0, 0));
        g.add(mesh(box(0.35, 1.1, 0.35, 0, 0.55, 0), m.white), mesh(stripes, m.red), ...(white.length ? [mesh(white, m.white)] : []));
        break;
      }
      case "beam": {
        g.add(mesh([box(0.12, 1.1, 0.12, 0, 0.55, 0), box(0.12, 1.1, 0.12, len, 0.55, 0)], m.white));
        const ray = new Mesh(cyl(0.012, len, 0, 0, 0, 6).rotateZ(Math.PI / 2).translate(len / 2, def.mount, 0), m.beam);
        g.add(ray);
        break;
      }
      default:
        g.add(mesh(box(len, 0.2, 0.2, len / 2, 0.1, 0), hueM));
    }
    return g;
  }

  // Point items face along their rotation.
  g.rotation.y = -(d.rot * Math.PI) / 180;
  const h = def.mount;
  switch (d.kind) {
    case "bollard":
      g.add(mesh(cyl(0.11, 1.0, 0, 0.5, 0, 16), m.steel), mesh(cyl(0.112, 0.06, 0, 0.82, 0, 16), m.reflect, false));
      break;
    case "turnstile": {
      const arms: BufferGeometry[] = [0, 2.094, 4.189].map((t) => cyl(0.02, 0.55, 0, 0, 0, 8).rotateZ(Math.PI / 2).translate(0.28, 0, 0).rotateY(t).translate(0.2, 0.95, 0));
      g.add(mesh(box(0.3, 1.0, 0.9, -0.05, 0.5, 0), m.galv), mesh(arms, m.steel));
      break;
    }
    case "reader":
    case "keypad":
    case "intercom":
      // On a slim post, so it reads wherever it stands; the face looks along the rotation.
      g.add(mesh(cyl(0.03, h - 0.1, 0, (h - 0.1) / 2, 0, 8), m.galv), mesh(box(0.05, d.kind === "intercom" ? 0.26 : 0.16, 0.1, 0.02, h, 0), hueM));
      break;
    case "lock":
      g.add(mesh(box(0.08, 0.06, 0.26, 0, h, 0), hueM));
      break;
    case "pir":
    case "glass":
      g.add(mesh(d.kind === "pir" ? box(0.07, 0.11, 0.07, 0, h, 0) : cyl(0.05, 0.03, 0, h, 0, 16), m.white), mesh(new SphereGeometry(0.025, 10, 8).translate(0.04, h - 0.02, 0), hueM, false));
      break;
    case "duress":
      g.add(mesh(box(0.08, 0.05, 0.08, 0, h, 0), m.red));
      break;
    case "panel":
      g.add(mesh(box(0.09, 0.42, 0.32, 0, h, 0), m.white), mesh(box(0.01, 0.1, 0.16, 0.05, h + 0.08, 0), hueM, false));
      break;
    case "siren":
      g.add(mesh(box(0.12, 0.3, 0.22, 0, h, 0), m.white), mesh(cyl(0.05, 0.06, 0.07, h + 0.12, 0, 12), m.red, false));
      break;
    case "light": {
      const head = mesh(box(0.35, 0.12, 0.3, 0.2, h, 0).rotateZ(-0.35), m.steel);
      g.add(mesh(cyl(0.06, h, 0, h / 2, 0, 10), m.galv), head, mesh(box(0.3, 0.02, 0.26, 0.24, h - 0.07, 0).rotateZ(-0.35), m.lamp, false));
      break;
    }
    case "guard": {
      g.add(
        mesh(box(2.0, 1.0, 2.0, 0, 0.5, 0), m.white),
        mesh([box(2.0, 1.1, 0.05, 0, 1.55, 0.975), box(2.0, 1.1, 0.05, 0, 1.55, -0.975), box(0.05, 1.1, 2.0, 0.975, 1.55, 0), box(0.05, 1.1, 2.0, -0.975, 1.55, 0)], m.glass, false),
        mesh(box(2.3, 0.15, 2.3, 0, 2.18, 0), m.steel)
      );
      break;
    }
    case "safe":
      g.add(mesh(box(0.6, 1.0, 0.6, 0, 0.5, 0), m.steel), mesh(cyl(0.06, 0.03, 0.31, 0.6, 0, 16).rotateZ(Math.PI / 2), m.galv, false));
      break;
    case "sign": {
      const plate = new Mesh(new BoxGeometry(0.02, 0.4, 0.6).translate(0.05, h, 0), m.sign);
      g.add(mesh(cyl(0.025, h + 0.2, 0, (h + 0.2) / 2, 0, 8), m.galv), plate);
      break;
    }
    default:
      g.add(mesh(new SphereGeometry(0.15, 14, 10).translate(0, h, 0), hueM));
  }
  return g;
}

/** The floor a sensor or light covers, as a flat fan in level coordinates (or null for other items). */
export function deviceFan(d: Device, f: Frame, m: DeviceMats): Mesh | null {
  if (d.b) return null;
  const a = toM(d.a, f);
  const pts = fanOf(d, a);
  if (pts.length < 3) return null;
  const shape = new Shape();
  pts.forEach((p, i) => (i ? shape.lineTo(p[0] - f.W / 2, p[1] - f.D / 2) : shape.moveTo(p[0] - f.W / 2, p[1] - f.D / 2)));
  const geo = new ShapeGeometry(shape);
  // Shapes lie in x–y; the plan's y is the world's z.
  geo.rotateX(Math.PI / 2);
  const fan = new Mesh(geo, m.fan[GROUP_HUE[deviceDef(d.kind).group]]);
  fan.position.y = 0.015;
  return fan;
}
