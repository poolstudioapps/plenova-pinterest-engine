/**
 * Aragog: a small black spider that lives on the main pages. It waits where
 * the page puts it - in a web in the corner of a card, hanging from a thread
 * under one, or inside its hole at the edge of the sheet - then chases the
 * pointer without ever stopping, slower than it and never quite straight,
 * and circles it once it has caught up. A click on it squashes it (cartoon
 * splat); another comes out a while later.
 *
 * Motion is physical: the spider steers a velocity with a limited
 * acceleration, its body turns on a damped spring and its abdomen lags in the
 * turns. Legs are inverse kinematics on planted feet: a foot stays where it
 * stands until it is left too far behind, then lifts (the knee rises), swings
 * to where the body will be and lands - never while a neighbouring leg is in
 * the air, which gives the alternating gait of real spiders at any speed.
 *
 * Everything lives in page coordinates (it scrolls with the page, like its web
 * and its stain). One small canvas follows the spider and redraws it each
 * frame; the web, thread, hole and stain are drawn once.
 * Decorative only: hidden from assistive technology, off for touch screens
 * and for anyone who asked for reduced motion.
 */

type V = { x: number; y: number };
export type Start = "web" | "thread" | "lair";

const add = (a: V, b: V): V => ({ x: a.x + b.x, y: a.y + b.y });
const sub = (a: V, b: V): V => ({ x: a.x - b.x, y: a.y - b.y });
const mul = (a: V, k: number): V => ({ x: a.x * k, y: a.y * k });
const len = (a: V) => Math.hypot(a.x, a.y);
const rot = (a: V, t: number): V => ({
  x: a.x * Math.cos(t) - a.y * Math.sin(t),
  y: a.x * Math.sin(t) + a.y * Math.cos(t),
});
const dir = (t: number): V => ({ x: Math.cos(t), y: Math.sin(t) });
const lerp = (a: V, b: V, k: number): V => ({
  x: a.x + (b.x - a.x) * k,
  y: a.y + (b.y - a.y) * k,
});
const rand = (a: number, b: number) => a + Math.random() * (b - a);
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
/** The shortest signed turn from angle a to angle b. */
const turn = (a: number, b: number) => {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
};

/* ------------------------------------------------------------ anatomy -- */

/** Its size: the body drawn at this scale, the legs laid out to match. */
const BODY = 1.2;

/** Body frame: +x towards the head, +y the spider's right. One side; the other mirrors it. */
const LEG_LAYOUT: { hip: V; rest: V }[] = [
  { hip: { x: 3.4, y: 1.9 }, rest: { x: 18, y: 10 } },
  { hip: { x: 2.0, y: 2.5 }, rest: { x: 8, y: 17.5 } },
  { hip: { x: 0.4, y: 2.5 }, rest: { x: -5.5, y: 17 } },
  { hip: { x: -1.0, y: 1.9 }, rest: { x: -16, y: 11 } },
].map(({ hip, rest }) => ({ hip: mul(hip, BODY), rest: mul(rest, BODY) }));

interface Leg {
  side: -1 | 1;
  hip: V;
  rest: V;
  /** Femur and tibia + metatarsus lengths. */
  a: number;
  b: number;
  /** The legs that must be on the ground for this one to lift: beside it and across. */
  near: number[];
  foot: V;
  from: V;
  t: number;
  dur: number;
  stepping: boolean;
  /** How high the foot is off the page during a step, 0 to 1. */
  lift: number;
  /** An offset of its next footing, for the small shuffles at rest. */
  nudge: V;
}

function makeLegs(): Leg[] {
  const legs: Leg[] = [];
  for (const side of [-1, 1] as const) {
    LEG_LAYOUT.forEach((l, i) => {
      const hip = { x: l.hip.x, y: l.hip.y * side };
      const rest = { x: l.rest.x, y: l.rest.y * side };
      const d = len(sub(rest, hip));
      const at = (s: -1 | 1, j: number) => (s === -1 ? 0 : 4) + j;
      legs.push({
        side,
        hip,
        rest,
        // Longer than the reach: the knees stand out, angular.
        a: d * 0.66,
        b: d * 0.76,
        near: [
          ...(i > 0 ? [at(side, i - 1)] : []),
          ...(i < 3 ? [at(side, i + 1)] : []),
          at(side === -1 ? 1 : -1, i),
        ],
        foot: { x: 0, y: 0 },
        from: { x: 0, y: 0 },
        t: 0,
        dur: 0.12,
        stepping: false,
        lift: 0,
        nudge: { x: 0, y: 0 },
      });
    });
  }
  return legs;
}

