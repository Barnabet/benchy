const SVG_NS = "http://www.w3.org/2000/svg";
const DEFAULT_METRIC = "eci";
const PROVIDERS = ["anthropic", "google", "openai"];
const SHAPES = { anthropic: "circle", google: "square", openai: "diamond" };
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const $ = (id) => document.getElementById(id);

const state = {
  data: null,
  metric: DEFAULT_METRIC,
  range: "all",
  providers: new Set(PROVIDERS),
  search: "",
  sort: null, // { key, dir: 1 | -1 }
  activeIndex: -1,
};

// ---------- helpers ----------

function el(tag, attrs = {}, text) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  if (text != null) node.textContent = text;
  return node;
}

function svgEl(tag, attrs = {}) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  return node;
}

function metricDef(key = state.metric) {
  return state.data.metrics.find((m) => m.key === key);
}

function providerName(id) {
  return state.data.creators[id]?.name ?? id;
}

function parseDate(iso) {
  if (!iso) return null;
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return Date.UTC(y, m - 1, d || 1);
}

function formatDate(t) {
  const d = new Date(t);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

function formatValue(metric, v) {
  if (v == null) return "–";
  switch (metric.unit) {
    case "%": return `${(v * 100).toFixed(1)}%`;
    case "$": return `$${v < 1 ? v.toFixed(3) : v.toFixed(2)}`;
    case "s": return `${v.toFixed(2)}s`;
    default: return Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(1);
  }
}

function isBetter(metric, a, b) {
  return metric.better === "lower" ? a < b : a > b;
}

// Marker glyph for a provider: shape doubles as identity when colour isn't enough.
function marker(provider, cx, cy, cls = "") {
  const style = `fill: var(--${provider})`;
  switch (SHAPES[provider]) {
    case "square":
      return svgEl("rect", { x: cx - 4.25, y: cy - 4.25, width: 8.5, height: 8.5, rx: 1.5, class: cls, style });
    case "diamond":
      return svgEl("path", { d: `M${cx} ${cy - 5.75}L${cx + 5.75} ${cy}L${cx} ${cy + 5.75}L${cx - 5.75} ${cy}Z`, class: cls, style });
    default:
      return svgEl("circle", { cx, cy, r: 4.5, class: cls, style });
  }
}

function swatch(provider, withLine = false) {
  const w = withLine ? 22 : 12;
  const svg = svgEl("svg", { width: w, height: 12, viewBox: `0 0 ${w} 12`, "aria-hidden": "true" });
  if (withLine) svg.append(svgEl("line", { x1: 0, x2: w, y1: 6, y2: 6, style: `stroke: var(--${provider}); stroke-width: 2` }));
  svg.append(marker(provider, w / 2, 6));
  return svg;
}

// ---------- filtering ----------

function filteredModels() {
  const { models } = state.data;
  const asOf = parseDate(state.data.fetchedAt);
  let cutoff = -Infinity;
  if (state.range !== "all") {
    const d = new Date(asOf);
    d.setUTCMonth(d.getUTCMonth() - Number(state.range));
    cutoff = d.getTime();
  }
  const q = state.search.trim().toLowerCase();
  return models.filter((m) => {
    if (!state.providers.has(m.creator)) return false;
    if (q && !`${m.name} ${m.slug}`.toLowerCase().includes(q)) return false;
    if (cutoff > -Infinity) {
      const t = parseDate(m.releaseDate);
      if (t == null || t < cutoff) return false;
    }
    return true;
  });
}

// ---------- URL state ----------

function readHash() {
  const params = new URLSearchParams(location.hash.slice(1));
  const metric = params.get("metric");
  if (metric && metricDef(metric)) state.metric = metric;
  const range = params.get("range");
  if (range && [...$("range").options].some((o) => o.value === range)) state.range = range;
  const providers = params.get("providers");
  if (providers != null) state.providers = new Set(providers.split(",").filter((p) => PROVIDERS.includes(p)));
  state.search = params.get("q") ?? "";
  const sort = params.get("sort");
  if (sort) {
    const [key, dir] = sort.split(":");
    state.sort = { key, dir: dir === "asc" ? 1 : -1 };
  }
}

function writeHash() {
  const params = new URLSearchParams();
  if (state.metric !== DEFAULT_METRIC) params.set("metric", state.metric);
  if (state.range !== "all") params.set("range", state.range);
  if (state.providers.size !== PROVIDERS.length) params.set("providers", [...state.providers].join(","));
  if (state.search) params.set("q", state.search);
  if (state.sort && state.sort.key !== state.metric) params.set("sort", `${state.sort.key}:${state.sort.dir === 1 ? "asc" : "desc"}`);
  const hash = params.toString();
  history.replaceState(null, "", hash ? `#${hash}` : location.pathname + location.search);
}

// ---------- controls ----------

function buildControls() {
  const select = $("metric");
  const groups = new Map();
  for (const m of state.data.metrics) {
    if (!groups.has(m.group)) groups.set(m.group, el("optgroup", { label: m.group }));
    groups.get(m.group).append(el("option", { value: m.key }, m.label));
  }
  select.append(...groups.values());
  select.value = state.metric;
  select.addEventListener("change", () => {
    state.metric = select.value;
    state.sort = null;
    update();
  });

  const range = $("range");
  range.value = state.range;
  range.addEventListener("change", () => {
    state.range = range.value;
    update();
  });

  const chips = $("providers");
  for (const id of PROVIDERS) {
    const chip = el("button", { type: "button", class: "chip", "aria-pressed": String(state.providers.has(id)) });
    chip.append(swatch(id), document.createTextNode(providerName(id)));
    chip.addEventListener("click", () => {
      if (state.providers.has(id)) state.providers.delete(id);
      else state.providers.add(id);
      chip.setAttribute("aria-pressed", String(state.providers.has(id)));
      update();
    });
    chips.append(chip);
  }

  const search = $("search");
  search.value = state.search;
  search.addEventListener("input", () => {
    state.search = search.value;
    update();
  });
}

// ---------- tiles ----------

function renderTiles(models) {
  const metric = metricDef();
  const best = {};
  for (const m of models) {
    const v = m.values[metric.key];
    if (v == null) continue;
    if (!best[m.creator] || isBetter(metric, v, best[m.creator].values[metric.key])) best[m.creator] = m;
  }
  let leader = null;
  for (const m of Object.values(best)) {
    if (!leader || isBetter(metric, m.values[metric.key], leader.values[metric.key])) leader = m;
  }

  const tiles = $("tiles");
  tiles.replaceChildren();
  for (const id of PROVIDERS) {
    if (!state.providers.has(id)) continue;
    const m = best[id];
    const tile = el("div", { class: "tile" });
    const label = el("div", { class: "tile-label" });
    label.append(swatch(id), document.createTextNode(`${providerName(id)}'s best`));
    if (m && m === leader && Object.keys(best).length > 1) label.append(el("span", { class: "badge" }, "Leads"));
    tile.append(label);
    if (m) {
      tile.append(
        el("div", { class: "tile-value" }, formatValue(metric, m.values[metric.key])),
        el("div", { class: "tile-model" }, m.name),
        el("div", { class: "tile-meta" }, m.releaseDate ? `Released ${formatDate(parseDate(m.releaseDate))}` : "Release date unknown"),
      );
    } else {
      tile.append(el("div", { class: "tile-meta" }, "No models with this metric in the current filter"));
    }
    tiles.append(tile);
  }
}

// ---------- chart ----------

function niceStep(raw) {
  const pow = 10 ** Math.floor(Math.log10(raw));
  const f = raw / pow;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * pow;
}

function linearTicks(lo, hi, count) {
  const step = niceStep((hi - lo) / count || 1);
  const first = Math.floor(lo / step);
  const last = Math.ceil(hi / step);
  const ticks = [];
  for (let i = first; i <= last; i++) ticks.push(+(i * step).toPrecision(12));
  return ticks;
}

function logTicks(lo, hi) {
  const ticks = [];
  for (let e = Math.floor(Math.log10(lo)); e <= Math.ceil(Math.log10(hi)); e++) {
    for (const f of [1, 2, 5]) {
      const v = f * 10 ** e;
      if (v >= lo * 0.999 && v <= hi * 1.001) ticks.push(v);
    }
  }
  return ticks;
}

function timeTicks(t0, t1, maxTicks) {
  const start = new Date(t0);
  for (const months of [1, 3, 6, 12, 24]) {
    const ticks = [];
    const d = new Date(Date.UTC(start.getUTCFullYear(), 0, 1));
    while (d.getTime() <= t1) {
      if (d.getTime() >= t0) ticks.push(d.getTime());
      d.setUTCMonth(d.getUTCMonth() + months);
    }
    if (ticks.length <= maxTicks) return ticks;
  }
  return [];
}

function tickLabel(t, first) {
  const d = new Date(t);
  const month = d.getUTCMonth();
  if (month === 0) return String(d.getUTCFullYear());
  return first ? `${MONTHS[month]} ${d.getUTCFullYear()}` : MONTHS[month];
}

function renderChart(models) {
  const metric = metricDef();
  const svg = $("chart");
  const wrap = $("chart-wrap");
  const width = wrap.clientWidth;
  const height = svg.clientHeight;
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.replaceChildren();
  hideTooltip();

  const pts = models
    .filter((m) => m.values[metric.key] != null && m.releaseDate)
    .map((m) => ({ model: m, t: parseDate(m.releaseDate), v: m.values[metric.key] }))
    .sort((a, b) => a.t - b.t);
  state.points = pts;
  state.activeIndex = -1;

  $("chart-title").textContent = `${metric.label} over time`;
  const log = metric.unit === "$" && pts.length > 0 && pts.every((p) => p.v > 0);
  $("chart-sub").textContent =
    `Each mark is a model at its release date. Lines follow each provider's best so far.${log ? " Log scale." : ""}`;
  svg.setAttribute("aria-label", `${metric.label} by release date for ${pts.length} models. Use arrow keys to step through them.`);

  if (pts.length === 0) {
    const text = svgEl("text", { x: width / 2, y: height / 2, "text-anchor": "middle", class: "no-data" });
    text.textContent = "No models with this metric in the current filter";
    svg.append(text);
    return;
  }

  const showEndLabels = width >= 600;
  const margin = { top: 12, right: showEndLabels ? 84 : 12, bottom: 28, left: 48 };
  const plotW = width - margin.left - margin.right;
  const plotH = height - margin.top - margin.bottom;

  // X: release dates, extended to the data's as-of date so best-so-far lines reach "now".
  const asOf = Math.max(parseDate(state.data.fetchedAt), pts.at(-1).t);
  let t0 = pts[0].t;
  const span = Math.max(asOf - t0, 30 * 864e5);
  t0 -= span * 0.02;
  const t1 = asOf;
  const x = (t) => margin.left + ((t - t0) / (t1 - t0)) * plotW;

  // Y: linear from zero for scores; log for prices.
  const values = pts.map((p) => p.v);
  let yTicks, y;
  if (log) {
    const lo = 10 ** Math.floor(Math.log10(Math.min(...values)));
    const hi = 10 ** Math.ceil(Math.log10(Math.max(...values)));
    yTicks = logTicks(lo, hi);
    y = (v) => margin.top + plotH - ((Math.log10(v) - Math.log10(lo)) / (Math.log10(hi) - Math.log10(lo))) * plotH;
  } else {
    const hi = Math.max(...values, 0);
    yTicks = linearTicks(Math.min(0, ...values), hi, 5);
    const yMin = yTicks[0];
    const yMax = yTicks.at(-1);
    y = (v) => margin.top + plotH - ((v - yMin) / (yMax - yMin || 1)) * plotH;
  }

  const axes = svgEl("g");
  for (const v of yTicks) {
    const yy = Math.round(y(v)) + 0.5;
    axes.append(svgEl("line", { x1: margin.left, x2: width - margin.right, y1: yy, y2: yy, class: v === yTicks[0] ? "baseline" : "grid" }));
    const label = svgEl("text", { x: margin.left - 8, y: yy, dy: "0.32em", "text-anchor": "end", class: "tick" });
    label.textContent = metric.unit === "%" ? `${+(v * 100).toFixed(1)}%` : metric.unit === "$" ? `$${v}` : String(v);
    axes.append(label);
  }
  const xTicks = timeTicks(t0, t1, Math.max(2, Math.floor(plotW / 70)));
  xTicks.forEach((t, i) => {
    const label = svgEl("text", { x: x(t), y: height - 8, "text-anchor": "middle", class: "tick" });
    label.textContent = tickLabel(t, i === 0);
    axes.append(label);
  });
  svg.append(axes);

  // Best-so-far per provider: a step line through each record-setting model.
  const lines = svgEl("g");
  const ends = [];
  for (const id of PROVIDERS) {
    const own = pts.filter((p) => p.model.creator === id);
    if (own.length === 0) continue;
    let best = null;
    let d = "";
    for (const p of own) {
      if (best && !isBetter(metric, p.v, best.v)) continue;
      p.record = true;
      d += best ? `H${x(p.t)}V${y(p.v)}` : `M${x(p.t)} ${y(p.v)}`;
      best = p;
    }
    d += `H${x(t1)}`;
    lines.append(svgEl("path", { d, class: "frontier", style: `stroke: var(--${id})` }));
    ends.push({ id, y: y(best.v), v: best.v });
  }
  svg.append(lines);

  // Direct end labels, leader first; a label that would collide is dropped (the legend carries it).
  if (showEndLabels) {
    const placed = [];
    ends.sort((a, b) => (isBetter(metric, a.v, b.v) ? -1 : 1));
    for (const e of ends) {
      if (placed.some((py) => Math.abs(py - e.y) < 14)) continue;
      placed.push(e.y);
      const label = svgEl("text", { x: x(t1) + 8, y: e.y, dy: "0.32em", class: "end-label" });
      label.textContent = providerName(e.id);
      svg.append(label);
    }
  }

  const crosshair = svgEl("line", { class: "crosshair", y1: margin.top, y2: margin.top + plotH, visibility: "hidden" });
  svg.append(crosshair);

  const marks = svgEl("g");
  const ordered = [...pts].sort((a, b) => Number(!!a.record) - Number(!!b.record));
  for (const p of ordered) {
    p.x = x(p.t);
    p.y = y(p.v);
    p.node = marker(p.model.creator, p.x, p.y, p.record ? "point" : "point dim");
    marks.append(p.node);
  }
  svg.append(marks);
  state.crosshair = crosshair;
}

function setActive(index) {
  const pts = state.points;
  if (state.activeIndex >= 0) pts[state.activeIndex]?.node.classList.remove("active");
  state.activeIndex = index;
  if (index < 0) {
    hideTooltip();
    return;
  }
  const p = pts[index];
  p.node.classList.add("active");
  p.node.parentNode.append(p.node); // bring to front
  showTooltip(p);
}

function showTooltip(p) {
  const metric = metricDef();
  const tip = $("tooltip");
  const model = el("div", { class: "tt-model" });
  model.append(swatch(p.model.creator), document.createTextNode(p.model.name));
  const meta = `${providerName(p.model.creator)} · ${formatDate(p.t)}${p.record ? " · new best" : ""}`;
  tip.replaceChildren(el("div", { class: "tt-value" }, formatValue(metric, p.v)), model, el("div", {}, meta));
  tip.hidden = false;

  state.crosshair.setAttribute("x1", p.x);
  state.crosshair.setAttribute("x2", p.x);
  state.crosshair.setAttribute("visibility", "visible");

  const wrapW = $("chart-wrap").clientWidth;
  const { offsetWidth: w, offsetHeight: h } = tip;
  let left = p.x + 14;
  if (left + w > wrapW) left = p.x - w - 14;
  tip.style.left = `${Math.max(0, left)}px`;
  tip.style.top = `${Math.max(0, p.y - h - 10)}px`;
}

function hideTooltip() {
  $("tooltip").hidden = true;
  state.crosshair?.setAttribute("visibility", "hidden");
}

function bindChartEvents() {
  const svg = $("chart");
  svg.addEventListener("pointermove", (e) => {
    const pts = state.points ?? [];
    const rect = svg.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    let bestIndex = -1;
    let bestDist = 32 ** 2; // nearest point within 32px
    pts.forEach((p, i) => {
      const dist = (p.x - px) ** 2 + (p.y - py) ** 2;
      if (dist < bestDist) {
        bestDist = dist;
        bestIndex = i;
      }
    });
    if (bestIndex !== state.activeIndex) setActive(bestIndex);
  });
  svg.addEventListener("pointerleave", () => setActive(-1));
  svg.addEventListener("blur", () => setActive(-1));
  svg.addEventListener("keydown", (e) => {
    const n = state.points?.length ?? 0;
    if (!n) return;
    if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      e.preventDefault();
      const step = e.key === "ArrowRight" ? 1 : -1;
      const next = state.activeIndex < 0 ? (step === 1 ? 0 : n - 1) : (state.activeIndex + step + n) % n;
      setActive(next);
    } else if (e.key === "Escape") {
      setActive(-1);
    }
  });
}

