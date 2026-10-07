/**
 * explainPanel.js  ·  View 5: "Why is this county unusual?"
 * ---------------------------------------------------------------------------
 * Lists the deterministic findings from explain.js, most salient first, each
 * linked to the view that shows the evidence, followed by data caveats.
 */

export function createExplainPanel(container, { onGoto }) {
  const root = d3.select(container);

  function update(state, explanation, county, m) {
    if (!explanation) { root.html('<p class="placeholder">Select a county, or pick one from the anomaly list, to see why it stands out. Every statement is computed from the data shown.</p>'); return; }
    const types = m.types.length ? `<div class="types">${m.types.map((t) => `<span class="tag">${t}</span>`).join("")}</div>` : '<div class="types"><span class="tag tag-muted">No discordance type triggered</span></div>';
    root.html(`${types}
      <ol class="findings">${explanation.findings.slice(0, 7).map((f) => `<li>${f.html} <button class="goto" data-view="${f.view}" title="Show the evidence">→ ${f.view}</button></li>`).join("")}</ol>
      ${explanation.caveats.length ? `<div class="caveats"><b>Read with care</b><ul>${explanation.caveats.map((c) => `<li>${c.html}</li>`).join("")}</ul></div>` : ""}`);
    root.selectAll("button.goto").on("click", function () { onGoto(this.dataset.view); });
  }
  return { update };
}
