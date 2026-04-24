// Discriminated union: a tool either succeeded with a value, or failed with
// a message. Replaces the legacy "error: ..." string sentinel.
export type ToolResult =
  | { ok: true; value: string }
  | { ok: false; message: string };

export const ok = (value: string): ToolResult => ({ ok: true, value });
export const err = (message: string): ToolResult => ({ ok: false, message });
