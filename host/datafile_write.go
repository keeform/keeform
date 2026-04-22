package main

import (
	"fmt"
	"os"
	"path/filepath"
)

// writeDataFile writes the DPAPI-encrypted pipe name and browser name to the data file.
// Format: "pipeName\nbrowserName" — newline separated, encrypted as one blob.
func writeDataFile(path string, pipeName string, browser string) error {
	logEnter("writeDataFile")       // debug
	defer logLeave("writeDataFile") // debug
	logf("path:    %s", path)       // debug
	logf("browser: %s", browser)    // debug

	if err := os.MkdirAll(filepath.Dir(path), 0700); err != nil {
		return fmt.Errorf("could not create directory: %w", err)
	}

	plaintext := pipeName + "\n" + browser
	encrypted, err := dpAPIEncryptDataFile([]byte(plaintext))
	if err != nil {
		return fmt.Errorf("DPAPI encrypt failed: %w", err)
	}
	logf("encrypted %d bytes", len(encrypted)) // debug

	if err := os.WriteFile(path, encrypted, 0600); err != nil {
		return fmt.Errorf("could not write file: %w", err)
	}
	logf("wrote data file successfully") // debug
	return nil
}
