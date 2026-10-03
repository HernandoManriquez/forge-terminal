//go:build !headless

package main

/*
#cgo pkg-config: gtk+-3.0
#include <gtk/gtk.h>
extern void forgeOnNativeClose(void);
static gboolean forge_editor_delete(GtkWidget *w,GdkEvent *event,gpointer data){forgeOnNativeClose();return TRUE;}
static int forge_install_editor_hook(void *window){return g_signal_connect(G_OBJECT(window),"delete-event",G_CALLBACK(forge_editor_delete),NULL)!=0;}
*/
import "C"
import "unsafe"

func installEditorCloseHook(window unsafe.Pointer) bool {
	return C.forge_install_editor_hook(window) != 0
}
