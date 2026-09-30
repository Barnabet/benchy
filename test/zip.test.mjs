import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { readZip } from "../scripts/lib/zip.mjs";

// sample.zip was made with Info-ZIP: deflated.csv (deflated), sub/ (a folder),
// sub/nested.csv and stored.txt (both stored).
const sample = await readFile(new URL("fixtures/sample.zip", import.meta.url));

test("lists every file and skips folder entries", () => {
  assert.deepEqual([...readZip(sample).keys()].sort(), ["deflated.csv", "stored.txt", "sub/nested.csv"]);
});

test("returns the contents of deflated and stored files", () => {
  const files = readZip(sample);
  assert.equal(files.get("stored.txt").toString(), "hi");
  assert.equal(files.get("sub/nested.csv").toString(), "x,y\n1,2\n");
  const csv = files.get("deflated.csv").toString();
  assert.ok(csv.startsWith("model,score\nm0,0.0\nm1,0.1\n"));
  assert.equal(csv.split("\n").length, 202);
});

test("rejects data that is not a zip", () => {
  assert.throws(() => readZip(Buffer.from("<html>not a zip</html>")), /not a zip/i);
});
