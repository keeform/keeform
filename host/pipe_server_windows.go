//go:build windows

package main

import (
	"errors"
	"net"
	"os"
	"time"

	"github.com/Microsoft/go-winio"
	"golang.org/x/sys/windows"
)

// createPipe creates a Windows named pipe for launcher communication.
func createPipe(pipeName string) net.Listener {
	logEnter("createPipe")       // debug
	defer logLeave("createPipe") // debug

	config := winio.PipeConfig{
		SecurityDescriptor: "",
		MessageMode:        true,
		InputBufferSize:    65536,
		OutputBufferSize:   65536,
	}

	pipePath := `\\.\pipe\` + pipeName
	logf("creating pipe: %s", pipePath) // debug

	listener, err := winio.ListenPipe(pipePath, &config)
	if err != nil {
		logf("ListenPipe error: %v", err) // debug
		panic(err)
	}
	logf("pipe created") // debug
	return listener
}

// waitForMutex ensures only one instance of the host runs at a time.
func waitForMutex() {
	logEnter("waitForMutex")       // debug
	defer logLeave("waitForMutex") // debug

	name, err := windows.UTF16PtrFromString("KeeFormHostMutex")
	if err != nil {
		logf("UTF16PtrFromString error: %v", err) // debug
		os.Exit(1)
	}

	handle, err := windows.CreateMutex(nil, true, name)
	if err != nil {
		if handle == 0 || !errors.Is(err, windows.ERROR_ALREADY_EXISTS) {
			logf("CreateMutex error: %v", err) // debug
			os.Exit(1)
		}
		logf("mutex already exists: %v", err) // debug
	}

	for {
		logf("waiting for mutex") // debug
		// G115: safe conversion — timeout value fits easily in uint32
		timeout := uint32(time.Second/time.Millisecond) * 10 //nolint:gosec // safe conversion for timeout value
		event, err := windows.WaitForSingleObject(handle, timeout)
		if err != nil {
			logf("WaitForSingleObject error: %v", err) // debug
			os.Exit(1)
		}

		if event == uint32(windows.WAIT_TIMEOUT) {
			logf("mutex timeout — pinging browser") // debug
			if err := sendToBrowser(`{"ping": true}`); err != nil {
				logf("ping failed, browser closed: %v", err) // debug
				os.Exit(1)
			}
			continue
		}

		if event == windows.WAIT_OBJECT_0 || event == windows.WAIT_ABANDONED {
			logf("mutex acquired") // debug
			break
		}

		logf("unexpected WaitForSingleObject event: %v", event) // debug
		os.Exit(1)
	}
}