function renderLegend() {
  const legend = $("legend");
  legend.replaceChildren();
  for (const id of PROVIDERS) {
    if (!state.providers.has(id)) continue;
    const item = el("span", { class: "legend-item" });
    item.append(swatch(id, true), document.createTextNode(providerName(id)));
    legend.append(item);
  }
}

// ---------- table ----------

function renderTable(models) {
  const metric = metricDef();
  const sort = state.sort ?? { key: metric.key, dir: metric.better === "lower" ? 1 : -1 };
  const columns = [
    { key: "name", label: "Model", text: true, get: (m) => m.name },
    { key: "creator", label: "Provider", text: true, get: (m) => providerName(m.creator) },
    { key: "releaseDate", label: "Released", text: true, get: (m) => m.releaseDate },
    ...state.data.metrics.map((mt) => ({ key: mt.key, label: mt.label, metric: mt, get: (m) => m.values[mt.key] })),
  ];
  const col = columns.find((c) => c.key === sort.key) ?? columns.find((c) => c.key === metric.key);

  const rows = [...models].sort((a, b) => {
    const va = col.get(a);
    const vb = col.get(b);
    if (va == null && vb == null) return a.name.localeCompare(b.name);
    if (va == null) return 1; // missing values always last
    if (vb == null) return -1;
    const cmp = typeof va === "number" ? va - vb : String(va).localeCompare(String(vb));
    return cmp * sort.dir || a.name.localeCompare(b.name);
  });

  const headRow = el("tr");
  for (const c of columns) {
    const th = el("th", { scope: "col" });
    if (c.text) th.classList.add("text");
    if (c.key === metric.key) th.classList.add("selected");
    if (c.key === col.key) th.setAttribute("aria-sort", sort.dir === 1 ? "ascending" : "descending");
    const button = el("button", { type: "button" }, c.key === col.key ? `${c.label} ${sort.dir === 1 ? "↑" : "↓"}` : c.label);
    button.addEventListener("click", () => {
      const dir = c.key === col.key ? -sort.dir : c.text ? 1 : c.metric?.better === "lower" ? 1 : -1;
      state.sort = { key: c.key, dir };
      update({ chart: false });
    });
    th.append(button);
    headRow.append(th);
  }
  $("table").tHead.replaceChildren(headRow);

  const body = document.createDocumentFragment();
  for (const m of rows) {
    const tr = el("tr");
    for (const c of columns) {
      const v = c.get(m);
      const td = el("td");
      if (c.text) td.classList.add("text");
      if (c.key === metric.key) td.classList.add("selected");
      if (c.key === "name") {
        const cell = el("span", { class: "model-cell" });
        cell.append(swatch(m.creator), document.createTextNode(m.name));
        td.append(cell);
      } else if (c.metric) {
        td.textContent = formatValue(c.metric, v);
        if (v == null) td.classList.add("missing");
      } else {
        td.textContent = v ?? "–";
        if (v == null) td.classList.add("missing");
      }
      tr.append(td);
    }
    body.append(tr);
  }
  $("table").tBodies[0].replaceChildren(body);
  $("table-sub").textContent = `${rows.length} model${rows.length === 1 ? "" : "s"} · sorted by ${col.label}`;
}

