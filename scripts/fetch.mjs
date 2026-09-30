#!/usr/bin/env node
// Pulls every LLM from the Artificial Analysis data API, saves the raw
// response as a dated snapshot, and writes a normalized file for the site
// containing only the creators listed in CREATORS.
//
// Usage: AA_API_KEY=... node scripts/fetch.mjs
//        (or put AA_API_KEY in .env and run `npm run fetch`)

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const API_URL = "https://artificialanalysis.ai/api/v2/data/llms/models";
const MAX_PAGES = 50;

// Which model creators to keep, keyed by the id the site uses.
const CREATORS = {
  anthropic: { name: "Anthropic", match: /anthropic/i },
  google: { name: "Google", match: /google|deepmind/i },
  openai: { name: "OpenAI", match: /openai/i },
};

// Labels and "which way is better" for fields we know about. Anything the API
// returns that isn't listed here still comes through with a generated label.
const METRICS = {
  "evaluations.artificial_analysis_intelligence_index": { label: "Intelligence Index", group: "Indices" },
  "evaluations.artificial_analysis_coding_index": { label: "Coding Index", group: "Indices" },
  "evaluations.artificial_analysis_math_index": { label: "Math Index", group: "Indices" },
  "evaluations.artificial_analysis_agentic_index": { label: "Agentic Index", group: "Indices" },
  "evaluations.mmlu_pro": { label: "MMLU-Pro", group: "Benchmarks" },
  "evaluations.gpqa": { label: "GPQA Diamond", group: "Benchmarks" },
  "evaluations.hle": { label: "Humanity's Last Exam", group: "Benchmarks" },
  "evaluations.livecodebench": { label: "LiveCodeBench", group: "Benchmarks" },
  "evaluations.scicode": { label: "SciCode", group: "Benchmarks" },
  "evaluations.math_500": { label: "MATH-500", group: "Benchmarks" },
  "evaluations.aime": { label: "AIME", group: "Benchmarks" },
  "evaluations.aime_25": { label: "AIME 2025", group: "Benchmarks" },
  "evaluations.ifbench": { label: "IFBench", group: "Benchmarks" },
  "evaluations.lcr": { label: "AA-LCR", group: "Benchmarks" },
  "evaluations.terminalbench_hard": { label: "Terminal-Bench Hard", group: "Benchmarks" },
  "evaluations.tau2": { label: "τ²-Bench", group: "Benchmarks" },
  "pricing.price_1m_blended_3_to_1": { label: "Price, blended ($/1M)", group: "Price", better: "lower", unit: "$" },
  "pricing.price_1m_input_tokens": { label: "Price, input ($/1M)", group: "Price", better: "lower", unit: "$" },
  "pricing.price_1m_output_tokens": { label: "Price, output ($/1M)", group: "Price", better: "lower", unit: "$" },
  "pricing.price_1m_cache_hit_tokens": { label: "Price, cache hit ($/1M)", group: "Price", better: "lower", unit: "$" },
  "pricing.price_1m_cache_write_tokens": { label: "Price, cache write ($/1M)", group: "Price", better: "lower", unit: "$" },
  median_output_tokens_per_second: { label: "Output speed (tok/s)", group: "Speed" },
  median_time_to_first_token_seconds: { label: "Time to first token (s)", group: "Speed", better: "lower", unit: "s" },
  median_time_to_first_answer_token: { label: "Time to first answer token (s)", group: "Speed", better: "lower", unit: "s" },
};

async function fetchPage(apiKey, page) {
  const url = `${API_URL}?page=${page}`;
  const res = await fetch(url, { headers: { "x-api-key": apiKey } });
  if (res.status === 401 || res.status === 403) {
    throw new Error(`${res.status} from Artificial Analysis: check AA_API_KEY`);
  }
  if (res.status === 429) {
    throw new Error("429 from Artificial Analysis: daily rate limit reached, try again tomorrow");
  }
  if (!res.ok) {
    throw new Error(`${res.status} ${res.statusText} from ${url}: ${(await res.text()).slice(0, 300)}`);
  }
  return res.json();
}

