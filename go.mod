module forge-terminal

go 1.26.0

require (
	github.com/UserExistsError/conpty v0.1.4
	github.com/creack/pty v1.1.24
	github.com/gorilla/websocket v1.5.3
	github.com/webview/webview_go v0.0.0-20240831120633-6173450d4dd6
	golang.org/x/sys v0.48.0
)

replace github.com/webview/webview_go => ./third_party/webview_go
