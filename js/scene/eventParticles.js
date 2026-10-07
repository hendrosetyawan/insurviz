/**
 * eventParticles.js
 * ---------------------------------------------------------------------------
 * Storm lights: every NOAA report as a glowing point coloured by peril,
 * resting on the roof of its county's prism. Significant and damaging
 * reports glow larger. Filtered-out reports fade to nothing and reports
 * outside the selection dim.
 */

import * as THREE from "three";
import { PARTICLES, PERILS } from "../config.js";
import { isSignificant } from "../metrics.js";
import { toScene } from "./geo.js";

const vertexShader = /* glsl */ `
  attribute vec3 aColor;
  attribute float aSize;
  attribute float aSeed;
  attribute float aVisible;
  uniform float uTime;
  uniform float uPixelRatio;
  uniform float uBaseSize;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vColor = aColor;
    vAlpha = aVisible * (0.7 + 0.3 * sin(uTime * 1.8 + aSeed * 6.2831));
    vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aVisible > 0.01 ? uBaseSize * aSize * uPixelRatio * (520.0 / -viewPosition.z) : 0.0;
    gl_Position = projectionMatrix * viewPosition;
  }
`;
const fragmentShader = /* glsl */ `
  uniform float uOpacity;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    if (d > 0.5) discard;
    gl_FragColor = vec4(vColor * 1.5, pow(1.0 - d * 2.0, 1.6) * vAlpha * uOpacity);
  }
`;

export function createEventParticles(scene, events) {
  const { x, y, peril, mag, damage, countyIdx } = events.columns;
  const count = events.count;
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  const seeds = new Float32Array(count);
  const visible = new Float32Array(count);
  const perilColors = PERILS.map((p) => new THREE.Color(p.color));

  for (let i = 0; i < count; i++) {
    const [sx, sz] = Number.isFinite(x[i]) ? toScene(x[i], y[i]) : [0, 0];
    positions[i * 3] = sx; positions[i * 3 + 2] = sz;
    const color = perilColors[peril[i]];
    colors.set([color.r, color.g, color.b], i * 3);
    sizes[i] = (isSignificant(peril[i], mag[i]) ? PARTICLES.significantSize : 1) + (damage[i] > 0 ? Math.log10(damage[i]) / 8 : 0);
    seeds[i] = Math.random();
  }

  const geometry = new THREE.BufferGeometry();
  const positionAttribute = new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute("position", positionAttribute);
  geometry.setAttribute("aColor", new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));
  geometry.setAttribute("aSeed", new THREE.BufferAttribute(seeds, 1));
  const visibleAttribute = new THREE.BufferAttribute(visible, 1).setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute("aVisible", visibleAttribute);

  const material = new THREE.ShaderMaterial({
    vertexShader, fragmentShader, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: {
      uTime: { value: 0 }, uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
      uBaseSize: { value: PARTICLES.baseSize }, uOpacity: { value: PARTICLES.opacity },
    },
  });
  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  scene.add(points);

  return {
    object: points,
    setVisibility(values) { visible.set(values); visibleAttribute.needsUpdate = true; },
    /** Lift every report onto its county roof (roofHeight(countyIndex) -> scene units). */
    setHeights(roofHeight) {
      for (let i = 0; i < count; i++) positions[i * 3 + 1] = roofHeight(countyIdx[i]) + PARTICLES.lift;
      positionAttribute.needsUpdate = true;
    },
    update(time) { material.uniforms.uTime.value = time; },
  };
}
