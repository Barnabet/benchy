#!/usr/bin/env node
// Downloads Epoch AI's benchmark export (CC BY 4.0, no key needed) and writes
// site/data/models.json: every Anthropic, Google and OpenAI model setting with
// its benchmark scores and Epoch Capabilities Index.
//
// Usage: npm run fetch

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { CREATORS, normalize } from "./lib/epoch.mjs";
import { readZip } from "./lib/zip.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const ZIP_URL = "https://epoch.ai/data/benchmark_data.zip";

async function main() {
  const res = await fetch(ZIP_URL);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} from ${ZIP_URL}`);
  const files = readZip(Buffer.from(await res.arrayBuffer()));
  console.log(`Downloaded ${files.size} files from ${ZIP_URL}`);

  const data = normalize(files, new Date().toISOString());
  const outPath = join(ROOT, "site", "data", "models.json");
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, JSON.stringify(data, null, 2) + "\n");
  const counts = Object.entries(CREATORS)
    .map(([id, c]) => `${c.name} ${data.models.filter((m) => m.creator === id).length}`)
    .join(", ");
  console.log(`Site data -> ${outPath} (${counts}; ${data.metrics.length} metrics)`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
