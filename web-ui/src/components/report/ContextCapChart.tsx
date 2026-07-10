import type { ReportModelAggregate } from "@/types";
import { SectionTitle } from "./SectionTitle";
import { colorFor, layoutEndpointLabels } from "./chart-utils";

const W = 820;
const H = 360;
const PAD = { l: 64, r: 16, t: 16, b: 40 };

const Y_TICKS = [0, 25, 50, 75, 100];

function capLabel(cap: number): string {
  return `${Math.round(cap / 1024)}k`;
}

export function ContextCapChart({ models }: { models: ReportModelAggregate[] }) {
  const plotted = models.filter(
    (m) => m.solveRateByContextCap && m.solveRateByContextCap.points.length > 0
  );

  if (plotted.length === 0) {
    return (
      <section className="mt-8">
        <SectionTitle>Solve rate vs context budget</SectionTitle>
        <div className="text-text-dim text-[12px]">
          No per-request data yet (captured on new runs)
        </div>
      </section>
    );
  }

  // Caps double each step, so index spacing == log2 spacing.
  const caps = plotted[0].solveRateByContextCap!.points.map((p) => p.cap);
  const plotW = W - PAD.l - PAD.r;
  const plotH = H - PAD.t - PAD.b;
  const xOf = (i: number): number => PAD.l + (i / Math.max(caps.length - 1, 1)) * plotW;
  const yOf = (pct: number): number => PAD.t + (1 - pct / 100) * plotH;

  const endpoints = layoutEndpointLabels(
    plotted.map((m) => {
      const pts = m.solveRateByContextCap!.points;
      return {
        model: m.model,
        color: colorFor(m.model),
        x: xOf(pts.length - 1),
        y: yOf(pts[pts.length - 1].pct),
      };
    }),
    PAD.t,
    H - PAD.b,
    W
  );

  return (
    <section className="mt-8">
      <SectionTitle>Solve rate vs context budget</SectionTitle>
      <div className="text-[11px] text-text-dim mb-2">
        Retrospective: a run counts at cap C only if it solved and its peak request fit within C —
        as-executed, not re-run capped. The gap between a model's curve and its plateau is score
        bought with context.
      </div>
      <div className="overflow-x-auto custom-scrollbar">
        <svg
          role="img"
          aria-label="Solve rate under context-window caps, per model"
          viewBox={`0 0 ${W} ${H}`}
          className="w-full max-w-[820px]"
          style={{ minHeight: 300 }}
        >
          {/* x gridlines + cap labels */}
          {caps.map((cap, i) => {
            const x = xOf(i);
            return (
              <g key={`x${cap}`}>
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
                  {capLabel(cap)}
                </text>
              </g>
            );
          })}
          {/* y gridlines */}
          {Y_TICKS.map((t) => {
            const y = yOf(t);
            return (
              <g key={`y${t}`}>
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
                  {t}%
                </text>
              </g>
            );
          })}
          {/* axes */}
          <line
            x1={PAD.l}
            x2={PAD.l}
            y1={PAD.t}
            y2={H - PAD.b}
            stroke="var(--color-text-main)"
            strokeWidth={1.5}
          />
          <line
            x1={PAD.l}
            x2={W - PAD.r}
            y1={H - PAD.b}
            y2={H - PAD.b}
            stroke="var(--color-text-main)"
            strokeWidth={1.5}
          />
          <text
            x={(PAD.l + W - PAD.r) / 2}
            y={H - 4}
            textAnchor="middle"
            fontSize={11}
            fill="var(--color-text-dim, var(--color-text-main))"
          >
            context cap (tokens, log scale)
          </text>
          <text
            x={-(H - PAD.b) / 2 - PAD.t / 2}
            y={16}
            textAnchor="middle"
            fontSize={11}
            fill="var(--color-text-dim, var(--color-text-main))"
            transform="rotate(-90)"
          >
            solve rate
          </text>

          {/* one line per model */}
          {plotted.map((m) => {
            const c = colorFor(m.model);
            const { attempts, points } = m.solveRateByContextCap!;
            const d = points
              .map((p, i) => `${i === 0 ? "M" : "L"} ${xOf(i).toFixed(1)} ${yOf(p.pct).toFixed(1)}`)
              .join(" ");
            return (
              <g key={m.model}>
                <path d={d} fill="none" stroke={c} strokeWidth={1.75} />
                {points.map((p, i) => (
                  <circle key={p.cap} cx={xOf(i)} cy={yOf(p.pct)} r={2.5} fill={c}>
                    <title>{`${m.model} · ≤${capLabel(p.cap)} ctx · ${p.pct.toFixed(0)}% (${p.solved}/${attempts})`}</title>
                  </circle>
                ))}
              </g>
            );
          })}

          {/* direct endpoint labels (drawn last, on top of all lines) */}
          {endpoints.map((e) => {
            const right = e.side === "right";
            const tx = right ? e.x + 7 : e.x - 7;
            return (
              <g key={`lbl-${e.model}`}>
                {Math.abs(e.labelY - e.y) > 1 && (
                  <line
                    x1={e.x}
                    y1={e.y}
                    x2={tx}
                    y2={e.labelY}
                    stroke={e.color}
                    strokeWidth={0.75}
                    opacity={0.5}
                  />
                )}
                <text
                  x={tx}
                  y={e.labelY + 3}
                  textAnchor={right ? "start" : "end"}
                  fontSize={10}
                  fontWeight={700}
                  fill={e.color}
                >
                  {e.model}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </section>
  );
}
