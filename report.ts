import { Schema } from "effect";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { RunFileSchema, type RunFile } from "./lib/schemas/run-file.ts";

type Aggregated = {
  m: string;
  source: "local" | "api";
  runs: number;
  score_pct: number;
  points_avg: number;
  max_avg: number;
  total_wall_s: number;
  avg_scenario_s: number;
  avg_first_token_s: number | null;
  completion_tps: number | null;
  completion_tps_approx: boolean;
  prompt_tps: number | null;
  prompt_tps_approx: boolean;
  tool_calls_total: number;
  requests: number;
  categories: Record<string, { pts: number; max: number; pct: number | null }>;
  scenario_count: number;
  latest_ts: string;
};

const CATS = [
  "surgical-edit",
  "scope-discipline",
  "verify-and-repair",
  "implementation",
  "read-only-analysis",
  "audit",
  "responsiveness",
  "long-context",
];

const resultsDir = join(import.meta.dir, "results");
const outPath = join(import.meta.dir, "bench-report.html");

const files = readdirSync(resultsDir)
  .filter((f) => f.endsWith(".json"))
  .map((f) => ({ name: f, path: join(resultsDir, f) }));

const groups = new Map<string, RunFile[]>();
for (const f of files) {
  const raw = Schema.decodeUnknownSync(RunFileSchema)(JSON.parse(readFileSync(f.path, "utf8")));
  const model = raw.modelMetrics?.model ?? "unknown";
  if (!groups.has(model)) groups.set(model, []);
  groups.get(model)!.push(raw);
}

const data: Aggregated[] = [];
for (const [model, runs] of groups) {
  const source: "local" | "api" = model.includes("/") ? "api" : "local";

  let totalPoints = 0;
  let maxPoints = 0;
  let totalWallMs = 0;
  let scenarioWallMs = 0;
  let scenarioCount = 0;
  let firstTokenSum = 0;
  let firstTokenCount = 0;

  let promptEvalTokens = 0;
  let promptEvalTimeMs = 0;
  let completionEvalTokens = 0;
  let completionEvalTimeMs = 0;
  let hasPromptTiming = false;
  let hasCompletionTiming = false;

  let promptTokens = 0;
  let completionTokens = 0;
  let totalRequestTimeMs = 0;
  let requests = 0;
  let toolCalls = 0;

  const catAgg: Record<string, { pts: number; max: number }> = {};
  const scenarioIds = new Set<string>();
  let latestTs = "";

  for (const r of runs) {
    totalPoints += r.totalPoints;
    maxPoints += r.maxPoints;
    if (!latestTs || r.timestamp > latestTs) latestTs = r.timestamp;

    const m = r.modelMetrics;
    if (m) {
      promptTokens += m.promptTokens ?? 0;
      completionTokens += m.completionTokens ?? 0;
      totalRequestTimeMs += m.totalRequestTimeMs ?? 0;
      requests += m.requestCount ?? 0;
      if (m.promptEvalTokens !== undefined && m.promptEvalTimeMs !== undefined) {
        promptEvalTokens += m.promptEvalTokens;
        promptEvalTimeMs += m.promptEvalTimeMs;
        hasPromptTiming = true;
      }
      if (m.completionEvalTokens !== undefined && m.completionEvalTimeMs !== undefined) {
        completionEvalTokens += m.completionEvalTokens;
        completionEvalTimeMs += m.completionEvalTimeMs;
        hasCompletionTiming = true;
      }
    }

    for (const s of r.results) {
      scenarioWallMs += s.wallTimeMs ?? 0;
      totalWallMs += s.wallTimeMs ?? 0;
      scenarioCount++;
      scenarioIds.add(s.scenarioId);
      toolCalls += s.toolCallCount ?? 0;
      if (typeof s.firstTokenMs === "number") {
        firstTokenSum += s.firstTokenMs;
        firstTokenCount++;
      }
      if (!catAgg[s.category]) catAgg[s.category] = { pts: 0, max: 0 };
      catAgg[s.category].pts += s.points ?? 0;
      catAgg[s.category].max += s.maxPoints ?? 0;
    }
  }

  const runsCount = runs.length;
  const score_pct = maxPoints > 0 ? (totalPoints / maxPoints) * 100 : 0;

  let completion_tps: number | null = null;
  let completion_approx = false;
  if (hasCompletionTiming && completionEvalTimeMs > 0) {
    completion_tps = completionEvalTokens / (completionEvalTimeMs / 1000);
  } else if (completionTokens > 0 && totalRequestTimeMs > 0) {
    completion_tps = completionTokens / (totalRequestTimeMs / 1000);
    completion_approx = true;
  }

  let prompt_tps: number | null = null;
  let prompt_approx = false;
  if (hasPromptTiming && promptEvalTimeMs > 0) {
    prompt_tps = promptEvalTokens / (promptEvalTimeMs / 1000);
  } else if (promptTokens > 0 && totalRequestTimeMs > 0) {
    prompt_tps = promptTokens / (totalRequestTimeMs / 1000);
    prompt_approx = true;
  }

  const cats: Aggregated["categories"] = {};
  for (const c of CATS) {
    const agg = catAgg[c];
    if (!agg || agg.max === 0) cats[c] = { pts: agg?.pts ?? 0, max: 0, pct: null };
    else cats[c] = { pts: agg.pts, max: agg.max, pct: (agg.pts / agg.max) * 100 };
  }

  data.push({
    m: model,
    source,
    runs: runsCount,
    score_pct,
    points_avg: totalPoints / runsCount,
    max_avg: maxPoints / runsCount,
    total_wall_s: totalWallMs / 1000,
    avg_scenario_s: scenarioCount ? scenarioWallMs / scenarioCount / 1000 : 0,
    avg_first_token_s: firstTokenCount ? firstTokenSum / firstTokenCount / 1000 : null,
    completion_tps,
    completion_tps_approx: completion_approx,
    prompt_tps,
    prompt_tps_approx: prompt_approx,
    tool_calls_total: toolCalls,
    requests,
    categories: cats,
    scenario_count: scenarioIds.size,
    latest_ts: latestTs,
  });
}

