package promql

import (
	"testing"
	"time"
)

// In agent mode, the PromQL engine is nil. Calling Close() on a nil pointer
// receiver must not panic — it should return nil. This reproduces the real
// Prometheus crash at shutdown.
func TestEngine_Close_Nil(t *testing.T) {
	var ng *Engine
	if err := ng.Close(); err != nil {
		t.Errorf("expected no error on nil engine Close; got %v", err)
	}
}

// Non-nil engine with no tracker: Close() should return nil cleanly.
// Guard against a fix that over-corrects and breaks the happy path.
func TestEngine_Close_NonNil(t *testing.T) {
	ng := NewEngine(EngineOpts{
		Timeout:              100 * time.Second,
		EnableAtModifier:     true,
		EnableNegativeOffset: true,
	})
	if err := ng.Close(); err != nil {
		t.Errorf("expected no error; got %v", err)
	}
}

type fakeTracker struct{ closed bool }

func (f *fakeTracker) Close() error { f.closed = true; return nil }

// Non-nil engine with a tracker: Close() must still invoke the tracker.
// Guard against a fix that short-circuits all the way through.
func TestEngine_Close_InvokesTracker(t *testing.T) {
	tracker := &fakeTracker{}
	ng := NewEngine(EngineOpts{ActiveQueryTracker: tracker})
	if err := ng.Close(); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !tracker.closed {
		t.Errorf("expected tracker.Close() to be invoked")
	}
}
