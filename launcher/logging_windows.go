//go:build windows

package main

import (
	"syscall"
	"unsafe"

	"golang.org/x/sys/windows"
)

var (
	kernel32              = windows.NewLazySystemDLL("kernel32.dll")
	procOutputDebugString = kernel32.NewProc("OutputDebugStringW")
)

// outputDebugString sends a message to DebugView++ (Win32 OutputDebugString).
func outputDebugString(msg string) {
	ptr, err := syscall.UTF16PtrFromString(msg)
	if err != nil {
		return
	}
	_, _, _ = procOutputDebugString.Call(uintptr(unsafe.Pointer(ptr)))
}
