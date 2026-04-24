// Extracted from Caddy's fileReplacementProvider.replace — the {file.*}
// global placeholder that reads a file and returns its contents for use
// in Caddyfile expressions.
//
// BUG: replace() returns the raw file contents, including the trailing
// newline that virtually every text editor appends. Users expect
// {file.path/to/secret.txt} to equal the secret, not "secret\n" —
// especially important for basicauth password hashes, API keys, etc.
package sb37

import (
	"os"
)

// FileReplacer reads a file by key and returns its string contents.
// key is a filesystem path relative to the current working directory.
type FileReplacer struct{}

func (f FileReplacer) Replace(key string) (string, bool) {
	body, err := os.ReadFile(key)
	if err != nil {
		return "", false
	}
	return string(body), true
}
