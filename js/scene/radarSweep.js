/**
 * radarSweep.js
 * ---------------------------------------------------------------------------
 * Command-floor ambience: faint range rings and a rotating radar sweep over
 * the map floor. Purely decorative; it carries no data.
 */

import * as THREE from "three";
import { SWEEP } from "../config.js";

const fragmentShader = /* glsl */ `
  uniform float uTime;
  uniform vec3 uColor;
  varying vec2 vUv;
  void main() {
    vec2 p = vUv - 0.5;
    float radius = length(p) * 2.0;
    if (radius > 1.0) discard;
    float angle = atan(p.y, p.x);
    float sweep = mod(uTime * ${SWEEP.speed.toFixed(2)}, 6.28318);
    float behind = mod(sweep - angle + 6.28318, 6.28318);
    float trail = smoothstep(${SWEEP.trail.toFixed(2)}, 0.0, behind);
    float edgeFade = smoothstep(1.0, 0.6, radius);
    gl_FragColor = vec4(uColor, trail * edgeFade * ${SWEEP.opacity.toFixed(2)});
  }
`;
const vertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;

export function createRadarSweep(scene) {
  const group = new THREE.Group();
  const material = new THREE.ShaderMaterial({
    vertexShader, fragmentShader, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color(SWEEP.color) } },
  });
  const disc = new THREE.Mesh(new THREE.PlaneGeometry(SWEEP.radius * 2, SWEEP.radius * 2), material);
  disc.rotation.x = -Math.PI / 2;
  disc.position.y = 0.2;
  group.add(disc);

  // concentric range rings
  const ringMaterial = new THREE.LineBasicMaterial({ color: SWEEP.color, transparent: true, opacity: 0.12 });
  for (let r = SWEEP.radius / 4; r <= SWEEP.radius; r += SWEEP.radius / 4) {
    const points = d3.range(0, 129).map((k) => {
      const a = (k / 128) * Math.PI * 2;
      return new THREE.Vector3(Math.cos(a) * r, 0.25, Math.sin(a) * r);
    });
    group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), ringMaterial));
  }
  scene.add(group);
  return { group, update(time) { material.uniforms.uTime.value = time; } };
}
