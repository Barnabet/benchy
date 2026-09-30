import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCsv } from "../scripts/lib/csv.mjs";

test("turns rows into objects keyed by the header", () => {
  assert.deepEqual(parseCsv("model,score\na,1\nb,2\n"), [
    { model: "a", score: "1" },
    { model: "b", score: "2" },
  ]);
});

test("reads quoted fields with commas, doubled quotes and line breaks", () => {
  const text = 'name,notes\n"Claude, Opus","said ""hi""\nthen left"\n';
  assert.deepEqual(parseCsv(text), [{ name: "Claude, Opus", notes: 'said "hi"\nthen left' }]);
});

test("accepts CRLF line endings, a byte order mark and no final newline", () => {
  assert.deepEqual(parseCsv("﻿a,b\r\n1,2\r\n3,4"), [
    { a: "1", b: "2" },
    { a: "3", b: "4" },
  ]);
});

test("fills missing trailing fields with empty strings and skips blank lines", () => {
  assert.deepEqual(parseCsv("a,b,c\n1\n\n2,3,4\n"), [
    { a: "1", b: "", c: "" },
    { a: "2", b: "3", c: "4" },
  ]);
});
