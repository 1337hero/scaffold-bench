import { strict as assert } from "node:assert";
import { Tokenizer } from "./tokenizer.ts";

// Case 1 — no v-pre, default behavior: `{{ foo }}` is an interpolation.
{
  const tk = new Tokenizer();
  const out = tk.tokenize("hello {{ foo }} world");
  assert.deepEqual(out, [
    { type: "text", value: "hello " },
    { type: "interpolation", value: "foo" },
    { type: "text", value: " world" },
  ]);
}

// Case 2 — THE bug. With inVPre=true, mustaches must be treated as
// literal text. Pre-fix the tokenizer goes into INTERP_INNER and emits
// an interpolation token (or swallows text until end-of-input).
{
  const tk = new Tokenizer();
  const out = tk.tokenize("{{ foo }}", { inVPre: true });
  assert.deepEqual(out, [{ type: "text", value: "{{ foo }}" }]);
}

// Case 3 — v-pre with unterminated mustache (the real-world symptom in
// #11915): `<textarea>{{ foo </textarea>` should stream through as text.
// Here we feed the raw text content only, since the outer element
// parsing lives above this tokenizer.
{
  const tk = new Tokenizer();
  const out = tk.tokenize("{{ foo ", { inVPre: true });
  assert.deepEqual(out, [{ type: "text", value: "{{ foo " }]);
}

// Case 4 — v-pre false, unterminated mustache stays in interpolation
// state (consistent with Vue's real behavior — unterminated `{{` is a
// parse error, but the RCDATA-state guard isn't what controls that).
{
  const tk = new Tokenizer();
  const out = tk.tokenize("{{ foo ", { inVPre: false });
  // Implementation detail: the half-open interpolation has no text
  // token emitted for it, since we never flushed. That's fine — the
  // point of this case is to confirm v-pre=false doesn't divert.
  assert.ok(
    !out.some((t) => t.type === "text" && t.value.startsWith("{{")),
    "v-pre=false: '{{' should not come out as literal text"
  );
}

console.log("sb34 ok");
