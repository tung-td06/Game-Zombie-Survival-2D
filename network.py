"""Multiplayer-ready networking scaffold (server-authoritative).

Architecture (spec #37):

    Server (authoritative)              Client(s)
    -----------------------             -----------------------
    owns Player/Zombie/Bullet           sends InputState
    state, damage, score, wave,         receives WorldSnapshot
    loot                                renders snapshot + local UI

The game logic lives in game.py / zombie.py etc. and is already written
against an injectable `game` facade, so a future headless server can drive
the same update_playing() loop while clients only render snapshots.

This module provides a WORKING transport layer (JSON-over-TCP with a
background receive thread and message queues). It is intentionally not
wired into the single-player flow — import it when implementing co-op:

    # host:
    server = Server(); server.start(port=7777)
    server.broadcast({"t": "snapshot", ...})

    # join:
    client = Client(); client.connect("192.168.1.10", 7777)
    client.send({"t": "input", "keys": [...], "aim": [x, y]})
    for msg in client.poll(): ...
"""
from __future__ import annotations

import json
import socket
import threading
from typing import Any, Callable

DEFAULT_PORT = 7777
MAX_PACKET = 65536


class NetworkManager:
    """Shared JSON/TCP transport with background receive thread."""

    def __init__(self) -> None:
        self.sock: socket.socket | None = None
        self.running = False
        self.inbox: list[dict[str, Any]] = []
        self.outbox_lock = threading.Lock()
        self._recv_thread: threading.Thread | None = None
        self.on_message: Callable[[dict[str, Any]], None] | None = None
        self.on_disconnect: Callable[[], None] | None = None

    # ------------------------------------------------------------ send ----
    def send(self, message: dict[str, Any]) -> bool:
        """Queue-free immediate send. Returns False if disconnected."""
        if self.sock is None:
            return False
        try:
            data = (json.dumps(message) + "\n").encode("utf-8")
            with self.outbox_lock:
                self.sock.sendall(data)
            return True
        except OSError:
            self._handle_disconnect()
            return False

    def poll(self) -> list[dict[str, Any]]:
        """Drain received messages (call once per game frame)."""
        msgs = self.inbox
        self.inbox = []
        return msgs

    # ----------------------------------------------------------- receive --
    def _start_receiving(self) -> None:
        self.running = True
        self._recv_thread = threading.Thread(
            target=self._receive_loop, daemon=True)
        self._recv_thread.start()

    def _receive_loop(self) -> None:
        buffer = b""
        while self.running and self.sock is not None:
            try:
                chunk = self.sock.recv(4096)
                if not chunk:
                    break
                buffer += chunk
                while b"\n" in buffer:
                    line, buffer = buffer.split(b"\n", 1)
                    if not line:
                        continue
                    msg = json.loads(line.decode("utf-8"))
                    self.inbox.append(msg)
                    if self.on_message is not None:
                        self.on_message(msg)
            except (OSError, ValueError):
                break
        self._handle_disconnect()

    def _handle_disconnect(self) -> None:
        if not self.running:
            return
        self.running = False
        if self.on_disconnect is not None:
            self.on_disconnect()

    def close(self) -> None:
        self.running = False
        if self.sock is not None:
            try:
                self.sock.close()
            except OSError:
                pass
            self.sock = None


class Client(NetworkManager):
    """Connects to a host; sends inputs, receives world snapshots."""

    def __init__(self) -> None:
        super().__init__()
        self.connected = False

    def connect(self, host: str, port: int = DEFAULT_PORT,
                timeout: float = 5.0) -> bool:
        try:
            self.sock = socket.create_connection((host, port), timeout=timeout)
            self.sock.settimeout(None)
            self.connected = True
            self._start_receiving()
            return True
        except OSError:
            self.sock = None
            self.connected = False
            return False

    def disconnect(self) -> None:
        self.close()
        self.connected = False


class Server(NetworkManager):
    """Authoritative host. Accepts N clients on one socket.

    Future integration point: run `pump()` each frame, feed client input
    messages into the simulation, then broadcast a snapshot built from the
    authoritative game state.
    """

    def __init__(self, max_clients: int = 4) -> None:
        super().__init__()
        self.max_clients = max_clients
        self.clients: list[socket.socket] = []
        self.listener: socket.socket | None = None
        self._accept_thread: threading.Thread | None = None

    def start(self, port: int = DEFAULT_PORT) -> bool:
        try:
            self.listener = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            self.listener.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            self.listener.bind(("", port))
            self.listener.listen(self.max_clients)
            self.running = True
            self._accept_thread = threading.Thread(
                target=self._accept_loop, daemon=True)
            self._accept_thread.start()
            return True
        except OSError:
            return False

    def _accept_loop(self) -> None:
        while self.running and self.listener is not None:
            try:
                conn, addr = self.listener.accept()
                if len(self.clients) >= self.max_clients:
                    conn.close()
                    continue
                self.clients.append(conn)
                self.inbox.append({"t": "client_joined", "addr": addr})
            except OSError:
                break

    def broadcast(self, message: dict[str, Any]) -> None:
        data = (json.dumps(message) + "\n").encode("utf-8")
        dead: list[socket.socket] = []
        with self.outbox_lock:
            for c in self.clients:
                try:
                    c.sendall(data)
                except OSError:
                    dead.append(c)
            for c in dead:
                self.clients.remove(c)

    def pump(self) -> list[dict[str, Any]]:
        """Server-side receive from every client into the inbox."""
        for c in list(self.clients):
            c.setblocking(False)
            try:
                while True:
                    chunk = c.recv(MAX_PACKET)
                    if not chunk:
                        self.clients.remove(c)
                        break
                    for line in chunk.split(b"\n"):
                        if line:
                            self.inbox.append(json.loads(line))
            except BlockingIOError:
                pass
            except (OSError, ValueError):
                if c in self.clients:
                    self.clients.remove(c)
        return self.poll()

    def stop(self) -> None:
        self.close()
        for c in self.clients:
            try:
                c.close()
            except OSError:
                pass
        self.clients.clear()
        if self.listener is not None:
            try:
                self.listener.close()
            except OSError:
                pass
