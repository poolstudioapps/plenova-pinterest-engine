import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { TessellateModifier } from "three/addons/modifiers/TessellateModifier.js";
import { mergeVertices } from "three/addons/utils/BufferGeometryUtils.js";

/**
 * A potted Monstera deliciosa, modelled in code, that watches the pointer.
 *
 * Nothing is downloaded: every leaf is traced from a handful of control
 * points - the heart-shaped blade, the slits running in from the margin along
 * the veins, the holes beside the midrib - then subdivided, cupped and drooped
 * so it catches the light like a real leaf. The pot is Plenova's pink.
 *
 * The plant turns toward the pointer wherever it is on the page, the leaves
 * stir with the speed of the pointer as if it were wind, a leaf under the
 * pointer ruffles, and a click makes the whole plant shiver. With reduced
 * motion requested, it is drawn once and holds still.
 */

export interface MonsteraOptions {
  /** Small leaves drifting around the plant. */
  floating: number;
  reducedMotion: boolean;
}

const BRAND_PINK = 0xee9f98;

// ------------------------------------------------------------------ leaves

interface LeafShapeOptions {
  slits: number;
  holes: boolean;
}

/** The right-hand margin, base to tip, for a leaf one unit long. */
function marginPoints(): THREE.Vector2[] {
  const control = [
    [0.03, 0.02],
    [0.1, -0.06],
    [0.26, -0.075],
    [0.4, 0.03],
    [0.485, 0.2],
    [0.505, 0.38],
    [0.465, 0.56],
    [0.365, 0.74],
    [0.21, 0.89],
    [0, 1],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  return new THREE.SplineCurve(control).getSpacedPoints(96);
}

/**
 * The blade's outline with its slits, and its holes.
 *
 * A slit is a narrow wedge cut in from the margin toward the midrib, angled
 * down the way monstera veins run; walking the outline, it is two extra
 * points - in to the end of the cut, and back out a little further along.
 */
function leafShape({ slits, holes }: LeafShapeOptions): THREE.Shape {
  const margin = marginPoints();
  const last = margin.length - 1;
  const cuts = new Map<number, { end: THREE.Vector2; back: number }>();
  for (let k = 0; k < slits; k++) {
    const u = 0.3 + (0.56 * k) / Math.max(1, slits - 1);
    const at = Math.round(u * last);
    const a = margin[at]!;
    cuts.set(at - 1, {
      end: new THREE.Vector2(a.x * 0.36, a.y - 0.07 - 0.05 * (1 - u)),
      back: at + 1,
    });
  }

  const right: THREE.Vector2[] = [];
  for (let i = 0; i <= last; i++) {
    const p = margin[i]!;
    right.push(p);
    const cut = cuts.get(i);
    if (cut) {
      right.push(cut.end);
      i = cut.back - 1;
    }
  }

  const shape = new THREE.Shape();
  shape.moveTo(right[0]!.x, right[0]!.y);
  for (const p of right.slice(1)) shape.lineTo(p.x, p.y);
  // Down the left-hand side, mirrored: the same points in reverse.
  for (let i = right.length - 2; i >= 0; i--) {
    const p = right[i]!;
    shape.lineTo(-p.x, p.y);
  }
  shape.closePath();

  if (holes && slits > 1) {
    const ends = [...cuts.values()].map((c) => c.end);
    for (let k = 0; k + 1 < ends.length; k++) {
      const y = (ends[k]!.y + ends[k + 1]!.y) / 2;
      const x = Math.min(0.095, Math.abs(ends[k]!.x) * 0.55);
      for (const side of [1, -1]) {
        const hole = new THREE.Path();
        hole.absellipse(side * x, y, 0.017, 0.034, 0, Math.PI * 2, false, side * 0.45);
        shape.holes.push(hole);
      }
    }
  }
  return shape;
}

interface LeafModel {
  blade: THREE.BufferGeometry;
  midrib: THREE.BufferGeometry;
}

/**
 * The blade as a real surface: subdivided so it can bend, cupped across the
 * midrib, drooping toward the tip, and shaded lighter along the midrib.
 */
function leafModel(options: LeafShapeOptions): LeafModel {
  // Eight segments per curve: the holes are ellipses and need them.
  const flat = new THREE.ShapeGeometry(leafShape(options), 8);
  const fine = new TessellateModifier(0.045, 8).modify(flat);
  flat.dispose();
  fine.deleteAttribute("uv");
  fine.deleteAttribute("normal");
  const blade = mergeVertices(fine, 1e-4);
  fine.dispose();

  const bend = (x: number, y: number) => 0.34 * x * x - 0.2 * y * y + 0.05 * x * y;
  const position = blade.getAttribute("position") as THREE.BufferAttribute;
  const colors = new Float32Array(position.count * 3);
  const vein = new THREE.Color(0xbfe3a0);
  const leaf = new THREE.Color(0xffffff);
  const c = new THREE.Color();
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i);
    const y = position.getY(i);
    position.setZ(i, bend(x, y));
    const t = THREE.MathUtils.smoothstep(Math.abs(x), 0.004, 0.07);
    c.copy(vein).lerp(leaf, t).multiplyScalar(0.86 + 0.14 * y);
    colors.set([c.r, c.g, c.b], i * 3);
  }
  blade.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  blade.computeVertexNormals();

  const spine = new THREE.CatmullRomCurve3(
    [0.02, 0.25, 0.5, 0.75, 0.96].map((y) => new THREE.Vector3(0, y, bend(0, y) + 0.006)),
  );
  const midrib = new THREE.TubeGeometry(spine, 24, 0.009, 5, false);
  return { blade, midrib };
}

