/**
 * texasScene.js
 * ---------------------------------------------------------------------------
 * The 3D stage: Texas's 254 counties as extruded prisms on a dark floor.
 *   height = one lens metric (e.g. significant storm reports per year)
 *   colour = another lens metric (e.g. homeowners nonrenewals per 1,000)
 * so one picture shows where two lenses agree or disagree.
 *
 * Layers on top: storm lights (every NOAA report on its county's roof),
 * damage pillars with shockwaves, the TWIA coastal outline, and a radar sweep.
 */

import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { AUTO_ROTATE_SPEED, MAP, SCENE, VIEW_MODES } from "../config.js";
import { toScene } from "./geo.js";
import { createEventParticles } from "./eventParticles.js";
import { createShockwaves } from "./shockwaves.js";
import { createRadarSweep } from "./radarSweep.js";


export function createTexasScene(container, data, { onHover, onSelect }) {
  const { countyList, projection, countyBorders, texas, events } = data;

  /* ---------- renderer, camera, controls, glow */
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  container.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(SCENE.background);
  scene.fog = new THREE.Fog(SCENE.background, 1100, 2200);
  const camera = new THREE.PerspectiveCamera(SCENE.camera.fov, 1, 1, 5000);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.maxPolarAngle = Math.PI * 0.47;
  controls.minDistance = 120;
  controls.maxDistance = 1800;

  scene.add(new THREE.AmbientLight(0xffffff, 0.5));
  const keyLight = new THREE.DirectionalLight(0xffffff, 1.3);
  keyLight.position.set(-400, 700, 300);
  scene.add(keyLight);
  const rimLight = new THREE.DirectionalLight(0x2dd4bf, 0.35);
  rimLight.position.set(500, 200, -500);
  scene.add(rimLight);

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), SCENE.bloom.strength, SCENE.bloom.radius, SCENE.bloom.threshold);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  const grid = new THREE.GridHelper(1600, 64, SCENE.gridColor, SCENE.gridColor);
  grid.position.y = -0.4;
  scene.add(grid);

  /* ---------- county prisms: unit-height extrusions scaled in y */
  const prismGroup = new THREE.Group();
  scene.add(prismGroup);
  const prisms = countyList.map((county) => {
    const shapes = featureToShapes(county.feature, projection);
    const geometry = new THREE.ExtrudeGeometry(shapes, { depth: 1, bevelEnabled: false });
    geometry.rotateX(-Math.PI / 2); // shape lies in x/-z, extrusion becomes +y (0..1)
    const material = new THREE.MeshStandardMaterial({ color: 0x334, roughness: 0.55, metalness: 0.15, emissive: 0x000000 });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.userData.countyIndex = county.index;
    mesh.scale.y = 0.001;
    prismGroup.add(mesh);
    // glowing outline that rides on the prism roof
    const roof = new THREE.LineSegments(new THREE.EdgesGeometry(geometry, 30),
      new THREE.LineBasicMaterial({ color: SCENE.outlineColor, transparent: true, opacity: 0.35 }));
    mesh.add(roof);
    return { mesh, roof, current: 0.001, target: SCENE.minPrismHeight, baseColor: new THREE.Color(), dim: false };
  });

  // flat Texas outline on the floor (always visible, also in "storm lights" mode)
  const floorLines = new THREE.Group();
  addGeoLines(floorLines, texas, projection, SCENE.outlineColor, 0.9, 0.3);
  addMultiLine(floorLines, countyBorders, projection, SCENE.outlineColor, 0.18, 0.25);
  scene.add(floorLines);

  /** Set target heights (scene units) and colours, one per county index. */
  function setPrisms(heights, colors) {
    prisms.forEach((prism, i) => {
      prism.target = heights[i];
      prism.baseColor.set(colors[i]);
      applyColor(prism);
    });
  }
  function applyColor(prism) {
    const color = prism.dim ? prism.baseColor.clone().lerp(new THREE.Color(SCENE.background), SCENE.dimAmount) : prism.baseColor;
    prism.mesh.material.color.copy(color);
    prism.mesh.material.emissive.copy(color).multiplyScalar(prism.dim ? 0 : 0.18);
    prism.roof.material.opacity = prism.dim ? 0.08 : 0.35;
  }
  /** Dim every county outside the selection (null = none dimmed). */
  function setFocus(isInFocus) {
    prisms.forEach((prism, i) => { prism.dim = !!isInFocus && !isInFocus(i); applyColor(prism); });
  }

  /* ---------- selected-county outline and TWIA outline */
  const highlightGroup = new THREE.Group();
  scene.add(highlightGroup);
  function highlightCounties(indices, color = SCENE.selectedColor) {
    highlightGroup.clear();
    for (const i of indices) {
      const lines = new THREE.Group();
      addGeoLines(lines, countyList[i].feature, projection, color, 1, 0);
      lines.userData.countyIndex = i;
      highlightGroup.add(lines);
    }
  }
  // TWIA outline: one group per coastal county so it can ride on that county's roof
  const twiaGroup = new THREE.Group();
  data.countyList.filter((c) => data.twia.has(c.fips)).forEach((c) => {
    const lines = new THREE.Group();
    addGeoLines(lines, c.feature, projection, SCENE.twiaColor, 0.95, 0);
    lines.userData.countyIndex = c.index;
    twiaGroup.add(lines);
  });
  twiaGroup.visible = false;
  scene.add(twiaGroup);

  /* ---------- storm lights, damage pillars, sweep */
  const particles = createEventParticles(scene, events);
  const shockwaves = createShockwaves(scene, events);
  const sweep = createRadarSweep(scene);
  const roofHeight = (countyIndex) => (countyIndex >= 0 && prismGroup.visible ? prisms[countyIndex].current : 0);

  let viewMode = "both";
  function setViewMode(key) {
    viewMode = key;
    prismGroup.visible = VIEW_MODES[key].prisms;
    particles.object.visible = VIEW_MODES[key].particles;
  }

  /* ---------- picking */
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  let pointerDown = null;
  function pick(event) {
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    if (prismGroup.visible) {
      const hit = raycaster.intersectObjects(prisms.map((p) => p.mesh), false)[0];
      return hit ? hit.object.userData.countyIndex : null;
    }
    // storm-lights mode: find the county under the floor point
    const point = new THREE.Vector3();
    if (!raycaster.ray.intersectPlane(floorPlane, point)) return null;
    const lonLat = projection.invert([point.x + MAP.width / 2, point.z + MAP.height / 2]);
    const found = lonLat && countyList.find((c) => d3.geoContains(c.feature, lonLat));
    return found ? found.index : null;
  }
  renderer.domElement.addEventListener("pointermove", (event) => onHover(pick(event), event));
  renderer.domElement.addEventListener("pointerleave", () => onHover(null));
  renderer.domElement.addEventListener("pointerdown", (event) => { pointerDown = [event.clientX, event.clientY]; });
  renderer.domElement.addEventListener("pointerup", (event) => {
    if (!pointerDown || Math.hypot(event.clientX - pointerDown[0], event.clientY - pointerDown[1]) > 4) return;
    onSelect(pick(event));
  });

  /* ---------- camera: fit, fly-to, auto-orbit */
  let fly = null; // {fromPos, toPos, fromTarget, toTarget, t}
  function viewFor(centerX = 0, centerZ = 0, spanX = MAP.width, spanZ = MAP.height, tilt = SCENE.camera.tilt) {
    const vHalf = THREE.MathUtils.degToRad(camera.fov / 2);
    const hHalf = Math.atan(Math.tan(vHalf) * camera.aspect);
    const distance = Math.max((spanX / 2) / Math.tan(hHalf), (spanZ / 2) / Math.tan(vHalf)) * SCENE.camera.margin;
    const t = THREE.MathUtils.degToRad(tilt);
    return { position: new THREE.Vector3(centerX, distance * Math.sin(t), centerZ + distance * Math.cos(t)), target: new THREE.Vector3(centerX, 0, centerZ) };
  }
  function flyTo(view, seconds = 1.6) {
    fly = { fromPos: camera.position.clone(), toPos: view.position, fromTarget: controls.target.clone(), toTarget: view.target, t: 0, seconds };
  }
  /** Fly to a set of counties (or all of Texas). */
  function frameCounties(indices, tilt) {
    if (!indices || !indices.length) { flyTo(viewFor(0, 0, MAP.width, MAP.height, tilt)); return; }
    const pts = indices.map((i) => countyList[i].feature).flatMap((f) => d3.geoBounds(f)).map((p) => projection(p)).filter(Boolean);
    const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
    const [cx, cz] = toScene((d3.min(xs) + d3.max(xs)) / 2, (d3.min(ys) + d3.max(ys)) / 2);
    const span = Math.max(d3.max(xs) - d3.min(xs), d3.max(ys) - d3.min(ys), 220) * 1.6;
    flyTo(viewFor(cx, cz, span, span, tilt ?? 50));
  }
  let onAutoRotateStop = null;
  function setAutoRotate(on) { controls.autoRotate = on; controls.autoRotateSpeed = AUTO_ROTATE_SPEED; }
  controls.addEventListener("start", () => { fly = null; if (controls.autoRotate) { controls.autoRotate = false; onAutoRotateStop?.(); } });

  let fitted = false;
  function resize() {
    const { clientWidth: w, clientHeight: h } = container;
    if (!w || !h) return;
    renderer.setSize(w, h); composer.setSize(w, h); bloom.setSize(w, h);
    camera.aspect = w / h; camera.updateProjectionMatrix();
    if (!fitted) { const v = viewFor(); camera.position.copy(v.position); controls.target.copy(v.target); fitted = true; }
  }
  new ResizeObserver(resize).observe(container);
  resize();

  /* ---------- render loop */
  const clock = new THREE.Clock();
  function animate() {
    const dt = clock.getDelta(), time = clock.elapsedTime;
    let moved = false;
    for (const prism of prisms) {
      const diff = prism.target - prism.current;
      if (Math.abs(diff) > 0.02) { prism.current += diff * SCENE.heightEasing; moved = true; } else prism.current = prism.target;
      prism.mesh.scale.y = Math.max(prism.current, 0.001);
    }
    highlightGroup.children.forEach((g) => { g.position.y = roofHeight(g.userData.countyIndex) + 0.4; });
    if (twiaGroup.visible) twiaGroup.children.forEach((g) => { g.position.y = roofHeight(g.userData.countyIndex) + 0.6; });
    if (moved) particles.setHeights(roofHeight);
    particles.update(time);
    shockwaves.update(time, roofHeight);
    sweep.update(time);
    if (fly) {
      fly.t = Math.min(1, fly.t + dt / fly.seconds);
      const k = d3.easeCubicInOut(fly.t);
      camera.position.lerpVectors(fly.fromPos, fly.toPos, k);
      controls.target.lerpVectors(fly.fromTarget, fly.toTarget, k);
      if (fly.t >= 1) fly = null;
    }
    controls.update();
    composer.render();
    requestAnimationFrame(animate);
  }
  particles.setHeights(roofHeight);
  animate();

  return {
    setPrisms, setFocus, highlightCounties, setViewMode, setAutoRotate, frameCounties,
    setVisibility: particles.setVisibility, setHighlights: shockwaves.setEvents,
    setTwia: (on) => { twiaGroup.visible = on; },
    resetCamera: () => frameCounties(null),
    onAutoRotateStop: (callback) => { onAutoRotateStop = callback; },
    focusEvent: (index) => {
      if (index == null) return;
      const [x, z] = toScene(events.columns.x[index], events.columns.y[index]);
      flyTo(viewFor(x, z, 260, 260, 48), 1.4);
    },
  };
}

