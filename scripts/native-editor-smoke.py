#!/usr/bin/env python3
"""Exercise the actual GTK editor, including a window-manager close request."""
import ctypes as C
import json
import os
from pathlib import Path
import selectors
import subprocess as sp
import tempfile
import time

ROOT = Path(__file__).resolve().parents[1]


def until(fn, timeout=15):
    end = time.monotonic() + timeout
    while time.monotonic() < end:
        value = fn()
        if value:
            return value
        time.sleep(0.08)
    raise AssertionError("Native editor condition timed out")


def close_request(display, window):
    class Data(C.Union):
        _fields_ = [("b", C.c_char * 20), ("s", C.c_short * 10), ("l", C.c_long * 5)]

    class Client(C.Structure):
        _fields_ = [("type", C.c_int), ("serial", C.c_ulong), ("send_event", C.c_int),
                    ("display", C.c_void_p), ("window", C.c_ulong),
                    ("message_type", C.c_ulong), ("format", C.c_int), ("data", Data)]

    class Event(C.Union):
        _fields_ = [("client", Client), ("pad", C.c_long * 24)]

    x = C.CDLL("libX11.so.6")
    x.XOpenDisplay.argtypes = [C.c_char_p]
    x.XOpenDisplay.restype = C.c_void_p
    x.XInternAtom.argtypes = [C.c_void_p, C.c_char_p, C.c_int]
    x.XInternAtom.restype = C.c_ulong
    x.XSendEvent.argtypes = [C.c_void_p, C.c_ulong, C.c_int, C.c_long, C.POINTER(Event)]
    x.XFlush.argtypes = [C.c_void_p]
    x.XCloseDisplay.argtypes = [C.c_void_p]
    d = x.XOpenDisplay(display.encode())
    assert d, "Cannot connect to Xvfb"
    try:
        e = Event()
        e.client.type, e.client.display, e.client.window = 33, d, int(window)
        e.client.message_type = x.XInternAtom(d, b"WM_PROTOCOLS", 0)
        e.client.format = 32
        e.client.data.l[0] = x.XInternAtom(d, b"WM_DELETE_WINDOW", 0)
        assert x.XSendEvent(d, int(window), 0, 0, C.byref(e))
        x.XFlush(d)
    finally:
        x.XCloseDisplay(d)


def main():
    report = ROOT / "reports/native-editor-smoke.json"
    result = {"status": "FAIL", "platform": "Linux x64 / WebKitGTK 4.1",
              "environment": "Xvfb; software rendering; root test sandbox exception if required",
              "windows_runtime_tested": False, "checks": []}
    app = xvfb = None
    try:
        with tempfile.TemporaryDirectory(prefix="forge-native-") as folder:
            folder = Path(folder)
            env = os.environ.copy()
            env.update(LIBGL_ALWAYS_SOFTWARE="1", WEBKIT_DISABLE_DMABUF_RENDERER="1",
                       XDG_CONFIG_HOME=str(folder / "xdg-config"),
                       XDG_CACHE_HOME=str(folder / "cache"))
            if os.geteuid() == 0:
                env["WEBKIT_DISABLE_SANDBOX_THIS_IS_DANGEROUS"] = "1"
            with (ROOT / "reports/native-editor.log").open("w") as log:
                xvfb = sp.Popen(["Xvfb", "-displayfd", "1", "-screen", "0", "1280x900x24",
                                 "-nolisten", "tcp"], stdout=sp.PIPE, stderr=log, env=env)
                with selectors.DefaultSelector() as selector:
                    selector.register(xvfb.stdout, selectors.EVENT_READ)
                    assert selector.select(8), "Xvfb startup timed out"
                    number = xvfb.stdout.readline().decode().strip()
                assert number.isdigit(), "Xvfb failed to allocate a display"
                env["DISPLAY"] = ":" + number
                file = folder / "notes.txt"
                file.write_text("original native document\n")
                app = sp.Popen([str(ROOT / "build/forge-linux-x64"), "--editor", str(file),
                                "--config-dir", str(folder / "config")],
                               stdout=log, stderr=log, env=env)

                def xdo(*args):
                    return sp.run(["xdotool", *map(str, args)], env=env, text=True,
                                  capture_output=True, timeout=5)

                window = until(lambda: xdo("search", "--onlyvisible", "--name",
                                            "notes.txt.*Forge Editor").stdout.strip().splitlines())[-1]
                assert xdo("windowfocus", "--sync", window).returncode == 0
                assert xdo("mousemove", "--window", window, 500, 240, "click", 1).returncode == 0
                assert xdo("key", "--clearmodifiers", "ctrl+a").returncode == 0
                assert xdo("type", "--clearmodifiers", "native editor saved").returncode == 0
                until(lambda: xdo("getwindowname", window).stdout.startswith("●"))
                close_request(env["DISPLAY"], window)
                time.sleep(0.4)
                assert app.poll() is None, "Window closed with unsaved edits"
                sp.run(["import", "-window", window,
                        str(ROOT / "reports/native-editor-unsaved.png")], env=env, check=True, timeout=8)
                result["checks"].append("WM_DELETE_WINDOW preserves unsaved document and opens prompt")
                assert xdo("key", "Escape").returncode == 0
                assert app.poll() is None
                assert xdo("key", "--clearmodifiers", "ctrl+s").returncode == 0
                until(lambda: file.read_text() == "native editor saved")
                until(lambda: not xdo("getwindowname", window).stdout.startswith("●"))
                result["checks"].append("Cancel keeps editor open; Ctrl+S writes exact document bytes")
                close_request(env["DISPLAY"], window)
                assert app.wait(timeout=10) == 0
                result["checks"].append("Clean native window close exits successfully")
                result["status"] = "PASS"
    except Exception as error:
        result["error"] = str(error)
        raise
    finally:
        for proc in (app, xvfb):
            if proc and proc.poll() is None:
                proc.terminate()
                try:
                    proc.wait(timeout=5)
                except sp.TimeoutExpired:
                    proc.kill()
                    proc.wait()
        report.write_text(json.dumps(result, indent=2) + "\n")
        print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
