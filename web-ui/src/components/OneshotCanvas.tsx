import { useMemo, useState } from "react";
import { extractHtml } from "@/lib/extract-html";

interface OneshotCanvasProps {
  text: string;
}

export function OneshotCanvas({ text }: OneshotCanvasProps) {
  const [showRaw, setShowRaw] = useState(false);

  const extraction = useMemo(() => extractHtml(text), [text]);
  const isComplete = extraction !== null && /<\/html>/i.test(extraction.html);

  const copyRaw = async () => {
    await navigator.clipboard.writeText(text);
  };

  const sourceLabel =
    extraction?.source === "fence" ? "from ```html fence" : extraction ? "from raw text" : null;

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex items-center justify-between px-2 py-1 border-b border-border-main text-[11px] text-text-dim">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowRaw((v) => !v)}
            className="px-2 py-0.5 border border-border-main rounded-sm hover:border-gold hover:text-gold"
          >
            {showRaw ? "Show artifact" : "Show raw text"}
          </button>
          {!showRaw && sourceLabel ? (
            <span className="text-text-dim">{sourceLabel}</span>
          ) : null}
        </div>
        <button
          onClick={copyRaw}
          disabled={text.length === 0}
          className="px-2 py-0.5 border border-border-main rounded-sm hover:border-blue-main hover:text-blue-main disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Copy
        </button>
      </div>

      <div className="flex-1 min-h-[52vh] bg-bg-main">
        {showRaw ? (
          <pre className="h-full overflow-auto p-3 text-sm whitespace-pre-wrap font-mono text-text-main">
            {text || "(no output yet)"}
          </pre>
        ) : text.length === 0 ? (
          <div className="h-full flex items-center justify-center text-xs text-text-dim">
            Waiting for model output…
          </div>
        ) : extraction && isComplete ? (
          <iframe
            title="Model artifact"
            srcDoc={extraction.html}
            sandbox="allow-scripts"
            className="w-full h-full block bg-white"
          />
        ) : extraction ? (
          <div className="h-full flex items-center justify-center text-xs text-text-dim">
            Streaming artifact… renders when the document closes.
          </div>
        ) : (
          <div className="h-full flex flex-col items-center justify-center gap-2 text-xs text-text-dim">
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
