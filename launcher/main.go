//
//                           KeeForm v5
//
// Copyright (C) 2005 - 2026   dave_keepass at users.sourceforge.net
//                             https://keeform.org
//
// This program is free software; you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation; either version 2 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.
//
// You should have received a copy of the GNU General Public License
// along with this program; if not, write to the Free Software
// Foundation, Inc., 51 Franklin St, Fifth Floor, Boston, MA  02110-1301  USA
//

// Build for Windows (release):
//   env GOOS=windows GOARCH=amd64 go build -trimpath -ldflags "-s -w -H windowsgui" -o keeform_launcher.exe .
// Build for Windows (debug):
//   env GOOS=windows GOARCH=amd64 go build -trimpath -ldflags "-H windowsgui" -o keeform_launcher_debug.exe .

package main

import (
	"encoding/json"
	"fmt"
	"os"
	"time"
)

const (
	dataFile = "keeform_host.exe.data"

	browserStartSleep = 2 * time.Second
	browserLoopSleep  = 500 * time.Millisecond
	browserTimeout    = 10 * time.Second
)

// credentials holds the data passed from KeePass via command line args.
// Password is forwarded as-is — decryption happens in the host.
type credentials struct {
	Version     int    `json:"version"`
	URL         string `json:"url"`
	Username    string `json:"username"`
	PasswordEnc string `json:"passwordEnc"` // raw {PASSWORD_ENC} blob or plain text
}

// args holds the parsed command line arguments from KeePass URL override:
//
//	keeform_launcher.exe {BROWSER} "{URL}" "{USERNAME}" "{PASSWORD_ENC}"
type args struct {
	browser  string
	url      string
	username string
	password string
}

func main() {
	initLogging("keeform_launcher.log", "KeeFormLauncher") // debug
	logEnter("main")                                       // debug
	defer logLeave("main")                                 // debug

	timer := time.Now() // debug

	a, err := parseArgs(os.Args[1:])
	if err != nil {
		showError("KeeForm argument error", err.Error())
		os.Exit(1)
	}

	printSystemInfo() // debug
	acquireMutex()
	logf("dataFile  %s", dataFile)                       // debug
	logf("browser   %s", a.browser)                      // debug
	logf("url       %s", a.url)                          // debug
	logf("username  %s", a.username)                     // debug
	logf("password  REDACTED (len=%d)", len(a.password)) // debug

	credsJSON, err := json.Marshal(credentials{
		Version:     1,
		URL:         a.url,
		Username:    a.username,
		PasswordEnc: a.password,
	})
	if err != nil {
		exitWithError("KeeForm error", fmt.Sprintf("could not marshal credentials: %v", err))
	}

	// Phase 1: browser already running — try data file and pipe once
	logf("phase 1: checking if host is already running") // debug
	var pipeName, browser string
	var dataErr error
	pipeName, browser, dataErr = tryReadDataFile()
	logf("phase 1: dataErr=%v browser=%s", dataErr, browser) // debug
	if dataErr == nil {
		pipeErr := sendToPipeOnce(pipeName, credsJSON)
		logf("phase 1: pipeErr=%v", pipeErr) // debug
		if pipeErr == nil {
			logf("credentials sent to running host")               // debug
			logf("activating browser from data file: %s", browser) // debug
			activateBrowser(browser)
			logf("execution time %dms", time.Since(timer).Milliseconds()) // debug
			return
		}
	}

	// Phase 2: host not running — start browser then poll for host
	logf("phase 2: starting browser %s", a.browser) // debug
	if err := ensureBrowserRunning(a.browser); err != nil {
		exitWithError("KeeForm browser error", fmt.Sprintf("could not start browser: %v", err))
	}

	logf("phase 2: waiting %v for browser to start", browserStartSleep) // debug
	time.Sleep(browserStartSleep)

	deadline := time.Now().Add(browserTimeout)
	for time.Now().Before(deadline) {
		pipeName, browser, dataErr = tryReadDataFile()
		if dataErr != nil {
			logf("data file not ready yet: %v", dataErr) // debug
			time.Sleep(browserLoopSleep)
			continue
		}

		if pipeErr := sendToPipe(pipeName, credsJSON); pipeErr != nil {
			logf("pipe connect failed: %v — retrying", pipeErr) // debug
			time.Sleep(browserLoopSleep)
			continue
		}

		logf("credentials sent to host")                       // debug
		logf("activating browser from data file: %s", browser) // debug
		activateBrowser(browser)
		logf("execution time %dms", time.Since(timer).Milliseconds()) // debug
		return
	}

	exitWithError("KeeForm error",
		"Connection to browser timed out.\n\nPlease make sure the KeeForm browser extension is installed and enabled.")
}

// parseArgs parses the KeePass URL override command line arguments.
// Expected format:
//
//	keeform_launcher.exe {BROWSER} "{URL}" "{USERNAME}" "{PASSWORD_ENC}"
func parseArgs(rawArgs []string) (args, error) {
	logf("parseArgs: %v", rawArgs) // debug

	if len(rawArgs) < 4 {
		return args{}, fmt.Errorf(
			"expected 4 arguments (browser, url, username, password), got %d\n\nUsage: keeform_launcher.exe {BROWSER} \"{URL}\" \"{USERNAME}\" \"{PASSWORD_ENC}\"",
			len(rawArgs),
		)
	}

	return args{
		browser:  rawArgs[0],
		url:      rawArgs[1],
		username: rawArgs[2],
		password: rawArgs[3],
	}, nil
}
