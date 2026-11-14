// Package main is the tailcat client the T3 Code mobile app links in: it
// forwards a loopback TCP port on the phone to one port of a tailcat server.
package main

import (
	"context"
	"errors"
	"io"
	"net"
	"sync"
	"time"

	"github.com/tailscale/tailcat"
)

// Ping bounds itself to 10 seconds; this also bounds the relay map fetch.
const reachTimeout = 15 * time.Second

// A forward nothing connects through is closed, so a removed or disabled
// environment does not keep a relay connection open. The app's WebSocket keeps
// a forward in use for as long as it is connected.
const idleTimeout = time.Minute

type forward struct {
	address  string
	client   *tailcat.Client
	listener net.Listener
	port     uint16
	cancel   context.CancelFunc

	activeMu sync.Mutex
	active   int
	idle     *time.Timer
	closed   sync.Once
}

var (
	mu       sync.Mutex
	forwards = map[string]*forward{}
)

// ensureForward returns the loopback port that reaches remotePort on the
// tailcat server at address. A forward whose server no longer answers, such as
// one left behind by a suspended app, is replaced.
func ensureForward(address string, remotePort uint16) (int, error) {
	mu.Lock()
	defer mu.Unlock()

	key := address
	if existing, ok := forwards[key]; ok {
		if existing.port == remotePort && existing.reachable() {
			return existing.localPort(), nil
		}
		existing.close()
		delete(forwards, key)
	}

	if _, err := tailcat.ParseAddr(tailcat.Addr(address)); err != nil {
		return 0, errors.New("not a tailcat address")
	}
	next, err := startForward(address, remotePort)
	if err != nil {
		return 0, err
	}
	forwards[key] = next
	return next.localPort(), nil
}

func startForward(address string, remotePort uint16) (*forward, error) {
	client := &tailcat.Client{
		Server: tailcat.Addr(address),
		Logf:   func(string, ...any) {},
	}
	f := &forward{address: address, client: client, port: remotePort}
	if !f.reachable() {
		_ = client.Close()
		return nil, errors.New("the machine did not answer over tailcat")
	}
	listener, err := net.Listen("tcp4", "127.0.0.1:0")
	if err != nil {
		_ = client.Close()
		return nil, err
	}
	ctx, cancel := context.WithCancel(context.Background())
	f.listener = listener
	f.cancel = cancel
	f.idle = time.AfterFunc(idleTimeout, f.closeIfIdle)
	go f.serve(ctx)
	return f, nil
}

func (f *forward) closeIfIdle() {
	mu.Lock()
	defer mu.Unlock()
	f.activeMu.Lock()
	defer f.activeMu.Unlock()
	if f.active > 0 || forwards[f.address] != f {
		return
	}
	delete(forwards, f.address)
	f.close()
}

func (f *forward) use(delta int) {
	f.activeMu.Lock()
	defer f.activeMu.Unlock()
	f.active += delta
	if f.active == 0 {
		f.idle.Reset(idleTimeout)
	} else {
		f.idle.Stop()
	}
}

func (f *forward) localPort() int {
	return f.listener.Addr().(*net.TCPAddr).Port
}

func (f *forward) reachable() bool {
	ctx, cancel := context.WithTimeout(context.Background(), reachTimeout)
	defer cancel()
	_, err := f.client.Ping(ctx)
	return err == nil
}

func (f *forward) close() {
	f.closed.Do(func() {
		f.idle.Stop()
		f.cancel()
		_ = f.listener.Close()
		_ = f.client.Close()
	})
}

// drop forgets a forward whose listener died on its own, as iOS does to a
// suspended app's sockets, so the next call opens a new one.
func (f *forward) drop() {
	mu.Lock()
	defer mu.Unlock()
	if forwards[f.address] == f {
		delete(forwards, f.address)
	}
	f.close()
}

func (f *forward) serve(ctx context.Context) {
	for {
		local, err := f.listener.Accept()
		if err != nil {
			go f.drop()
			return
		}
		go f.pipe(ctx, local)
	}
}

func (f *forward) pipe(ctx context.Context, local net.Conn) {
	defer local.Close()
	f.use(1)
	defer f.use(-1)
	remote, err := f.client.DialTCPPort(ctx, f.port)
	if err != nil {
		return
	}
	defer remote.Close()
	stop := context.AfterFunc(ctx, func() {
		_ = local.Close()
		_ = remote.Close()
	})
	defer stop()

	done := make(chan struct{}, 2)
	copyHalf := func(dst, src net.Conn) {
		_, _ = io.Copy(dst, src)
		if half, ok := dst.(interface{ CloseWrite() error }); ok {
			_ = half.CloseWrite()
		} else {
			_ = dst.Close()
		}
		done <- struct{}{}
	}
	go copyHalf(remote, local)
	go copyHalf(local, remote)
	<-done
	<-done
}
