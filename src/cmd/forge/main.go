package main

import (
	"flag"
	"fmt"
	"io/fs"
	"log"
	"os"
	"os/signal"
	"runtime"
	"syscall"

	"forge-terminal/src/internal/server"
	"forge-terminal/src/ui"
)

var version = "0.2.0"

func main() {
	runtime.LockOSThread()
	headless := flag.Bool("serve", false, "Run local UI in an existing browser (development / headless Linux)")
	config := flag.String("config-dir", "", "Override configuration directory")
	printVersion := flag.Bool("version", false, "Print version")
	flag.Parse()
	if *printVersion {
		fmt.Println("Forge Terminal", version)
		return
	}
	assets, err := fs.Sub(ui.Files, "dist")
	if err != nil {
		log.Fatal(err)
	}
	s, err := server.New(assets, *config, version)
	if err != nil {
		log.Fatal(err)
	}
	if err = s.Start(); err != nil {
		log.Fatal(err)
	}
	defer s.Close()
	if *headless {
		fmt.Println("FORGE_URL=" + s.URL())
		ch := make(chan os.Signal, 1)
		signal.Notify(ch, os.Interrupt, syscall.SIGTERM)
		select {
		case <-ch:
		case <-s.Done():
		}
		return
	}
	if err := runWindow(s.URL()); err != nil {
		showStartupError(err)
		s.Close()
		os.Exit(1)
	}
}