/** The knee between a hip and a foot: of the two possible, the one farther from the body. */
function knee(h: V, f: V, a: number, b: number, center: V): V {
  const dx = f.x - h.x;
  const dy = f.y - h.y;
  const d = clamp(Math.hypot(dx, dy), Math.abs(a - b) + 0.01, a + b - 0.01);
  const base = Math.atan2(dy, dx);
  const bend = Math.acos(clamp((a * a + d * d - b * b) / (2 * a * d), -1, 1));
  const k1 = add(h, mul(dir(base + bend), a));
  const k2 = add(h, mul(dir(base - bend), a));
  return len(sub(k1, center)) > len(sub(k2, center)) ? k1 : k2;
}

/* ------------------------------------------------------------ drawing -- */

const SIZE = 128;
const C = SIZE / 2;
const INK = "#0b0b0c";

function ellipse(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, r = 0) {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, r, 0, Math.PI * 2);
}

/** A limb segment that narrows from `w1` to `w2`: legs end in a point, like a drawn silhouette. */
function taper(ctx: CanvasRenderingContext2D, a: V, b: V, w1: number, w2: number) {
  const d = sub(b, a);
  const l = len(d) || 1;
  const n = { x: -d.y / l, y: d.x / l };
  ctx.beginPath();
  ctx.moveTo(a.x + n.x * w1 * 0.5, a.y + n.y * w1 * 0.5);
  ctx.lineTo(b.x + n.x * w2 * 0.5, b.y + n.y * w2 * 0.5);
  ctx.lineTo(b.x - n.x * w2 * 0.5, b.y - n.y * w2 * 0.5);
  ctx.lineTo(a.x - n.x * w1 * 0.5, a.y - n.y * w1 * 0.5);
  ctx.closePath();
  ctx.fill();
  // Round joints, so the bend reads as a knee and not a crack.
  ellipse(ctx, a.x, a.y, w1 * 0.5, w1 * 0.5);
  ctx.fill();
}

/**
 * The spider, as a flat black silhouette (a Halloween cut-out rather than a
 * specimen): a big round abdomen, a small head, eight thin angular legs that
 * end in a point. `o` is where its body centre is drawn, in canvas pixels.
 */
function drawSpider(
  ctx: CanvasRenderingContext2D,
  o: V,
  heading: number,
  legs: { hip: V; knee: V; foot: V }[],
  sway: number,
  /** The abdomen's lag in a turn, radians about the waist. */
  abd: number,
) {
  // A faint shadow under it, so it sits on the page instead of floating.
  ctx.save();
  ctx.translate(1.2, 2);
  ctx.globalAlpha = 0.12;
  ctx.fillStyle = "#000";
  if ("filter" in ctx) ctx.filter = "blur(1.2px)";
  ctx.translate(o.x, o.y);
  ctx.rotate(heading);
  ctx.scale(BODY, BODY);
  ctx.rotate(abd);
  ellipse(ctx, -7, sway, 7.4, 6.4);
  ctx.fill();
  ctx.restore();
  if ("filter" in ctx) ctx.filter = "none";

  ctx.fillStyle = INK;
  for (const l of legs) {
    const mid = lerp(l.knee, l.foot, 0.55);
    taper(ctx, l.hip, l.knee, 2.3, 1.8);
    taper(ctx, l.knee, mid, 1.8, 1.25);
    taper(ctx, mid, l.foot, 1.25, 0.2);
  }

  ctx.save();
  ctx.translate(o.x, o.y);
  ctx.rotate(heading);
  ctx.scale(BODY, BODY);
  // The abdomen hangs from the waist and swings behind in the turns.
  ctx.save();
  ctx.translate(-1.6, 0);
  ctx.rotate(abd);
  ctx.translate(1.6, 0);
  ellipse(ctx, -7, sway, 7.6, 6.6);
  ctx.fill();
  // One soft glint: round, not flat.
  ctx.fillStyle = "rgba(255,255,255,0.13)";
  ellipse(ctx, -9, sway - 2.6, 2.6, 1.3, -0.35);
  ctx.fill();
  ctx.restore();
  ctx.fillStyle = INK;
  // Waist, head, and two short palps.
  ellipse(ctx, -1.6, sway * 0.4, 1.8, 1.5);
  ctx.fill();
  ellipse(ctx, 1.9, 0, 3.9, 3.3);
  ctx.fill();
  taper(ctx, { x: 4.6, y: -1.1 }, { x: 7.4, y: -2 }, 1.2, 0.5);
  taper(ctx, { x: 4.6, y: 1.1 }, { x: 7.4, y: 2 }, 1.2, 0.5);
  ctx.restore();
}

