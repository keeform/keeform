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
//   env GOOS=windows GOARCH=amd64 go build -trimpath -ldflags "-s -w -H windowsgui" -o keeform_host.exe .
// Build for Windows (debug):
//   env GOOS=windows GOARCH=amd64 go build -trimpath -ldflags "-H windowsgui" -o keeform_host_debug.exe .

package main

import (
	"bufio"
	"bytes"
	"crypto/rand"
	"encoding/base32"
	"encoding/binary"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"os"
	"path/filepath"
	"time"
)

const keeformVersion = "5.0.1"
const dataFile = "keeform_host.exe.data"

// browserMsg is received from the browser extension on connect.
type browserMsg struct {
	Type     string `json:"type"`
	Browser  string `json:"browser"`
	Protocol int    `json:"protocol"`
}

// credentials is received from keeform_launcher.exe via named pipe.
// PasswordEnc is the raw {PASSWORD_ENC} blob or plain text — host decrypts it.
type credentials struct {
	Version     int    `json:"version"`
	URL         string `json:"url"`
	Username    string `json:"username"`
	PasswordEnc string `json:"passwordEnc"`
}

// forwardCredentials is what the host sends to the extension after decryption.
type forwardCredentials struct {
	Version  int    `json:"version"`
	URL      string `json:"url"`
	Username string `json:"username"`
	Password string `json:"password"`
}

func main() {
	initLogging("keeform_host.log", "KeeFormHost") // debug
	logEnter("main")                               // debug
	defer logLeave("main")                         // debug
	printSystemInfo()                              // debug
	logf("keeformVersion %s", keeformVersion)      // debug
	logf("dataFile       %s", dataFile)            // debug

	waitForMutex()

	if err := sendToBrowser(jsonString("requestSettings")); err != nil {
		logf("sendToBrowser requestSettings failed: %v", err) // debug
		panic(err)
	}

	msg, err := readBrowserMsg()
	if err != nil {
		logf("readBrowserMsg error: %v", err) // debug
		panic(err)
	}

	if msg.Type != "settings" {
		logf("expected settings message, got: %s", msg.Type) // debug
		panic("browser did not send settings")
	}

	logf("protocol v%d", msg.Protocol) // debug
	logf("browser  %s", msg.Browser)   // debug

	if msg.Protocol != 2 {
		logf("protocol v%d too old, refusing connection", msg.Protocol) // debug
		panic("unsupported protocol version")
	}

	// Generate pipe name and write data file — now that we know the browser name
	pipeName := randomBase32(32)
	logf("pipe name: %s", pipeName) // debug

	dataFilePath := filepath.Join(localAppData(), "KeeForm", dataFile)
	if err := writeDataFile(dataFilePath, pipeName, msg.Browser); err != nil {
		logf("writeDataFile error: %v", err) // debug
		panic(err)
	}
	defer func() {
		logf("removing data file %s", dataFilePath) // debug
		_ = os.Remove(dataFilePath)
	}()

	if err := sendToBrowser(jsonString("listening")); err != nil {
		logf("sendToBrowser listening failed: %v", err) // debug
		panic(err)
	}

	versionMsg, err := json.Marshal(struct {
		Version string `json:"version"`
	}{
		Version: keeformVersion,
	})
	if err != nil {
		logf("json marshal version error: %v", err) // debug
		panic(err)
	}
	if err := sendToBrowser(string(versionMsg)); err != nil {
		logf("sendToBrowser version failed: %v", err) // debug
		panic(err)
	}
	logf("sent version %s to extension", keeformVersion) // debug

	listener := createPipe(pipeName)
	defer listener.Close()
	go listenForLauncher(listener)

	listenBrowserPipe()
}

// listenForLauncher accepts launcher connections in a loop.
// The same pipe stays open for the entire host lifetime.
func listenForLauncher(listener net.Listener) {
	logEnter("listenForLauncher")       // debug
	defer logLeave("listenForLauncher") // debug

	for {
		logf("waiting for launcher connection") // debug
		conn, err := listener.Accept()
		if err != nil {
			logf("listener.Accept error (host closing?): %v", err) // debug
			return
		}
		logf("launcher connected") // debug
		handleLauncherConnection(conn)
	}
}

