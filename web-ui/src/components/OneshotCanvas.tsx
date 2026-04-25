import { useEffect, useMemo, useRef, useState } from "react";
import { wrapText } from "@/lib/canvas-text";

interface OneshotCanvasProps {
  text: string;
}

export function OneshotCanvas({ text }: OneshotCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [showRaw, setShowRaw] = useState(false);
  const [canvasWidth, setCanvasWidth] = useState(0);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;

    const updateWidth = () => setCanvasWidth(element.clientWidth);
    updateWidth();

    const observer = new ResizeObserver(updateWidth);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const lines = useMemo(() => {
    const canvas = canvasRef.current;
    if (!canvas || canvasWidth <= 0) return text.split("\n");

    const ctx = canvas.getContext("2d");
    if (!ctx) return text.split("\n");

    ctx.font = '13px "CommitMono", monospace';
    return wrapText((s) => ctx.measureText(s).width, text, Math.max(100, canvasWidth - 24));
  }, [text, canvasWidth]);

  useEffect(() => {
    if (showRaw) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const lineHeight = 18;
    const visible = Math.max(1, Math.floor((height - 16) / lineHeight));
    const start = Math.max(0, lines.length - visible);

    const raf = requestAnimationFrame(() => {
      ctx.fillStyle = "#0f1115";
      ctx.fillRect(0, 0, width, height);
      ctx.font = '13px "CommitMono", monospace';
      ctx.fillStyle = "#d0d5df";
      ctx.textBaseline = "top";

      let y = 8;
      for (let i = start; i < lines.length; i++) {
        ctx.fillText(lines[i], 12, y);
        y += lineHeight;
      }
    });

    return () => cancelAnimationFrame(raf);
  }, [lines, showRaw]);

  const copyRaw = async () => {
    await navigator.clipboard.writeText(text);
  };

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex items-center justify-between px-2 py-1 border-b border-border-main text-[11px] text-text-dim">
        <button
          onClick={() => setShowRaw((v) => !v)}
          className="px-2 py-0.5 border border-border-main rounded-sm hover:border-gold hover:text-gold"
        >
          {showRaw ? "Show canvas" : "Show raw text"}
        </button>
        {showRaw ? (
          <button
            onClick={copyRaw}
            className="px-2 py-0.5 border border-border-main rounded-sm hover:border-blue-main hover:text-blue-main"
          >
            Copy
          </button>
        ) : null}
      </div>

      <div ref={containerRef} className="flex-1 min-h-[52vh] bg-bg-main">
        {showRaw ? (
          <pre className="h-full overflow-auto p-3 text-sm whitespace-pre-wrap font-mono text-text-main">
            {text || "(no output yet)"}
          </pre>
        ) : text.length === 0 ? (
          <div className="h-full flex items-center justify-center text-xs text-text-dim">
            Waiting for model output…
          </div>
        ) : (
          <canvas ref={canvasRef} className="w-full h-full block" />
        )}
      </div>
    </div>
  );
}
