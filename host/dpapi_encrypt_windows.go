//go:build windows

package main

import (
	"encoding/base64"
	"fmt"
	"unsafe"

	"golang.org/x/sys/windows"
)

var (
	crypt32                = windows.NewLazySystemDLL("crypt32.dll")
	procCryptProtectData   = crypt32.NewProc("CryptProtectData")
	procCryptUnprotectData = crypt32.NewProc("CryptUnprotectData")
)

// keeformEntropy is KeeForm's own entropy for data file encryption.
// 0xEE, 0xF0 at the end = "eef0" as in "Keef0rm" :)
// Must match keeformEntropy in keeform_launcher.
var keeformEntropy = []byte{0x4B, 0x65, 0x65, 0x46, 0x30, 0x72, 0x6D, 0xEE, 0xF0}

// keepassEntropy is the fixed entropy KeePass uses for {PASSWORD_ENC}.
var keepassEntropy = []byte{0xA5, 0x74, 0x2E, 0xEC}

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

// dpAPIEncryptDataFile encrypts the pipe name using KeeForm entropy.
func dpAPIEncryptDataFile(plaintext []byte) ([]byte, error) {
	logEnter("dpAPIEncryptDataFile")               // debug
	defer logLeave("dpAPIEncryptDataFile")         // debug
	logf("input length: %d bytes", len(plaintext)) // debug

	input := newDataBlob(plaintext)
	entropy := newDataBlob(keeformEntropy)
	var output dataBlob

	ret, _, err := procCryptProtectData.Call(
		uintptr(unsafe.Pointer(input)),
		0,
		uintptr(unsafe.Pointer(entropy)),
		0,
		0,
		0,
		uintptr(unsafe.Pointer(&output)),
	)

	if ret == 0 {
		return nil, fmt.Errorf("CryptProtectData failed: %w", err)
	}
	defer func() {
		_, _ = windows.LocalFree(windows.Handle(unsafe.Pointer(output.pbData)))
	}()

	result := output.toByteSlice()
	logf("encrypted to %d bytes", len(result)) // debug
	return result, nil
}

// decryptPassword handles {PASSWORD_ENC} / plain text password.
// KeePass {PASSWORD_ENC} = base64(DPAPI(password, keepassEntropy)).
// If base64 decode fails → plain text {PASSWORD}.
// If DPAPI decrypt fails → fallback to plain text for backward compatibility.
// NOTE: This preserves historical behavior but means a base64-looking plain
// password is accepted as plain text when DPAPI decrypt is not possible.
func decryptPassword(input string) (string, error) {
	logEnter("decryptPassword")          // debug
	defer logLeave("decryptPassword")    // debug
	logf("input length: %d", len(input)) // debug

	decoded, err := base64.StdEncoding.DecodeString(input)
	if err != nil {
		logf("not base64, treating as plain text password") // debug
		return input, nil
	}
	logf("base64 decoded to %d bytes, attempting DPAPI decrypt", len(decoded)) // debug

	input2 := newDataBlob(decoded)
	entropy := newDataBlob(keepassEntropy)
	var output dataBlob

	ret, _, _ := procCryptUnprotectData.Call(
		uintptr(unsafe.Pointer(input2)),
		0,
		uintptr(unsafe.Pointer(entropy)),
		0,
		0,
		0,
		uintptr(unsafe.Pointer(&output)),
	)

	if ret == 0 {
		logf("DPAPI decrypt failed, treating as plain text password") // debug
		return input, nil
	}

	defer func() {
		_, _ = windows.LocalFree(windows.Handle(unsafe.Pointer(output.pbData)))
	}()

	result := string(output.toByteSlice())
	logf("DPAPI decrypt succeeded") // debug
	return result, nil
}
