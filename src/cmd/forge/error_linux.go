package main

import "log"

func showStartupError(err error) {
	log.Printf("%v. A graphical desktop is required; use --serve for the browser mode.", err)
}
