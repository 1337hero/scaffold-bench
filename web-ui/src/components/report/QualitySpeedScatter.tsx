import type { ReportModelAggregate } from "@/types";
import { SectionTitle } from "./SectionTitle";

export function QualitySpeedScatter({ models }: { models: ReportModelAggregate[] }) {
  const plotted = models.filter((model) => model.completionTps !== null);
  const xMax = Math.max(1, ...plotted.map((model) => model.completionTps ?? 0)) * 1.1;
  const width = 640;
  const height = 340;
  const pad = { left: 52, right: 28, top: 24, bottom: 42 };

  return (
    <section className="mt-8">
      <SectionTitle>Quality × speed</SectionTitle>
      <div className="bg-content-bg border border-border-main rounded-sm overflow-hidden">
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-[360px]">
          {Array.from({ length: 6 }, (_, index) => {
            const y = pad.top + ((height - pad.top - pad.bottom) * index) / 5;
            const x = pad.left + ((width - pad.left - pad.right) * index) / 5;
            return (
              <g key={index}>
                <line x1={pad.left} x2={width - pad.right} y1={y} y2={y} stroke="#242831" />
                <line y1={pad.top} y2={height - pad.bottom} x1={x} x2={x} stroke="#242831" />
                <text x={8} y={y + 4} fill="#626772" fontSize="10">{100 - index * 20}%</text>
                <text x={x - 8} y={height - 16} fill="#626772" fontSize="10">{Math.round((xMax * index) / 5)}</text>
              </g>
            );
          })}
          {plotted.map((model) => {
            const x = pad.left + ((model.completionTps ?? 0) / xMax) * (width - pad.left - pad.right);
            const y = pad.top + (1 - model.scorePct / 100) * (height - pad.top - pad.bottom);
            return (
              <g key={model.model}>
                <circle cx={x} cy={y} r="5" fill={`hsl(${model.scorePct * 1.2}, 70%, 55%)`} stroke={model.source === "api" ? "#b38bff" : "#0C0D10"} strokeWidth="2" />
                <text x={x} y={y - 10} fill="#E2E4E9" fontSize="10" textAnchor="middle">{model.model}</text>
              </g>
            );
          })}
          <text x={pad.left} y={16} fill="#626772" fontSize="10">quality · % score</text>
          <text x={width - 130} y={height - 8} fill="#626772" fontSize="10">generation tok/s</text>
        </svg>
      </div>
    </section>
  );
}