/**
 * Squashed, cartoon-style: a flat splat of red with round drops, the spider
 * flattened on top with its legs thrown out and two crosses for eyes. Funny,
 * not gory.
 */
function drawStain(ctx: CanvasRenderingContext2D, cx: number, cy: number, heading: number) {
  const RED = "#c8242b";

  // The splat: a round middle with blunt lobes, and drops thrown around it.
  ctx.fillStyle = RED;
  ctx.beginPath();
  const lobes = 7;
  const phase = Math.random() * Math.PI;
  for (let i = 0; i <= 64; i++) {
    const a = (i / 64) * Math.PI * 2;
    const k = 10.5 + Math.max(0, Math.sin(a * lobes + phase)) * 4.5;
    const x = cx + Math.cos(a) * k;
    const y = cy + Math.sin(a) * k;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + rand(-0.25, 0.25);
    const d = rand(19, 27);
    const r = rand(1.3, 2.6);
    ellipse(ctx, cx + Math.cos(a) * d, cy + Math.sin(a) * d, r, r);
    ctx.fill();
  }

  // The spider, flat: body spread wide, legs flung out straight.
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(heading);
  ctx.fillStyle = INK;
  for (let i = 0; i < 8; i++) {
    const side = i < 4 ? -1 : 1;
    const j = i % 4;
    const a = side * (0.55 + j * 0.62) + rand(-0.12, 0.12);
    const hip = { x: 1.5 - j * 1.3, y: side * 2.5 };
    const k = add(hip, mul(dir(a), rand(8, 10)));
    const f = add(k, mul(dir(a + side * rand(0.2, 0.6)), rand(7, 9)));
    taper(ctx, hip, k, 1.8, 1.4);
    taper(ctx, k, f, 1.4, 0.2);
  }
  ellipse(ctx, -5.5, 0, 9.5, 8.2);
  ctx.fill();
  ellipse(ctx, 4.6, 0, 4.4, 4);
  ctx.fill();

  // Two little crosses for eyes.
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 0.9;
  ctx.lineCap = "round";
  ctx.beginPath();
  for (const y of [-1.7, 1.7]) {
    ctx.moveTo(4.4, y - 0.95);
    ctx.lineTo(6.3, y + 0.95);
    ctx.moveTo(6.3, y - 0.95);
    ctx.lineTo(4.4, y + 0.95);
  }
  ctx.stroke();
  ctx.restore();
}

/* ------------------------------------------------------------ the page -- */

function silk(): string {
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "rgba(215,230,215,0.42)"
    : "rgba(92,104,92,0.42)";
}

