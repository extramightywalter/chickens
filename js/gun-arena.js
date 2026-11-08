import { R, SPEED } from "./track.js";
import { mazeClearFraction } from "./maze.js";

export const BLASTER_HP = 30;
export const BULLET_SPEED = 48;
export const FIRE_INTERVAL = 0.45;
export const EYE_HEIGHT = 1.5;
const SCALE = 2;
const sourceUrl = new URL("../assets/models/gun arina.model", import.meta.url);
let source;
if (typeof window === "undefined") {
  const { readFile } = await import("node:fs/promises");
  source = await readFile(sourceUrl, "utf8");
} else {
  const response = await fetch(sourceUrl);
  if (!response.ok) throw new Error(`Could not load Gun Arena (${response.status}).`);
  source = await response.text();
}

// Asset Forge saves part references, not meshes. Rebuild their layout with primitives.
export function parseGunArena(text) {
  const colors = new Map([...text.matchAll(/name:([^;]+);color:RGBA\(([^)]+)\)/g)]
    .map(([, name, rgba]) => [name, rgba.split(",").slice(0, 3).map(Number)]));
  const pieces = text.split("\n").filter(line => line.includes("collection:") &&
    !line.includes("hidden:True")).map(line => {
    const field = name => line.match(new RegExp(`${name}:([^;]+)`))?.[1];
    const vector = name => field(name)?.replace(/[()]/g, "").split(",").map(Number);
    const position = vector("position"), rotation = vector("rotation"), scale = vector("scale");
    const type = field("type");
    if (!position || !rotation || !scale || !type ||
      [...position, ...rotation, ...scale].some(value => !Number.isFinite(value))) {
      throw new Error("Invalid Gun Arena part.");
    }
    const vent = type === "panel_vent";
    const size = vent ? [0.95, 0.16, 0.95] :
      type === "rudder_sides" ? [0.15, 1, 1] :
      type.startsWith("engine_") ? [0.8, 0.8, 1.2] : [1, 1, 1];
    const [width, height, depth] = size.map((value, i) => value * scale[i] * SCALE);
    const angle = rotation[1] * Math.PI / 180;
    const halfX = (Math.abs(Math.cos(angle)) * width + Math.abs(Math.sin(angle)) * depth) / 2;
    const halfZ = (Math.abs(Math.sin(angle)) * width + Math.abs(Math.cos(angle)) * depth) / 2;
    const x = position[0] * SCALE, z = position[2] * SCALE;
    const minY = (position[1] - 1) * SCALE;
    return {
      type, vent, x, z, y: minY + height / 2, width, height, depth, angle,
      minX: x - halfX, maxX: x + halfX, minZ: z - halfZ, maxZ: z + halfZ,
      minY, maxY: minY + height,
      color: colors.get(field("materials")?.split("+")[0]) ?? [0.8, 0.85, 0.9],
    };
  });
  const floor = pieces.filter(piece => piece.type === "block_bevel" && piece.maxY <= 0.01);
  if (!floor.length) throw new Error("Gun Arena has no floor.");
  const bounds = {
    minX: Math.min(...floor.map(piece => piece.minX)),
    maxX: Math.max(...floor.map(piece => piece.maxX)),
    minZ: Math.min(...floor.map(piece => piece.minZ)),
    maxZ: Math.max(...floor.map(piece => piece.maxZ)),
  };
  const merged = new Map();
  for (const piece of pieces.filter(piece => !piece.vent && piece.maxY > 0.4)) {
    const key = [piece.minX, piece.maxX, piece.minZ, piece.maxZ].map(n => n.toFixed(3)).join(",");
    const previous = merged.get(key);
    if (previous) {
      previous.minY = Math.min(previous.minY, piece.minY);
      previous.maxY = Math.max(previous.maxY, piece.maxY);
    } else merged.set(key, { ...piece });
  }
  const walls = [...merged.values(),
    { minX: bounds.minX - 2, maxX: bounds.minX, minZ: bounds.minZ - 2, maxZ: bounds.maxZ + 2 },
    { minX: bounds.maxX, maxX: bounds.maxX + 2, minZ: bounds.minZ - 2, maxZ: bounds.maxZ + 2 },
    { minX: bounds.minX - 2, maxX: bounds.maxX + 2, minZ: bounds.minZ - 2, maxZ: bounds.minZ },
    { minX: bounds.minX - 2, maxX: bounds.maxX + 2, minZ: bounds.maxZ, maxZ: bounds.maxZ + 2 },
  ];
  return { pieces, walls, bounds, vents: pieces.filter(piece => piece.vent) };
}

