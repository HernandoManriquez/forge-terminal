# Dependencies retained locally

`webview_go` is the MIT-licensed project https://github.com/webview/webview_go,
commit `6173450d4dd6` (2024-08-31). Its original license and nested WebView2/webview
licenses are retained. The Go module uses an explicit local replacement.

Local modifications:

1. Linux pkg-config dependency changed from `webkit2gtk-4.0` to `webkit2gtk-4.1`.
2. In WebView2.h, `EventToken.h` changed to `eventtoken.h`, matching MinGW's
   case-sensitive filesystem. Windows filesystems resolve both spellings.
3. `NewWindow` returns nil when the C window cannot be initialized, avoiding a
   null-pointer crash when a graphical display or required runtime is absent.

Do not silently replace or remove these patches when updating the dependency.