// ---------------------------------------------------------------- the scene

interface Leaf {
  wobble: THREE.Object3D;
  blade: THREE.Mesh;
  phase: number;
  /** A damped spring, pushed by the pointer and by clicks. */
  spring: { x: number; v: number };
}

interface Drifter {
  mesh: THREE.Object3D;
  speed: number;
  spin: THREE.Vector3;
  depth: number;
  phase: number;
}

export function mountMonstera(host: HTMLElement, options: MonsteraOptions): () => void {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.95;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.domElement.style.display = "block";
  renderer.domElement.style.width = "100%";
  renderer.domElement.style.height = "100%";
  // Fades in once drawn, rather than popping in when the chunk arrives.
  renderer.domElement.style.opacity = "0";
  renderer.domElement.style.transition = "opacity 700ms ease";
  host.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  // A soft studio reflected in the glossy leaves and the glazed pot.
  const pmrem = new THREE.PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  const environment = pmrem.fromScene(room, 0.04);
  room.dispose();
  scene.environment = environment.texture;
  scene.environmentIntensity = 0.32;

  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 50);
  camera.position.set(0, 1.75, 5);
  camera.lookAt(0, 1.22, 0);

  // Light: a soft sky, a warm key that casts the shadow, a cool rim.
  scene.add(new THREE.HemisphereLight(0xffffff, 0xd9e8d2, 0.75));
  const key = new THREE.DirectionalLight(0xfff4e6, 1.6);
  key.position.set(2.6, 4.2, 3.2);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.camera.left = -2.2;
  key.shadow.camera.right = 2.2;
  key.shadow.camera.top = 3;
  key.shadow.camera.bottom = -1;
  key.shadow.radius = 5;
  key.shadow.bias = -0.0006;
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xd5ecff, 0.7);
  rim.position.set(-2.4, 2.4, -3);
  scene.add(rim);

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(8, 8),
    new THREE.ShadowMaterial({ opacity: 0.13 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  const plant = new THREE.Group();
  scene.add(plant);

  // The pot: a turned profile, Plenova pink, with a rolled rim.
  const profile = [
    [0, 0],
    [0.46, 0],
    [0.5, 0.03],
    [0.6, 0.6],
    [0.66, 0.62],
    [0.68, 0.79],
    [0.62, 0.8],
    [0.59, 0.72],
    [0.0, 0.72],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  const pot = new THREE.Mesh(
    new THREE.LatheGeometry(profile, 64),
    new THREE.MeshStandardMaterial({ color: BRAND_PINK, roughness: 0.62, metalness: 0 }),
  );
  pot.castShadow = true;
  pot.receiveShadow = true;
  plant.add(pot);
  const soil = new THREE.Mesh(
    new THREE.CircleGeometry(0.585, 48),
    new THREE.MeshStandardMaterial({ color: 0x4a3526, roughness: 1 }),
  );
  soil.rotation.x = -Math.PI / 2;
  soil.position.y = 0.735;
  soil.receiveShadow = true;
  plant.add(soil);

  const models = [
    leafModel({ slits: 5, holes: true }),
    leafModel({ slits: 4, holes: true }),
    leafModel({ slits: 3, holes: false }),
  ];
  const stemMaterial = new THREE.MeshStandardMaterial({ color: 0x4f8f4a, roughness: 0.55 });
  const midribMaterial = new THREE.MeshStandardMaterial({ color: 0xc8e9a6, roughness: 0.5 });

  const leaves: Leaf[] = [];
  const SPECS = [
    { turn: 0.2, height: 1.0, reach: 0.5, rise: -0.28, size: 0.86, model: 0, tint: 0x2f7442 },
    { turn: 2.6, height: 1.12, reach: 0.46, rise: -0.2, size: 0.9, model: 0, tint: 0x2b6b3d },
    { turn: 4.4, height: 1.28, reach: 0.44, rise: -0.1, size: 0.84, model: 0, tint: 0x33804a },
    { turn: 1.3, height: 1.5, reach: 0.4, rise: 0.02, size: 0.78, model: 1, tint: 0x2e7545 },
    { turn: 3.5, height: 1.7, reach: 0.34, rise: 0.12, size: 0.7, model: 1, tint: 0x3a8a4d },
    { turn: 5.5, height: 1.86, reach: 0.28, rise: 0.22, size: 0.6, model: 1, tint: 0x43955a },
    { turn: 0.8, height: 2.05, reach: 0.18, rise: 0.42, size: 0.46, model: 2, tint: 0x62b463 },
  ];
  const toViewer = new THREE.Vector3(0, 0, 1);
  for (const [i, spec] of SPECS.entries()) {
    const out = new THREE.Vector3(Math.cos(spec.turn), 0, Math.sin(spec.turn));
    const attach = out.clone().multiplyScalar(spec.reach).setY(spec.height);

    // The petiole rises from the soil and arcs out to the blade.
    const base = out.clone().multiplyScalar(0.05).setY(0.74);
    const stemCurve = new THREE.CatmullRomCurve3([
      base,
      out.clone().multiplyScalar(0.08).setY(0.74 + (spec.height - 0.74) * 0.45),
      out.clone().multiplyScalar(spec.reach * 0.7).setY(spec.height + 0.06),
      attach,
    ]);
    const stem = new THREE.Mesh(new THREE.TubeGeometry(stemCurve, 28, 0.02, 6, false), stemMaterial);
    stem.castShadow = true;
    plant.add(stem);

    // The blade's frame: pointing out and a little up or down, its face
    // turned half to the sky and half to the viewer - facing the sky alone,
    // the blades were seen edge-on from the front, as thin slivers.
    const along = out.clone().multiplyScalar(Math.cos(spec.rise)).setY(Math.sin(spec.rise)).normalize();
    const facing = new THREE.Vector3(0, 0.62, 0).add(toViewer.clone().multiplyScalar(0.8)).add(out.clone().multiplyScalar(0.2));
    const face = facing.sub(along.clone().multiplyScalar(along.dot(facing))).normalize();
    const roll = Math.sin(i * 1.7) * 0.3;
    const side = new THREE.Vector3().crossVectors(along, face);
    face.multiplyScalar(Math.cos(roll)).add(side.clone().multiplyScalar(Math.sin(roll))).normalize();
    const right = new THREE.Vector3().crossVectors(along, face).normalize();

    const pivot = new THREE.Object3D();
    pivot.position.copy(attach);
    pivot.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(right, along, face));
    plant.add(pivot);

    const wobble = new THREE.Object3D();
    pivot.add(wobble);
    const model = models[spec.model]!;
    const blade = new THREE.Mesh(
      model.blade,
      new THREE.MeshStandardMaterial({
        color: spec.tint,
        vertexColors: true,
        side: THREE.DoubleSide,
        roughness: 0.5,
        metalness: 0,
      }),
    );
    blade.scale.setScalar(spec.size);
    blade.castShadow = true;
    blade.receiveShadow = true;
    const midrib = new THREE.Mesh(model.midrib, midribMaterial);
    midrib.scale.setScalar(spec.size);
    wobble.add(blade, midrib);

    leaves.push({ wobble, blade, phase: i * 1.37, spring: { x: 0, v: 0 } });
  }

  // Small leaves drifting up around the plant, at different depths.
  const drifters: Drifter[] = [];
  const drift = new THREE.Group();
  scene.add(drift);
  const small = models[2]!;
  for (let j = 0; j < options.floating; j++) {
    const angle = (j / Math.max(1, options.floating)) * Math.PI * 2 + 0.6;
    const depth = 0.6 + ((j * 0.37) % 1) * 0.9;
    const mesh = new THREE.Mesh(
      small.blade,
      new THREE.MeshStandardMaterial({
        color: [0x3f9152, 0x5bab5c, 0x2f7442, 0x7cc36c][j % 4],
        vertexColors: true,
        side: THREE.DoubleSide,
        roughness: 0.45,
      }),
    );
    mesh.scale.setScalar(0.24 + ((j * 0.53) % 1) * 0.16);
    mesh.position.set(Math.cos(angle) * 1.75 * depth, 0.2 + ((j * 0.61) % 1) * 2.6, Math.sin(angle) * 0.9 - 0.4);
    mesh.rotation.set(j, j * 2.1, j * 0.7);
    drift.add(mesh);
    drifters.push({
      mesh,
      speed: 0.07 + ((j * 0.29) % 1) * 0.08,
      spin: new THREE.Vector3(0.3 + (j % 3) * 0.2, 0.5, 0.2 + (j % 2) * 0.3),
      depth,
      phase: j * 1.9,
    });
  }

  // ------------------------------------------------------------ interaction

  const pointer = { x: 0, y: 0, lastX: 0, lastY: 0, lastT: 0, inside: false, ndc: new THREE.Vector2() };
  const follow = { x: 0, y: 0 };
  let windTarget = 0;
  let wind = 0;
  let hovered: Leaf | null = null;
  const raycaster = new THREE.Raycaster();

  const onPointerMove = (event: PointerEvent) => {
    const rect = host.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    pointer.x = THREE.MathUtils.clamp((event.clientX - cx) / (window.innerWidth / 2), -1, 1);
    pointer.y = THREE.MathUtils.clamp((event.clientY - cy) / (window.innerHeight / 2), -1, 1);

    const now = performance.now();
    const dt = Math.max(1, now - pointer.lastT);
    const speed = Math.hypot(event.clientX - pointer.lastX, event.clientY - pointer.lastY) / dt;
    pointer.lastX = event.clientX;
    pointer.lastY = event.clientY;
    pointer.lastT = now;
    windTarget = Math.min(1, windTarget + speed * 0.12);

    pointer.inside =
      event.clientX >= rect.left &&
      event.clientX <= rect.right &&
      event.clientY >= rect.top &&
      event.clientY <= rect.bottom;
    if (pointer.inside) {
      pointer.ndc.set(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1,
      );
    }
  };

  const onClick = (event: MouseEvent) => {
    const rect = host.getBoundingClientRect();
    if (
      event.clientX < rect.left ||
      event.clientX > rect.right ||
      event.clientY < rect.top ||
      event.clientY > rect.bottom
    ) {
      return;
    }
    for (const leaf of leaves) leaf.spring.v += 3.2 + Math.random();
    windTarget = 1;
  };

  // ------------------------------------------------------------------ loop

  const resize = () => {
    const width = Math.max(1, host.clientWidth);
    const height = Math.max(1, host.clientHeight);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    // Narrow boxes pull back, so the plant always fits.
    camera.position.z = 5 * Math.max(1, 1.1 / camera.aspect);
    camera.lookAt(0, 1.22, 0);
    camera.updateProjectionMatrix();
    if (options.reducedMotion) renderer.render(scene, camera);
  };
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(host);
  resize();

  let frame = 0;
  let running = false;
  let visible = true;
  let last = performance.now();
  const clock = { t: 0 };

  const step = (now: number) => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    clock.t += dt;
    const t = clock.t;

    const ease = 1 - Math.exp(-dt * 3.5);
    follow.x += (pointer.x - follow.x) * ease;
    follow.y += (pointer.y - follow.y) * ease;
    plant.rotation.y = Math.sin(t * 0.25) * 0.12 + follow.x * 0.55;
    plant.rotation.x = follow.y * 0.1;

    windTarget *= Math.exp(-dt * 1.6);
    wind += (windTarget - wind) * (1 - Math.exp(-dt * 4));

    // The leaf under the pointer ruffles once each time it is reached.
    if (pointer.inside) {
      raycaster.setFromCamera(pointer.ndc, camera);
      const hit = raycaster.intersectObjects(
        leaves.map((l) => l.blade),
        false,
      )[0];
      const leaf = hit ? leaves.find((l) => l.blade === hit.object) ?? null : null;
      if (leaf && leaf !== hovered) leaf.spring.v += 2.4;
      hovered = leaf;
      renderer.domElement.style.cursor = leaf ? "pointer" : "";
    } else if (hovered) {
      hovered = null;
      renderer.domElement.style.cursor = "";
    }

    for (const leaf of leaves) {
      const s = leaf.spring;
      s.v += (-38 * s.x - 5.5 * s.v) * dt;
      s.x += s.v * dt;
      const amp = 0.022 + wind * 0.11;
      leaf.wobble.rotation.x = Math.sin(t * 1.15 + leaf.phase) * amp + s.x * 0.12;
      leaf.wobble.rotation.z = Math.cos(t * 0.85 + leaf.phase * 1.3) * amp * 0.7 + s.x * 0.05;
    }

    for (const d of drifters) {
      d.mesh.position.y += d.speed * dt;
      if (d.mesh.position.y > 3.1) d.mesh.position.y = -0.1;
      d.mesh.position.x += Math.sin(t * 0.6 + d.phase) * 0.04 * dt;
      d.mesh.rotation.x += d.spin.x * dt;
      d.mesh.rotation.y += d.spin.y * dt;
      d.mesh.rotation.z += d.spin.z * dt * (0.5 + wind);
    }
    // The drifting leaves shift against the plant, the nearer ones more.
    drift.position.x = -follow.x * 0.35;
    drift.position.y = follow.y * 0.2;

    renderer.render(scene, camera);
    frame = requestAnimationFrame(step);
  };

  const start = () => {
    if (running || options.reducedMotion || !visible || document.hidden) return;
    running = true;
    last = performance.now();
    frame = requestAnimationFrame(step);
  };
  const stop = () => {
    running = false;
    cancelAnimationFrame(frame);
  };

  // Only while it can be seen: off screen or in a background tab it sleeps.
  const intersection = new IntersectionObserver((entries) => {
    visible = entries.some((e) => e.isIntersecting);
    if (visible) start();
    else stop();
  });
  intersection.observe(host);
  const onVisibility = () => (document.hidden ? stop() : start());
  document.addEventListener("visibilitychange", onVisibility);

  if (!options.reducedMotion) {
    window.addEventListener("pointermove", onPointerMove, { passive: true });
    window.addEventListener("click", onClick);
  }
  renderer.render(scene, camera);
  requestAnimationFrame(() => {
    renderer.domElement.style.opacity = "1";
  });
  start();

  return () => {
    stop();
    resizeObserver.disconnect();
    intersection.disconnect();
    document.removeEventListener("visibilitychange", onVisibility);
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("click", onClick);
    scene.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
      const material = mesh.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(material)) material.forEach((m) => m.dispose());
      else material?.dispose();
    });
    environment.dispose();
    pmrem.dispose();
    renderer.dispose();
    // Browsers keep only a handful of WebGL contexts; give this one back now
    // rather than whenever the collector gets to it.
    renderer.forceContextLoss();
    renderer.domElement.remove();
  };
}