function svg(tag: string, attrs: Record<string, string | number>): SVGElement {
  const el = document.createElementNS("http://www.w3.org/2000/svg", tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  return el;
}

/** A page point, from a point on screen. */
const page = (x: number, y: number): V => ({ x: x + window.scrollX, y: y + window.scrollY });

/** The first card well in view, to put the web, the thread or the hole on. */
function anchorCard(): DOMRect | null {
  for (const el of document.querySelectorAll<HTMLElement>("#main .card")) {
    const r = el.getBoundingClientRect();
    if (
      r.width > 240 &&
      r.height > 120 &&
      r.top > 40 &&
      r.top < window.innerHeight * 0.6 &&
      r.right < window.innerWidth
    )
      return r;
  }
  return null;
}

/* -------------------------------------------------------------- engine -- */

export function startAragog(start: Start): () => void {
  const layer = document.createElement("div");
  layer.setAttribute("aria-hidden", "true");
  layer.style.cssText =
    "position:absolute;left:0;top:0;width:0;height:0;pointer-events:none;z-index:40;";
  document.body.appendChild(layer);

  const canvas = document.createElement("canvas");
  canvas.setAttribute("aria-hidden", "true");
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = SIZE * dpr;
  canvas.height = SIZE * dpr;
  canvas.style.cssText = `position:fixed;left:0;top:0;width:${SIZE}px;height:${SIZE}px;pointer-events:none;z-index:45;will-change:transform;`;
  // On the dark ground a black spider would vanish: a pale rim outlines it.
  if (window.matchMedia("(prefers-color-scheme: dark)").matches)
    canvas.style.filter = "drop-shadow(0 0 0.8px rgba(225,238,225,0.75))";
  document.body.appendChild(canvas);
  const ctx = canvas.getContext("2d");

  // What a click lands on: a disc on the body, not the whole canvas.
  const hit = document.createElement("div");
  hit.setAttribute("aria-hidden", "true");
  hit.style.cssText =
    "position:fixed;left:0;top:0;width:34px;height:34px;border-radius:50%;z-index:46;cursor:pointer;will-change:transform;";
  document.body.appendChild(hit);

  let raf = 0;
  let alive = true;
  let respawn: ReturnType<typeof setTimeout> | undefined;
  // Where the pointer last was: the spider keeps after it even once it leaves.
  let cursor: V | null = null;
  let firstMove = 0;

  // The spider: position, velocity, heading and how fast it turns.
  let pos: V = { x: 0, y: 0 };
  let vel: V = { x: 0, y: 0 };
  let heading = 0;
  let omega = 0;
  /** Walked distance as a phase, for the body's sway in time with the steps. */
  let gait = 0;
  let legs = makeLegs();
  let state: "hold" | "emerge" | "walk" | "gone" = "hold";
  let scenario: Start = start;
  let clock = 0;
  let twitchAt = 0;
  let orbit: 1 | -1 = 1;
  let orbitUntil = 0;
  // Scenario furniture.
  let hole: { at: V; out: number; el: SVGElement } | null = null;
  let thread: { anchor: V; length: number; target: number; line: SVGElement; svgEl: SVGElement; fading: number } | null = null;

  const plant = () => {
    for (const l of legs) {
      l.foot = add(pos, rot(l.rest, heading));
      l.stepping = false;
      l.lift = 0;
    }
  };

  /* --- scenarios --------------------------------------------------- */

  function setupWeb(r: DOMRect) {
    const corner = page(r.right, r.top);
    const box = 96;
    const s = svg("svg", {
      width: box,
      height: box,
      viewBox: `${-box} 0 ${box} ${box}`,
      style: `position:absolute;left:${corner.x - box}px;top:${corner.y}px;overflow:visible`,
    });
    const hub: V = { x: -31, y: 31 };
    const anchors: V[] = [
      { x: -86, y: 0 }, { x: -60, y: 0 }, { x: -36, y: 0 }, { x: -14, y: 0 },
      { x: -5, y: 5 }, { x: 0, y: 14 }, { x: 0, y: 36 }, { x: 0, y: 60 }, { x: 0, y: 86 },
    ];
    // An irregular corner web: radials to both edges, a sagging spiral between them.
    const radials = anchors
      .map((a) => ({ a, ang: Math.atan2(a.y - hub.y, a.x - hub.x) }))
      .sort((p, q) => p.ang - q.ang);
    let d = "";
    for (const { a } of radials) d += `M${hub.x},${hub.y}L${a.x},${a.y}`;
    for (let ring = 1; ring <= 7; ring++) {
      const f = ring / 8 + rand(-0.03, 0.03);
      for (let i = 0; i < radials.length - 1; i++) {
        const p = lerp(hub, radials[i]!.a, f);
        const q = lerp(hub, radials[i + 1]!.a, f + rand(-0.02, 0.02));
        const m = lerp(lerp(p, q, 0.5), hub, 0.07);
        d += `M${p.x.toFixed(1)},${p.y.toFixed(1)}Q${m.x.toFixed(1)},${m.y.toFixed(1)} ${q.x.toFixed(1)},${q.y.toFixed(1)}`;
      }
    }
    // A few stray threads, as a real one has.
    d += `M-70,0Q-60,22 -44,34M0,70Q-24,62 -40,46M-20,0L-2,20`;
    s.appendChild(
      svg("path", { d, fill: "none", stroke: silk(), "stroke-width": 0.6, "stroke-linecap": "round" }),
    );
    layer.appendChild(s);
    pos = add(corner, hub);
    heading = Math.atan2(1, -1) + rand(-0.3, 0.3);
    plant();
  }

  function setupThread(r: DOMRect | null) {
    const anchor = r
      ? page(r.left + r.width * rand(0.62, 0.82), r.bottom - 1)
      : page(window.innerWidth * 0.72, 0);
    const s = svg("svg", {
      width: 1,
      height: 1,
      style: "position:absolute;left:0;top:0;overflow:visible",
    });
    const line = svg("line", {
      stroke: silk(),
      "stroke-width": 0.7,
      "stroke-linecap": "round",
    });
    s.appendChild(line);
    layer.appendChild(s);
    thread = { anchor, length: 0, target: rand(70, 120), line, svgEl: s, fading: 0 };
    heading = Math.PI / 2; // head down, hanging by its spinnerets
    pos = add(anchor, { x: 0, y: 13 });
    plant();
  }

  function setupLair() {
    const sheet = document.querySelector<HTMLElement>("#main > div");
    const sr = sheet?.getBoundingClientRect();
    const x = sr ? sr.left + 22 : 24;
    const y = window.innerHeight * rand(0.45, 0.7);
    const at = page(x, y);
    const s = svg("svg", {
      width: 40,
      height: 28,
      viewBox: "-20 -14 40 28",
      style: `position:absolute;left:${at.x - 20}px;top:${at.y - 14}px;overflow:visible`,
    });
    // A clean round hole, as in a cartoon: a shaded rim, a deep inside
    // (darkest under the top edge), a lit lower lip - it reads as a hole, not
    // as a stain.
    const dark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const defs = svg("defs", {});
    const g = svg("linearGradient", { id: "aragog-hole", x1: 0, y1: 0, x2: 0, y2: 1 });
    g.appendChild(svg("stop", { offset: "0%", "stop-color": "#000" }));
    g.appendChild(svg("stop", { offset: "100%", "stop-color": "#26262a" }));
    defs.appendChild(g);
    s.appendChild(defs);
    s.appendChild(
      svg("ellipse", {
        cx: 0,
        cy: 0.6,
        rx: 16.5,
        ry: 11,
        fill: dark ? "rgba(255,255,255,0.08)" : "rgba(29,47,27,0.13)",
      }),
    );
    s.appendChild(svg("ellipse", { cx: 0, cy: 0, rx: 14, ry: 9, fill: "url(#aragog-hole)" }));
    s.appendChild(
      svg("path", {
        d: "M-12.4,4.2A14,9 0 0 0 12.4,4.2",
        fill: "none",
        stroke: dark ? "rgba(255,255,255,0.28)" : "rgba(255,255,255,0.75)",
        "stroke-width": 1.1,
        "stroke-linecap": "round",
      }),
    );
    layer.appendChild(s);
    hole = { at, out: 0, el: s };
    heading = rand(-0.5, 0.5); // facing into the page
    pos = add(at, mul(dir(heading), -7));
    plant();
  }

  function setup(kind: Start) {
    scenario = kind;
    state = "hold";
    vel = { x: 0, y: 0 };
    omega = 0;
    legs = makeLegs();
    const r = anchorCard();
    if (kind === "web" && r) setupWeb(r);
    else if (kind === "thread") setupThread(r);
    else {
      scenario = "lair";
      setupLair();
    }
  }

  /* --- behaviour --------------------------------------------------- */

  function wake() {
    if (state !== "hold") return;
    if (scenario === "lair") state = "emerge";
    else {
      state = "walk";
      if (thread) thread.fading = 0.001;
    }
  }

  /** The body turns towards `target` on a damped spring: a little lag, no snap. */
  function turnBody(dt: number, target: number) {
    omega += (turn(heading, target) * 70 - omega * 15) * dt;
    heading += omega * dt;
  }

  /**
   * Steers the velocity towards `desired`, the way legs can: by so much per
   * second, never all at once.
   */
  function steer(dt: number, desired: V, accel: number) {
    let dv = sub(desired, vel);
    const l = len(dv);
    const max = accel * dt;
    if (l > max) dv = mul(dv, max / l);
    vel = add(vel, dv);
    pos = add(pos, mul(vel, dt));
    const doc = document.documentElement;
    // Kept on the page, not on the screen: scrolled away, it walks back.
    pos = {
      x: clamp(pos.x, 14, doc.scrollWidth - 14),
      y: clamp(pos.y, 14, doc.scrollHeight - 14),
    };
  }

  function stepLegs(dt: number) {
    const speed = len(vel);
    const dur = clamp(0.15 - speed * 0.00055, 0.075, 0.15);
    // A foot lands where its home will be when it lands, not where it is now.
    const lead = dur * 1.05;
    const aheadPos = add(pos, mul(vel, lead));
    const aheadHeading = heading + omega * lead;
    const home = (l: Leg) => add(pos, rot(l.rest, heading));
    const landing = (l: Leg) => add(add(aheadPos, rot(l.rest, aheadHeading)), l.nudge);

    for (const l of legs) {
      if (!l.stepping) continue;
      l.t += dt / l.dur;
      const k = clamp(l.t, 0, 1);
      // Quick off the ground, quick down, slower through the top of the arc.
      const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
      l.foot = lerp(l.from, landing(l), e);
      l.lift = Math.sin(k * Math.PI);
      if (l.t >= 1) {
        l.stepping = false;
        l.lift = 0;
        l.nudge = { x: 0, y: 0 };
      }
    }

    // The planted feet left furthest behind lift first; a foot waits while a
    // neighbour is in the air, unless it is about to be pulled off its reach.
    const threshold = speed > 4 ? 5 + speed * 0.025 : 2.4;
    const due = legs
      .filter((l) => !l.stepping)
      .map((l) => ({ l, err: len(sub(l.foot, home(l))) }))
      .filter((d) => d.err > threshold)
      .sort((p, q) => q.err - p.err);
    for (const { l, err } of due) {
      const waiting = l.near.some((j) => legs[j]!.stepping);
      if (waiting && err < (l.a + l.b) * 0.75) continue;
      l.stepping = true;
      l.t = 0;
      l.dur = dur;
      l.from = l.foot;
    }
  }

  /** At rest in its web or its hole: one foot shifts now and then. */
  function shuffle(now: number) {
    if (now < twitchAt) return;
    twitchAt = now + rand(900, 2600);
    const free = legs.filter((l) => !l.stepping && !l.near.some((j) => legs[j]!.stepping));
    const l = free[Math.floor(Math.random() * free.length)];
    if (!l) return;
    l.nudge = { x: rand(-2.5, 2.5), y: rand(-2.5, 2.5) };
    l.stepping = true;
    l.t = 0;
    l.dur = 0.13;
    l.from = l.foot;
  }

  function update(dt: number, now: number) {
    clock += dt;
    gait += len(vel) * dt * 0.33;
    const near = cursor ? len(sub(cursor, pos)) : Infinity;

    if (state === "hold") {
      if (firstMove && (near < 280 || now - firstMove > 9000)) wake();
      if (thread && state === "hold") {
        // Letting itself down, then swaying on the end of the thread.
        thread.length += (thread.target - thread.length) * Math.min(1, dt * 1.6);
        const swing = Math.sin(clock * 1.6) * 0.07;
        const tail = thread.length + Math.sin(clock * 2.3) * 1.2;
        pos = add(thread.anchor, { x: Math.sin(swing) * tail, y: Math.cos(swing) * tail + 13 });
        heading = Math.PI / 2 - swing;
        // Legs drawn in while it hangs, stirring a little.
        for (const l of legs) {
          const tuck = mul(l.rest, 0.72 + Math.sin(clock * 3 + l.rest.x) * 0.03);
          l.foot = add(pos, rot(tuck, heading));
        }
        return;
      }
      shuffle(now);
      stepLegs(dt);
      return;
    }

    if (state === "emerge" && hole) {
      // Out of the hole, slowly, straight ahead.
      steer(dt, mul(dir(heading), 26), 120);
      turnBody(dt, heading);
      if (len(sub(pos, hole.at)) > 34) {
        state = "walk";
        // Out and gone: the hole closes behind it, so nothing is left lying there.
        const el = hole.el;
        setTimeout(() => {
          el.style.transition = "opacity 900ms ease";
          el.style.opacity = "0";
          setTimeout(() => el.remove(), 950);
        }, 1600);
      }
      stepLegs(dt);
      return;
    }

    if (state !== "walk") return;
    const target = cursor ?? pos;
    const to = sub(target, pos);
    const dist = len(to);
    const ORBIT = 46;
    if (now > orbitUntil) {
      orbit = Math.random() < 0.5 ? 1 : -1;
      orbitUntil = now + rand(7000, 14000);
    }
    // Never quite straight: a slow meander on top of the chase.
    const meander = Math.sin(clock * 1.15) * 0.2 + Math.sin(clock * 0.41 + 1.7) * 0.16;
    const toward = Math.atan2(to.y, to.x);
    let want: number;
    let cruise: number;
    if (dist > ORBIT * 1.5) {
      want = toward + meander;
      cruise = clamp(44 + (dist - 70) * 0.3, 44, 118);
    } else {
      // Caught up: it circles the pointer, never stopping.
      const off = clamp((dist - ORBIT) / ORBIT, -1, 1);
      want = toward + orbit * (Math.PI / 2 - off * 0.9) + meander * 0.5;
      cruise = 38;
    }
    steer(dt, mul(dir(want), cruise), 240);
    if (len(vel) > 2) turnBody(dt, Math.atan2(vel.y, vel.x));
    stepLegs(dt);
  }

  /* --- drawing ----------------------------------------------------- */

  function render() {
    if (!ctx) return;
    const sx = window.scrollX;
    const sy = window.scrollY;
    const o = { x: pos.x - sx - C, y: pos.y - sy - C };
    canvas.style.transform = `translate3d(${o.x.toFixed(1)}px,${o.y.toFixed(1)}px,0)`;
    hit.style.transform = `translate3d(${(pos.x - sx - 17).toFixed(1)}px,${(pos.y - sy - 17).toFixed(1)}px,0)`;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, SIZE, SIZE);
    const local = (p: V): V => ({ x: p.x - pos.x + C, y: p.y - pos.y + C });
    const center = { x: C, y: C };
    const drawn = legs.map((l) => {
      const hip = local(add(pos, rot(l.hip, heading)));
      let foot = local(l.foot);
      let k = knee(hip, foot, l.a, l.b, center);
      if (l.lift > 0) {
        // Seen from above, a leg in the air: the knee rises (outwards), the
        // foot draws in.
        const mid = lerp(hip, foot, 0.5);
        const out = sub(k, mid);
        const ol = len(out) || 1;
        k = add(k, mul(out, (l.lift * 2.6) / ol));
        foot = lerp(foot, hip, l.lift * 0.1);
      }
      return { hip, foot, knee: k };
    });
    const speed = len(vel);
    const sway = Math.sin(gait) * 0.55 * Math.min(1, speed / 40);
    const abd = clamp(-omega * 0.07, -0.4, 0.4);
    drawSpider(ctx, center, heading, drawn, sway, abd);

    // Inside the hole, what has not come out yet stays in the dark.
    if (hole && (state === "hold" || state === "emerge")) {
      const h = local(hole.at);
      ctx.save();
      ctx.globalCompositeOperation = "destination-out";
      ctx.translate(h.x, h.y);
      ctx.scale(1, 9 / 14);
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 15);
      g.addColorStop(0, "rgba(0,0,0,1)");
      g.addColorStop(0.72, "rgba(0,0,0,0.95)");
      g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 0, 15, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    if (thread) {
      // From its anchor to the spinnerets; let go, it slackens and fades.
      const tail = add(pos, rot({ x: -14.5 * BODY, y: 0 }, heading));
      const end = thread.fading > 0 ? lerp(tail, thread.anchor, Math.min(1, thread.fading)) : tail;
      thread.line.setAttribute("x1", thread.anchor.x.toFixed(1));
      thread.line.setAttribute("y1", thread.anchor.y.toFixed(1));
      thread.line.setAttribute("x2", end.x.toFixed(1));
      thread.line.setAttribute("y2", end.y.toFixed(1));
    }
  }

  /* --- squash ------------------------------------------------------ */

  function squash(e: PointerEvent) {
    if (state === "gone") return;
    e.preventDefault();
    e.stopPropagation();
    state = "gone";
    canvas.style.opacity = "0";
    hit.style.pointerEvents = "none";
    const box = 90;
    const stain = document.createElement("canvas");
    stain.width = box * dpr;
    stain.height = box * dpr;
    stain.style.cssText = `position:absolute;left:${pos.x - box / 2}px;top:${pos.y - box / 2}px;width:${box}px;height:${box}px;transition:opacity 2s ease;`;
    const sctx = stain.getContext("2d");
    if (sctx) {
      sctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawStain(sctx, box / 2, box / 2, heading);
    }
    layer.appendChild(stain);
    stain.animate(
      [
        { transform: "scale(0.55)", opacity: 0.4 },
        { transform: "scale(1)", opacity: 1 },
      ],
      { duration: 170, easing: "cubic-bezier(0.23, 1, 0.32, 1)" },
    );
    // The stain dries off after a while; another spider comes out later.
    setTimeout(() => {
      stain.style.opacity = "0";
      setTimeout(() => stain.remove(), 2100);
    }, 120_000);
    respawn = setTimeout(() => {
      if (!alive) return;
      thread?.svgEl.remove();
      thread = null;
      hole = null;
      setup(Math.random() < 0.5 ? "lair" : "thread");
      canvas.style.opacity = "1";
      hit.style.pointerEvents = "auto";
    }, rand(25_000, 40_000));
  }

  /* --- loop -------------------------------------------------------- */

  let last = performance.now();
  function frame(now: number) {
    if (!alive) return;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (state !== "gone") {
      update(dt, now);
      render();
    }
    if (thread && thread.fading > 0) {
      thread.fading += dt * 1.8;
      thread.svgEl.style.opacity = String(Math.max(0, 1 - thread.fading));
      if (thread.fading >= 1) {
        thread.svgEl.remove();
        thread = null;
      }
    }
    raf = requestAnimationFrame(frame);
  }

  const onMove = (e: PointerEvent) => {
    if (e.pointerType !== "mouse") return;
    cursor = page(e.clientX, e.clientY);
    if (!firstMove) firstMove = performance.now();
  };
  // Scrolling moves the page under a still pointer: the spider aims at where
  // the pointer now is on the page.
  let lastClient: { x: number; y: number } | null = null;
  const onMoveClient = (e: PointerEvent) => {
    if (e.pointerType === "mouse") lastClient = { x: e.clientX, y: e.clientY };
  };
  const onScroll = () => {
    if (lastClient) cursor = page(lastClient.x, lastClient.y);
  };
  const onVisibility = () => {
    cancelAnimationFrame(raf);
    if (!document.hidden && alive) {
      last = performance.now();
      raf = requestAnimationFrame(frame);
    }
  };

  setup(start);
  hit.addEventListener("pointerdown", squash);
  window.addEventListener("pointermove", onMove, { passive: true });
  window.addEventListener("pointermove", onMoveClient, { passive: true });
  window.addEventListener("scroll", onScroll, { passive: true });
  document.addEventListener("visibilitychange", onVisibility);
  canvas.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 400, easing: "ease-out" });
  raf = requestAnimationFrame(frame);

  return () => {
    alive = false;
    cancelAnimationFrame(raf);
    clearTimeout(respawn);
    hit.removeEventListener("pointerdown", squash);
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointermove", onMoveClient);
    window.removeEventListener("scroll", onScroll);
    document.removeEventListener("visibilitychange", onVisibility);
    layer.remove();
    canvas.remove();
    hit.remove();
  };
}