export const gunArena = parseGunArena(source);

export function gunFloorHeight(x, z) {
  return gunArena.vents.some(vent => x >= vent.minX && x <= vent.maxX &&
    z >= vent.minZ && z <= vent.maxZ) ? 0.32 : 0;
}

const nodes = [];
for (let x = Math.ceil(gunArena.bounds.minX + R); x < gunArena.bounds.maxX - R; x++) {
  for (let z = Math.ceil(gunArena.bounds.minZ + R); z < gunArena.bounds.maxZ - R; z++) {
    if (gunArena.walls.every(wall => Math.hypot(
      x - Math.max(wall.minX, Math.min(x, wall.maxX)),
      z - Math.max(wall.minZ, Math.min(z, wall.maxZ))) > R + 0.05)) nodes.push({ x, z });
  }
}
const nodeIds = new Map(nodes.map((node, id) => [`${node.x},${node.z}`, id]));
const links = nodes.map(node => [[1, 0], [-1, 0], [0, 1], [0, -1]]
  .map(([dx, dz]) => nodeIds.get(`${node.x + dx},${node.z + dz}`))
  .filter(id => id !== undefined &&
    mazeClearFraction(gunArena.walls, node, nodes[id], R + 0.02) === 1));
const nearestNode = point => nodes.reduce((best, node, id) =>
  Math.hypot(node.x - point.x, node.z - point.z) <
    Math.hypot(nodes[best].x - point.x, nodes[best].z - point.z) ? id : best, 0);
const reachable = new Set([0]), queue = [0];
for (let i = 0; i < queue.length; i++) {
  for (const id of links[queue[i]]) if (!reachable.has(id)) { reachable.add(id); queue.push(id); }
}
if (reachable.size < 8) throw new Error("Gun Arena needs room for eight connected spawns.");
const spawnPoints = [nodes[queue[Math.floor(queue.length / 2)]]];
while (spawnPoints.length < 8) {
  const next = [...reachable].map(id => nodes[id]).filter(node => !spawnPoints.includes(node))
    .sort((a, b) => Math.min(...spawnPoints.map(s => Math.hypot(b.x - s.x, b.z - s.z))) -
      Math.min(...spawnPoints.map(s => Math.hypot(a.x - s.x, a.z - s.z))))[0];
  spawnPoints.push(next);
}

function wallHit(from, to) {
  let first = Infinity;
  for (const wall of gunArena.walls) {
    let enter = 0, exit = 1;
    for (const [axis, low, high] of [
      ["x", wall.minX, wall.maxX], ["z", wall.minZ, wall.maxZ],
      ["y", wall.minY ?? -10, wall.maxY ?? 100],
    ]) {
      const delta = to[axis] - from[axis];
      if (Math.abs(delta) < 1e-10) {
        if (from[axis] < low || from[axis] > high) exit = -1;
      } else {
        const a = (low - from[axis]) / delta, b = (high - from[axis]) / delta;
        enter = Math.max(enter, Math.min(a, b));
        exit = Math.min(exit, Math.max(a, b));
      }
    }
    if (enter <= exit) first = Math.min(first, enter);
  }
  return first;
}

