#!/usr/bin/env node

/**
 * Explicitly opt-in, capped scaffold for a future live authoring comparison.
 * It does not call a provider directly and sends no execution-lifecycle action.
 */

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const MAX_CASES = 24;
const MAX_PROVIDER_CALLS = 48;
const PHASE1_LIVE_EVAL = process.env.PHASE1_LIVE_EVAL;
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifestPath = path.join(ROOT, "eval", "manifests", "phase1-live.json");
const casesPath = path.join(ROOT, "eval", "golden", "cases.jsonl");

function parseJsonLines(text) {
  return text
    .split(/\r?\n/)
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line));
}

function assertBoundedManifest(manifest, cases) {
  if (PHASE1_LIVE_EVAL !== "1") {
    throw new Error("set PHASE1_LIVE_EVAL=1 for explicit live evaluation opt-in");
  }
  if (manifest.mode !== "live" || manifest.run_enabled !== false) {
    throw new Error("live evaluation requires a live manifest with execution disabled");
  }
  if (cases.length > MAX_CASES || manifest.max_cases > MAX_CASES) {
    throw new Error(`case cap exceeded: ${MAX_CASES}`);
  }
  if (manifest.max_provider_calls > MAX_PROVIDER_CALLS) {
    throw new Error(`provider-call cap exceeded: ${MAX_PROVIDER_CALLS}`);
  }
  if (manifest.case_ids.length !== cases.length) {
    throw new Error("live manifest does not cover the case fixture set");
  }
}

async function main() {
  const endpoint = process.env.PHASE1_LIVE_EVAL_URL;
  if (!endpoint) {
    throw new Error("PHASE1_LIVE_EVAL_URL is required after explicit opt-in");
  }
  const [manifest, casesText] = await Promise.all([
    readFile(manifestPath, "utf8").then(JSON.parse),
    readFile(casesPath, "utf8"),
  ]);
  const cases = parseJsonLines(casesText);
  assertBoundedManifest(manifest, cases);
  let providerCalls = 0;
  const results = [];
  for (const scenario of cases) {
    if (providerCalls >= MAX_PROVIDER_CALLS) {
      throw new Error(`provider-call cap exceeded: ${MAX_PROVIDER_CALLS}`);
    }
    providerCalls += 1;
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ case_id: scenario.case_id, description: scenario.description }),
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) {
      throw new Error(`live case request failed with HTTP ${response.status}`);
    }
    results.push({ case_id: scenario.case_id, response: await response.json() });
  }
  process.stdout.write(JSON.stringify({ manifest_id: manifest.manifest_id, provider_calls: providerCalls, results }));
}

main().catch((error) => {
  console.error(`phase1 live scaffold stopped: ${error.message}`);
  process.exitCode = 1;
});
