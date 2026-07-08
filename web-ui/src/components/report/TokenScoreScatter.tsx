import { useMemo, useState } from "react";
import type { ParetoPoint, ReportModelAggregate } from "@/types";
import { formatTokenCount } from "@/lib/format";
import { SectionTitle } from "./SectionTitle";

const W = 820;
const H = 460;
const PAD = { l: 64, r: 16, t: 16, b: 40 };

// Distinct palette (theme accent hexes) — index by hash of model name.
const PALETTE = [
  "#40a02b",
  "#1e66f5",
  "#8839ef",
  "#d20f39",
  "#e8590c",
  "#0a9396",
  "#9b59b6",
  "#b5651d",
  "#1e9e8e",
  "#c01a48",
  "#3a5a40",
  "#5b3a8c",
];

function colorFor(model: string): string {
  let h = 0;
  for (let i = 0; i < model.length; i++) h = (h * 31 + model.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

const CLOUD_CAP = 2000;

export function TokenScoreScatter({
  models,
  cloud,
}: {
  models: ReportModelAggregate[];
  cloud?: ParetoPoint[];
}) {
  const [logX, setLogX] = useState(true);
  const [showCloud, setShowCloud] = useState(true);

  const plottedModels = models.filter((m) => m.avgTokensPerScenario > 0);
  const cloudShown =
    showCloud && cloud && cloud.length <= CLOUD_CAP ? cloud : undefined;

  const tokens = useMemo(() => {
    const vals: number[] = [];
    for (const m of plottedModels) vals.push(m.avgTokensPerScenario);
    if (cloudShown) for (const p of cloudShown) vals.push(p.totalTokens);
    return vals;
  }, [plottedModels, cloudShown]);

  const range = useMemo(() => {
    if (tokens.length === 0) return { min: 0, max: 1 };
    const min = Math.min(...tokens);
    const max = Math.max(...tokens);
    return { min: Math.max(min, 1), max };
  }, [tokens]);

  if (plottedModels.length === 0) {
    return (
      <section className="mt-8">
        <SectionTitle>Score vs total tokens</SectionTitle>
        <div className="text-text-dim text-[12px]">No token data (metrics unavailable)</div>
      </section>
    );
  }

  const plotW = W - PAD.l - PAD.r;
  const plotH = H - PAD.t - PAD.b;

  const xOf = (t: number): number => {
    if (logX) {
      const lo = Math.log10(range.min);
      const hi = Math.log10(Math.max(range.max, range.min * 10));
      return PAD.l + ((Math.log10(Math.max(t, 1)) - lo) / (hi - lo)) * plotW;
    }
    const span = Math.max(range.max - range.min, 1);
    return PAD.l + ((t - range.min) / span) * plotW;
  };
  const yOf = (score: number): number =>
    PAD.t + (1 - Math.min(Math.max(score, 0), 100) / 100) * plotH;

  const ticks = logX ? decadeTicks(range.min, range.max) : linearTicks(range.min, range.max);

  return (
    <section className="mt-8">
      <SectionTitle>Score vs total tokens</SectionTitle>
      <div className="flex items-center gap-4 mb-2 text-[11px] text-text-dim">
        <label className="flex items-center gap-1 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={logX}
            onChange={(e) => setLogX(e.target.checked)}
          />
          log-x
        </label>
        <label className="flex items-center gap-1 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={showCloud && !!cloud && cloud.length <= CLOUD_CAP}
            disabled={!cloud || cloud.length > CLOUD_CAP}
            onChange={(e) => setShowCloud(e.target.checked)}
          />
          per-scenario cloud
          {cloud && cloud.length > CLOUD_CAP ? " (hidden, too many points)" : ""}
        </label>
        <span className="ml-auto">frontier = non-dominated (low tokens, high score)</span>
      </div>
      <div className="overflow-x-auto custom-scrollbar">
        <svg
          role="img"
          aria-label="Score vs total tokens per model"
          viewBox={`0 0 ${W} ${H}`}
          className="w-full max-w-[820px]"
          style={{ minHeight: 360 }}
        >
          {/* gridlines + x ticks */}
          {ticks.map((t) => {
            const x = xOf(t);
            return (
              <g key={t}>
                <line
                  x1={x}
                  x2={x}
                  y1={PAD.t}
                  y2={H - PAD.b}
                  stroke="var(--color-border-main)"
                  strokeWidth={1}
                />
                <text
                  x={x}
                  y={H - PAD.b + 16}
                  textAnchor="middle"
                  fontSize={10}
                  fill="var(--color-text-dim, var(--color-text-main))"
                >
                  {formatTokenCount(t)}
                </text>
              </g>
            );
          })}
          {/* y gridlines 0/25/50/75/100 */}
          {[0, 25, 50, 75, 100].map((s) => {
            const y = yOf(s);
            return (
              <g key={s}>
                <line
                  x1={PAD.l}
                  x2={W - PAD.r}
                  y1={y}
                  y2={y}
                  stroke="var(--color-border-main)"
                  strokeWidth={1}
                />
                <text
                  x={PAD.l - 8}
                  y={y + 3}
                  textAnchor="end"
                  fontSize={10}
                  fill="var(--color-text-dim, var(--color-text-main))"
                >
                  {s}%
                </text>
              </g>
            );
          })}
          {/* axes */}
          <line x1={PAD.l} x2={PAD.l} y1={PAD.t} y2={H - PAD.b} stroke="var(--color-text-main)" strokeWidth={1.5} />
          <line x1={PAD.l} x2={W - PAD.r} y1={H - PAD.b} y2={H - PAD.b} stroke="var(--color-text-main)" strokeWidth={1.5} />
          <text x={(PAD.l + W - PAD.r) / 2} y={H - 4} textAnchor="middle" fontSize={11} fill="var(--color-text-dim, var(--color-text-main))">
            total tokens per scenario (avg) {logX ? "· log" : "· linear"}
          </text>
          <text
            x={-(H - PAD.b) / 2 - PAD.t / 2}
            y={16}
            textAnchor="middle"
            fontSize={11}
            fill="var(--color-text-dim, var(--color-text-main))"
            transform="rotate(-90)"
          >
            score %
          </text>

          {/* faint per-scenario-run cloud */}
          {cloudShown?.map((p, i) => (
            <circle
              key={`c${i}`}
              cx={xOf(p.totalTokens)}
              cy={yOf(p.scorePct)}
              r={2}
              fill={colorFor(p.model)}
              opacity={0.16}
            >
              <title>{`${p.model} · ${p.scenarioId} · ${p.scorePct.toFixed(0)}% · ${formatTokenCount(p.totalTokens)} tok`}</title>
            </circle>
          ))}

          {/* headline model points */}
          {plottedModels.map((m) => {
            const x = xOf(m.avgTokensPerScenario);
            const y = yOf(m.scorePct);
            const c = colorFor(m.model);
            return (
              <g key={m.model}>
                <circle
                  cx={x}
                  cy={y}
                  r={m.paretoFrontier ? 8 : 6}
                  fill={m.source === "api" ? c : "none"}
                  stroke={c}
                  strokeWidth={m.paretoFrontier ? 2.5 : 1.5}
                >
                  <title>{`${m.model} · ${m.scorePct.toFixed(0)}% · ${formatTokenCount(m.avgTokensPerScenario)} tok${m.paretoFrontier ? " · frontier" : ""}`}</title>
                </circle>
                {m.paretoFrontier && (
                  <text
                    x={x + 11}
                    y={y - 9}
                    fontSize={10}
                    fill={c}
                    fontWeight={700}
                  >
                    {m.model}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>
      {plottedModels.length > 12 ? (
        <div className="text-[11px] text-text-dim mt-1">{plottedModels.length} models plotted</div>
      ) : (
        <Legend models={plottedModels} />
      )}
    </section>
  );
}

function Legend({ models }: { models: ReportModelAggregate[] }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-[11px]">
      {models.map((m) => (
        <span key={m.model} className="flex items-center gap-1.5">
          <span
            className="inline-block w-2.5 h-2.5 rounded-full"
            style={{
              background: m.source === "api" ? colorFor(m.model) : "transparent",
              border: `1.5px solid ${colorFor(m.model)}`,
            }}
          />
          <span className="text-text-main truncate max-w-[180px]">{m.model}</span>
          {m.paretoFrontier && <span className="text-text-dim">★</span>}
        </span>
      ))}
    </div>
  );
}

function decadeTicks(min: number, max: number): number[] {
  const lo = Math.floor(Math.log10(Math.max(min, 1)));
  const hi = Math.ceil(Math.log10(Math.max(max, 1)));
  const ticks: number[] = [];
  for (let e = lo; e <= hi; e++) ticks.push(Math.pow(10, e));
  return ticks;
}

function linearTicks(min: number, max: number): number[] {
  const span = max - min;
  const step = niceStep(span / 5);
  const start = Math.ceil(min / step) * step;
  const ticks: number[] = [];
  for (let v = start; v <= max; v += step) ticks.push(Math.round(v));
  if (ticks.length === 0) ticks.push(Math.round(min), Math.round(max));
  return ticks;
}

function niceStep(raw: number): number {
  const pow = Math.pow(10, Math.floor(Math.log10(raw)));
  const n = raw / pow;
  const nice = n < 1.5 ? 1 : n < 3 ? 2 : n < 7 ? 5 : 10;
  return nice * pow;
}
