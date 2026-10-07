/**
 * geo.js
 * ---------------------------------------------------------------------------
 * Map pixel (x, y) -> 3D scene (x, z), centred on the map frame.
 */
import { MAP } from "../config.js";

export const toScene = (x, y) => [x - MAP.width / 2, y - MAP.height / 2];
