/**
 * shockwaves.js
 * ---------------------------------------------------------------------------
 * The most damaging events in the current filters, marked on the map with a
 * light pillar (height = log of NOAA-reported damage) and an expanding
 * hexagonal shockwave ring. Pillars are coloured by peril.
 */

import * as THREE from "three";
import { MAP, PERILS, SHOCKWAVES } from "../config.js";

export function createShockwaves(scene, events) {
  const group = new THREE.Group();
  scene.add(group);
  const markers = Array.from({ length: SHOCKWAVES.count }, (_, k) => {
    const pillar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.7, 1.6, 1, 10, 1, true),
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
    );
    pillar.geometry.translate(0, 0.5, 0);
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.85, 1, 6),
      new THREE.MeshBasicMaterial({ transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
    );
    ring.rotation.x = -Math.PI / 2;
    group.add(pillar, ring);
    return { pillar, ring, phase: k / SHOCKWAVES.count, active: false };
  });

  /** Place markers on the given highlight events ({index, damage}). */
  function setEvents(highlights) {
    const { x, y, onMap, peril } = events.columns;
    const maxLog = highlights.length ? Math.log10(highlights[0].damage) : 1;
    markers.forEach((marker, k) => {
      const item = highlights[k];
      marker.active = !!item && onMap[item.index] === 1;
      marker.pillar.visible = marker.ring.visible = marker.active;
      if (!marker.active) return;
      const sx = x[item.index] - MAP.width / 2, sz = y[item.index] - MAP.height / 2;
      const color = new THREE.Color(PERILS[peril[item.index]].color);
      const height = SHOCKWAVES.maxPillar * Math.max(0.25, Math.log10(item.damage) / maxLog) ** 3;
      marker.pillar.position.set(sx, 0, sz);
      marker.pillar.scale.set(1, height, 1);
      marker.pillar.material.color = color;
      marker.ring.position.set(sx, 0.4, sz);
      marker.ring.material.color = color;
    });
  }

  /** Animate rings outward and fade them, each with its own phase. */
  function update(time) {
    markers.forEach((marker) => {
      if (!marker.active) return;
      const t = (time / SHOCKWAVES.periodSeconds + marker.phase) % 1;
      const radius = 2 + t * SHOCKWAVES.maxRadius;
      marker.ring.scale.set(radius, radius, radius);
      marker.ring.material.opacity = (1 - t) * 0.9;
    });
  }

  return { setEvents, update, group };
}
