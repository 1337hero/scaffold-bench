// Extracted from Vue 3's compiler-core Tokenizer — the state handling for
// RCDATA elements (<title>, <textarea>). Inside these tags the parser
// still looks for the interpolation delimiter (default "{{") to support
// templating.
//
// BUG: when v-pre is active on an ancestor element, the parser should
// treat ALL mustache delimiters as literal text, not just those in the
// normal text state. The RCDATA-state dispatch does NOT consult
// this.inVPre, so `<div v-pre><textarea>{{ foo </textarea></div>`
// starts interpolation at `{{`, then never sees a closing `}}`, and
// emits a broken token stream.
//
// Fix (from vuejs/core#11915): gate the interpolation-open transition
// on `!this.inVPre`. Inside v-pre, RCDATA content is kept verbatim.

export type Token =
  | { type: "text"; value: string }
  | { type: "interpolation"; value: string };

export class Tokenizer {
  inVPre = false;
  state: "RCDATA" | "INTERP_OPEN" | "INTERP_INNER" = "RCDATA";
  buffer = "";
  tokens: Token[] = [];
  delimiterOpen = ["{", "{"];
  delimiterClose = ["}", "}"];
  delimiterIndex = 0;

  tokenize(input: string, opts: { inVPre?: boolean } = {}): Token[] {
    this.inVPre = opts.inVPre ?? false;
    this.state = "RCDATA";
    this.buffer = "";
    this.tokens = [];
    this.delimiterIndex = 0;

    for (let i = 0; i < input.length; i++) {
      const c = input[i];
      if (this.state === "RCDATA") {
        // This is the buggy branch. Interpolation-open fires regardless
        // of v-pre because the guard is missing.
        if (c === this.delimiterOpen[0]) {
          this.state = "INTERP_OPEN";
          this.delimiterIndex = 1;
        } else {
          this.buffer += c;
        }
      } else if (this.state === "INTERP_OPEN") {
        if (c === this.delimiterOpen[this.delimiterIndex]) {
          this.flushBuffer();
          this.state = "INTERP_INNER";
          this.buffer = "";
          this.delimiterIndex = 0;
        } else {
          // Not a full delimiter — recover: prepend the consumed open
          // char, stay in RCDATA.
          this.buffer += this.delimiterOpen[0] + c;
          this.state = "RCDATA";
        }
      } else if (this.state === "INTERP_INNER") {
        if (c === this.delimiterClose[0] && input[i + 1] === this.delimiterClose[1]) {
          this.tokens.push({ type: "interpolation", value: this.buffer.trim() });
          this.buffer = "";
          this.state = "RCDATA";
          i++;
        } else {
          this.buffer += c;
        }
      }
    }
    this.flushBuffer();
    return this.tokens;
  }

  flushBuffer() {
    if (this.buffer.length > 0) {
      this.tokens.push({ type: "text", value: this.buffer });
      this.buffer = "";
    }
  }
}
