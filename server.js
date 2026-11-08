import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { dirname, extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { MINIGAMES } from "./js/pillows.js";
import { createLanGame } from "./js/lan-game.js";

const root = dirname(fileURLToPath(import.meta.url));
const types = {
  ".html": "text/html", ".js": "text/javascript", ".css": "text/css",
  ".png": "image/png", ".glb": "model/gltf-binary",
  ".model": "text/plain; charset=utf-8",
};
const controls = ["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright", "e", " ", "fire"];

export function createLanServer() {
  const players = new Map();
  const rooms = new Map();
  let closing = false;

  function publicRoom(room) {
    return {
      id: room.id, hostId: room.hostId, selection: room.selection, slots: room.slots,
      phase: room.game ? room.game.state.scene === "finished" ? "finished" : "playing" : "waiting",
      members: [...room.members],
    };
  }

  function send(player, event, data) {
    player.response.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  }

  function publish() {
    const games = [...rooms.values()].filter(room => !room.game).map(publicRoom);
    for (const [playerId, player] of players) {
      send(player, "rooms", {
        playerId, token: player.token, games,
        room: player.roomId ? publicRoom(rooms.get(player.roomId)) : null,
      });
    }
  }

  function leave(playerId) {
    const player = players.get(playerId);
    const room = rooms.get(player.roomId);
    if (!room) return;
    if (room.hostId === playerId || room.game) {
      for (const memberId of room.members) {
        const member = players.get(memberId);
        member.roomId = null;
        if (memberId !== playerId) {
          send(member, "notice", {
            message: room.game ? "A player left. The LAN game has ended." : "The host closed this game.",
          });
        }
      }
      rooms.delete(room.id);
    } else {
      room.members = room.members.filter(id => id !== playerId);
      player.roomId = null;
    }
  }

  async function handle(request, response) {
    const url = new URL(request.url, "http://localhost");
    if (url.pathname === "/api/lan/events" && request.method === "GET") {
      const id = randomUUID();
      response.writeHead(200, {
        "Content-Type": "text/event-stream", "Cache-Control": "no-cache",
        "Connection": "keep-alive", "X-Accel-Buffering": "no",
      });
      response.flushHeaders();
      const player = { response, token: randomUUID(), roomId: null, keys: {}, lastInput: 0 };
      players.set(id, player);
      response.on("close", () => {
        if (closing) return;
        if (!players.has(id)) return;
        leave(id);
        players.delete(id);
        publish();
      });
      publish();
      return;
    }
    if (url.pathname === "/api/lan" && request.method === "POST") {
      if (request.headers.origin && request.headers.origin !== `http://${request.headers.host}` &&
        request.headers.origin !== `https://${request.headers.host}`) {
        response.writeHead(403).end("Use the same server for LAN requests.");
        return;
      }
      let body = "";
      for await (const chunk of request) {
        body += chunk;
        if (body.length > 4096) {
          response.writeHead(413).end("Request too large.");
          return;
        }
      }
      let data;
      try {
        data = JSON.parse(body);
      } catch {
        response.writeHead(400).end("Invalid JSON.");
        return;
      }
      if (!data || typeof data !== "object") {
        response.writeHead(400).end("Expected a LAN request.");
        return;
      }
      const player = players.get(data.playerId);
      let error;
      if (!player || player.token !== data.token) error = "LAN connection expired. Reopen the LAN menu.";
      else if (data.action === "host") {
        if (player.roomId) error = "Leave your current game first.";
        else if (!Number.isInteger(data.slots) || data.slots < 2 || data.slots > 8) {
          error = "Choose 2-8 slots, including yourself.";
        } else if (![...MINIGAMES, "random"].includes(data.selection)) error = "Choose a valid minigame.";
        else {
          const room = {
            id: randomUUID(), hostId: data.playerId, selection: data.selection,
            slots: data.slots, members: [data.playerId], game: null,
          };
          rooms.set(room.id, room);
          player.roomId = room.id;
        }
      } else if (data.action === "join") {
        const room = rooms.get(data.roomId);
        if (player.roomId) error = "Leave your current game first.";
        else if (!room || room.game || room.members.length >= room.slots) error = "That game is no longer available.";
        else {
          room.members.push(data.playerId);
          player.roomId = room.id;
          if (room.members.length === room.slots) {
            const selection = room.selection === "random" ?
              MINIGAMES[Math.floor(Math.random() * MINIGAMES.length)] : room.selection;
            room.game = createLanGame(selection, room.members);
            for (const id of room.members) players.get(id).keys = {};
          }
        }
      } else if (data.action === "leave") leave(data.playerId);
      else if (data.action === "input") {
        if (!data.keys || typeof data.keys !== "object" || Array.isArray(data.keys)) {
          error = "Invalid controls.";
        } else {
          const nextKeys = Object.fromEntries(controls.map(key => [key, data.keys[key] === true]));
          for (const key of ["aimYaw", "aimPitch"]) {
            if (data.keys[key] !== undefined && !Number.isFinite(data.keys[key])) {
              error = "Invalid aim controls.";
              break;
            }
            if (data.keys[key] !== undefined) nextKeys[key] = data.keys[key];
          }
          if (!error) {
            player.keys = nextKeys;
            player.lastInput = Date.now();
          }
        }
      } else error = "Unknown LAN action.";
      response.writeHead(error ? 400 : 200, { "Content-Type": "application/json" });
      response.end(JSON.stringify(error ? { error } : { ok: true }));
      if (!error && data.action !== "input") publish();
      return;
    }
    if (url.pathname.startsWith("/api/lan")) {
      response.writeHead(404).end("LAN endpoint not found.");
      return;
    }
    if (request.method !== "GET" && request.method !== "HEAD") {
      response.writeHead(405).end("Method not allowed.");
      return;
    }
    let path;
    try {
      path = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname);
    } catch {
      response.writeHead(400).end("Invalid path.");
      return;
    }
    const file = resolve(root, `.${path}`);
    const publicFile = ["/index.html", "/styles.css", "/oreo portrait.png", "/pillow.glb", "/race-track.glb"].includes(path) ||
      path.startsWith("/js/") || path.startsWith("/assets/");
    if (!publicFile || !file.startsWith(`${root}${sep}`) || path.split("/").some(part => part.startsWith("."))) {
      response.writeHead(404).end("Not found.");
      return;
    }
    let info;
    try {
      info = await stat(file);
    } catch (error) {
      if (error.code !== "ENOENT" && error.code !== "ENOTDIR") throw error;
    }
    if (!info?.isFile()) {
      response.writeHead(404).end("Not found.");
      return;
    }
    response.writeHead(200, {
      "Content-Type": types[extname(file)] ?? "application/octet-stream",
      "Content-Length": info.size,
      "Cache-Control": "no-cache",
    });
    if (request.method === "HEAD") response.end();
    else createReadStream(file).on("error", error => response.destroy(error)).pipe(response);
  }

  const server = createServer((request, response) => {
    handle(request, response).catch(error => {
      console.error("LAN server request failed:", error);
      if (!response.headersSent) response.writeHead(500).end("LAN server error.");
      else response.destroy(error);
    });
  });
  let last = performance.now();
  const timer = setInterval(() => {
    const now = performance.now();
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;
    for (const room of rooms.values()) {
      if (!room.game) continue;
      const inputs = new Map(room.members.map(id => {
        const player = players.get(id);
        return [id, Date.now() - player.lastInput < 1000 ? player.keys : {}];
      }));
      room.game.update(dt, inputs);
      for (const id of room.members) {
        const player = players.get(id);
        if (player.response.writableLength < 65536) {
          send(player, "round", { state: room.game.state, racers: room.game.racers });
        }
      }
    }
  }, 50);
  const heartbeat = setInterval(() => {
    for (const player of players.values()) player.response.write(": heartbeat\n\n");
  }, 10000);
  server.on("close", () => { clearInterval(timer); clearInterval(heartbeat); });
  server.closeLan = () => {
    closing = true;
    clearInterval(timer);
    clearInterval(heartbeat);
    for (const player of players.values()) player.response.end();
    players.clear();
    rooms.clear();
    server.close();
  };
  return server;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT ?? 8000);
  const server = createLanServer();
  server.listen(port, "0.0.0.0", () => {
    console.log(`Chicken LAN server: http://localhost:${port}`);
    console.log(`Other players: open http://<this computer's LAN IP>:${port} on the same network.`);
  });
}
