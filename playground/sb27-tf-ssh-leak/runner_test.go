package remotexec

import (
	"context"
	"sync"
	"testing"
	"time"
)

type fakeComm struct {
	mu           sync.Mutex
	disconnected chan struct{}
	closed       bool
}

func (f *fakeComm) Connect() error { return nil }

func (f *fakeComm) Disconnect() error {
	f.mu.Lock()
	defer f.mu.Unlock()
	if f.closed {
		return nil
	}
	f.closed = true
	close(f.disconnected)
	return nil
}

// After RunScripts returns, the communicator should disconnect promptly —
// it should NOT wait for the caller's context to end. Reproduces the real
// Terraform bug where long Terraform runs pin SSH connections open until
// the whole run completes.
func TestRunScripts_DisconnectsAfterCommands(t *testing.T) {
	comm := &fakeComm{disconnected: make(chan struct{})}

	// Long-lived caller context, like a real Terraform run.
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	if err := RunScripts(ctx, comm); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	select {
	case <-comm.disconnected:
		// good — disconnected promptly after scripts returned
	case <-time.After(2 * time.Second):
		t.Fatal("communicator did not disconnect after commands completed")
	}
}

// Sanity: if the caller cancels before RunScripts returns, disconnect must
// still fire. Guards against a fix that only handles the happy path.
func TestRunScripts_DisconnectsOnCancellation(t *testing.T) {
	comm := &fakeComm{disconnected: make(chan struct{})}

	ctx, cancel := context.WithCancel(context.Background())

	if err := RunScripts(ctx, comm); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	cancel()

	select {
	case <-comm.disconnected:
		// good
	case <-time.After(2 * time.Second):
		t.Fatal("communicator did not disconnect after context cancellation")
	}
}
