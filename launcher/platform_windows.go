//go:build windows

package main

import "os"

// localAppData returns the Windows %LOCALAPPDATA% path.
func localAppData() string {
	return os.Getenv("LOCALAPPDATA")
}
