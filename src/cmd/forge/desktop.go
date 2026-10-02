//go:build !headless

package main

import (
	"errors"
	webview "github.com/webview/webview_go"
)

func runWindow(url string) error {
	w := webview.New(false)
	if w == nil {
		return errors.New("cannot create native webview; verify WebKitGTK/WebView2 runtime")
	}
	defer w.Destroy()
	w.SetTitle("Forge Terminal")
	w.SetSize(1380, 900, webview.HintNone)
	w.SetSize(850, 580, webview.HintMin)
	w.Navigate(url)
	w.Run()
	return nil
}
