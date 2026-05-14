const express = require("express");
const fs = require("fs");
const http = require("http");
const os = require("os");
const path = require("path");
const { Server } = require("socket.io");

const HOST = process.env.HOST || "0.0.0.0";
const PORT = Number(process.env.PORT) || 3000;
const CORS_ORIGIN = process.env.CORS_ORIGIN || "*";
const PUBLIC_SERVER_URL = String(process.env.PUBLIC_SERVER_URL || "").trim();
const SERVER_NAME = process.env.SERVER_NAME || "Bobloxx Server";
const TUNNEL_INFO_FILE = path.join(__dirname, "tunnel-info.json");
const MAX_CHAT_HISTORY = 25;
const MAX_CHAT_LENGTH = 160;
const SERVER_STARTED_AT = Date.now();

const MAPS = {
  Grassland: {
    id: "Grassland",
    name: "Parkour Grassland",
    difficulty: "Normal",
    spawn: { x: 0, y: 5, z: 0 },
    fallLimit: -25,
  },
  Void: {
    id: "Void",
    name: "The Void",
    difficulty: "Hard",
    spawn: { x: 0, y: 7, z: 0 },
    fallLimit: -40,
  },
  Skyway: {
    id: "Skyway",
    name: "Skyway Sprint",
    difficulty: "Medium",
    spawn: { x: 0, y: 6, z: 0 },
    fallLimit: -30,
  },
};
const MAP_IDS = Object.keys(MAPS);

const app = express();
app.disable("x-powered-by");

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: CORS_ORIGIN },
});

app.use(express.static(__dirname));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

const players = new Map();
const roomChatHistory = new Map();

function sanitizeName(input) {
  const cleaned = String(input || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 12);

  return cleaned || "Noob";
}

function sanitizeMessage(input) {
  return String(input || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_CHAT_LENGTH);
}

function clampNumber(value, min, max, fallback) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(max, Math.max(min, numeric));
}

function getMapConfig(mapId) {
  return MAPS[mapId] || MAPS.Grassland;
}

function toPublicPlayer(player) {
  return {
    id: player.id,
    name: player.name,
    displayName: player.name,
    map: player.map,
    x: player.x,
    y: player.y,
    z: player.z,
    rot: player.rot,
    vel: player.vel,
  };
}

function getMapPlayerCount(mapId) {
  let count = 0;
  for (const player of players.values()) {
    if (player.map === mapId) count += 1;
  }
  return count;
}

function getPlayersInMap(mapId, excludeId) {
  const currentPlayers = Object.create(null);
  for (const [id, player] of players.entries()) {
    if (player.map === mapId && id !== excludeId) {
      currentPlayers[id] = toPublicPlayer(player);
    }
  }
  return currentPlayers;
}

function summarizeMap(mapId) {
  const map = getMapConfig(mapId);
  return {
    id: map.id,
    name: map.name,
    difficulty: map.difficulty,
    spawn: map.spawn,
    fallLimit: map.fallLimit,
    playerCount: getMapPlayerCount(map.id),
  };
}

function summarizeMaps() {
  return MAP_IDS.map((mapId) => summarizeMap(mapId));
}

function getPlayersInMapList(mapId, excludeId) {
  const list = [];
  for (const [id, player] of players.entries()) {
    if (player.map === mapId && id !== excludeId) {
      list.push(player);
    }
  }
  return list;
}

function makeUniquePlayerName(baseName, mapId, socketId) {
  const usedNames = new Set(
    getPlayersInMapList(mapId, socketId).map((player) => player.name.toLowerCase())
  );

  if (!usedNames.has(baseName.toLowerCase())) {
    return baseName;
  }

  let suffix = 2;
  while (usedNames.has(`${baseName} ${suffix}`.toLowerCase())) {
    suffix += 1;
  }

  return `${baseName} ${suffix}`.slice(0, 12).trim();
}

function getChatHistory(mapId) {
  return roomChatHistory.get(mapId) || [];
}

function storeChatMessage(mapId, message) {
  const history = roomChatHistory.get(mapId) || [];
  history.push(message);
  if (history.length > MAX_CHAT_HISTORY) {
    history.splice(0, history.length - MAX_CHAT_HISTORY);
  }
  roomChatHistory.set(mapId, history);
  return message;
}

