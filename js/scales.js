/**
 * scales.js
 * ---------------------------------------------------------------------------
 * Height and colour scales for the county prisms, shared by the 3D scene,
 * the legend and the scatterplot so every view encodes a metric the same way.
 */

import { COLOR_CLASSES, COLOR_RAMP, METRICS, NO_DATA_COLOR, SCENE } from "./config.js";
import { metricColumn } from "./metrics.js";

/** Prism height: sqrt for counts/money, linear (clamped at the 98th percentile) for rates. */
export function makeHeightScale(values, metric) {
  const column = metricColumn(values, metric);
  const spec = METRICS[metric];
  if (spec.scale === "sqrt") {
    return d3.scaleSqrt().domain([0, d3.max(column) || 1]).range([SCENE.minPrismHeight, SCENE.maxPrismHeight]).clamp(true);
  }
  const sorted = column.slice().sort(d3.ascending);
  const lo = d3.quantile(sorted, 0.02) ?? 0, hi = d3.quantile(sorted, 0.98) ?? 1;
  // flip "low = risk" metrics so tall still means more risk
  const range = spec.risk === "low" ? [SCENE.maxPrismHeight, SCENE.minPrismHeight] : [SCENE.minPrismHeight, SCENE.maxPrismHeight];
  return d3.scaleLinear().domain([lo, hi]).range(range).clamp(true);
}

/** The ordered class colours, low risk -> high risk. */
export function classColors() {
  return d3.quantize((t) => d3.interpolateMagma(COLOR_RAMP[0] + t * (COLOR_RAMP[1] - COLOR_RAMP[0])), COLOR_CLASSES);
}

/**
 * Quantile classes (equal numbers of counties per colour), so skewed metrics
 * still spread across the ramp. Returns colour(value) plus the class breaks.
 */
export function makeColorScale(values, metric) {
  const column = metricColumn(values, metric);
  const colors = classColors();
  const range = METRICS[metric].risk === "low" ? colors.slice().reverse() : colors;
  const scale = d3.scaleQuantile().domain(column).range(range);
  const color = (value) => (value == null || !Number.isFinite(value) ? NO_DATA_COLOR : scale(value));
  return { color, breaks: scale.quantiles(), colors: range, extent: d3.extent(column) };
}
