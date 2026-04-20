package main

import (
	"fmt"
	"net"
	"time"
)

const (
	pipePrefix         = `\\.\pipe\`
	pipeConnectTimeout = 5 * time.Second
	pipeRetryInterval  = 500 * time.Millisecond
)

// sendToPipeOnce connects once to the pipe and sends credentials.
// Used in phase 1 — fail fast, no retry.
func sendToPipeOnce(pipeName string, data []byte) error {
	logEnter("sendToPipeOnce")       // debug
	defer logLeave("sendToPipeOnce") // debug

	pipePath := pipePrefix + pipeName
	logf("connecting to pipe: %s", pipePath) // debug

	conn, err := dialPipeOnce(pipePath)
	if err != nil {
		return fmt.Errorf("could not connect to pipe %s: %w", pipePath, err)
	}
	defer conn.Close()
	logf("connected to pipe") // debug

	return writeToPipe(conn, data)
}

// sendToPipe connects to the pipe with retry on busy.
// Used in phase 2 — host may still be initializing.
func sendToPipe(pipeName string, data []byte) error {
	logEnter("sendToPipe")       // debug
	defer logLeave("sendToPipe") // debug

	pipePath := pipePrefix + pipeName
	logf("connecting to pipe: %s", pipePath) // debug

	deadline := time.Now().Add(pipeConnectTimeout)
	attempt := 0

	for time.Now().Before(deadline) {
		attempt++
		logf("dial attempt %d", attempt) // debug

		conn, err := dialPipeOnce(pipePath)
		if err == nil {
			logf("connected on attempt %d", attempt) // debug
			return writeAndClose(conn, data)
		}

		if isPipeBusy(err) {
			logf("pipe busy, retrying...") // debug
			time.Sleep(pipeRetryInterval)
			continue
		}

		return fmt.Errorf("could not connect to pipe %s: %w", pipePath, err)
	}

	return fmt.Errorf("timed out connecting to pipe %s", pipePath)
}

// writeAndClose writes credentials to the pipe and closes it.
// Used in retry loops to avoid defer inside loop.
func writeAndClose(conn net.Conn, data []byte) error {
	defer conn.Close()
	return writeToPipe(conn, data)
}

// writeToPipe sends JSON credentials over an open pipe connection.
func writeToPipe(conn net.Conn, data []byte) error {
	message := append(data, '\n')

	if err := conn.SetWriteDeadline(time.Now().Add(5 * time.Second)); err != nil {
		return fmt.Errorf("could not set write deadline: %w", err)
	}

	n, err := conn.Write(message)
	if err != nil {
		return fmt.Errorf("could not write to pipe: %w", err)
	}
	if n != len(message) {
		return fmt.Errorf("partial write: wrote %d of %d bytes", n, len(message))
	}
	logf("wrote %d bytes to pipe", n) // debug
	return nil
}
