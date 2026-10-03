//go:build !headless

package main

import "C"
import (
	"errors"
	webview "github.com/webview/webview_go"
	"sync/atomic"
)

var onEditorNativeClose func()

//export forgeOnNativeClose
func forgeOnNativeClose() {
	if onEditorNativeClose != nil {
		onEditorNativeClose()
	}
}
func runEditorWindow(url string) error {
	w := webview.New(false)
	if w == nil {
		return errors.New("cannot create editor webview; verify WebKitGTK/WebView2")
	}
	defer w.Destroy()
	var ready atomic.Bool
	if err := w.Bind("forgeEditorClose", func() { w.Terminate() }); err != nil {
		return err
	}
	if err := w.Bind("forgeEditorReady", func() { ready.Store(true) }); err != nil {
		return err
	}
	if err := w.Bind("forgeEditorTitle", func(title string) {
		if len(title) > 220 {
			title = title[:220]
		}
		w.Dispatch(func() { w.SetTitle(title) })
	}); err != nil {
		return err
	}
	onEditorNativeClose = func() {
		if !ready.Load() {
			w.Terminate()
			return
		}
		w.Dispatch(func() { w.Eval("window.forgeRequestClose()") })
	}
	defer func() { onEditorNativeClose = nil }()
	if !installEditorCloseHook(w.Window()) {
		return errors.New("cannot protect unsaved changes in editor window")
	}
	w.SetTitle("Forge · Editor")
	w.SetSize(1050, 760, webview.HintNone)
	w.SetSize(660, 420, webview.HintMin)
	w.Navigate(url)
	w.Run()
	return nil
}