function makeServerMessage(text) {
  return {
    name: "Server",
    displayName: "Server",
    text,
    system: true,
    createdAt: Date.now(),
  };
}

function emitPrivateServerMessage(socket, text) {
  socket.emit("chatUpdate", {
    name: "Server",
    displayName: "Server",
    text,
    system: true,
    private: true,
    createdAt: Date.now(),
  });
}

function getLanUrls() {
  const interfaces = os.networkInterfaces();
  const urls = [];

  for (const entries of Object.values(interfaces)) {
    for (const entry of entries || []) {
      if (!entry || entry.internal || entry.family !== "IPv4") continue;
      urls.push(`http://${entry.address}:${PORT}`);
    }
  }

  return Array.from(new Set(urls)).sort();
}

function readTunnelInfo() {
  try {
    if (!fs.existsSync(TUNNEL_INFO_FILE)) return null;
    const raw = fs.readFileSync(TUNNEL_INFO_FILE, "utf8");
    const data = JSON.parse(raw);
    if (!data || typeof data.publicUrl !== "string" || !data.publicUrl.trim()) {
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

function getServerInfo(reqHost) {
  const lanUrls = getLanUrls();
  const localUrl = `http://localhost:${PORT}`;
  const sameOriginUrl = reqHost ? `http://${reqHost}` : null;
  const tunnelInfo = readTunnelInfo();
  const primaryLanUrl = lanUrls[0] || null;
  const internetJoinUrl = PUBLIC_SERVER_URL || tunnelInfo?.publicUrl || null;
  const preferredJoinUrl = internetJoinUrl || sameOriginUrl || primaryLanUrl || localUrl;
  const tunnelProvider = PUBLIC_SERVER_URL ? "public-url" : tunnelInfo?.provider || null;

  return {
    name: SERVER_NAME,
    host: HOST,
    port: PORT,
    corsOrigin: CORS_ORIGIN,
    publicUrl: internetJoinUrl,
    internetJoinUrl,
    preferredJoinUrl,
    localUrl,
    sameOriginUrl,
    primaryLanUrl,
    lanUrls,
    tunnelProvider,
    shareHint: PUBLIC_SERVER_URL
      ? `Share ${PUBLIC_SERVER_URL} with friends on other networks.`
      : tunnelInfo?.publicUrl
        ? `Share ${tunnelInfo.publicUrl} with friends and keep npm run share open.`
        : `For free internet play, keep the server running and start npm run share in a second terminal.`,
  };
}

function emitRoomServerMessage(mapId, text) {
  const message = storeChatMessage(mapId, makeServerMessage(text));
  io.to(mapId).emit("chatUpdate", message);
  return message;
}

function formatDuration(ms) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const parts = [];

  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0 || hours > 0) parts.push(`${minutes}m`);
  parts.push(`${seconds}s`);

  return parts.join(" ");
}

function formatPosition(player) {
  return `x ${player.x.toFixed(1)}, y ${player.y.toFixed(1)}, z ${player.z.toFixed(1)}`;
}

function findMapByQuery(query) {
  const normalized = String(query || "").trim().toLowerCase();
  if (!normalized) return null;

  const exactId = MAP_IDS.find((mapId) => mapId.toLowerCase() === normalized);
  if (exactId) return MAPS[exactId];

  const exactName = MAP_IDS.find((mapId) => MAPS[mapId].name.toLowerCase() === normalized);
  if (exactName) return MAPS[exactName];

  const partial = MAP_IDS.find((mapId) => {
    return (
      mapId.toLowerCase().includes(normalized) ||
      MAPS[mapId].name.toLowerCase().includes(normalized)
    );
  });

  return partial ? MAPS[partial] : null;
}

function broadcastRoomInfo(mapId) {
  const mapData = summarizeMap(mapId);
  const maps = summarizeMaps();

  io.to(mapId).emit("roomInfo", {
    map: mapId,
    mapData,
    playerCount: mapData.playerCount,
  });
  io.emit("mapsUpdate", maps);
}

function renamePlayer(socket, requestedName) {
  const player = players.get(socket.id);
  if (!player) return false;

  const nextName = makeUniquePlayerName(sanitizeName(requestedName), player.map, socket.id);
  if (nextName === player.name) {
    emitPrivateServerMessage(socket, `You are already named ${nextName}.`);
    return true;
  }

  const oldName = player.name;
  player.name = nextName;

  socket.emit("selfRenamed", { name: nextName, displayName: nextName });
  socket.to(player.map).emit("playerRenamed", {
    id: socket.id,
    name: nextName,
    displayName: nextName,
  });

  console.log(`Rename: ${oldName} (${socket.id}) is now ${nextName}`);
  emitRoomServerMessage(player.map, `${oldName} is now ${nextName}.`);
  return true;
}

function removePlayerFromRoom(socket, options = {}) {
  const player = players.get(socket.id);
  if (!player) return null;

  players.delete(socket.id);
  socket.leave(player.map);
  io.to(player.map).emit("playerDisconnected", socket.id);
  console.log(`Player: ${player.name} (${socket.id}) left ${player.map}`);
  console.log(`Room ${player.map} now has ${getMapPlayerCount(player.map)} player(s)`);

  if (options.announceLeave) {
    const leaveMessage = storeChatMessage(
      player.map,
      makeServerMessage(`${player.name} left ${getMapConfig(player.map).name}.`)
    );
    io.to(player.map).emit("chatUpdate", leaveMessage);
  }

  broadcastRoomInfo(player.map);
  return player;
}

function joinPlayerToMap(socket, requestedMap, requestedName, source = "join") {
  const existing = players.get(socket.id);
  const requestedNameClean = sanitizeName(requestedName ?? existing?.name);
  const isSameRoom = Boolean(existing && existing.map === requestedMap.id);
  const name = makeUniquePlayerName(requestedNameClean, requestedMap.id, socket.id);

  console.log(`Join request: ${socket.id} wants ${requestedMap.id} as ${requestedNameClean} from ${source}`);

  if (existing && !isSameRoom) {
    removePlayerFromRoom(socket);
  }

  socket.join(requestedMap.id);

  const player = {
    id: socket.id,
    name,
    map: requestedMap.id,
    x: requestedMap.spawn.x,
    y: requestedMap.spawn.y,
    z: requestedMap.spawn.z,
    rot: 0,
    vel: 0,
    joinedAt: existing?.joinedAt || Date.now(),
  };

  players.set(socket.id, player);

  const currentPlayers = getPlayersInMap(requestedMap.id, socket.id);
  const currentPlayerNames = Object.values(currentPlayers).map((entry) => entry.name);

  console.log(`Player: ${name} (${socket.id}) joined ${requestedMap.id}`);
  console.log(`Players already in ${requestedMap.id}: ${currentPlayerNames.join(", ") || "none"}`);
  console.log(`Room ${requestedMap.id} now has ${getMapPlayerCount(requestedMap.id)} player(s)`);

  socket.emit("joinedGame", {
    self: toPublicPlayer(player),
    map: requestedMap.id,
    mapData: summarizeMap(requestedMap.id),
    currentPlayers,
    chatHistory: getChatHistory(requestedMap.id),
    playerCount: getMapPlayerCount(requestedMap.id),
    maps: summarizeMaps(),
    serverInfo: getServerInfo(socket.handshake.headers.host),
  });

  if (isSameRoom) {
    if (existing && existing.name !== name) {
      socket.to(requestedMap.id).emit("playerRenamed", {
        id: socket.id,
        name,
        displayName: name,
      });
    }

    socket.to(requestedMap.id).emit("playerMoved", {
      id: socket.id,
      pos: toPublicPlayer(player),
      teleported: true,
    });
  } else {
    socket.to(requestedMap.id).emit("newPlayer", toPublicPlayer(player));
    emitRoomServerMessage(requestedMap.id, `${name} joined ${requestedMap.name}.`);
  }

  broadcastRoomInfo(requestedMap.id);
  return player;
}

function respawnPlayer(socket, reason) {
  const player = players.get(socket.id);
  if (!player) return;

  const mapConfig = getMapConfig(player.map);
  player.x = mapConfig.spawn.x;
  player.y = mapConfig.spawn.y;
  player.z = mapConfig.spawn.z;
  player.rot = 0;
  player.vel = 0;
  console.log(`Respawn: ${player.name} (${socket.id}) in ${player.map} because of ${reason || "respawn"}`);

  socket.emit("respawned", {
    x: player.x,
    y: player.y,
    z: player.z,
    reason: reason || "respawn",
  });

  io.to(player.map).emit("playerMoved", {
    id: socket.id,
    pos: toPublicPlayer(player),
    teleported: true,
  });
}

function handleChatCommand(socket, rawText) {
  const player = players.get(socket.id);
  if (!player) return true;

  const [command, ...args] = rawText.split(/\s+/);
  const argumentText = args.join(" ").trim();
  console.log(`Command: ${player.name} (${socket.id}) used ${command || "(empty)"} in ${player.map}`);

  switch ((command || "").toLowerCase()) {
    case "/help":
      emitPrivateServerMessage(
        socket,
        "Server commands: /help, /who, /respawn, /maps, /map <name>, /where, /time, /connect"
      );
      emitPrivateServerMessage(
        socket,
        "More: /stats, /rename <name>, /me <action>, /roll [max], /motd. Try /clienthelp too."
      );
      return true;
    case "/who": {
      const roomPlayers = getPlayersInMapList(player.map, socket.id)
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((entry) => entry.name);

      roomPlayers.unshift(`${player.name} (you)`);
      emitPrivateServerMessage(socket, `Players here: ${roomPlayers.join(", ")}`);
      return true;
    }
    case "/respawn":
      respawnPlayer(socket, "command");
      emitPrivateServerMessage(socket, "Respawned at the map spawn.");
      return true;
    case "/maps": {
      const mapSummary = summarizeMaps()
        .map((map) => `${map.name} (${map.playerCount})`)
        .join(", ");
      emitPrivateServerMessage(socket, `Maps: ${mapSummary}`);
      return true;
    }
    case "/map": {
      if (!argumentText) {
        emitPrivateServerMessage(socket, "Usage: /map <name>");
        return true;
      }

      const targetMap = findMapByQuery(argumentText);
      if (!targetMap) {
        emitPrivateServerMessage(socket, `Map not found: ${argumentText}`);
        return true;
      }

      if (targetMap.id === player.map) {
        emitPrivateServerMessage(socket, `You are already in ${targetMap.name}.`);
        return true;
      }

      joinPlayerToMap(socket, targetMap, player.name, "/map");
      emitPrivateServerMessage(socket, `Switched to ${targetMap.name}.`);
      return true;
    }
    case "/where": {
      const map = getMapConfig(player.map);
      emitPrivateServerMessage(socket, `You are in ${map.name} at ${formatPosition(player)}.`);
      return true;
    }
    case "/time":
      emitPrivateServerMessage(socket, `Server time: ${new Date().toLocaleString()}`);
      return true;
    case "/connect": {
      const info = getServerInfo(socket.handshake.headers.host);
      emitPrivateServerMessage(
        socket,
        `Join URL: ${info.preferredJoinUrl}`
      );
      if (info.publicUrl) {
        emitPrivateServerMessage(socket, `Internet share URL: ${info.publicUrl}`);
      } else if (info.primaryLanUrl) {
        emitPrivateServerMessage(
          socket,
          `LAN URL: ${info.primaryLanUrl}. For internet play, set PUBLIC_SERVER_URL and forward port ${PORT}.`
        );
      } else {
        emitPrivateServerMessage(
          socket,
          `No LAN URL detected. For internet play, set PUBLIC_SERVER_URL and forward port ${PORT}.`
        );
      }
      return true;
    }
    case "/stats":
      emitPrivateServerMessage(
        socket,
        `Online: ${players.size} | Here: ${getMapPlayerCount(player.map)} | Uptime: ${formatDuration(Date.now() - SERVER_STARTED_AT)}`
      );
      return true;
    case "/rename":
      if (!argumentText) {
        emitPrivateServerMessage(socket, "Usage: /rename <new name>");
        return true;
      }
      renamePlayer(socket, argumentText);
      return true;
    case "/me":
      if (!argumentText) {
        emitPrivateServerMessage(socket, "Usage: /me <action>");
        return true;
      }
      emitRoomServerMessage(player.map, `* ${player.name} ${argumentText}`);
      return true;
    case "/roll": {
      const requestedMax = Number.parseInt(args[0] || "6", 10);
      const max = Number.isFinite(requestedMax) ? Math.min(1000, Math.max(2, requestedMax)) : 6;
      const result = Math.floor(Math.random() * max) + 1;
      emitRoomServerMessage(player.map, `${player.name} rolled ${result} / ${max}.`);
      return true;
    }
    case "/motd":
      emitPrivateServerMessage(
        socket,
        `Welcome to Bobloxx. You are in ${getMapConfig(player.map).name}. Use /help to see the server command list.`
      );
      return true;
    default:
      emitPrivateServerMessage(socket, `Unknown command: ${command}`);
      return true;
  }
}

io.on("connection", (socket) => {
  console.log(`Player connected: ${socket.id}`);
  console.log(`Connected players total: ${io.engine.clientsCount}`);

  socket.emit("welcome", {
    socketId: socket.id,
    maps: summarizeMaps(),
    serverInfo: getServerInfo(socket.handshake.headers.host),
  });

  socket.on("joinGame", (payload) => {
    const requestedMap = getMapConfig(payload?.map);
    joinPlayerToMap(socket, requestedMap, payload?.name, "join button");
  });

  socket.on("chatMessage", (rawText) => {
    const player = players.get(socket.id);
    if (!player) return;

    const text = sanitizeMessage(rawText);
    if (!text) return;
    console.log(`Chat: ${player.name} (${socket.id}) in ${player.map}: ${text}`);

    if (text.startsWith("/")) {
      handleChatCommand(socket, text);
      return;
    }

    const message = storeChatMessage(player.map, {
      name: player.name,
      displayName: player.name,
      text,
      system: false,
      createdAt: Date.now(),
    });

    io.to(player.map).emit("chatUpdate", message);
  });

  socket.on("requestRespawn", () => {
    const player = players.get(socket.id);
    if (player) {
      console.log(`Respawn request: ${player.name} (${socket.id}) in ${player.map}`);
    }
    respawnPlayer(socket, "fall");
  });

  socket.on("move", (payload) => {
    const player = players.get(socket.id);
    if (!player) return;

    player.x = clampNumber(payload?.x, -500, 500, player.x);
    player.y = clampNumber(payload?.y, -150, 500, player.y);
    player.z = clampNumber(payload?.z, -500, 500, player.z);
    player.rot = clampNumber(payload?.rot, -Math.PI * 4, Math.PI * 4, player.rot);
    player.vel = clampNumber(payload?.vel, 0, 100, player.vel);

    socket.to(player.map).emit("playerMoved", {
      id: socket.id,
      pos: toPublicPlayer(player),
    });
  });

  socket.on("disconnect", () => {
    console.log(`Player disconnected: ${socket.id}`);
    removePlayerFromRoom(socket, { announceLeave: true });
  });
});

app.get("/api/status", (req, res) => {
  console.log("API: GET /api/status");
  res.json({
    ok: true,
    serverName: SERVER_NAME,
    playerCount: players.size,
    maps: summarizeMaps(),
    serverInfo: getServerInfo(req.headers.host),
  });
});

app.get("/api/maps", (req, res) => {
  console.log("API: GET /api/maps");
  res.json(summarizeMaps());
});

app.get("/api/connect", (req, res) => {
  console.log("API: GET /api/connect");
  res.json(getServerInfo(req.headers.host));
});

server.listen(PORT, HOST, () => {
  console.log(`${SERVER_NAME} on http://${HOST}:${PORT}`);
  console.log(`Local URL: http://localhost:${PORT}`);
  const lanUrls = getLanUrls();
  if (lanUrls.length > 0) {
    console.log(`LAN URL(s): ${lanUrls.join(", ")}`);
  }
  if (PUBLIC_SERVER_URL) {
    console.log(`Public URL: ${PUBLIC_SERVER_URL}`);
  } else {
    console.log(`Free internet sharing: run npm run share in another terminal`);
    console.log(`Manual public access: port-forward TCP ${PORT} or host on a public IP/domain for cross-network play`);
  }
});
