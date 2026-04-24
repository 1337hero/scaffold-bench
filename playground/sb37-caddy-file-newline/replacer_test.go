package sb37

import (
	"os"
	"path/filepath"
	"testing"
)

func writeFile(t *testing.T, dir, name, contents string) string {
	t.Helper()
	p := filepath.Join(dir, name)
	if err := os.WriteFile(p, []byte(contents), 0644); err != nil {
		t.Fatalf("write: %v", err)
	}
	return p
}

func TestReplaceStripsSingleTrailingNewline(t *testing.T) {
	dir := t.TempDir()
	p := writeFile(t, dir, "plain.txt", "foo\n")

	f := FileReplacer{}
	got, ok := f.Replace(p)
	if !ok {
		t.Fatal("Replace returned not-ok for existing file")
	}
	if got != "foo" {
		t.Fatalf("trailing newline not stripped: got %q, want %q", got, "foo")
	}
}

func TestReplaceStripsTrailingCRLF(t *testing.T) {
	dir := t.TempDir()
	p := writeFile(t, dir, "crlf.txt", "foo\r\n")

	f := FileReplacer{}
	got, _ := f.Replace(p)
	if got != "foo" {
		t.Fatalf("trailing CRLF not stripped: got %q, want %q", got, "foo")
	}
}

func TestReplacePreservesInteriorNewlines(t *testing.T) {
	// Only the LAST newline should be stripped. Files with multiple
	// trailing newlines should keep n-1 of them.
	dir := t.TempDir()
	p := writeFile(t, dir, "multi.txt", "foo\n\n")

	f := FileReplacer{}
	got, _ := f.Replace(p)
	if got != "foo\n" {
		t.Fatalf("interior newline not preserved: got %q, want %q", got, "foo\n")
	}
}

func TestReplaceNoNewline(t *testing.T) {
	dir := t.TempDir()
	p := writeFile(t, dir, "bare.txt", "foo")

	f := FileReplacer{}
	got, _ := f.Replace(p)
	if got != "foo" {
		t.Fatalf("got %q, want %q", got, "foo")
	}
}
