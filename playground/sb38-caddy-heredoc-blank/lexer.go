// Extracted from Caddy's caddyfile lexer — finalizeHeredoc strips the
// leading padding from each line of a heredoc body so authors can indent
// the content naturally.
//
// BUG: blank lines inside the heredoc have ZERO leading whitespace, so
// they never match the computed padding, and finalizeHeredoc raises a
// "mismatched leading whitespace" error on otherwise-valid documents.
package sb38

import (
	"fmt"
	"strings"
)

// FinalizeHeredoc processes val (runes between "<<MARKER\n" and the
// closing MARKER line, inclusive of the closing line's leading padding).
// The closing-marker line's leading whitespace defines the padding to
// strip from every body line.
func FinalizeHeredoc(val []rune, marker string) (string, error) {
	stringVal := string(val)
	lines := strings.Split(stringVal, "\n")

	// Last line is the padding before the closing marker; it defines
	// what should be stripped from every preceding line.
	paddingToStrip := lines[len(lines)-1]

	// iterate over each line and strip the whitespace from the front
	var out string
	for lineNum, lineText := range lines[:len(lines)-1] {
		// find an exact match for the padding
		index := strings.Index(lineText, paddingToStrip)

		if index != 0 {
			return "", fmt.Errorf(
				"mismatched leading whitespace in heredoc <<%s on line #%d [%s], expected whitespace [%s] to match the closing marker",
				marker, lineNum+1, lineText, paddingToStrip,
			)
		}
		out += strings.TrimPrefix(lineText, paddingToStrip) + "\n"
	}
	// Drop the trailing newline added by the final iteration.
	return strings.TrimSuffix(out, "\n"), nil
}
