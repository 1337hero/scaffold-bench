import { useEffect, useMemo, useRef, useState } from "react";
import { Copy, Download, ExternalLink, Maximize2, RotateCw } from "lucide-react";
import { extractHtml } from "@/lib/extract-html";
import { api } from "@/api/client";
import type { OneshotPromptState } from "@/hooks/oneshot-state-reducer";

interface OneshotCanvasProps {
  promptId: string | null;
  prompt?: OneshotPromptState;
}

export function OneshotCanvas({ promptId, prompt }: OneshotCanvasProps) {
  const [showRaw, setShowRaw] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const streamRef = useRef<HTMLPreElement>(null);

  const text = prompt?.output ?? "";
  const streaming = prompt?.status === "running";
  const hasArtifact = Boolean(prompt?.artifact) && promptId !== null;
  const artifactUrl = hasArtifact
    ? api.oneshotArtifactUrl(promptId, prompt?.artifactVersion)
    : null;

  const extraction = useMemo(
    () => (hasArtifact || streaming ? null : extractHtml(text)),
    [hasArtifact, streaming, text]
  );

  // New prompt or fresh run: reset to artifact view
  useEffect(() => {
    setShowRaw(false);
    setReloadKey(0);
  }, [promptId]);

  // Follow the live stream
  useEffect(() => {
    if (!streaming || !streamRef.current) return;
    streamRef.current.scrollTop = streamRef.current.scrollHeight;
  }, [streaming, text]);

  const copyRaw = async () => {
    await navigator.clipboard.writeText(text);
  };

  const downloadHtml = () => {
    const html = extraction?.html ?? extractHtml(text)?.html ?? text;
    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${promptId ?? "oneshot"}.html`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const toggleFullscreen = () => {
    if (document.fullscreenElement) {
      void document.exitFullscreen();
    } else {
      void containerRef.current?.requestFullscreen();
    }
  };

  const renderable = hasArtifact || extraction !== null;

  return (
    <div ref={containerRef} className="flex flex-col h-full min-h-0 bg-bg-main">
      <div className="flex items-center justify-between px-2 py-1 border-b border-border-main text-[11px] text-text-dim">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowRaw((v) => !v)}
            disabled={streaming}
            className="px-2 py-0.5 border border-border-main rounded-sm hover:border-gold hover:text-gold disabled:opacity-40"
          >
            {showRaw ? "Show artifact" : "Show raw text"}
          </button>
          {streaming ? (
            <span className="text-gold">
              Streaming… {text.length.toLocaleString()} chars
            </span>
          ) : null}
        </div>
        <div className="flex items-center gap-1">
          <ToolbarButton
            label="Reload artifact"
            disabled={!renderable || streaming}
            onClick={() => setReloadKey((k) => k + 1)}
          >
            <RotateCw size={12} />
          </ToolbarButton>
          {artifactUrl ? (
            <a
              href={artifactUrl}
              target="_blank"
              rel="noreferrer"
              title="Open in new tab"
              className="p-1 border border-border-main rounded-sm hover:border-blue-main hover:text-blue-main"
            >
              <ExternalLink size={12} />
            </a>
          ) : (
            <ToolbarButton label="Open in new tab" disabled>
              <ExternalLink size={12} />
            </ToolbarButton>
          )}
          <ToolbarButton label="Download HTML" disabled={text.length === 0} onClick={downloadHtml}>
            <Download size={12} />
          </ToolbarButton>
          <ToolbarButton label="Copy raw output" disabled={text.length === 0} onClick={copyRaw}>
            <Copy size={12} />
          </ToolbarButton>
          <ToolbarButton label="Fullscreen" onClick={toggleFullscreen}>
            <Maximize2 size={12} />
          </ToolbarButton>
        </div>
      </div>

      <div className="flex flex-1 min-h-0">
        {streaming ? (
          <pre
            ref={streamRef}
            className="flex-1 min-h-0 overflow-auto p-3 text-xs whitespace-pre-wrap font-mono text-text-main"
          >
            {text || "Waiting for first token…"}
          </pre>
        ) : showRaw ? (
          <pre className="flex-1 min-h-0 overflow-auto p-3 text-sm whitespace-pre-wrap font-mono text-text-main">
            {text || "(no output yet)"}
          </pre>
        ) : text.length === 0 && !hasArtifact ? (
          <div className="flex flex-1 items-center justify-center text-xs text-text-dim">
            No output yet — run this prompt to see its artifact.
          </div>
        ) : artifactUrl ? (
          // Deliberately unsandboxed: artifacts need localStorage (high scores,
          // kanban persistence) and are locally-generated model output.
          // eslint-disable-next-line react/iframe-missing-sandbox
          <iframe
            key={`${artifactUrl}-${reloadKey}`}
            title="Model artifact"
            src={artifactUrl}
            className="w-full flex-1 min-h-0 block bg-white"
          />
        ) : extraction ? (
          <iframe
            key={reloadKey}
            title="Model artifact"
            srcDoc={extraction.html}
            sandbox="allow-scripts"
            className="w-full flex-1 min-h-0 block bg-white"
          />
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 text-xs text-text-dim">
            <div>No renderable HTML found in the model output.</div>
            <button
              onClick={() => setShowRaw(true)}
              className="px-2 py-0.5 border border-border-main rounded-sm hover:border-gold hover:text-gold"
            >
              Show raw text
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function ToolbarButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled?: boolean;
  onClick?: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={label}
      className="p-1 border border-border-main rounded-sm hover:border-blue-main hover:text-blue-main disabled:opacity-40 disabled:cursor-not-allowed"
    >
      {children}
    </button>
  );
}
