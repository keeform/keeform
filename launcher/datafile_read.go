package main

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

// tryReadDataFile attempts a single read of the DPAPI-encrypted data file.
// Returns pipe name and browser name on success.
// Format: "pipeName\nbrowserName" — written by the host after extension connects.
func tryReadDataFile() (pipeName string, browser string, err error) {
	logEnter("tryReadDataFile")       // debug
	defer logLeave("tryReadDataFile") // debug

	dataFilePath := filepath.Join(localAppData(), "KeeForm", dataFile)
	logf("data file path: %s", dataFilePath) // debug

	encrypted, err := os.ReadFile(dataFilePath)
	if err != nil {
		return "", "", fmt.Errorf("could not read file: %w", err)
	}
	logf("read %d bytes from data file", len(encrypted)) // debug

	decrypted, err := dpAPIDecryptDataFile(encrypted)
	if err != nil {
		return "", "", fmt.Errorf("DPAPI decrypt failed: %w", err)
	}
	logf("decrypted %d bytes", len(decrypted)) // debug
	logf("content: %q", string(decrypted))     // debug

	parts := strings.SplitN(strings.TrimSpace(string(decrypted)), "\n", 2)
	if len(parts) < 2 || parts[0] == "" {
		return "", "", errors.New("invalid data file format")
	}

	pipeName = parts[0]
	browser = parts[1]
	logf("pipe name: %s", pipeName) // debug
	logf("browser:   %s", browser)  // debug
	return pipeName, browser, nil
}
