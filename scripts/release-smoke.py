#!/usr/bin/env python3
"""Check the built Linux release, embedded UI, cwd and independent editor auth."""
import http.cookiejar
import json
from pathlib import Path
import selectors
import subprocess as sp
import tempfile
import urllib.parse
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
BINARY = ROOT / "build/forge-linux-x64"
VERSION = json.loads((ROOT / "package.json").read_text())["version"]
processes = []
checks = []
report = {"status": "FAIL", "platform": "Linux x64", "checks": checks}


def start(cwd, config, extra=()):
    p = sp.Popen([str(BINARY), "--serve", "--config-dir", str(config), *extra],
                 cwd=cwd, stdout=sp.PIPE, stderr=sp.PIPE, text=True)
    processes.append(p)
    with selectors.DefaultSelector() as selector:
        selector.register(p.stdout, selectors.EVENT_READ)
        assert selector.select(10), "Startup timeout"
        line = p.stdout.readline().strip()
    assert line.startswith("FORGE_URL="), line
    return line.split("=", 1)[1]


try:
    assert sp.check_output([str(BINARY), "--version"], text=True).strip() == "Forge Terminal " + VERSION
    checks.append("Native Linux binary reports " + VERSION)
    with tempfile.TemporaryDirectory(prefix="forge-release-") as temp:
        project = Path(temp) / "project with spaces"
        project.mkdir()
        doc = project / ".gitignore"
        doc.write_text("build/\n")
        browser = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
        main = start(project, Path(temp) / "main-config")
        editor = start(project, Path(temp) / "editor-config", ["--editor", str(doc)])
        origin = lambda url: urllib.parse.urlsplit(url)._replace(path="", query="", fragment="").geturl()
        assert "0.4" in browser.open(main, timeout=5).read().decode()
        boot = json.load(browser.open(origin(main) + "/api/bootstrap", timeout=5))
        assert boot["startupCwd"] == str(project)
        assert "terminal-surface" in browser.open(origin(main) + "/app.js", timeout=5).read().decode()
        checks.append("Authenticated terminal has embedded 0.4 UI and launch cwd with spaces")
        assert "Contenido del archivo" in browser.open(editor, timeout=5).read().decode()
        assert "Guardar como" in browser.open(origin(editor) + "/editor.js", timeout=5).read().decode()
        document = json.load(browser.open(origin(editor) + "/api/editor/file?" +
                                         urllib.parse.urlencode({"path": str(doc)}), timeout=5))
        assert document["text"] == "build/\n"
        checks.append("Standalone editor serves embedded UI and actual dotfile")
        for url in (main, editor):
            assert browser.open(origin(url) + "/api/bootstrap", timeout=5).status == 200
        checks.append("Two processes remain authenticated with one shared cookie jar")
    report["status"] = "PASS"
except Exception as error:
    report["error"] = str(error)
    raise
finally:
    for process in processes:
        process.terminate()
        process.wait(timeout=10)
    (ROOT / "reports/release-smoke.json").write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps(report, indent=2))