function chickenHit(from, to, racer, previous) {
  const x = from.x - previous.x, z = from.z - previous.z;
  const dx = to.x - from.x - (racer.x - previous.x);
  const dz = to.z - from.z - (racer.z - previous.z);
  const a = dx * dx + dz * dz, b = 2 * (x * dx + z * dz);
  const c = x * x + z * z - (R + 0.08) ** 2;
  let enter = 0, exit = 1;
  if (a < 1e-10) {
    if (c > 0) return Infinity;
  } else {
    const discriminant = b * b - 4 * a * c;
    if (discriminant < 0) return Infinity;
    enter = Math.max(enter, (-b - Math.sqrt(discriminant)) / (2 * a));
    exit = Math.min(exit, (-b + Math.sqrt(discriminant)) / (2 * a));
  }
  const y = from.y - gunFloorHeight(previous.x, previous.z);
  const dy = to.y - from.y - (gunFloorHeight(racer.x, racer.z) -
    gunFloorHeight(previous.x, previous.z));
  if (Math.abs(dy) < 1e-10) {
    if (y < 0 || y > 1.9) return Infinity;
  } else {
    const a = -y / dy, b = (1.9 - y) / dy;
    enter = Math.max(enter, Math.min(a, b));
    exit = Math.min(exit, Math.max(a, b));
  }
  return enter <= exit ? enter : Infinity;
}

