//go:build !headless

package main

/*
#cgo LDFLAGS: -lcomctl32
#include <windows.h>
#include <commctrl.h>
extern void forgeOnNativeClose(void);
static LRESULT CALLBACK forge_editor_subclass(HWND window,UINT msg,WPARAM wp,LPARAM lp,UINT_PTR id,DWORD_PTR data){if(msg==WM_CLOSE){forgeOnNativeClose();return 0;}if(msg==WM_NCDESTROY)RemoveWindowSubclass(window,forge_editor_subclass,id);return DefSubclassProc(window,msg,wp,lp);}
static int forge_install_editor_hook(void *window){return SetWindowSubclass((HWND)window,forge_editor_subclass,1,0)!=0;}
*/
import "C"
import "unsafe"

func installEditorCloseHook(window unsafe.Pointer) bool {
	return C.forge_install_editor_hook(window) != 0
}