data.sort((a, b) => b.score_pct - a.score_pct);

const totalRuns = files.length;
const totalScenarioRuns = data.reduce((s, d) => s + d.runs * d.scenario_count, 0);
const localCount = data.filter((d) => d.source === "local").length;
const apiCount = data.filter((d) => d.source === "api").length;
const snapshot = new Date().toISOString().replace("T", " ").slice(0, 19) + " UTC";

const best = data[0];
const scored = data.filter((d) => d.avg_scenario_s > 0);
const aligned = [...scored].sort((a, b) => b.score_pct / b.avg_scenario_s - a.score_pct / a.avg_scenario_s)[0];
const fastestGen = [...data].filter((d) => d.completion_tps != null).sort((a, b) => (b.completion_tps ?? 0) - (a.completion_tps ?? 0))[0];
const fastestPrompt = [...data].filter((d) => d.prompt_tps != null).sort((a, b) => (b.prompt_tps ?? 0) - (a.prompt_tps ?? 0))[0];

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>scaffold-bench · LLM Report</title>
<meta name="viewport" content="width=device-width,initial-scale=1" />
<style>
  :root {
    --bg:#0b0d10; --panel:#12161b; --panel-2:#171c23; --line:#242c35;
    --text:#e6edf3; --mute:#8b98a5;
    --accent:#7cf0a4; --accent-2:#8ab4ff; --warn:#ffd166; --bad:#ff6b6b; --gold:#f6c453;
    --api:#b38bff;
  }
  * { box-sizing: border-box; }
  html,body { background: var(--bg); color: var(--text); margin:0;
    font-family: ui-monospace, "JetBrains Mono", "Fira Code", Menlo, monospace;
    font-size: 13px; line-height: 1.5; }
  .wrap { max-width: 1280px; margin: 0 auto; padding: 28px 28px 120px; }
  header h1 { font-size: 22px; margin: 0 0 4px; letter-spacing: -0.01em; }
  header .sub { color: var(--mute); font-size: 12px; }
  header .meta { color: var(--mute); font-size: 11px; margin-top: 10px; }
  section { margin-top: 32px; }
  h2 { font-size: 13px; text-transform: uppercase; letter-spacing: 0.14em;
    color: var(--mute); border-bottom: 1px solid var(--line); padding-bottom: 6px; margin: 0 0 14px; }
  .grid-awards { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }
  .award { background: var(--panel); border: 1px solid var(--line); border-radius: 8px; padding: 14px; }
  .award .label { color: var(--mute); font-size: 10px; text-transform: uppercase; letter-spacing: 0.14em; }
  .award .name { font-size: 18px; margin-top: 6px; color: var(--accent); }
  .award .detail { color: var(--mute); font-size: 11px; margin-top: 4px; }
  .award.gold .name { color: var(--gold); }
  .award.blue .name { color: var(--accent-2); }
  .award.green .name { color: var(--accent); }
  .award.warn .name { color: var(--warn); }
  table { width:100%; border-collapse: collapse; font-size: 12px; }
  th, td { text-align: right; padding: 8px 10px; border-bottom: 1px solid var(--line); white-space: nowrap; }
  th { color: var(--mute); font-weight: 500; text-transform: uppercase;
    font-size: 10px; letter-spacing: 0.12em; background: var(--panel-2); }
  th:first-child, td:first-child { text-align: left; }
  th.l, td.l { text-align: left; }
  tbody tr:hover { background: #141a22; }
  .rank { color: var(--mute); width: 28px; }
  .model { color: var(--text); font-weight: 600; }
  .pct-bar { position: relative; background: #0e1218; border-radius: 3px; height: 6px; overflow: hidden; }
  .pct-bar > span { display:block; height: 100%; background: var(--accent); }
  .pct-bar.sm { width: 80px; display:inline-block; vertical-align: middle; margin-right: 8px; }
  .num { font-variant-numeric: tabular-nums; }
  .good { color: var(--accent); } .mid { color: var(--warn); } .bad { color: var(--bad); }
  .heatmap { width:100%; border-collapse: collapse; font-size: 11px; }
  .heatmap th, .heatmap td { border: 1px solid var(--line); padding: 6px 8px; text-align: center; }
  .heatmap th:first-child, .heatmap td:first-child { text-align: left; }
  .cell { color: #0b0d10; font-weight: 600; font-variant-numeric: tabular-nums; }
  .cell.na { background: #1a2028; color: var(--mute); font-weight: 400; }
  .bars { display: grid; grid-template-columns: 260px 1fr 80px; row-gap: 6px; align-items: center; }
  .bars .bar-track { background: #0e1218; height: 10px; border-radius: 3px; overflow: hidden; }
  .bars .bar-track > span { display:block; height: 100%; }
  .bars .m { color: var(--text); display: flex; align-items: center; gap: 6px; }
  .bars .v { text-align: right; color: var(--mute); font-variant-numeric: tabular-nums; }
  .scatter { position: relative; height: 420px; background: var(--panel); border: 1px solid var(--line);
    border-radius: 8px; margin-top: 12px; }
  .scatter .axis { position: absolute; color: var(--mute); font-size: 10px; }
  .scatter .axis.x { bottom: 6px; right: 12px; }
  .scatter .axis.y { top: 8px; left: 12px; writing-mode: vertical-rl; transform: rotate(180deg); }
  .scatter .gridline { position: absolute; background: var(--line); }
  .scatter .dot { position: absolute; width: 10px; height: 10px; border-radius: 50%;
    transform: translate(-50%, 50%); box-shadow: 0 0 0 2px rgba(0,0,0,0.4); }
  .scatter .lbl { position: absolute; color: var(--text); font-size: 10px;
    transform: translate(-50%, calc(50% - 14px)); white-space: nowrap; pointer-events:none; }
  .legend { color: var(--mute); font-size: 11px; margin-top: 8px; }
  .footer { color: var(--mute); font-size: 11px; margin-top: 40px; border-top: 1px solid var(--line); padding-top: 16px; }
  .tag { display:inline-block; padding: 2px 6px; border:1px solid var(--line); border-radius: 3px;
    color: var(--mute); font-size: 10px; margin-right: 4px; }
  .src { display:inline-block; font-size: 9px; padding: 1px 6px; border-radius: 3px; letter-spacing: 0.1em;
    text-transform: uppercase; font-weight: 600; }
  .src.local { background: rgba(124,240,164,0.12); color: var(--accent); border:1px solid rgba(124,240,164,0.3); }
  .src.api   { background: rgba(179,139,255,0.12); color: var(--api);    border:1px solid rgba(179,139,255,0.3); }
  .approx { color: var(--mute); font-size: 10px; margin-left: 4px; }
  .filter { display: inline-flex; gap: 6px; margin-left: 12px; }
  .filter button { background: var(--panel); color: var(--mute); border: 1px solid var(--line);
    border-radius: 4px; padding: 3px 10px; font-size: 10px; letter-spacing: 0.1em;
    text-transform: uppercase; cursor: pointer; font-family: inherit; }
  .filter button.on { color: var(--text); border-color: var(--gold); background: var(--panel-2); }
</style>
</head>
<body>
<div class="wrap">

<header>
  <h1>scaffold-bench · LLM comparison</h1>
  <div class="sub">${data.length} models · ${totalRuns} runs · ${localCount} local · ${apiCount} api</div>
  <div class="meta">
    Endpoint <span class="tag">llama-swap @ 127.0.0.1:8082 · OpenRouter-style API</span>
    Harness <span class="tag">bun bench.ts</span>
    Snapshot <span class="tag">${snapshot}</span>
    <span class="filter">
      <button class="on" data-f="all">all</button>
      <button data-f="local">local</button>
      <button data-f="api">api</button>
    </span>
  </div>
</header>

<section>
  <h2>Awards</h2>
  <div class="grid-awards">
    <div class="award gold">
      <div class="label">🏆 Best Overall</div>
      <div class="name">${best?.m ?? "—"}</div>
      <div class="detail">${best ? `${best.score_pct.toFixed(1)}% · ${best.points_avg.toFixed(1)}/${best.max_avg.toFixed(0)} pts · ${best.completion_tps?.toFixed(1) ?? "—"} gen tps` : ""}</div>
    </div>
    <div class="award green">
      <div class="label">🎯 Best Aligned (score ÷ scen-avg)</div>
      <div class="name">${aligned?.m ?? "—"}</div>
      <div class="detail">${aligned ? `${aligned.score_pct.toFixed(1)}% @ ${aligned.avg_scenario_s.toFixed(1)}s/scen · ${aligned.completion_tps?.toFixed(1) ?? "—"} gen tps` : ""}</div>
    </div>
    <div class="award blue">
      <div class="label">⚡ Fastest Generation</div>
      <div class="name">${fastestGen?.m ?? "—"}</div>
      <div class="detail">${fastestGen ? `${fastestGen.completion_tps?.toFixed(1)} gen tps · ${fastestGen.score_pct.toFixed(1)}% score` : ""}</div>
    </div>
    <div class="award warn">
      <div class="label">📨 Fastest Prompt Eval</div>
      <div class="name">${fastestPrompt?.m ?? "—"}</div>
      <div class="detail">${fastestPrompt ? `${fastestPrompt.prompt_tps?.toFixed(0)} prompt tps` : ""}</div>
    </div>
  </div>
</section>

<section>
  <h2>Leaderboard</h2>
  <table>
    <thead>
      <tr>
        <th style="width:28px">#</th>
        <th class="l">model</th>
        <th class="l">src</th>
        <th>score</th>
        <th>pts/run</th>
        <th>gen tps</th>
        <th>prompt tps</th>
        <th>scen avg (s)</th>
        <th>ttft (s)</th>
        <th>tools</th>
        <th>requests</th>
        <th>runs</th>
      </tr>
    </thead>
    <tbody id="leaderboard"></tbody>
  </table>
  <div class="legend">TPS shown with <span class="approx">~</span> means approximated from total request time (no per-eval timing from API).</div>
</section>

<section>
  <h2>Quality score (% of scored max)</h2>
  <div class="bars" id="scorebars"></div>
  <div class="legend">Score is points earned ÷ points available across all runs for that model.</div>
</section>

<section>
  <h2>Generation speed (completion tok/s)</h2>
  <div class="bars" id="genbars"></div>
  <div class="legend">Higher is faster. Speed without quality is empty calories — see scatter below.</div>
</section>

<section>
  <h2>Prompt processing speed (prompt eval tok/s)</h2>
  <div class="bars" id="ppbars"></div>
</section>

<section>
  <h2>Scenario avg time (s)</h2>
  <div class="bars" id="scenbars"></div>
  <div class="legend">Lower is faster. Wall time / scenarios run — reflects total session cost per task.</div>
</section>

<section>
  <h2>TTFT · time to first token (s)</h2>
  <div class="bars" id="ttftbars"></div>
  <div class="legend">Lower is snappier — time between request start and first streamed token.</div>
</section>

<section>
  <h2>Quality × speed</h2>
  <div class="scatter" id="scatter">
    <div class="axis y">quality · % score</div>
    <div class="axis x">generation tok/s</div>
  </div>
  <div class="legend">Top-right is ideal: fast <em>and</em> smart. Purple rings = API runs.</div>
</section>

<section>
  <h2>Category heatmap (%)</h2>
  <table class="heatmap" id="heatmap"></table>
  <div class="legend">Green = strong, red = weak. Dark gray = not tested on that category.</div>
</section>

<div class="footer">
  Generated from ${resultsDir} · ${totalRuns} result files · ${totalScenarioRuns} scenario runs aggregated.
</div>

</div>

<script>
const ALL = ${JSON.stringify(data)};
const CATS = ${JSON.stringify(CATS)};
let entries = ALL.slice();

function tpsCell(v, approx) {
  if (v == null) return '<span class="approx">—</span>';
  return (approx ? '~' : '') + v.toFixed(1);
}
function ppsCell(v, approx) {
  if (v == null) return '<span class="approx">—</span>';
  return (approx ? '~' : '') + v.toFixed(0);
}
function srcBadge(s) { return '<span class="src '+s+'">'+s+'</span>'; }

function render() {
  renderLeaderboard();
  renderBars('scorebars', [...entries].sort((a,b)=>b.score_pct-a.score_pct),
    r=>r.score_pct, v=>v.toFixed(1)+'%', '#7cf0a4');
  renderBars('genbars', [...entries].filter(r=>r.completion_tps!=null)
      .sort((a,b)=>(b.completion_tps)-(a.completion_tps)),
    r=>r.completion_tps, (v,r)=>(r.completion_tps_approx?'~':'')+v.toFixed(1), '#8ab4ff');
  renderBars('ppbars', [...entries].filter(r=>r.prompt_tps!=null)
      .sort((a,b)=>(b.prompt_tps)-(a.prompt_tps)),
    r=>r.prompt_tps, (v,r)=>(r.prompt_tps_approx?'~':'')+v.toFixed(0), '#f6c453');
  renderBars('scenbars', [...entries].filter(r=>r.avg_scenario_s>0)
      .sort((a,b)=>a.avg_scenario_s-b.avg_scenario_s),
    r=>r.avg_scenario_s, v=>v.toFixed(1)+'s', '#ff6b6b', true);
  renderBars('ttftbars', [...entries].filter(r=>r.avg_first_token_s!=null)
      .sort((a,b)=>a.avg_first_token_s-b.avg_first_token_s),
    r=>r.avg_first_token_s, v=>v.toFixed(2)+'s', '#b38bff', true);
  renderScatter();
  renderHeatmap();
}

function renderLeaderboard() {
  const lb = document.getElementById('leaderboard');
  lb.innerHTML = '';
  const byScore = [...entries].sort((a,b)=>b.score_pct-a.score_pct);
  byScore.forEach((r,i)=>{
    const tr = document.createElement('tr');
    const scoreCls = r.score_pct>=70?'good':r.score_pct>=40?'mid':'bad';
    tr.innerHTML = \`
      <td class="rank num">\${i+1}</td>
      <td class="model l">\${r.m}</td>
      <td class="l">\${srcBadge(r.source)}</td>
      <td class="num \${scoreCls}">
        <div class="pct-bar sm"><span style="width:\${r.score_pct}%"></span></div>\${r.score_pct.toFixed(1)}%
      </td>
      <td class="num">\${r.points_avg.toFixed(1)} / \${r.max_avg.toFixed(0)}</td>
      <td class="num">\${tpsCell(r.completion_tps, r.completion_tps_approx)}</td>
      <td class="num">\${ppsCell(r.prompt_tps, r.prompt_tps_approx)}</td>
      <td class="num">\${r.avg_scenario_s.toFixed(1)}</td>
      <td class="num">\${r.avg_first_token_s!=null?r.avg_first_token_s.toFixed(2):'—'}</td>
      <td class="num">\${r.tool_calls_total}</td>
      <td class="num">\${r.requests}</td>
      <td class="num">\${r.runs}</td>\`;
    lb.appendChild(tr);
  });
}

function renderBars(id, sorted, accessor, format, color, reverseScale) {
  const host = document.getElementById(id);
  host.innerHTML = '';
  if (!sorted.length) {
    host.innerHTML = '<div class="legend">no data</div>';
    return;
  }
  const max = Math.max(...sorted.map(accessor));
  const min = Math.min(...sorted.map(accessor));
  sorted.forEach(r => {
    const v = accessor(r);
    const pct = reverseScale
      ? (max === min ? 100 : ((max - v) / (max - min)) * 100 * 0.95 + 5)
      : (max ? (v/max)*100 : 0);
    const row = document.createElement('div'); row.className='m';
    row.innerHTML = '<span>'+r.m+'</span>' + srcBadge(r.source);
    const track = document.createElement('div'); track.className='bar-track';
    const fill = document.createElement('span');
    fill.style.width = pct+'%'; fill.style.background = color;
    track.appendChild(fill);
    const val = document.createElement('div'); val.className='v';
    val.textContent = typeof format === 'function' ? format(v, r) : format;
    host.appendChild(row); host.appendChild(track); host.appendChild(val);
  });
}

function renderScatter() {
  const host = document.getElementById('scatter');
  host.querySelectorAll('.dot,.lbl,.gridline,.axis.num').forEach(n=>n.remove());
  const W = host.clientWidth, H = 420;
  const padL = 50, padR = 40, padT = 30, padB = 40;
  const plotted = entries.filter(r=>r.completion_tps!=null);
  const xMax = Math.max(1, ...plotted.map(r=>r.completion_tps))*1.1;
  for (let i=0;i<=5;i++){
    const y = padT + (H-padT-padB)*i/5;
    const g = document.createElement('div'); g.className='gridline';
    g.style.left=padL+'px'; g.style.right=padR+'px'; g.style.top=y+'px'; g.style.height='1px';
    host.appendChild(g);
    const lbl = document.createElement('div'); lbl.className='axis num';
    lbl.style.left='10px'; lbl.style.top=(y-6)+'px'; lbl.textContent=(100-(i*20))+'%';
    host.appendChild(lbl);
  }
  for (let i=0;i<=5;i++){
    const x = padL + (W-padL-padR)*i/5;
    const g = document.createElement('div'); g.className='gridline';
    g.style.top=padT+'px'; g.style.bottom=padB+'px'; g.style.left=x+'px'; g.style.width='1px';
    host.appendChild(g);
    const lbl = document.createElement('div'); lbl.className='axis num';
    lbl.style.bottom='18px'; lbl.style.left=(x-10)+'px';
    lbl.textContent=Math.round(xMax*i/5);
    host.appendChild(lbl);
  }
  plotted.forEach(r=>{
    const xp = padL + (r.completion_tps/xMax)*(W-padL-padR);
    const yp = padT + (1 - r.score_pct/100)*(H-padT-padB);
    const size = 10;
    const dot = document.createElement('div'); dot.className='dot';
    dot.style.left = xp+'px'; dot.style.top = yp+'px';
    dot.style.width = size+'px'; dot.style.height = size+'px';
    dot.style.background = 'hsl('+(r.score_pct*1.2)+', 70%, 55%)';
    if (r.source === 'api') dot.style.boxShadow = '0 0 0 2px #b38bff';
    host.appendChild(dot);
    const lbl = document.createElement('div'); lbl.className='lbl';
    lbl.style.left=xp+'px'; lbl.style.top=yp+'px'; lbl.textContent=r.m;
    host.appendChild(lbl);
  });
}

function renderHeatmap() {
  const host = document.getElementById('heatmap');
  const byScore = [...entries].sort((a,b)=>b.score_pct-a.score_pct);
  let html = '<thead><tr><th>model</th><th>src</th>';
  CATS.forEach(c=> html += '<th>'+c+'</th>');
  html += '<th>overall</th></tr></thead><tbody>';
  byScore.forEach(r=>{
    html += '<tr><td class="model">'+r.m+'</td><td>'+srcBadge(r.source)+'</td>';
    CATS.forEach(c=>{
      const cat = r.categories[c];
      if (!cat || cat.max === 0) {
        html += '<td class="cell na">—</td>';
      } else {
        html += '<td class="cell" style="background:hsl('+(cat.pct*1.2)+',60%,55%)">'+cat.pct.toFixed(0)+'</td>';
      }
    });
    html += '<td class="cell" style="background:hsl('+(r.score_pct*1.2)+',60%,55%)">'+r.score_pct.toFixed(0)+'</td></tr>';
  });
  html += '</tbody>';
  host.innerHTML = html;
}

document.querySelectorAll('.filter button').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.filter button').forEach(b=>b.classList.remove('on'));
    btn.classList.add('on');
    const f = btn.dataset.f;
    entries = f === 'all' ? ALL.slice() : ALL.filter(r => r.source === f);
    render();
  });
});

render();
</script>
</body>
</html>`;

writeFileSync(outPath, html);
console.log(
  `wrote ${outPath}\n  ${data.length} models · ${totalRuns} runs · ${localCount} local · ${apiCount} api`,
);
