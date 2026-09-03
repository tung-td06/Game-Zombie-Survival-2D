// Running `node server.js` directly does not set NODE_ENV (the `next dev`
// CLI does). Without it, next.config's `setupDevPlatform()` (which makes
// the dev Edge compile handle node: builtins for the file-based fallback
// store) is skipped, so default to development like `next dev` does.
process.env.NODE_ENV = process.env.NODE_ENV || "development";

const { createServer } = require("http");
const { parse } = require("url");
const next = require("next");
const { WebSocketServer } = require("ws");

const dev = process.env.NODE_ENV !== "production";
const app = next({ dev });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const server = createServer((req, res) => {
    const parsedUrl = parse(req.url, true);
    handle(req, res, parsedUrl);
  });

  const wss = new WebSocketServer({ noServer: true });

  // Map of roomCode -> { host: WebSocket, guests: Set<WebSocket>, players: Map<string, any> }
  const rooms = new Map();

  wss.on("connection", (ws) => {
    let clientRoomCode = null;
    let clientIsHost = false;
    let clientUsername = null;

    ws.on("message", (message) => {
      try {
        const msg = JSON.parse(message);
        
        if (msg.type === "join") {
          clientRoomCode = msg.roomCode.toUpperCase();
          clientIsHost = !!msg.isHost;
          clientUsername = msg.username;

          if (!rooms.has(clientRoomCode)) {
            rooms.set(clientRoomCode, { host: null, guests: new Set(), players: new Map() });
          }
          const room = rooms.get(clientRoomCode);

          if (clientIsHost) {
            room.host = ws;
            room.players.set(clientUsername, { isHost: true });
            console.log(`Host created room ${clientRoomCode} as ${clientUsername}`);
          } else {
            room.guests.add(ws);
            room.players.set(clientUsername, { isHost: false });
            console.log(`Guest ${clientUsername} joined room ${clientRoomCode}`);
            
            // Notify the Host that a Guest joined
            if (room.host && room.host.readyState === 1) {
              room.host.send(JSON.stringify({ type: "player_joined", username: clientUsername }));
            }
          }
        } else if (msg.type === "input") {
          // Relay Guest inputs to the Host
          if (clientRoomCode) {
            const room = rooms.get(clientRoomCode);
            if (room && room.host && room.host.readyState === 1) {
              room.host.send(JSON.stringify({
                type: "input",
                username: clientUsername,
                ...msg
              }));
            }
          }
        } else if (msg.type === "snapshot") {
          // Relay Host state snapshot to all Guests in the room
          if (clientRoomCode && clientIsHost) {
            const room = rooms.get(clientRoomCode);
            if (room) {
              const packet = JSON.stringify({
                type: "snapshot",
                ...msg
              });
              for (const guest of room.guests) {
                if (guest.readyState === 1) {
                  guest.send(packet);
                }
              }
            }
          }
        } else if (msg.type === "chat") {
          // Relay chat message to all other players in the room
          if (clientRoomCode) {
            const room = rooms.get(clientRoomCode);
            if (room) {
              const packet = JSON.stringify({
                type: "chat",
                username: clientUsername,
                text: msg.text
              });
              if (room.host && room.host !== ws && room.host.readyState === 1) {
                room.host.send(packet);
              }
              for (const guest of room.guests) {
                if (guest !== ws && guest.readyState === 1) {
                  guest.send(packet);
                }
              }
            }
          }
        }
      } catch (err) {
        console.error("WS Message Error:", err);
      }
    });

    ws.on("close", () => {
      if (clientRoomCode && rooms.has(clientRoomCode)) {
        const room = rooms.get(clientRoomCode);
        room.players.delete(clientUsername);
        
        if (clientIsHost) {
          console.log(`Host left, closing room ${clientRoomCode}`);
          // Notify guests and close the room
          const packet = JSON.stringify({ type: "host_disconnected" });
          for (const guest of room.guests) {
            if (guest.readyState === 1) {
              guest.send(packet);
            }
          }
          rooms.delete(clientRoomCode);
        } else {
          console.log(`Guest ${clientUsername} left room ${clientRoomCode}`);
          room.guests.delete(ws);
          // Notify host
          if (room.host && room.host.readyState === 1) {
            room.host.send(JSON.stringify({ type: "player_left", username: clientUsername }));
          }
        }
      }
    });
  });

  server.on("upgrade", (req, socket, head) => {
    const { pathname } = parse(req.url);
    if (pathname === "/api/multiplayer") {
      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit("connection", ws, req);
      });
    } else {
      socket.destroy();
    }
  });

  const PORT = process.env.PORT || 3000;
  server.listen(PORT, (err) => {
    if (err) throw err;
    console.log(`> Ready on http://localhost:${PORT}`);
  });
});
