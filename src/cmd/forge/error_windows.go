package main

import (
	"golang.org/x/sys/windows"
	"unsafe"
)

func showStartupError(err error) {
	message, _ := windows.UTF16PtrFromString("No se pudo abrir Forge Terminal. Comprueba que Microsoft Edge WebView2 Runtime esté instalado.\n\n" + err.Error())
	title, _ := windows.UTF16PtrFromString("Forge Terminal")
	windows.NewLazySystemDLL("user32.dll").NewProc("MessageBoxW").Call(0, uintptr(unsafe.Pointer(message)), uintptr(unsafe.Pointer(title)), 0x10)
}
