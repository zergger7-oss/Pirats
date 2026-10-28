const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });
const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, "public")));
app.get("/health", (_req, res) => res.json({ ok: true, game: "pirates-io-mvp" }));

const players = new Map();
const resources = new Map();
const RESOURCE_COUNT = 24;
const WORLD_LIMIT = 44;

function rand(min, max) { return min + Math.random() * (max - min); }
function makeResources() {
  for (let i = 0; i < RESOURCE_COUNT; i++) {
    const type = Math.random() < 0.58 ? "shell" : "crab";
    resources.set("r" + i, {
      id: "r" + i, type,
      x: rand(-12, 12),
      z: rand(-12, 12),
      value: type === "shell" ? 3 : 7
    });
  }
}
makeResources();

function publicPlayers() {
  return Array.from(players.values()).map(p => ({
    id: p.id, name: p.name, x: p.x, z: p.z, yaw: p.yaw, coins: p.coins
  }));
}

io.on("connection", socket => {
  const name = "Пират-" + Math.floor(100 + Math.random() * 900);
  players.set(socket.id, {
    id: socket.id, name, x: rand(-8, 8), z: rand(-8, 8),
    yaw: 0, coins: 0, lastMove: 0
  });

  socket.emit("welcome", {
    id: socket.id,
    players: publicPlayers(),
    resources: Array.from(resources.values())
  });
  socket.broadcast.emit("playerJoined", {
    id: socket.id, name, x: players.get(socket.id).x,
    z: players.get(socket.id).z, yaw: 0, coins: 0
  });

  socket.on("move", data => {
    const p = players.get(socket.id);
    if (!p || !data || !Number.isFinite(data.x) || !Number.isFinite(data.z)) return;
    const now = Date.now();
    if (now - p.lastMove < 30) return;
    p.lastMove = now;
    // Server clamps coordinates to keep players inside the playable area.
    p.x = Math.max(-WORLD_LIMIT, Math.min(WORLD_LIMIT, data.x));
    p.z = Math.max(-WORLD_LIMIT, Math.min(WORLD_LIMIT, data.z));
    p.yaw = Number.isFinite(data.yaw) ? data.yaw : p.yaw;
    socket.broadcast.emit("playerMoved", {
      id: p.id, x: p.x, z: p.z, yaw: p.yaw
    });
  });

  socket.on("collect", resourceId => {
    const p = players.get(socket.id);
    const r = resources.get(String(resourceId));
    if (!p || !r) return;
    const dx = p.x - r.x, dz = p.z - r.z;
    if (dx * dx + dz * dz > 4.5 * 4.5) return;
    resources.delete(r.id);
    p.coins += r.value;
    io.emit("resourceRemoved", { id: r.id });
    socket.emit("wallet", { coins: p.coins, gained: r.value });
  });

  socket.on("disconnect", () => {
    players.delete(socket.id);
    io.emit("playerLeft", socket.id);
  });
});

setInterval(() => {
  io.emit("worldState", publicPlayers());
}, 1500);

server.listen(PORT, "0.0.0.0", () => {
  console.log("Pirates.io MVP listening on port " + PORT);
});