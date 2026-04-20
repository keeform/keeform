//go:build windows

package main

import (
	"fmt"
	"unsafe"

	"golang.org/x/sys/windows"
)

var (
	crypt32                = windows.NewLazySystemDLL("crypt32.dll")
	procCryptUnprotectData = crypt32.NewProc("CryptUnprotectData")
)

// keeformEntropy is KeeForm's own entropy for data file encryption.
// 0xEE, 0xF0 at the end = "eef0" as in "Keef0rm" :)
// Must match keeformEntropy in keeform_host.
var keeformEntropy = []byte{0x4B, 0x65, 0x65, 0x46, 0x30, 0x72, 0x6D, 0xEE, 0xF0}

type dataBlob struct {
	cbData uint32
	pbData *byte
}

func newDataBlob(d []byte) *dataBlob {
	if len(d) == 0 {
		return &dataBlob{}
	}
	return &dataBlob{
		pbData: &d[0],
		cbData: uint32(len(d)), //nolint:gosec // len() never exceeds uint32 for realistic sizes
	}
}

func (b *dataBlob) toByteSlice() []byte {
	d := make([]byte, b.cbData)
	copy(d, unsafe.Slice(b.pbData, b.cbData))
	return d
}

// dpAPIDecryptDataFile decrypts the data file blob using KeeForm entropy.
func dpAPIDecryptDataFile(encrypted []byte) ([]byte, error) {
	logEnter("dpAPIDecryptDataFile")               // debug
	defer logLeave("dpAPIDecryptDataFile")         // debug
	logf("input length: %d bytes", len(encrypted)) // debug

	input := newDataBlob(encrypted)
	entropy := newDataBlob(keeformEntropy)
	var output dataBlob

	ret, _, err := procCryptUnprotectData.Call(
		uintptr(unsafe.Pointer(input)),
		0,
		uintptr(unsafe.Pointer(entropy)),
		0,
		0,
		0,
		uintptr(unsafe.Pointer(&output)),
	)

	if ret == 0 {
		return nil, fmt.Errorf("CryptUnprotectData failed: %w", err)
	}
	defer func() {
		_, _ = windows.LocalFree(windows.Handle(unsafe.Pointer(output.pbData)))
	}()

	result := output.toByteSlice()
	logf("decrypted %d bytes", len(result)) // debug
	return result, nil
}
