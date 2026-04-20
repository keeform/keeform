##
##                           KeeForm v5
##
## Copyright (C) 2005 - 2026   dave_keepass at users.sourceforge.net
##                             https://keeform.org
##
## This program is free software; you can redistribute it and/or modify
## it under the terms of the GNU General Public License as published by
## the Free Software Foundation; either version 2 of the License, or
## (at your option) any later version.
##
## This program is distributed in the hope that it will be useful,
## but WITHOUT ANY WARRANTY; without even the implied warranty of
## MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
## GNU General Public License for more details.
##
## You should have received a copy of the GNU General Public License
## along with this program; if not, write to the Free Software
## Foundation, Inc., 51 Franklin St, Fifth Floor, Boston, MA  02110-1301  USA
##

BUILDFLAGS := -trimpath -ldflags "-s -w -H windowsgui"

## Default target: lint first, then builds
all: lint build_debug/keeform_launcher.exe build_release/keeform_launcher.exe build_release/keeform_launcher32.exe

release: clean all

## Debug build — logging included, production filename, ready to send to user
build_debug: *.go
	rm -rf build_debug
	mkdir build_debug

build_debug/keeform_launcher.exe: build_debug
	env GOOS=windows GOARCH=amd64 go build $(BUILDFLAGS) -o $@ .

## Strip debug lines from source into build_release/
## logging.go and logging_windows.go are removed — not needed in release
build_release: *.go
	rm -rf build_release
	mkdir build_release
	cp go.mod go.sum build_release/
	for f in *.go; do sed '/\/\/ debug/d' $$f > build_release/$$f; done
	gofmt -w build_release/
	rm -f build_release/logging.go build_release/logging_windows.go

## Release build 64-bit
build_release/keeform_launcher.exe: build_release
	cd build_release && env GOOS=windows GOARCH=amd64 go build $(BUILDFLAGS) -o keeform_launcher.exe .

## Release build 32-bit
build_release/keeform_launcher32.exe: build_release
	cd build_release && env GOOS=windows GOARCH=386 GO386=softfloat go build $(BUILDFLAGS) -o keeform_launcher32.exe .

## Lint both debug source and stripped release
lint: lint_debug lint_release

lint_debug: *.go
	env GOOS=windows GOARCH=amd64 gofmt -l .
	env GOOS=windows GOARCH=amd64 golangci-lint run .

lint_release: build_release
	cd build_release && env GOOS=windows GOARCH=amd64 gofmt -l .
	cd build_release && env GOOS=windows GOARCH=amd64 golangci-lint run .

clean:
	rm -f keeform_launcher.exe keeform_launcher32.exe
	rm -rf build_debug build_release
	rm -f lint

cleanlog:
	rm -f *.log

cleanall: clean cleanlog