async function fetchAll(apiKey) {
  const pages = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const body = await fetchPage(apiKey, page);
    pages.push(body);
    if (!body.pagination?.has_more) break;
  }
  const { data: _, pagination: __, ...meta } = pages[0];
  return { meta, data: pages.flatMap((p) => p.data ?? []) };
}

// Flattens nested numeric fields into dot paths: { pricing: { a: 1 } } -> { "pricing.a": 1 }.
function numericFields(obj, prefix = "", out = {}) {
  for (const [key, value] of Object.entries(obj ?? {})) {
    if (key === "model_creator") continue;
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === "number" && Number.isFinite(value)) out[path] = value;
    else if (value && typeof value === "object" && !Array.isArray(value)) numericFields(value, path, out);
  }
  return out;
}

function creatorOf(model) {
  const { name = "", slug = "" } = model.model_creator ?? {};
  for (const [id, c] of Object.entries(CREATORS)) {
    if (c.match.test(name) || c.match.test(slug)) return id;
  }
  return null;
}

function labelFor(path) {
  const last = path.split(".").pop();
  return last.replace(/_/g, " ").replace(/\b\w/g, (ch) => ch.toUpperCase());
}

function groupFor(path) {
  if (path.startsWith("evaluations.")) return "Benchmarks";
  if (path.startsWith("pricing.")) return "Price";
  return "Other";
}

function normalize({ meta, data }, fetchedAt) {
  const models = [];
  for (const m of data) {
    const creator = creatorOf(m);
    if (!creator) continue;
    models.push({
      id: m.id,
      name: m.name,
      slug: m.slug,
      creator,
      releaseDate: m.release_date ?? null,
      values: numericFields(m),
    });
  }
  models.sort((a, b) => (a.releaseDate ?? "").localeCompare(b.releaseDate ?? "") || a.name.localeCompare(b.name));

  const seen = new Set(models.flatMap((m) => Object.keys(m.values)));
  const known = Object.keys(METRICS).filter((k) => seen.has(k));
  const extra = [...seen].filter((k) => !METRICS[k]).sort();
  const metrics = [...known, ...extra].map((key) => {
    const def = METRICS[key] ?? { label: labelFor(key), group: groupFor(key) };
    // Some benchmarks come back as 0-1 fractions; the site shows those as percentages.
    const max = Math.max(...models.map((m) => m.values[key] ?? -Infinity));
    const unit = def.unit ?? (def.group !== "Indices" && def.group !== "Speed" && max <= 1 ? "%" : "");
    return { key, label: def.label, group: def.group, better: def.better ?? "higher", unit };
  });

  return {
    source: { name: "Artificial Analysis", url: "https://artificialanalysis.ai" },
    fetchedAt,
    apiMeta: meta,
    creators: Object.fromEntries(Object.entries(CREATORS).map(([id, c]) => [id, { name: c.name }])),
    metrics,
    models,
  };
}

async function main() {
  const apiKey = process.env.AA_API_KEY;
  if (!apiKey) {
    console.error("AA_API_KEY is not set. Get a key at https://artificialanalysis.ai and put it in .env");
    process.exit(1);
  }

  const fetchedAt = new Date().toISOString();
  const raw = await fetchAll(apiKey);
  console.log(`Fetched ${raw.data.length} models (tier: ${raw.meta.tier ?? "unknown"})`);

  const snapshotPath = join(ROOT, "data", "snapshots", `${fetchedAt.slice(0, 10)}.json`);
  await mkdir(dirname(snapshotPath), { recursive: true });
  await writeFile(snapshotPath, JSON.stringify({ fetchedAt, ...raw }, null, 2) + "\n");
  console.log(`Raw snapshot  -> ${snapshotPath}`);

  const normalized = normalize(raw, fetchedAt);
  const outPath = join(ROOT, "site", "data", "models.json");
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, JSON.stringify(normalized, null, 2) + "\n");
  const counts = Object.keys(CREATORS)
    .map((id) => `${CREATORS[id].name} ${normalized.models.filter((m) => m.creator === id).length}`)
    .join(", ");
  console.log(`Site data     -> ${outPath} (${counts}; ${normalized.metrics.length} metrics)`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
