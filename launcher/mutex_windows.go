//go:build windows

package main

import (
	"errors"
	"os"
	"time"

	"golang.org/x/sys/windows"
)

const (
	mutexName    = "KeeFormLauncherMutex"
	mutexTimeout = 30 * time.Second
)

// acquireMutex ensures only one launcher runs at a time.
// Multiple launchers queue up and proceed in order.
// Called at startup before any other work.
func acquireMutex() {
	logEnter("acquireMutex")       // debug
	defer logLeave("acquireMutex") // debug

	name, err := windows.UTF16PtrFromString(mutexName)
	if err != nil {
		logf("UTF16PtrFromString error: %v", err) // debug
		return
	}

	handle, err := windows.CreateMutex(nil, true, name)
	if err != nil && !errors.Is(err, windows.ERROR_ALREADY_EXISTS) {
		logf("CreateMutex error: %v", err) // debug
		return
	}
	logf("mutex created, waiting to acquire") // debug

	// G115: safe conversion — timeout in milliseconds fits in uint32
	timeoutMs := uint32(mutexTimeout.Milliseconds()) //nolint:gosec
	event, err := windows.WaitForSingleObject(handle, timeoutMs)
	if err != nil {
		logf("WaitForSingleObject error: %v", err) // debug
		return
	}

	switch event {
	case windows.WAIT_OBJECT_0, windows.WAIT_ABANDONED:
		logf("mutex acquired") // debug
	case uint32(windows.WAIT_TIMEOUT):
		logf("mutex timeout after %v — proceeding anyway", mutexTimeout) // debug
	default:
		logf("unexpected WaitForSingleObject event: %d", event) // debug
		os.Exit(1)
	}

	// Mutex is released automatically when the process exits
}
