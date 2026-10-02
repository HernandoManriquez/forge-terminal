//go:build headless

package main

import "errors"

func runWindow(url string) error { return errors.New("headless build: start with --serve") }
