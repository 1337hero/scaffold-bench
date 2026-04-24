// Extracted and trimmed from Terraform's internal/builtin/provisioners/remote-exec/resource_provisioner.go
// at commit 310331bd. Preserves the buggy disconnect goroutine pattern with a
// simplified Communicator interface so it compiles standalone.
// Original: https://github.com/hashicorp/terraform/blob/main/internal/builtin/provisioners/remote-exec/resource_provisioner.go

package remotexec

import "context"

// Communicator is the minimum interface we need from the real Terraform
// communicator. Real one has ~15 methods — for this fixture, Connect and
// Disconnect are enough to reproduce the SSH-pin-open bug.
type Communicator interface {
	Connect() error
	Disconnect() error
}

// RunScripts connects, runs a (simulated) script, and spawns a goroutine
// that is supposed to disconnect the communicator when the commands are
// done. BUG: the goroutine waits on the caller's ctx, which stays live
// after the scripts return. The communicator stays connected — SSH
// connections pin open for the entire Terraform run.
func RunScripts(ctx context.Context, comm Communicator) error {
	if err := comm.Connect(); err != nil {
		return err
	}

	// Wait for the context to end and then disconnect.
	go func() {
		<-ctx.Done()
		comm.Disconnect()
	}()

	// Real implementation uploads and runs each script here.
	// Fixture no-op: nothing to run.
	return nil
}
