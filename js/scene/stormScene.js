/**
 * stormScene.js
 * ---------------------------------------------------------------------------
 * The 3D view (R1 + R2 in one picture): the US as a dark plane with glowing
 * state outlines, and one hexagonal column per map cell. Column height encodes
 * the chosen metric on a square-root scale. Each column is split into peril
 * segments sorted by share, largest on top, so the cap colour seen from above
 * is the cell's dominant peril and the sides show the full mix.
 *
 * On top of the columns: the event light map (eventParticles.js), damage
 * shockwaves (shockwaves.js) and a decorative radar sweep (radarSweep.js).
 *
 * Built with Three.js; scales and map geometry come from D3 / topojson.
 */

import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { AUTO_ROTATE_SPEED, HEX, MAP, PERILS, SCENE, VIEW_MODES } from "../config.js";
import { createEventParticles } from "./eventParticles.js";
import { createShockwaves } from "./shockwaves.js";
import { createRadarSweep } from "./radarSweep.js";

const PERIL_COUNT = PERILS.length;

/** Map pixel (x, y) -> scene (x, z), centred on the map. */
const toScene = (x, y) => [x - MAP.width / 2, y - MAP.height / 2];

export function createStormScene(container, { states, bins, events, onHover, onSelect }) {
  /* ---------- renderer, camera, controls */
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(SCENE.background);
  scene.fog = new THREE.Fog(SCENE.background, 900, 1700);

  const camera = new THREE.PerspectiveCamera(SCENE.camera.fov, 1, 1, 4000);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.maxPolarAngle = Math.PI * 0.47;
  controls.minDistance = 160;
  controls.maxDistance = 1300;

  scene.add(new THREE.AmbientLight(0xffffff, 0.55));
  const keyLight = new THREE.DirectionalLight(0xffffff, 1.1);
  keyLight.position.set(-300, 600, 400);
  scene.add(keyLight);

  /* ---------- glow (bloom) */
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), SCENE.bloom.strength, SCENE.bloom.radius, SCENE.bloom.threshold);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  /* ---------- ground: faint grid + state outlines */
  const grid = new THREE.GridHelper(1400, 56, SCENE.gridColor, SCENE.gridColor);
  grid.position.y = -0.5;
  scene.add(grid);

  const outlineGroup = new THREE.Group();
  scene.add(outlineGroup);
  const stateMesh = topojson.mesh(states, states.objects.states, (a, b) => a !== b);
  const nationMesh = topojson.mesh(states, states.objects.nation);
  addLines(outlineGroup, stateMesh, SCENE.stateLineColor, SCENE.stateLineOpacity * 0.6);
  addLines(outlineGroup, nationMesh, SCENE.stateLineColor, SCENE.stateLineOpacity);

  let selectedOutline = null;
  /** Bright outline around one selected state (or none). */
  function highlightState(fips) {
    if (selectedOutline) { outlineGroup.remove(selectedOutline); selectedOutline = null; }
    if (fips == null) return;
    const geometry = states.objects.states.geometries.find((g) => +g.id === fips);
    if (!geometry) return;
    selectedOutline = new THREE.Group();
    addLines(selectedOutline, topojson.mesh(states, geometry), SCENE.selectedStateColor, 1, 1.2);
    outlineGroup.add(selectedOutline);
  }

  /* ---------- hexagon columns: one instanced mesh per peril (stacked) */
  const columnGeometry = new THREE.CylinderGeometry(HEX.radius * HEX.gap, HEX.radius * HEX.gap, 1, 6);
  columnGeometry.translate(0, 0.5, 0); // base sits on the ground
  const binCount = bins.centers.length;
  const perilColors = PERILS.map((peril) => new THREE.Color(peril.color));
  const dimmedColors = perilColors.map((color) => color.clone().lerp(new THREE.Color(SCENE.background), SCENE.dimAmount));
  const meshes = PERILS.map((peril, p) => {
    const material = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.45, metalness: 0.1 });
    const mesh = new THREE.InstancedMesh(columnGeometry, material, binCount);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    for (let b = 0; b < binCount; b++) mesh.setColorAt(b, perilColors[p]);
    mesh.frustumCulled = false;
    scene.add(mesh);
    return mesh;
  });

  /** Keep the columns in focus at full colour and dim the rest (null = all in focus). */
  function setFocusBins(isInFocus) {
    meshes.forEach((mesh, p) => {
      for (let b = 0; b < binCount; b++) {
        mesh.setColorAt(b, !isInFocus || isInFocus(b) ? perilColors[p] : dimmedColors[p]);
      }
      mesh.instanceColor.needsUpdate = true;
    });
  }

  // current (animated) and target segment heights, per bin and peril
  const currentHeights = new Float32Array(binCount * PERIL_COUNT);
  const targetHeights = new Float32Array(binCount * PERIL_COUNT);
  const centersScene = bins.centers.map((c) => toScene(c.x, c.y));

  /** Write every instance matrix from the current heights. */
  const matrix = new THREE.Matrix4();
  const scaleVec = new THREE.Vector3();
  const positionVec = new THREE.Vector3();
  const identityRotation = new THREE.Quaternion();
  const stackOrder = new Uint8Array(binCount * PERIL_COUNT); // per bin: perils from bottom to top
  function writeMatrices() {
    for (let b = 0; b < binCount; b++) {
      let base = 0;
      const [sx, sz] = centersScene[b];
      for (let k = 0; k < PERIL_COUNT; k++) {
        const p = stackOrder[b * PERIL_COUNT + k];
        const h = currentHeights[b * PERIL_COUNT + p];
        positionVec.set(sx, base, sz);
        // an empty segment is scaled to nothing, so its cap does not show on top
        if (h > 0.001) scaleVec.set(1, h, 1); else scaleVec.set(0, 0, 0);
        matrix.compose(positionVec, identityRotation, scaleVec);
        meshes[p].setMatrixAt(b, matrix);
        base += h;
      }
    }
    meshes.forEach((mesh) => { mesh.instanceMatrix.needsUpdate = true; mesh.computeBoundingSphere(); });
  }

  /**
   * New data: stacked heights from per-bin, per-peril values.
   * Total column height follows sqrt(total); each peril keeps its share.
   */
  function setValues(hexValues, hexMax) {
    const heightScale = d3.scaleSqrt().domain([0, hexMax || 1]).range([0, SCENE.maxColumnHeight]);
    for (let b = 0; b < binCount; b++) {
      const i = b * PERIL_COUNT;
      const total = hexValues[i] + hexValues[i + 1] + hexValues[i + 2];
      const totalHeight = total > 0 ? Math.max(heightScale(total), 0.6) : 0;
      for (let p = 0; p < PERIL_COUNT; p++) {
        targetHeights[i + p] = total > 0 ? (totalHeight * hexValues[i + p]) / total : 0;
      }
      // smallest share at the bottom, largest on top: the cap shows the dominant peril
      [0, 1, 2].sort((a, c) => hexValues[i + a] - hexValues[i + c])
        .forEach((peril, k) => { stackOrder[i + k] = peril; });
    }
  }

  /* ---------- light map, damage shockwaves, radar sweep */
  const particles = createEventParticles(scene, events);
  const shockwaves = createShockwaves(scene, events);
  const sweep = createRadarSweep(scene);

  /** Show columns, the light map, or both. */
  function setViewMode(modeKey) {
    const mode = VIEW_MODES[modeKey];
    meshes.forEach((mesh) => { mesh.visible = mode.columns; });
    particles.object.visible = mode.particles;
  }

  /** Slow automatic orbit, stopped as soon as the analyst drags. */
  function setAutoRotate(on) { controls.autoRotate = on; controls.autoRotateSpeed = AUTO_ROTATE_SPEED; }
  controls.addEventListener("start", () => { if (controls.autoRotate) { controls.autoRotate = false; onAutoRotateStop?.(); } });
  let onAutoRotateStop = null;

  /* ---------- selected-hex marker and focused-event beacon */
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(HEX.radius * 1.05, HEX.radius * 1.35, 6),
    new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide, transparent: true, opacity: 0.95 }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.rotation.z = Math.PI / 2;
  ring.visible = false;
  scene.add(ring);

  const beacon = new THREE.Mesh(
    new THREE.CylinderGeometry(0.8, 0.8, 260, 8),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 }),
  );
  beacon.visible = false;
  scene.add(beacon);

  function highlightHex(binId) {
    ring.visible = binId != null;
    if (binId == null) return;
    const [x, z] = centersScene[binId];
    ring.position.set(x, 0.3, z);
  }

  /** Show a vertical light at one event's map position (x, y in map pixels). */
  function showBeacon(point) {
    beacon.visible = !!point;
    if (!point) return;
    const [x, z] = toScene(point.x, point.y);
    beacon.position.set(x, 130, z);
    controls.target.set(x, 0, z);
  }

  /* ---------- picking: hover tooltip and click selection */
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  let pointerDown = null;

  function pick(event) {
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects(meshes, false);
    return hits.length ? hits[0].instanceId : null;
  }
  renderer.domElement.addEventListener("pointermove", (event) => onHover(pick(event), event));
  renderer.domElement.addEventListener("pointerleave", () => onHover(null));
  renderer.domElement.addEventListener("pointerdown", (event) => { pointerDown = [event.clientX, event.clientY]; });
  renderer.domElement.addEventListener("pointerup", (event) => {
    // treat as a click only if the mouse did not drag (dragging orbits the camera)
    if (!pointerDown || Math.hypot(event.clientX - pointerDown[0], event.clientY - pointerDown[1]) > 4) return;
    onSelect(pick(event));
  });

  /* ---------- sizing + render loop */
  /** Place the camera so the whole map fits the view, looking down at SCENE.camera.tilt degrees. */
  function fitCamera() {
    const verticalHalf = THREE.MathUtils.degToRad(camera.fov / 2);
    const horizontalHalf = Math.atan(Math.tan(verticalHalf) * camera.aspect);
    const fitWidth = (MAP.width / 2) * SCENE.camera.margin / Math.tan(horizontalHalf);
    const fitDepth = (MAP.height / 2) * SCENE.camera.margin / Math.tan(verticalHalf);
    const distance = Math.max(fitWidth, fitDepth);
    const tilt = THREE.MathUtils.degToRad(SCENE.camera.tilt);
    camera.position.set(0, distance * Math.sin(tilt), distance * Math.cos(tilt));
    controls.target.set(0, 0, 0);
  }

  let fitted = false;
  function resize() {
    const { clientWidth: w, clientHeight: h } = container;
    if (!w || !h) return;
    renderer.setSize(w, h);
    composer.setSize(w, h);
    bloom.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    if (!fitted) { fitCamera(); fitted = true; }
  }
  new ResizeObserver(resize).observe(container);
  resize();

  const clock = new THREE.Clock();
  function animate() {
    const time = clock.getElapsedTime();
    particles.update(time);
    shockwaves.update(time);
    sweep.update(time);
    // ease every segment towards its target height
    let moving = false;
    for (let i = 0; i < currentHeights.length; i++) {
      const diff = targetHeights[i] - currentHeights[i];
      if (Math.abs(diff) > 0.01) { currentHeights[i] += diff * SCENE.heightEasing; moving = true; }
      else currentHeights[i] = targetHeights[i];
    }
    if (moving) writeMatrices();
    controls.update();
    composer.render();
    requestAnimationFrame(animate);
  }
  writeMatrices();
  animate();

  return {
    setValues, setFocusBins, highlightHex, highlightState, showBeacon, resetCamera: fitCamera,
    setVisibility: particles.setVisibility, setHighlights: shockwaves.setEvents, setViewMode, setAutoRotate,
    onAutoRotateStop: (callback) => { onAutoRotateStop = callback; },
  };
}

/** Add a topojson MultiLineString (map pixel coordinates) as glowing lines. */
function addLines(group, multiLine, color, opacity, y = 0.6) {
  const material = new THREE.LineBasicMaterial({ color, transparent: true, opacity });
  for (const line of multiLine.coordinates) {
    const points = line.map(([x, z]) => new THREE.Vector3(...toSceneXYZ(x, z, y)));
    group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), material));
  }
}
function toSceneXYZ(x, y, height) {
  const [sx, sz] = toScene(x, y);
  return [sx, height, sz];
}
