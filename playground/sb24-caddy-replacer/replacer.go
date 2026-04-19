// Extracted and trimmed from Caddy's replacer.go at commit c839a98f (Caddy 2.7).
// Preserves the real replace() logic verbatim, including the bug.
// Original: https://github.com/caddyserver/caddy/blob/master/replacer.go

package replacer

import (
	"fmt"
	"strings"
)

// NewReplacer returns an empty Replacer with a static map.
func NewReplacer() *Replacer {
	return &Replacer{static: make(map[string]any)}
}

// Replacer evaluates placeholders of the form {key} against static values.
// Escaped braces like \{ and \} are converted to literal { and }.
type Replacer struct {
	static map[string]any
}

// Set assigns variable to value.
func (r *Replacer) Set(variable string, value any) {
	r.static[variable] = value
}

// Get returns the value for variable.
func (r *Replacer) Get(variable string) (any, bool) {
	v, ok := r.static[variable]
	return v, ok
}

// ReplaceAll evaluates all placeholders in input. Unknown placeholders
// are replaced with empty (if non-empty) or removed.
func (r *Replacer) ReplaceAll(input, empty string) string {
	out, _ := r.replace(input, empty, true, false, false, nil)
	return out
}

// ReplaceFunc is ReplaceAll with a transform hook per replacement.
func (r *Replacer) ReplaceFunc(input string, f ReplacementFunc) (string, error) {
	return r.replace(input, "", true, false, false, f)
}

func (r *Replacer) replace(input, empty string,
	treatUnknownAsEmpty, errOnEmpty, errOnUnknown bool,
	f ReplacementFunc,
) (string, error) {
	if !strings.Contains(input, string(phOpen)) {
		return input, nil
	}

	var sb strings.Builder
	sb.Grow(len(input))

	var lastWriteCursor int
	var unclosedCount int

scan:
	for i := 0; i < len(input); i++ {
		if i > 0 && input[i-1] == phEscape && (input[i] == phClose || input[i] == phOpen) {
			sb.WriteString(input[lastWriteCursor : i-1])
			lastWriteCursor = i
			continue
		}

		if input[i] != phOpen {
			continue
		}

		if unclosedCount > 100 {
			return "", fmt.Errorf("too many unclosed placeholders")
		}

		end := strings.Index(input[i:], string(phClose)) + i
		if end < i {
			unclosedCount++
			continue
		}

		for end > 0 && end < len(input)-1 && input[end-1] == phEscape {
			nextEnd := strings.Index(input[end+1:], string(phClose))
			if nextEnd < 0 {
				unclosedCount++
				continue scan
			}
			end += nextEnd + 1
		}

		sb.WriteString(input[lastWriteCursor:i])

		key := input[i+1 : end]

		val, found := r.Get(key)
		if !found {
			if errOnUnknown {
				return "", fmt.Errorf("unrecognized placeholder %s%s%s",
					string(phOpen), key, string(phClose))
			} else if !treatUnknownAsEmpty {
				lastWriteCursor = i
				continue
			}
		}

		if f != nil {
			var err error
			val, err = f(key, val)
			if err != nil {
				return "", err
			}
		}

		valStr := toString(val)

		if valStr == "" {
			if errOnEmpty {
				return "", fmt.Errorf("evaluated placeholder %s%s%s is empty",
					string(phOpen), key, string(phClose))
			} else if empty != "" {
				sb.WriteString(empty)
			}
		} else {
			sb.WriteString(valStr)
		}

		i = end
		lastWriteCursor = i + 1
	}

	sb.WriteString(input[lastWriteCursor:])

	return sb.String(), nil
}

// toString converts val to a string (minimal, test-fixture version).
func toString(val any) string {
	switch v := val.(type) {
	case nil:
		return ""
	case string:
		return v
	case fmt.Stringer:
		return v.String()
	default:
		return fmt.Sprintf("%v", v)
	}
}

// ReplacementFunc can modify a value mid-replacement.
type ReplacementFunc func(variable string, val any) (any, error)

const phOpen, phClose, phEscape = '{', '}', '\\'