// ---------- theme ----------

function currentTheme() {
  const set = document.documentElement.dataset.theme;
  if (set) return set;
  return matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function initTheme() {
  try {
    const saved = localStorage.getItem("benchy-theme");
    if (saved === "light" || saved === "dark") document.documentElement.dataset.theme = saved;
  } catch {}
  const button = $("theme-toggle");
  const label = () => {
    button.textContent = currentTheme() === "dark" ? "Light" : "Dark";
  };
  label();
  button.addEventListener("click", () => {
    const next = currentTheme() === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem("benchy-theme", next);
    } catch {}
    label();
  });
}

// ---------- main ----------

function update({ chart = true } = {}) {
  const models = filteredModels();
  renderTiles(models);
  if (chart) {
    renderLegend();
    renderChart(models);
  }
  renderTable(models);
  writeHash();
}

function showEmpty(detail) {
  $("app").hidden = true;
  $("empty").hidden = false;
  $("empty-detail").textContent = detail;
}

async function main() {
  initTheme();
  let data;
  try {
    const res = await fetch("data/models.json", { cache: "no-store" });
    if (!res.ok) throw new Error(`data/models.json: ${res.status}`);
    data = await res.json();
  } catch (err) {
    showEmpty(String(err.message ?? err));
    return;
  }
  if (!data.models?.length || !data.metrics?.length) {
    showEmpty("data/models.json has no models.");
    return;
  }
  state.data = data;
  if (!metricDef(state.metric)) state.metric = data.metrics[0].key;
  readHash();

  $("data-meta").textContent = ` · fetched ${formatDate(parseDate(data.fetchedAt))}`;

  $("app").hidden = false;
  buildControls();
  bindChartEvents();
  update();

  let lastWidth = $("chart-wrap").clientWidth;
  new ResizeObserver(() => {
    const w = $("chart-wrap").clientWidth;
    if (w !== lastWidth) {
      lastWidth = w;
      renderChart(filteredModels());
    }
  }).observe($("chart-wrap"));
}

main();
