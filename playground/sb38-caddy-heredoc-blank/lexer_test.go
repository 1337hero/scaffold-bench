package sb38

import "testing"

// The val passed to FinalizeHeredoc is already the content starting after
// "<<MARKER\n", ending with the leading-whitespace of the closing marker.

func TestHeredocNoIndent(t *testing.T) {
	in := []rune("foo\nbar\n")
	got, err := FinalizeHeredoc(in, "EOF")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got != "foo\nbar" {
		t.Fatalf("got %q, want %q", got, "foo\nbar")
	}
}

func TestHeredocBlankLineNoIndent(t *testing.T) {
	// Blank line, no indent on closing marker. Padding is "", which
	// trivially matches empty lines, so this works pre-fix. Sanity case.
	in := []rune("line one\n\nline two\n")
	got, err := FinalizeHeredoc(in, "EOF")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	want := "line one\n\nline two"
	if got != want {
		t.Fatalf("got %q, want %q", got, want)
	}
}

func TestHeredocIndentedWithBlankLine(t *testing.T) {
	// Indented heredoc with a blank line inside. Closing marker's indent
	// is one tab → paddingToStrip is "\t". The blank line is literally "" —
	// strings.Index("", "\t") returns -1, not 0, so pre-fix FinalizeHeredoc
	// errors on the blank line. This is the reported bug.
	in := []rune("\tline one\n\n\tline two\n\t")
	got, err := FinalizeHeredoc(in, "EOF")
	if err != nil {
		t.Fatalf("unexpected error on blank line in indented heredoc: %v", err)
	}
	want := "line one\n\nline two"
	if got != want {
		t.Fatalf("got %q, want %q", got, want)
	}
}

func TestHeredocIndentMismatchStillErrors(t *testing.T) {
	// Non-empty line that fails padding match must still error — the fix
	// should special-case only truly-empty lines.
	in := []rune("\t\tcontent\n\tmismatch\n\t\t")
	_, err := FinalizeHeredoc(in, "EOF")
	if err == nil {
		t.Fatal("expected mismatched-whitespace error, got nil")
	}
}