export function createGunRound(random = Math.random) {
  let nextBullet = 0;
  const ai = new WeakMap();
  const previousAim = new WeakMap();

  function reset(state, racers) {
    state.bullets = [];
    nextBullet = 0;
    racers.forEach((racer, index) => {
      const spawn = spawnPoints[index], target = spawnPoints[(index + 1) % racers.length];
      previousAim.delete(racer);
      ai.delete(racer);
      Object.assign(racer, {
        x: spawn.x, z: spawn.z, yaw: Math.atan2(target.x - spawn.x, target.z - spawn.z),
        pitch: 0, lives: BLASTER_HP, eliminated: false, fireCooldown: 0,
        shotsFired: 0, spinTimer: 0, diveTimer: 0, walk: 0,
        controls: { forward: 0, strafe: 0 },
      });
    });
  }

  function fire(state, racer) {
    if (racer.eliminated || racer.fireCooldown > 1e-8) return;
    const computer = ai.has(racer);
    const yaw = racer.yaw + (computer ? (random() * 2 - 1) * 0.2 : 0);
    const pitch = racer.pitch + (computer ? (random() * 2 - 1) * 0.12 : 0);
    state.bullets.push({
      id: nextBullet++, ownerId: racer.id, x: racer.x, z: racer.z,
      y: gunFloorHeight(racer.x, racer.z) + EYE_HEIGHT,
      vx: Math.sin(yaw) * Math.cos(pitch) * BULLET_SPEED,
      vz: Math.cos(yaw) * Math.cos(pitch) * BULLET_SPEED,
      vy: Math.sin(pitch) * BULLET_SPEED, ttl: 2,
    });
    racer.fireCooldown = FIRE_INTERVAL;
    racer.shotsFired++;
  }

  function chooseControls(racer, racers, dt) {
    const target = racers.filter(other => other !== racer && !other.eliminated)
      .sort((a, b) => Math.hypot(a.x - racer.x, a.z - racer.z) -
        Math.hypot(b.x - racer.x, b.z - racer.z))[0];
    if (!target) return {};
    let memory = ai.get(racer);
    if (!memory) { memory = { timer: 0, path: [] }; ai.set(racer, memory); }
    memory.timer -= dt;
    const clear = mazeClearFraction(gunArena.walls, racer, target, 0.1) === 1;
    let destination = target;
    if (!clear) {
      if (memory.timer <= 0 || !memory.path.length) {
        const start = nearestNode(racer), end = nearestNode(target);
        const parents = new Map([[start, null]]), search = [start];
        for (let n = 0; n < search.length && !parents.has(end); n++) {
          for (const id of links[search[n]]) if (!parents.has(id)) {
            parents.set(id, search[n]); search.push(id);
          }
        }
        memory.path = [];
        if (parents.has(end)) {
          for (let id = end; id !== null; id = parents.get(id)) memory.path.unshift(nodes[id]);
        }
        memory.timer = 0.8;
      }
      while (memory.path.length > 1 &&
        Math.hypot(memory.path[0].x - racer.x, memory.path[0].z - racer.z) < 0.35) memory.path.shift();
      destination = memory.path[0] ?? target;
    }
    const yaw = Math.atan2(target.x - racer.x, target.z - racer.z);
    const dx = destination.x - racer.x, dz = destination.z - racer.z;
    const distance = Math.hypot(dx, dz);
    const forward = distance > 1e-8 ?
      (dx * Math.sin(racer.yaw) + dz * Math.cos(racer.yaw)) / distance : 0;
    const strafe = distance > 1e-8 ?
      (-dx * Math.cos(racer.yaw) + dz * Math.sin(racer.yaw)) / distance : 0;
    const move = !clear || Math.hypot(target.x - racer.x, target.z - racer.z) > 9;
    return {
      w: move && forward > 0.35, s: move && forward < -0.35,
      a: move && strafe < -0.35, d: move && strafe > 0.35,
      aimYaw: yaw,
      " ": clear && Math.hypot(target.x - racer.x, target.z - racer.z) < 25,
      aimPitch: Math.atan2(gunFloorHeight(target.x, target.z) - gunFloorHeight(racer.x, racer.z),
        Math.hypot(target.x - racer.x, target.z - racer.z)),
    };
  }

  function advance(state, racers, dt, getKeys, move) {
    let remaining = dt;
    while (remaining > 1e-8) {
      const step = Math.min(remaining, 1 / 120);
      remaining -= step;
      const previous = racers.map(({ x, z }) => ({ x, z }));
      for (const racer of racers) {
        if (racer.eliminated) continue;
        const keys = getKeys(racer, step);
        racer.fireCooldown = Math.max(0, racer.fireCooldown - step);
        if (Number.isFinite(keys.aimYaw) && keys.aimYaw !== previousAim.get(racer)) {
          racer.yaw = Math.atan2(Math.sin(keys.aimYaw), Math.cos(keys.aimYaw));
          previousAim.set(racer, keys.aimYaw);
        } else if (keys.aimYaw === undefined) previousAim.delete(racer);
        if (Number.isFinite(keys.aimPitch)) racer.pitch = Math.max(-1.1, Math.min(1.1, keys.aimPitch));
        const forward = Number(Boolean(keys.w || keys.arrowup)) - Number(Boolean(keys.s || keys.arrowdown));
        const strafe = Number(Boolean(keys.d || keys.arrowright)) -
          Number(Boolean(keys.a || keys.arrowleft));
        racer.controls = { forward, strafe };
        move(racer, step, forward, strafe, SPEED, gunArena.walls);
        racer.walk = forward || strafe ? racer.walk + step * 11 : 0;
        if (keys[" "] || keys.fire) fire(state, racer);
      }
      for (const bullet of state.bullets) {
        const to = { x: bullet.x + bullet.vx * step, y: bullet.y + bullet.vy * step,
          z: bullet.z + bullet.vz * step };
        const obstruction = Math.min(wallHit(bullet, to),
          to.y <= 0 ? bullet.y / (bullet.y - to.y) : Infinity);
        let hit = null, time = obstruction;
        racers.forEach((racer, index) => {
          if (racer.eliminated || racer.id === bullet.ownerId) return;
          const entry = chickenHit(bullet, to, racer, previous[index]);
          if (entry < time) { time = entry; hit = racer; }
        });
        if (hit) {
          hit.lives = Math.max(0, hit.lives - 1);
          hit.eliminated = hit.lives === 0;
        }
        Object.assign(bullet, to);
        bullet.ttl = Number.isFinite(time) ? 0 : bullet.ttl - step;
      }
      state.bullets = state.bullets.filter(bullet => bullet.ttl > 0);
      const survivors = racers.filter(racer => !racer.eliminated);
      if (survivors.length <= 1) return survivors;
    }
    return null;
  }

  return { reset, fire, advance, chooseControls };
}
