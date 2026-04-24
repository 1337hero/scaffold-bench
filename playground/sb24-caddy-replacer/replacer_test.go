package replacer

import "testing"

// Ported from Caddy's replacer_test.go. The `\}` case exercises the bug
// reported in https://github.com/caddyserver/caddy/issues/... — escaped
// closing braces in inputs without any opening brace are not unescaped.
func TestReplaceAll(t *testing.T) {
	rep := NewReplacer()

	cases := []struct {
		input, expect string
	}{
		{input: `\{`, expect: `{`},
		{input: `\}`, expect: `}`},
		{input: `foo\}`, expect: `foo}`},
		{input: `foo\{bar\}`, expect: `foo{bar}`},
		{input: `{`, expect: `{`},
		{input: `}`, expect: `}`},
		{input: "plain", expect: "plain"},
	}

	for i, tc := range cases {
		actual := rep.ReplaceAll(tc.input, "")
		if actual != tc.expect {
			t.Errorf("case %d: input=%q expect=%q got=%q", i, tc.input, tc.expect, actual)
		}
	}
}
