import { test } from "node:test";
import assert from "node:assert/strict";
import { normalize } from "../scripts/lib/epoch.mjs";

// A tiny Epoch export: the same file names and columns as benchmark_data.zip.
const files = new Map([
  [
    "benchmark_metadata.csv",
    `benchmark,in_eci,source_file,score_column,scale,random_baseline,score_ceiling,release_date,superseded_by
GPQA diamond,True,gpqa_diamond.csv,Best score (across scorers),1.0,0.25,1.0,2023-11-20,
Aider polyglot,True,aider_polyglot_external.csv,Percent correct,0.01,0.0,1.0,2024-12-01,
FrontierMath-Old,True,frontiermath.csv,Best score (across scorers),1.0,0.0,0.5,2025-02-28,FrontierMath-New
Others only,True,others_only.csv,Score,1.0,0.0,1.0,2025-01-01,
No file,True,,Score,1.0,0.0,1.0,2025-01-01,
Missing file,True,missing.csv,Score,1.0,0.0,1.0,2025-01-01,
`,
  ],
  [
    "model_metadata.csv",
    `model_version,model_group,date,display_name,organization,country,accessibility,training_compute_flop
,,,,,,,
claude-sonnet-5-5_max,Claude Sonnet 5.5,2026-09-28,Claude Sonnet 5.5 (max),Anthropic,United States of America,API access,
claude-sonnet-5-5_low,Claude Sonnet 5.5,2026-09-28,,Anthropic,United States of America,API access,
gpt-6-astra_unknown,GPT-6 Astra,2026-09-03,GPT-6 Astra (unknown thinking),OpenAI,United States of America,API access,
gemini-3-pro,Gemini 3 Pro,2026-05-01,,"Google DeepMind,Google",United States of America,API access,
deepseek-v4,DeepSeek V4,2026-04-01,DeepSeek V4,DeepSeek,China,Open weights,
claude-2.1,Claude 2.1,2023-11-21,,Anthropic,United States of America,API access,
`,
  ],
  [
    "gpqa_diamond.csv",
    `Model version,Best score (across scorers),Organization
claude-sonnet-5-5_max,0.93,Anthropic
claude-sonnet-5-5_max,0.95,Anthropic
claude-sonnet-5-5_low,0.8,Anthropic
gpt-6-astra_unknown,0.91,OpenAI
deepseek-v4,0.85,DeepSeek
gemini-3-pro,,Google DeepMind
`,
  ],
  ["aider_polyglot_external.csv", "Model version,Percent correct,Organization\ngpt-6-astra_unknown,50,OpenAI\n"],
  ["frontiermath.csv", "Model version,Best score (across scorers),Organization\ngemini-3-pro,0.3,Google DeepMind\n"],
  ["others_only.csv", "Model version,Score,Organization\ndeepseek-v4,0.5,DeepSeek\n"],
  [
    "epoch_capabilities_index/eci_scores.csv",
    `Model,Display name,eci,eci_ci_low,eci_ci_high,date,Organization
Claude Sonnet 5.5,Claude Sonnet 5.5,160.2,157.1,163.5,2026-09-28,Anthropic
DeepSeek V4,DeepSeek V4,140.0,137.0,143.0,2026-04-01,DeepSeek
`,
  ],
]);

const FETCHED_AT = "2026-09-30T12:00:00.000Z";
const data = normalize(files, FETCHED_AT);
const byId = Object.fromEntries(data.models.map((m) => [m.id, m]));

test("keeps one row per scored Anthropic, Google and OpenAI setting, oldest first", () => {
  assert.deepEqual(
    data.models.map((m) => [m.id, m.name, m.creator, m.releaseDate]),
    [
      ["gemini-3-pro", "Gemini 3 Pro", "google", "2026-05-01"],
      ["gpt-6-astra_unknown", "GPT-6 Astra (unknown thinking)", "openai", "2026-09-03"],
      ["claude-sonnet-5-5_low", "Claude Sonnet 5.5 (low)", "anthropic", "2026-09-28"],
      ["claude-sonnet-5-5_max", "Claude Sonnet 5.5 (max)", "anthropic", "2026-09-28"],
    ],
  );
  assert.equal(byId["claude-sonnet-5-5_max"].slug, "claude-sonnet-5-5_max");
});

test("scales scores to fractions and keeps the best of repeated runs", () => {
  assert.equal(byId["claude-sonnet-5-5_max"].values.gpqa_diamond, 0.95);
  assert.equal(byId["claude-sonnet-5-5_low"].values.gpqa_diamond, 0.8);
  assert.equal(byId["gpt-6-astra_unknown"].values.aider_polyglot, 0.5);
  assert.equal(byId["gemini-3-pro"].values.frontiermath, 0.3);
  assert.equal("gpqa_diamond" in byId["gemini-3-pro"].values, false);
});

test("gives every setting of a model that model's ECI", () => {
  assert.equal(byId["claude-sonnet-5-5_max"].values.eci, 160.2);
  assert.equal(byId["claude-sonnet-5-5_low"].values.eci, 160.2);
  assert.equal("eci" in byId["gpt-6-astra_unknown"].values, false);
});

test("lists ECI first, then benchmarks with data by coverage, superseded ones last", () => {
  assert.deepEqual(data.metrics, [
    { key: "eci", label: "ECI (whole model)", group: "Index", better: "higher", unit: "" },
    { key: "gpqa_diamond", label: "GPQA diamond", group: "Benchmarks", better: "higher", unit: "%" },
    { key: "aider_polyglot", label: "Aider polyglot", group: "Benchmarks", better: "higher", unit: "%" },
    { key: "frontiermath", label: "FrontierMath-Old", group: "Superseded", better: "higher", unit: "%" },
  ]);
});

test("tells apart versions that would share a name by adding their id", () => {
  const { models } = normalize(
    new Map([
      ["benchmark_metadata.csv", "benchmark,source_file,score_column,scale,superseded_by\nMMLU,mmlu_external.csv,EM,1.0,\n"],
      [
        "model_metadata.csv",
        `model_version,model_group,date,display_name,organization
gpt-4-0314,GPT-4 (Mar 2023),2023-03-14,,OpenAI
gpt-4-32k-0314,GPT-4 (Mar 2023),2023-03-14,,OpenAI
gpt-4-0613,GPT-4 (Jun 2023),2023-06-13,,OpenAI
`,
      ],
      ["mmlu_external.csv", "Model version,EM\ngpt-4-0314,0.86\ngpt-4-32k-0314,0.86\ngpt-4-0613,0.86\n"],
    ]),
    FETCHED_AT,
  );
  assert.deepEqual(
    models.map((m) => m.name),
    ["GPT-4 (Mar 2023) · gpt-4-0314", "GPT-4 (Mar 2023) · gpt-4-32k-0314", "GPT-4 (Jun 2023)"],
  );
});

test("credits Epoch AI and names the three providers", () => {
  assert.equal(data.fetchedAt, FETCHED_AT);
  assert.deepEqual(data.source, {
    name: "Epoch AI",
    url: "https://epoch.ai/benchmarks",
    license: "CC BY 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
  });
  assert.deepEqual(data.creators, {
    anthropic: { name: "Anthropic" },
    google: { name: "Google" },
    openai: { name: "OpenAI" },
  });
});
