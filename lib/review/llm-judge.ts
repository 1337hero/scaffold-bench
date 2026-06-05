// OPTIONAL, OFF-BY-DEFAULT qualitative LLM reviewer.
//
// QUARANTINE CONTRACT: this module writes ONLY to the `review_notes` table via
// `upsertReviewNotes`. It never returns anything the scoring path consumes and
// must never be imported by any scoring-path module (lib/scoring.ts,
// lib/scenarios/_shared/rubric.ts, lib/orchestrator.ts, server/run-engine.ts,
// server/db/queries.ts, scripts/run-all-models.ts, scripts/replay-results-to-db.ts).
// Invoke it only from the standalone scripts/llm-review.ts entrypoint.

import { upsertReviewNotes } from "../../server/db/review-notes.ts";

export interface ReviewScenario {
  scenarioId: string;
  category?: string;
  status?: string;
  points?: number;
  maxPoints?: number;
  checks?: { name: string; pass: boolean; detail?: string }[];
}

export interface ReviewRunInput {
  runId: string;
  model: string | null;
  scenarios: ReviewScenario[];
}

export function isReviewEnabled(): boolean {
  return process.env.SCAFFOLD_LLM_REVIEW === "1";
}

interface ReviewConfig {
  endpoint: string;
  model: string;
  apiKey: string | undefined;
}

function readConfig(): ReviewConfig | undefined {
  const endpoint = process.env.SCAFFOLD_LLM_REVIEW_ENDPOINT?.trim();
  const model = process.env.SCAFFOLD_LLM_REVIEW_MODEL?.trim();
  if (!endpoint || !model) return undefined;
  return { endpoint, model, apiKey: process.env.SCAFFOLD_LLM_REVIEW_API_KEY?.trim() || undefined };
}

function buildPrompt(scenario: ReviewScenario): string {
  return [
    "You are a qualitative code-review assistant. You do NOT assign scores.",
    "Given a deterministic scenario result, write a SHORT qualitative note covering:",
    "1. Cleanup burden: how much manual cleanup a human would face.",
    "2. Failure-mode clustering: what kind of failure this is, if any.",
    "3. Human-vs-deterministic comparison: where a human reviewer might differ from the automatic checks.",
    "Return prose only. Do not output numbers that look like scores.",
    "",
    `Scenario: ${scenario.scenarioId} (${scenario.category ?? "unknown"})`,
    `Deterministic status: ${scenario.status ?? "unknown"}`,
    `Checks: ${JSON.stringify(scenario.checks ?? [])}`,
  ].join("\n");
}

async function requestNote(cfg: ReviewConfig, scenario: ReviewScenario): Promise<string | null> {
  try {
    const res = await fetch(`${cfg.endpoint.replace(/\/$/, "")}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(cfg.apiKey ? { authorization: `Bearer ${cfg.apiKey}` } : {}),
      },
      body: JSON.stringify({
        model: cfg.model,
        messages: [{ role: "user", content: buildPrompt(scenario) }],
      }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const content = data.choices?.[0]?.message?.content;
    return typeof content === "string" && content.trim().length > 0 ? content.trim() : null;
  } catch {
    return null;
  }
}

// Side-effect-only writer. Returns nothing scoring consumes. Never throws.
export async function reviewRun(input: ReviewRunInput): Promise<void> {
  if (!isReviewEnabled()) return;
  const cfg = readConfig();
  if (!cfg) return;

  for (const scenario of input.scenarios) {
    const notes = await requestNote(cfg, scenario);
    if (notes === null) continue;
    upsertReviewNotes({
      run_id: input.runId,
      scenario_id: scenario.scenarioId,
      notes,
      model: cfg.model,
      created_at: Date.now(),
    });
  }
}
