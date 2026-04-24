// Extracted and trimmed from Prometheus's promql/engine.go at commit 9f57f14d.
// Preserves the buggy Close() body verbatim with local stubs for Engine/EngineOpts
// so it compiles standalone.
// Original: https://github.com/prometheus/prometheus/blob/main/promql/engine.go

package promql

import "time"

// ActiveQueryTracker is the minimum interface Close() needs from the real
// Prometheus tracker type.
type ActiveQueryTracker interface {
	Close() error
}

// EngineOpts holds configuration for NewEngine. Trimmed to the fields used
// by this fixture.
type EngineOpts struct {
	Timeout              time.Duration
	MaxSamples           int
	ActiveQueryTracker   ActiveQueryTracker
	EnableAtModifier     bool
	EnableNegativeOffset bool
}

// Engine runs PromQL queries. Trimmed from the full Prometheus Engine.
type Engine struct {
	timeout              time.Duration
	maxSamplesPerQuery   int
	activeQueryTracker   ActiveQueryTracker
	enableAtModifier     bool
	enableNegativeOffset bool
}

// NewEngine returns a new Engine.
func NewEngine(opts EngineOpts) *Engine {
	return &Engine{
		timeout:              opts.Timeout,
		maxSamplesPerQuery:   opts.MaxSamples,
		activeQueryTracker:   opts.ActiveQueryTracker,
		enableAtModifier:     opts.EnableAtModifier,
		enableNegativeOffset: opts.EnableNegativeOffset,
	}
}

// Close closes ng.
func (ng *Engine) Close() error {
	if ng.activeQueryTracker != nil {
		return ng.activeQueryTracker.Close()
	}
	return nil
}
