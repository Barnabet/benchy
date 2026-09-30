// Turns Epoch AI's benchmark export (the files of benchmark_data.zip, as a Map
// from path to CSV text) into the site's models.json: one row per model setting
// ("Claude Sonnet 5.5 (max)") from the creators in CREATORS, each benchmark
// scaled to a 0-1 fraction, plus the Epoch Capabilities Index.

import { parseCsv } from "./csv.mjs";

// Which model creators to keep, keyed by the id the site uses, matched against Epoch's organization.
export const CREATORS = {
  anthropic: { name: "Anthropic", match: /anthropic/i },
  google: { name: "Google", match: /google|deepmind/i },
  openai: { name: "OpenAI", match: /openai/i },
};

const SOURCE = {
  name: "Epoch AI",
  url: "https://epoch.ai/benchmarks",
  license: "CC BY 4.0",
  licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
};
const ECI_FILE = "epoch_capabilities_index/eci_scores.csv";
const GROUPS = ["Index", "Benchmarks", "Superseded"];

function creatorOf(organization) {
  for (const [id, c] of Object.entries(CREATORS)) if (c.match.test(organization)) return id;
  return null;
}

function number(text) {
  if (!text?.trim()) return null;
  const v = Number(text);
  return Number.isFinite(v) ? v : null;
}

// "gpqa_diamond.csv" -> "gpqa_diamond", "hle_external.csv" -> "hle".
function metricKey(file) {
  return file.replace(/\.csv$/, "").replace(/_external$/, "");
}

// Epoch leaves some display names blank: "claude-haiku-4-5_8K" in group "Claude Haiku 4.5" -> "Claude Haiku 4.5 (8K)".
function displayName({ model_version: version, model_group: group, display_name: name }) {
  if (name) return name;
  if (!group) return version;
  const setting = version.includes("_") ? version.slice(version.lastIndexOf("_") + 1) : "";
  return setting ? `${group} (${setting})` : group;
}

export function normalize(files, fetchedAt) {
  const csv = (path) => (files.has(path) ? parseCsv(String(files.get(path))) : null);

  const models = new Map();
  const groupOf = new Map();
  for (const r of csv("model_metadata.csv") ?? []) {
    const creator = creatorOf(r.organization);
    if (!r.model_version || !creator) continue;
    models.set(r.model_version, {
      id: r.model_version,
      name: displayName(r),
      slug: r.model_version,
      creator,
      releaseDate: r.date || null,
      values: {},
    });
    groupOf.set(r.model_version, r.model_group);
  }

  const metrics = [];
  for (const b of csv("benchmark_metadata.csv") ?? []) {
    const rows = b.source_file ? csv(b.source_file) : null;
    if (!rows) continue;
    const key = metricKey(b.source_file);
    const scale = number(b.scale) ?? 1;
    let count = 0;
    for (const r of rows) {
      const model = models.get(r["Model version"]);
      const raw = number(r[b.score_column]);
      if (!model || raw == null) continue;
      const v = Math.round(raw * scale * 1e6) / 1e6;
      // A setting can have several runs (scaffolds, reruns); keep its best, as Epoch's own charts do.
      if (!(key in model.values)) count++;
      else if (v <= model.values[key]) continue;
      model.values[key] = v;
    }
    if (count === 0) continue;
    metrics.push({ key, label: b.benchmark, group: b.superseded_by ? "Superseded" : "Benchmarks", better: "higher", unit: "%", count });
  }

  // ECI is computed per model, not per setting, so every setting of a model shows the same value.
  const eci = new Map((csv(ECI_FILE) ?? []).map((r) => [r.Model, number(r.eci)]));
  let eciCount = 0;
  for (const m of models.values()) {
    const v = eci.get(groupOf.get(m.id));
    if (v == null) continue;
    m.values.eci = v;
    eciCount++;
  }
  if (eciCount > 0) metrics.push({ key: "eci", label: "ECI (whole model)", group: "Index", better: "higher", unit: "", count: eciCount });

  metrics.sort((a, b) => GROUPS.indexOf(a.group) - GROUPS.indexOf(b.group) || b.count - a.count || a.label.localeCompare(b.label));

  const scored = [...models.values()].filter((m) => Object.keys(m.values).length > 0);
  // Versions Epoch files under one group without a display name ("gpt-4-0314", "gpt-4-32k-0314") would look identical.
  const uses = new Map();
  for (const m of scored) uses.set(m.name, (uses.get(m.name) ?? 0) + 1);
  for (const m of scored) if (uses.get(m.name) > 1) m.name = `${m.name} · ${m.id}`;

  return {
    source: SOURCE,
    fetchedAt,
    creators: Object.fromEntries(Object.entries(CREATORS).map(([id, c]) => [id, { name: c.name }])),
    metrics: metrics.map(({ count, ...m }) => m),
    models: scored.sort((a, b) => (a.releaseDate ?? "").localeCompare(b.releaseDate ?? "") || a.name.localeCompare(b.name)),
  };
}
