import { useEffect, useRef } from "react";
import { Color, Mesh, OrthographicCamera, PlaneGeometry, Scene, ShaderMaterial, Vector2, WebGLRenderer } from "three";

/**
 * A survey plate: contour lines of a slowly drifting relief, drawn in a
 * fragment shader. Hairlines in ink, every fifth an index contour, and a single
 * brass datum line — brass as structure, never fill. The ground swells gently
 * under the pointer. Renders only while visible, at ≤30fps, and holds a single
 * still frame when the user prefers reduced motion.
 */

const VERT = /* glsl */ `
void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

const FRAG = /* glsl */ `
precision highp float;
uniform float uTime;
uniform vec2 uRes;
uniform vec2 uMouse;
uniform float uMouseOn;
uniform vec3 uLine;
uniform vec3 uIndex;
uniform vec3 uDatum;
uniform float uLineA;
uniform float uIndexA;
uniform float uDatumA;
uniform float uDensity;
uniform float uScale;
uniform float uSeed;

// 3D simplex noise — Stefan Gustavson / Ian McEwan (MIT).
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permute(vec4 x) { return mod289(((x * 34.0) + 10.0) * x); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }
float snoise(vec3 v) {
  const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;
  i = mod289(i);
  vec4 p = permute(permute(permute(i.z + vec4(0.0, i1.z, i2.z, 1.0)) + i.y + vec4(0.0, i1.y, i2.y, 1.0)) + i.x + vec4(0.0, i1.x, i2.x, 1.0));
  float n_ = 0.142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);
  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0) * 2.0 + 1.0;
  vec4 s1 = floor(b1) * 2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);
  vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
  vec4 m = max(0.5 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
  m = m * m;
  return 105.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
}

float relief(vec2 p, float t) {
  float h = 0.0;
  float a = 0.56;
  for (int i = 0; i < 4; i++) {
    h += a * snoise(vec3(p, t + uSeed + float(i) * 7.31));
    p = p * 2.03 + vec2(17.2, -9.4);
    a *= 0.5;
  }
  return h;
}

void main() {
  vec2 uv = gl_FragCoord.xy / uRes.y * uScale;
  float h = relief(uv, uTime * 0.016);
  vec2 m = uMouse / uRes.y * uScale;
  float d = distance(uv, m);
  h += uMouseOn * 0.2 * exp(-d * d * 7.0);

  float v = h * uDensity;
  float w = fwidth(v);
  float f = fract(v);
  float dist = min(f, 1.0 - f);
  float hair = 1.0 - smoothstep(0.0, w * 1.05, dist);
  float bold = 1.0 - smoothstep(0.0, w * 1.9, dist);

  float k = floor(v + 0.5);
  float isIndex = 1.0 - step(0.5, mod(k, 5.0));
  float isDatum = 1.0 - step(0.5, abs(k - 2.0));

  vec3 col = uLine;
  float alpha = hair * uLineA;
  col = mix(col, uIndex, isIndex);
  alpha = mix(alpha, bold * uIndexA, isIndex);
  col = mix(col, uDatum, isDatum);
  alpha = mix(alpha, bold * uDatumA, isDatum);
  gl_FragColor = vec4(col * alpha, alpha);
}
`;

function cssColor(name: string): Color {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return new Color(v || "#000000");
}

function palette() {
  const night = document.documentElement.dataset.theme === "night";
  return night
    ? { line: cssColor("--sand-100"), index: cssColor("--sand-100"), datum: cssColor("--brass-400"), lineA: 0.075, indexA: 0.17, datumA: 0.7 }
    : { line: cssColor("--bark-800"), index: cssColor("--bark-800"), datum: cssColor("--brass-500"), lineA: 0.085, indexA: 0.2, datumA: 0.75 };
}

export default function SurveyField({
  density = 9,
  scale = 1.35,
  seed = 3.1,
  className = "",
}: {
  density?: number;
  scale?: number;
  seed?: number;
  className?: string;
}) {
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let renderer: WebGLRenderer;
    try {
      renderer = new WebGLRenderer({ alpha: true, antialias: false, powerPreference: "low-power", premultipliedAlpha: true });
    } catch {
      return; // No WebGL: the plate is ornament, the page reads fine without it.
    }
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.domElement.setAttribute("aria-hidden", "true");
    renderer.domElement.className = "pt-survey__canvas";
    el.appendChild(renderer.domElement);

    const p = palette();
    const uniforms = {
      uTime: { value: 0 },
      uRes: { value: new Vector2(1, 1) },
      uMouse: { value: new Vector2(-9999, -9999) },
      uMouseOn: { value: 0 },
      uLine: { value: p.line },
      uIndex: { value: p.index },
      uDatum: { value: p.datum },
      uLineA: { value: p.lineA },
      uIndexA: { value: p.indexA },
      uDatumA: { value: p.datumA },
      uDensity: { value: density },
      uScale: { value: scale },
      uSeed: { value: seed },
    };
    const scene = new Scene();
    const camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const geometry = new PlaneGeometry(2, 2);
    const material = new ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms, transparent: true, depthTest: false });
    scene.add(new Mesh(geometry, material));

    const draw = () => renderer.render(scene, camera);
    const size = () => {
      const { width, height } = el.getBoundingClientRect();
      if (!width || !height) return;
      renderer.setSize(width, height, false);
      const buf = renderer.getDrawingBufferSize(new Vector2());
      uniforms.uRes.value.set(buf.x, buf.y);
      draw();
    };
    const ro = new ResizeObserver(size);
    ro.observe(el);
    size();

    // Pointer, in drawing-buffer pixels with GL's bottom-left origin; eased towards the target.
    const target = new Vector2(-9999, -9999);
    let targetOn = 0;
    const onMove = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      const inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
      targetOn = inside ? 1 : 0;
      const k = uniforms.uRes.value.x / r.width;
      target.set((e.clientX - r.left) * k, (r.bottom - e.clientY) * k);
      if (uniforms.uMouse.value.x < -9000) uniforms.uMouse.value.copy(target);
    };
    if (!reduce) window.addEventListener("pointermove", onMove, { passive: true });

    const onTheme = new MutationObserver(() => {
      const q = palette();
      uniforms.uLine.value = q.line;
      uniforms.uIndex.value = q.index;
      uniforms.uDatum.value = q.datum;
      uniforms.uLineA.value = q.lineA;
      uniforms.uIndexA.value = q.indexA;
      uniforms.uDatumA.value = q.datumA;
      draw();
    });
    onTheme.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

    let visible = true;
    const io = new IntersectionObserver(([entry]) => {
      visible = !!entry?.isIntersecting;
    });
    io.observe(el);

    let raf = 0;
    let last = 0;
    const start = performance.now();
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      if (!visible || document.hidden || now - last < 33) return;
      last = now;
      uniforms.uTime.value = (now - start) / 1000;
      uniforms.uMouse.value.lerp(target, 0.06);
      uniforms.uMouseOn.value += (targetOn - uniforms.uMouseOn.value) * 0.05;
      draw();
    };
    if (!reduce) raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", onMove);
      ro.disconnect();
      io.disconnect();
      onTheme.disconnect();
      geometry.dispose();
      material.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [density, scale, seed]);

  return <div ref={host} className={`pt-survey ${className}`} aria-hidden />;
}
