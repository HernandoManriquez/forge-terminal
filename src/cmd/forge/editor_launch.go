package main

import (
	"errors"
	"os"
	"os/exec"
	"path/filepath"
)

func editorLauncher(config string) func(string) error {
	slots := make(chan struct{}, 4)
	return func(path string) error {
		select {
		case slots <- struct{}{}:
		default:
			return errors.New("Ya hay cuatro editores abiertos. Cierra uno antes de continuar")
		}
		started := false
		defer func() {
			if !started {
				<-slots
			}
		}()
		executable, err := os.Executable()
		if err != nil {
			return err
		}
		args := []string{"--editor", path}
		if config != "" {
			absolute, err := filepath.Abs(config)
			if err != nil {
				return err
			}
			args = append(args, "--config-dir", absolute)
		}
		child := exec.Command(executable, args...)
		child.Dir = filepath.Dir(path)
		if err = child.Start(); err != nil {
			return err
		}
		started = true
		go func() { _ = child.Wait(); <-slots }()
		return nil
	}
}
