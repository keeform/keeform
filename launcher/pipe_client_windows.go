//go:build windows

package main

import (
	"errors"
	"net"
	"syscall"
	"time"

	"github.com/Microsoft/go-winio"
)

// dialPipeOnce attempts a single connection to a Windows named pipe.
// Uses a short timeout so the retry loop in dialPipe works correctly.
func dialPipeOnce(pipePath string) (net.Conn, error) {
	timeout := 500 * time.Millisecond
	return winio.DialPipe(pipePath, &timeout)
}

// isPipeBusy returns true if the error indicates the pipe is busy
// (another client is connected and the pipe has max instances).
func isPipeBusy(err error) bool {
	if err == nil {
		return false
	}
	// ERROR_PIPE_BUSY = 231
	var errno syscall.Errno
	if errors.As(err, &errno) {
		return errno == 231
	}
	return false
}