// handleLauncherConnection reads credentials from the launcher and
// forwards them to the browser extension via native messaging.
func handleLauncherConnection(conn net.Conn) {
	logEnter("handleLauncherConnection")       // debug
	defer logLeave("handleLauncherConnection") // debug

	defer func() {
		time.Sleep(50 * time.Millisecond)
		conn.Close()
	}()

	if err := conn.SetReadDeadline(time.Now().Add(5 * time.Second)); err != nil {
		logf("SetReadDeadline error: %v", err) // debug
		return
	}

	readBytes, err := bufio.NewReader(conn).ReadBytes('\n')
	if err != nil && !errors.Is(err, io.EOF) {
		logf("ReadBytes error: %v", err) // debug
		return
	}

	logf("received %d bytes from launcher", len(readBytes)) // debug

	var creds credentials
	if err := json.Unmarshal(bytes.TrimSpace(readBytes), &creds); err != nil {
		logf("invalid credentials JSON: %v", err) // debug
		return
	}

	logf("credentials version %d", creds.Version)          // debug
	logf("url:      %s", creds.URL)                        // debug
	logf("username: %s", creds.Username)                   // debug
	logf("passwordEnc length: %d", len(creds.PasswordEnc)) // debug

	password, err := decryptPassword(creds.PasswordEnc)
	if err != nil {
		logf("decryptPassword error: %v", err) // debug
		return
	}
	logf("password decrypted successfully") // debug

	fwdJSON, err := json.Marshal(forwardCredentials{
		Version:  creds.Version,
		URL:      creds.URL,
		Username: creds.Username,
		Password: password,
	})
	if err != nil {
		logf("json marshal error: %v", err) // debug
		return
	}

	if err := sendToBrowser(string(fwdJSON)); err != nil {
		logf("sendToBrowser credentials failed: %v", err) // debug
		return
	}
	logf("credentials forwarded to extension") // debug
}

// listenBrowserPipe reads messages from the browser extension until EOF.
func listenBrowserPipe() {
	logEnter("listenBrowserPipe")       // debug
	defer logLeave("listenBrowserPipe") // debug

	for {
		logf("waiting for browser message") // debug
		msg, err := readBrowserMsg()
		if err != nil {
			logf("readBrowserMsg error (browser closed?): %v", err) // debug
			return
		}
		logf("received browser message type: %s", msg.Type) // debug
		switch msg.Type {
		// TODO: handle messages from extension (fill result, errors, etc.)
		default:
		}
	}
}

// sendToBrowser sends a JSON message to the browser extension via native messaging.
func sendToBrowser(jsonmsg string) error {
	logEnter("sendToBrowser")       // debug
	defer logLeave("sendToBrowser") // debug

	var buf bytes.Buffer
	buf.WriteString(jsonmsg)
	logf("sending %d bytes: %.60s", buf.Len(), jsonmsg) // debug

	msgLen := buf.Len()
	// G115: native messaging messages are always small, overflow not possible
	if err := binary.Write(os.Stdout, binary.LittleEndian, uint32(msgLen)); err != nil { //nolint:gosec
		return fmt.Errorf("binary write error: %w", err)
	}
	if _, err := buf.WriteTo(os.Stdout); err != nil {
		return fmt.Errorf("write stdout error: %w", err)
	}
	return nil
}

// readBrowserMsg reads one native messaging message from the browser extension.
func readBrowserMsg() (browserMsg, error) {
	logEnter("readBrowserMsg")       // debug
	defer logLeave("readBrowserMsg") // debug

	var msg browserMsg
	var length uint32

	if err := binary.Read(os.Stdin, binary.LittleEndian, &length); err != nil {
		return msg, fmt.Errorf("binary read error: %w", err)
	}
	logf("message length: %d", length) // debug

	reader := &io.LimitedReader{R: os.Stdin, N: int64(length)}
	if err := json.NewDecoder(reader).Decode(&msg); err != nil {
		return msg, fmt.Errorf("json decode error: %w", err)
	}

	logf("message type: %s browser: %s protocol: %d", msg.Type, msg.Browser, msg.Protocol) // debug
	return msg, nil
}

// jsonString wraps a string in JSON double quotes.
func jsonString(s string) string {
	return `"` + s + `"`
}

// randomBase32 generates a random base32-encoded string of length l.
func randomBase32(l int) string {
	buf := make([]byte, l)
	if _, err := rand.Read(buf); err != nil {
		logf("rand.Read failed: %v", err) // debug
		os.Exit(1)
	}
	return base32.StdEncoding.WithPadding(base32.NoPadding).EncodeToString(buf)
}
