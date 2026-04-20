package main

import (
	"fmt"
	"io"
	"os"
	"path/filepath"
	"runtime"
	"sync"
	"time"
)

var (
	debugPrefix string
	indent      string
	indentStep  = "    "
	indentMu    sync.Mutex
	logWriter   io.Writer = os.Stderr
)

// initLogging sets up logging. logFile is the log file name, prefix is the
// DebugView++ prefix (e.g. "KeeFormHost" or "KeeFormLauncher").
// Safe to call multiple times.
func initLogging(logFile string, prefix string) {
	indentMu.Lock()
	defer indentMu.Unlock()

	debugPrefix = prefix

	logDir := filepath.Join(localAppData(), "KeeForm")
	_ = os.MkdirAll(logDir, 0700)
	logPath := filepath.Join(logDir, logFile)

	f, err := os.OpenFile(logPath, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0600)
	if err != nil {
		logWriter = os.Stderr
		return
	}
	logWriter = io.MultiWriter(f, os.Stderr)
}

func logEnter(funcName string) {
	indentMu.Lock()
	defer indentMu.Unlock()
	writeLog(">" + funcName)
	indent += indentStep
}

func logLeave(funcName string) {
	indentMu.Lock()
	defer indentMu.Unlock()
	if len(indent) >= len(indentStep) {
		indent = indent[:len(indent)-len(indentStep)]
	}
	writeLog("<" + funcName)
}

func logf(format string, args ...any) {
	indentMu.Lock()
	defer indentMu.Unlock()
	writeLog(fmt.Sprintf(format, args...))
}

func writeLog(msg string) {
	_, file, line, ok := runtime.Caller(2)
	location := "unknown"
	if ok {
		location = fmt.Sprintf("%s:%d", filepath.Base(file), line)
	}
	lineOut := fmt.Sprintf("%s  pid=%05d  %-32s  %s%s",
		time.Now().Format("15:04:05.000"),
		os.Getpid(),
		location,
		indent,
		msg,
	)
	fmt.Fprintln(logWriter, lineOut)
	outputDebugString(debugPrefix + ": " + lineOut)
}

func printSystemInfo() {
	logEnter("printSystemInfo")
	defer logLeave("printSystemInfo")

	logf("date         %s", time.Now().Format("2006/01/02 15:04:05"))
	logf("os           %s", runtime.GOOS)
	logf("arch         %s", runtime.GOARCH)
	logf("go version   %s", runtime.Version())
	logf("executable   %s", os.Args[0])
	wd, _ := os.Getwd()
	logf("workingdir   %s", wd)
	logf("localappdata %s", localAppData())
}
