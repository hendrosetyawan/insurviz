/**
 * eventParticles.js
 * ---------------------------------------------------------------------------
 * The "light map": every NOAA event as a glowing point on the map floor,
 * coloured by peril. Significant and damaging events are drawn larger.
 * Points twinkle gently; filtered-out events fade to nothing and events
 * outside the selection dim, so the light map follows every filter.
 */

import * as THREE from "three";
import { MAP, PARTICLES, PERILS, SIGNIFICANT } from "../config.js";

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
    float twinkle = 0.7 + 0.3 * sin(uTime * 1.8 + aSeed * 6.2831);
    vAlpha = aVisible * twinkle;
    vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aVisible > 0.01 ? uBaseSize * aSize * uPixelRatio * (420.0 / -viewPosition.z) : 0.0;
    gl_Position = projectionMatrix * viewPosition;
  }
`;

const fragmentShader = /* glsl */ `
  uniform float uOpacity;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    float distanceFromCentre = length(gl_PointCoord - 0.5);
    if (distanceFromCentre > 0.5) discard;
    float glow = pow(1.0 - distanceFromCentre * 2.0, 1.6);
    gl_FragColor = vec4(vColor * 1.5, glow * vAlpha * uOpacity);
  }
`;

/**
 * @param {THREE.Scene} scene
 * @param {Object} events - packed events with projected x/y (map pixels)
 * @returns {{setVisibility: Function, update: Function, object: THREE.Points}}
 */
export function createEventParticles(scene, events) {
  const { x, y, onMap, peril, mag, damage } = events.columns;
  const count = events.count;
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  const seeds = new Float32Array(count);
  const visible = new Float32Array(count);
  const perilColors = PERILS.map((p) => new THREE.Color(p.color));

  for (let i = 0; i < count; i++) {
    positions[i * 3] = onMap[i] ? x[i] - MAP.width / 2 : 0;
    positions[i * 3 + 1] = PARTICLES.height;
    positions[i * 3 + 2] = onMap[i] ? y[i] - MAP.height / 2 : 0;
    const color = perilColors[peril[i]];
    colors.set([color.r, color.g, color.b], i * 3);
    const significant = peril[i] === 2
      || (peril[i] === 0 && mag[i] >= SIGNIFICANT.hailInches * 100)
      || (peril[i] === 1 && mag[i] >= SIGNIFICANT.windKnots);
    // bigger points for significant events and (log) for reported damage
    const damageBoost = damage[i] > 0 ? Math.log10(damage[i]) / 8 : 0;
    sizes[i] = (significant ? PARTICLES.significantSize : 1) + damageBoost;
    seeds[i] = Math.random();
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("aColor", new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));
  geometry.setAttribute("aSeed", new THREE.BufferAttribute(seeds, 1));
  const visibleAttribute = new THREE.BufferAttribute(visible, 1);
  visibleAttribute.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute("aVisible", visibleAttribute);

  const material = new THREE.ShaderMaterial({
    vertexShader, fragmentShader,
    uniforms: {
      uTime: { value: 0 },
      uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
      uBaseSize: { value: PARTICLES.baseSize },
      uOpacity: { value: PARTICLES.opacity },
    },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  scene.add(points);

  return {
    object: points,
    /** Copy the per-event visibility computed by aggregate(). */
    setVisibility(values) { visible.set(values); visibleAttribute.needsUpdate = true; },
    update(time) { material.uniforms.uTime.value = time; },
  };
}