/* ---------- geometry helpers ---------- */

/** GeoJSON (Multi)Polygon -> THREE.Shape[] in scene coordinates. */
function featureToShapes(feature, projection) {
  const polygons = feature.geometry.type === "Polygon" ? [feature.geometry.coordinates] : feature.geometry.coordinates;
  const shapes = [];
  for (const polygon of polygons) {
    const [outer, ...holes] = polygon.map((ring) => ring.map((p) => toScene(...projection(p))));
    // shape y = -z so that rotateX(-90°) maps it back onto the map's z axis
    const shape = new THREE.Shape(outer.map(([x, z]) => new THREE.Vector2(x, -z)));
    holes.forEach((hole) => shape.holes.push(new THREE.Path(hole.map(([x, z]) => new THREE.Vector2(x, -z)))));
    shapes.push(shape);
  }
  return shapes;
}

function lineFromPoints(points, color, opacity, y) {
  const material = new THREE.LineBasicMaterial({ color, transparent: true, opacity });
  return new THREE.Line(new THREE.BufferGeometry().setFromPoints(points.map(([x, z]) => new THREE.Vector3(x, y, z))), material);
}
/** Outline of a GeoJSON feature at height y. */
function addGeoLines(group, feature, projection, color, opacity, y) {
  const geom = feature.geometry || feature;
  const polygons = geom.type === "Polygon" ? [geom.coordinates] : geom.coordinates;
  for (const polygon of polygons) for (const ring of polygon) {
    group.add(lineFromPoints(ring.map((p) => toScene(...projection(p))), color, opacity, y));
  }
}
/** A topojson MultiLineString (lon/lat) at height y. */
function addMultiLine(group, multiLine, projection, color, opacity, y) {
  for (const line of multiLine.coordinates) group.add(lineFromPoints(line.map((p) => toScene(...projection(p))), color, opacity, y));
}
