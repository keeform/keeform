//go:build windows

package main

import (
	"fmt"
	"strings"
	"syscall"
	"time"
	"unsafe"

	"golang.org/x/sys/windows"
)

var (
	user32              = windows.NewLazySystemDLL("user32.dll")
	procFindWindow      = user32.NewProc("FindWindowW")
	procEnumWindows     = user32.NewProc("EnumWindows")
	procGetWindowText   = user32.NewProc("GetWindowTextW")
	procSetForeground   = user32.NewProc("SetForegroundWindow")
	procShowWindow      = user32.NewProc("ShowWindow")
	procIsIconic        = user32.NewProc("IsIconic")
	procIsWindowVisible = user32.NewProc("IsWindowVisible")
)

const swRestore = 9

// ensureBrowserRunning starts the browser if it is not already running.
func ensureBrowserRunning(browser string) error {
	logEnter("ensureBrowserRunning")       // debug
	defer logLeave("ensureBrowserRunning") // debug

	logf("browser: %s", browser) // debug

	if browser == "" || strings.EqualFold(browser, "NOBROWSER") {
		logf("browser start skipped") // debug
		return nil
	}

	if strings.EqualFold(browser, "{EDGE}") {
		logf("starting Edge via ShellExecute") // debug
		return shellExecute("microsoft-edge:")
	}

	logf("starting browser: %s", browser) // debug
	if err := shellExecute(browser); err != nil {
		return fmt.Errorf("could not start browser %s: %w", browser, err)
	}

	logf("waiting %v for browser to start", browserStartSleep) // debug
	time.Sleep(browserStartSleep)

	return nil
}

// activateBrowser brings the browser window to the foreground.
// The launcher has foreground lock permission inherited from KeePass,
// so SetForegroundWindow works even when another app has focus.
func activateBrowser(browser string) {
	logEnter("activateBrowser")       // debug
	defer logLeave("activateBrowser") // debug

	logf("browser: %s", browser) // debug

	if browser == "" || strings.EqualFold(browser, "NOBROWSER") {
		logf("activate skipped") // debug
		return
	}

	var hwnd syscall.Handle

	if strings.Contains(strings.ToLower(browser), "firefox") {
		// Firefox: find by window class name
		logf("activating Firefox via MozillaWindowClass") // debug
		hwnd = findWindowByClass("MozillaWindowClass")
	} else {
		// Chromium-based: find by window title containing browser name
		logf("activating Chromium-based browser via EnumWindows") // debug
		hwnd = findChromiumWindow(browser)
	}

	if hwnd == 0 {
		logf("window not found for browser: %s", browser) // debug
		return
	}

	logf("found window handle: %d", hwnd) // debug

	isMinimized, _, _ := procIsIconic.Call(uintptr(hwnd))
	if isMinimized != 0 {
		logf("window is minimized, restoring") // debug
		_, _, _ = procShowWindow.Call(uintptr(hwnd), swRestore)
		time.Sleep(100 * time.Millisecond)
	}

	_, _, _ = procSetForeground.Call(uintptr(hwnd))
	logf("SetForegroundWindow called") // debug
}

// findWindowByClass finds a window by class name. Returns 0 if not found.
func findWindowByClass(className string) syscall.Handle {
	logEnter("findWindowByClass")       // debug
	defer logLeave("findWindowByClass") // debug

	classPtr, err := syscall.UTF16PtrFromString(className)
	if err != nil {
		logf("UTF16PtrFromString error: %v", err) // debug
		return 0
	}

	hwnd, _, _ := procFindWindow.Call(
		uintptr(unsafe.Pointer(classPtr)),
		0,
	)
	logf("FindWindow(%s) = %d", className, hwnd) // debug
	return syscall.Handle(hwnd)
}

// browserSearchTerms returns window title search terms for a given browser name.
// e.g. "Google Chrome" -> ["Google Chrome", "Chrome"]
func browserSearchTerms(browser string) []string {
	terms := []string{browser}
	lower := strings.ToLower(browser)
	switch {
	case strings.Contains(lower, "chrome"):
		terms = append(terms, "Chrome")
	case strings.Contains(lower, "edge"):
		terms = append(terms, "Edge")
	case strings.Contains(lower, "brave"):
		terms = append(terms, "Brave")
	case strings.Contains(lower, "opera"):
		terms = append(terms, "Opera")
	case strings.Contains(lower, "vivaldi"):
		terms = append(terms, "Vivaldi")
	case strings.Contains(lower, "chromium"):
		terms = append(terms, "Chromium")
	}
	return terms
}

// findChromiumWindow finds a Chromium-based browser window using EnumWindows.
// Matches visible top-level windows whose title contains the browser name.
func findChromiumWindow(browser string) syscall.Handle {
	logEnter("findChromiumWindow")       // debug
	defer logLeave("findChromiumWindow") // debug

	searchTerms := browserSearchTerms(browser)
	logf("search terms: %v", searchTerms) // debug

	var found syscall.Handle

	cb := syscall.NewCallback(func(hwnd syscall.Handle, _ uintptr) uintptr {
		// Skip invisible windows
		visible, _, _ := procIsWindowVisible.Call(uintptr(hwnd))
		if visible == 0 {
			return 1 // continue
		}

		// Get window title
		buf := make([]uint16, 256)
		_, _, _ = procGetWindowText.Call(uintptr(hwnd), uintptr(unsafe.Pointer(&buf[0])), 256)
		title := syscall.UTF16ToString(buf)
		if title == "" {
			return 1 // continue
		}

		titleLower := strings.ToLower(title)
		for _, term := range searchTerms {
			if strings.Contains(titleLower, strings.ToLower(term)) {
				logf("found window: %q handle=%d", title, hwnd) // debug
				found = hwnd
				return 0 // stop enumeration
			}
		}
		return 1 // continue
	})

	_, _, _ = procEnumWindows.Call(cb, 0)
	return found
}

// shellExecute opens a file or URL using the default Windows shell handler.
func shellExecute(target string) error {
	logEnter("shellExecute")       // debug
	defer logLeave("shellExecute") // debug

	logf("target: %s", target) // debug

	verb, _ := syscall.UTF16PtrFromString("open")
	targetPtr, _ := syscall.UTF16PtrFromString(target)

	shell32 := windows.NewLazySystemDLL("shell32.dll")
	shellExecuteW := shell32.NewProc("ShellExecuteW")

	ret, _, _ := shellExecuteW.Call(
		0,
		uintptr(unsafe.Pointer(verb)),
		uintptr(unsafe.Pointer(targetPtr)),
		0,
		0,
		1, // SW_SHOWNORMAL
	)

	if ret <= 32 {
		return fmt.Errorf("ShellExecuteW returned %d for target %s", ret, target)
	}

	logf("ShellExecuteW succeeded (ret=%d)", ret) // debug
	return nil
}
