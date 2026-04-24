import { useEffect, useRef, useState } from "react";
import type { RunStatus } from "@/types";

export function useElapsedTimer(status: RunStatus, startedAt?: number | null): number {
  const [elapsed, setElapsed] = useState(0);
  const startTimeRef = useRef<number | null>(null);

  useEffect(() => {
    if (status === "running") {
      if (!startTimeRef.current) {
        startTimeRef.current = startedAt ?? Date.now();
      }
      const interval = setInterval(() => {
        setElapsed(Date.now() - (startTimeRef.current ?? Date.now()));
      }, 1000);
      return () => clearInterval(interval);
    } else if (status !== "idle") {
      return;
    } else {
      startTimeRef.current = null;
      setElapsed(0);
      return;
    }
  }, [status, startedAt]);

  return elapsed;
}
