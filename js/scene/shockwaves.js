/**
 * shockwaves.js
 * ---------------------------------------------------------------------------
 * The most damaging storm reports in the current filters, marked with a light
 * pillar (height grows with NOAA-reported damage) and an expanding hexagonal
 * shockwave ring, both standing on the county roof. Coloured by peril.
 */

import * as THREE from "three";
import { PERILS, SHOCKWAVES } from "../config.js";
import { toScene } from "./geo.js";

export function createShockwaves(scene, events) {
  const group = new THREE.Group();
  scene.add(group);
  const markers = Array.from({ length: SHOCKWAVES.count }, (_, k) => {
    const pillar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.7, 1.6, 1, 10, 1, true).translate(0, 0.5, 0),
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
    );
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.85, 1, 6),
      new THREE.MeshBasicMaterial({ transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
    );
    ring.rotation.x = -Math.PI / 2;
    group.add(pillar, ring);
    return { pillar, ring, phase: k / SHOCKWAVES.count, active: false, countyIndex: -1 };
  });

  function setEvents(highlights) {
    const { x, y, peril, countyIdx } = events.columns;
    const maxLog = highlights.length ? Math.log10(highlights[0].damage) : 1;
    markers.forEach((marker, k) => {
      const item = highlights[k];
      marker.active = !!item && Number.isFinite(x[item.index]);
      marker.pillar.visible = marker.ring.visible = marker.active;
      if (!marker.active) return;
      const [sx, sz] = toScene(x[item.index], y[item.index]);
      const color = new THREE.Color(PERILS[peril[item.index]].color);
      marker.countyIndex = countyIdx[item.index];
      marker.pillar.position.set(sx, 0, sz);
      marker.pillar.scale.y = SHOCKWAVES.maxPillar * Math.max(0.25, Math.log10(item.damage) / maxLog) ** 3;
      marker.pillar.material.color = color;
      marker.ring.position.set(sx, 0, sz);
      marker.ring.material.color = color;
    });
  }

  /** Grow and fade the rings; keep pillar and ring on the (animated) roof height. */
  function update(time, roofHeight) {
    markers.forEach((marker) => {
      if (!marker.active) return;
      const base = roofHeight(marker.countyIndex);
      marker.pillar.position.y = base;
      marker.ring.position.y = base + 0.5;
      const t = (time / SHOCKWAVES.periodSeconds + marker.phase) % 1;
      const r = 2 + t * SHOCKWAVES.maxRadius;
      marker.ring.scale.set(r, r, r);
      marker.ring.material.opacity = (1 - t) * 0.9;
    });
  }
  return { setEvents, update, group };
}
