import { useEffect, useRef } from "react";
import type { OneshotEvent } from "@/types";

const EVENT_TYPES: OneshotEvent["type"][] = [
  "oneshot_run_started",
  "oneshot_test_started",
  "oneshot_delta",
  "oneshot_test_finished",
  "oneshot_run_finished",
  "oneshot_run_failed",
];

export function useOneshotSSE(
  runId: string | null,
  onEvent: (event: OneshotEvent) => void,
  opts?: { onOpen?: () => void; onError?: () => void }
): void {
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;
  const onOpenRef = useRef(opts?.onOpen);
  onOpenRef.current = opts?.onOpen;
  const onErrorRef = useRef(opts?.onError);
  onErrorRef.current = opts?.onError;

  useEffect(() => {
    if (!runId) return;

    const source = new EventSource(`/api/oneshot/runs/${runId}/stream`);

    const handle = (evt: MessageEvent<string>) => {
      try {
        onEventRef.current(JSON.parse(evt.data) as OneshotEvent);
      } catch {}
    };

    const handleOpen = () => {
      onOpenRef.current?.();
    };

    const handleError = () => {
      onErrorRef.current?.();
    };

    for (const type of EVENT_TYPES) {
      source.addEventListener(type, handle as EventListener);
    }

    source.addEventListener("open", handleOpen);
    source.addEventListener("error", handleError);

    return () => {
      for (const type of EVENT_TYPES) {
        source.removeEventListener(type, handle as EventListener);
      }
      source.removeEventListener("open", handleOpen);
      source.removeEventListener("error", handleError);
      source.close();
    };
  }, [runId]);
}
