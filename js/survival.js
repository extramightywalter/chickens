import { R, SPEED, TURN } from "./track.js";
import {
  MAZE_SIZE, generateMaze, mazeCellAt, mazeClearFraction, mazePath, mazePosition,
} from "./maze.js";

export const SURVIVAL_SIZE = MAZE_SIZE * 1.1;
export const SURVIVAL_COLS = 22;
export const FLAME_RANGE = 5;
export const FLAME_HALF_ANGLE = Math.PI / 7;
export const PICKUP_RANGE = 1.6;
export const SURVIVAL_MONSTER_SCALE = 2;
export const MONSTER_RADIUS = 0.4 * SURVIVAL_MONSTER_SCALE;
export const CARRY_SPEED_MULTIPLIER = 0.65;
const MONSTER_SPEEDS = { monster: SPEED * 0.24, runna: SPEED * 0.575, blaster: SPEED * 0.19 };
const TRAP_RADIUS = 0.35;
const SHOT_INTERVAL = 3;
const PROJECTILE_SPEED = 12;

export function generateSurvivalMap(random = Math.random) {
  const rooms = [
    { col: 9, row: 9, width: 4, height: 4 },
    ...[[2, 2], [16, 2], [2, 16], [16, 16]].map(([col, row]) => ({
      col: col + Math.floor(random() * 2), row: row + Math.floor(random() * 2),
      width: 4, height: 4,
    })),
  ];
  return {
    ...generateMaze(random, { cols: SURVIVAL_COLS, size: SURVIVAL_SIZE, rooms }),
    cols: SURVIVAL_COLS, size: SURVIVAL_SIZE, rooms,
    start: 11 * SURVIVAL_COLS + 11,
  };
}

// Asset Forge .model files reference parts rather than containing mesh data.
export function parseMonsterBlaster(text) {
  const colors = new Map([...text.matchAll(/name:([^;]+);color:RGBA\(([^)]+)\)/g)]
    .map(([, name, rgba]) => [name, rgba.split(",").slice(0, 3).map(Number)]));
  const pieces = text.split("\n").filter(line =>
    line.includes("collection:") && !line.includes("hidden:True")).map(line => {
    const field = name => line.match(new RegExp(`${name}:([^;]+)`))?.[1];
    const vector = name => field(name)?.replace(/[()]/g, "").split(",").map(Number);
    const position = vector("position"), rotation = vector("rotation"), scale = vector("scale");
    const type = field("type"), color = colors.get(field("materials")?.split("+")[0]);
    if (!type || !color || !position || !rotation || !scale ||
      [position, rotation, scale].some(values =>
        values.length !== 3 || values.some(value => !Number.isFinite(value)))) {
      throw new Error("Invalid Monster Blaster part.");
    }
    return { type, position, rotation, scale, color };
  });
  if (!pieces.length) throw new Error("Monster Blaster has no visible parts.");
  return pieces;
}

export function monsterBlasterGeometryKind(type) {
  if (type.startsWith("blaster_")) return "barrel";
  if (type.includes("spike")) return "spike";
  if (type === "leg") return "leg";
  if (type === "body_point_ring") return "ring";
  if (type.startsWith("leg_base_large")) return "body";
  if (type.startsWith("leg_base") || type === "body_half_long") return "block";
  return "block";
}

function distance(a, b) { return Math.hypot(a.x - b.x, a.z - b.z); }

function segmentHit(from, to, target, radius) {
  const dx = to.x - from.x, dz = to.z - from.z;
  const x = from.x - target.x, z = from.z - target.z;
  const c = x * x + z * z - radius * radius;
  if (c <= 0) return 0;
  const a = dx * dx + dz * dz, b = 2 * (x * dx + z * dz);
  const discriminant = b * b - 4 * a * c;
  if (a < 1e-12 || discriminant < 0) return Infinity;
  const t = (-b - Math.sqrt(discriminant)) / (2 * a);
  return t >= 0 && t <= 1 ? t : Infinity;
}

function inFlame(map, item, actor, radius) {
  const dx = actor.x - item.x, dz = actor.z - item.z;
  const along = dx * Math.sin(item.yaw) + dz * Math.cos(item.yaw);
  const across = Math.abs(dx * Math.cos(item.yaw) - dz * Math.sin(item.yaw));
  return along >= 0 && distance(item, actor) <= FLAME_RANGE + radius &&
    across <= 0.25 + along * Math.tan(FLAME_HALF_ANGLE) + radius &&
    mazeClearFraction(map.walls, item, actor) === 1;
}

function stopAtActors(map, from, to, actors, radius) {
  let fraction = 1;
  for (const actor of actors) {
    if (mazeClearFraction(map.walls, from, actor) < 1) continue;
    const dx = to.x - from.x, dz = to.z - from.z;
    if (distance(from, actor) <= radius + 1e-8 &&
      (from.x - actor.x) * dx + (from.z - actor.z) * dz >= 0) continue;
    fraction = Math.min(fraction, segmentHit(from, to, actor, radius));
  }
  to.x = from.x + (to.x - from.x) * fraction;
  to.z = from.z + (to.z - from.z) * fraction;
}

export function createSurvivalRound(random = Math.random) {
  let previousKeys = new WeakMap(), navigation = new WeakMap(), trapDecisions = new WeakMap();
  let nextProjectile = 0;

  function reset(state, racers) {
    previousKeys = new WeakMap();
    navigation = new WeakMap();
    trapDecisions = new WeakMap();
    nextProjectile = 0;
    state.survivalMap = generateSurvivalMap(random);
    state.survivalProjectiles = [];
    state.survivalTime = 0;
    racers.forEach((racer, index) => {
      const angle = index / racers.length * Math.PI * 2;
      const radius = racers.length > 4 ? 2 : 1;
      Object.assign(racer, {
        x: Math.sin(angle) * radius, z: Math.cos(angle) * radius, yaw: angle,
        lives: 3, eliminated: false, invulnerable: 0, carryingDefenseId: null,
        survivalNotice: "", walk: 0, spinTimer: 0, diveTimer: 0,
        controls: { forward: 0, turn: 0 },
      });
    });
    const cells = Array.from({ length: SURVIVAL_COLS ** 2 }, (_, cell) => cell);
    for (let i = cells.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [cells[i], cells[j]] = [cells[j], cells[i]];
    }
    state.defenses = cells.slice(0, 8).map((cell, id) => ({
      id, type: id % 2 ? "trap" : "flame", ...mazePosition(cell, state.survivalMap),
      yaw: Math.floor(random() * 4) * Math.PI / 2, carrierId: null, fireTimer: 0, firing: false,
    }));
    // Both kinds of defense are available beside the central starting area.
    state.defenses[0].x = -3.5; state.defenses[0].z = 0;
    state.defenses[1].x = 3.5; state.defenses[1].z = 0;
    const spawns = cells.filter(cell =>
      distance(mazePosition(cell, state.survivalMap), { x: 0, z: 0 }) > 12);
    state.survivalMonsters = Array.from({ length: 9 }, (_, id) => ({
      id, type: id < 6 ? "monster" : id < 8 ? "runna" : "blaster",
      ...mazePosition(spawns[id], state.survivalMap), yaw: 0, walk: 0,
      respawnIn: 0, shotCooldown: SHOT_INTERVAL,
    }));
  }

  function actions(state, racer, keys, active = true) {
    const pressed = keys.e === true, previous = previousKeys.get(racer) ?? false;
    previousKeys.set(racer, pressed);
    if (!active || racer.eliminated || !pressed || previous) return;
    const map = state.survivalMap;
    if (racer.carryingDefenseId !== null) {
      const item = state.defenses.find(item => item.id === racer.carryingDefenseId);
      const drop = {
        x: racer.x + Math.sin(racer.yaw) * 1.1,
        z: racer.z + Math.cos(racer.yaw) * 1.1,
      };
      if (mazeClearFraction(map.walls, racer, drop, 0.45) < 1) {
        racer.survivalNotice = "Not enough room to place it; turn toward open floor.";
        return;
      }
      Object.assign(item, drop, { yaw: racer.yaw, carrierId: null });
      racer.carryingDefenseId = null;
      racer.survivalNotice = "";
      return;
    }
    const item = state.defenses.filter(item => item.carrierId === null &&
      distance(item, racer) <= PICKUP_RANGE &&
      mazeClearFraction(map.walls, racer, item) === 1)
      .sort((a, b) => distance(a, racer) - distance(b, racer))[0];
    if (item) {
      item.carrierId = racer.id;
      item.firing = false;
      item.fireTimer = 0;
      racer.carryingDefenseId = item.id;
      racer.survivalNotice = "";
    }
  }

  function destination(map, actor, target, dt) {
    if (mazeClearFraction(map.walls, actor, target, MONSTER_RADIUS) === 1) {
      navigation.delete(actor);
      return target;
    }
    let memory = navigation.get(actor);
    const end = mazeCellAt(target, map);
    if (!memory || !memory.path.length || (memory.end !== end && memory.timer <= 0)) {
      memory = {
        end, timer: 0.8,
        path: mazePath(map, mazeCellAt(actor, map), end).map(cell => mazePosition(cell, map)),
      };
      navigation.set(actor, memory);
    }
    memory.timer -= dt;
    while (memory.path.length > 1 && distance(actor, memory.path[0]) < 0.08) memory.path.shift();
    return memory.path[0];
  }

  function chooseControls(state, racer, dt) {
    const enemies = state.survivalMonsters.filter(monster => monster.respawnIn === 0)
      .sort((a, b) => distance(a, racer) - distance(b, racer));
    const enemy = enemies[0];
    let target, e = false;
    if (racer.carryingDefenseId === null) {
      target = state.defenses.filter(item => item.carrierId === null)
        .sort((a, b) => distance(a, racer) - distance(b, racer))[0];
      e = Boolean(target && distance(target, racer) <= PICKUP_RANGE &&
        mazeClearFraction(state.survivalMap.walls, racer, target) === 1);
    } else if (enemy) {
      target = enemy;
      e = distance(enemy, racer) < 9;
    }
    target ??= enemy ?? { x: 0, z: 0 };
    const point = destination(state.survivalMap, racer, target, dt);
    const yaw = Math.atan2(point.x - racer.x, point.z - racer.z);
    const error = Math.atan2(Math.sin(yaw - racer.yaw), Math.cos(yaw - racer.yaw));
    const fleeing = enemy && distance(enemy, racer) < 3;
    return {
      w: !e && !fleeing && Math.abs(error) < 0.2,
      s: Boolean(fleeing), a: error > TURN * dt, d: error < -TURN * dt,
      e: e && Math.abs(error) < 0.25 && !previousKeys.get(racer),
    };
  }

  function avoidTraps(state, monster, point) {
    let decisions = trapDecisions.get(monster);
    if (!decisions) { decisions = new Map(); trapDecisions.set(monster, decisions); }
    for (const trap of state.defenses) {
      if (trap.type !== "trap") continue;
      if (trap.carrierId !== null || distance(monster, trap) > 6) { decisions.delete(trap.id); continue; }
      let decision = decisions.get(trap.id);
      if (decision && (decision.x !== trap.x || decision.z !== trap.z)) {
        decisions.delete(trap.id);
        decision = undefined;
      }
      if (!decision && distance(monster, trap) < 4 &&
        Number.isFinite(segmentHit(monster, point, trap, MONSTER_RADIUS + TRAP_RADIUS + 0.1))) {
        decision = { x: trap.x, z: trap.z, path: [] };
        decisions.set(trap.id, decision);
        if (random() >= 0.5) continue;
        const range = distance(monster, point);
        if (range < 1e-8) continue;
        const dx = (point.x - monster.x) / range, dz = (point.z - monster.z) / range;
        const clearance = MONSTER_RADIUS + TRAP_RADIUS + 0.3;
        for (const side of [1, -1]) {
          const path = [-1, 1].map(ahead => ({
            x: trap.x + (dx * ahead - dz * side) * clearance,
            z: trap.z + (dz * ahead + dx * side) * clearance,
          }));
          const route = [monster, ...path, point];
          if (route.slice(1).every((next, index) =>
            mazeClearFraction(state.survivalMap.walls, route[index], next, MONSTER_RADIUS) === 1 &&
            !Number.isFinite(segmentHit(route[index], next, trap, MONSTER_RADIUS + TRAP_RADIUS)))) {
            decision.path = path;
            break;
          }
        }
      }
      if (decision) {
        while (decision.path.length && distance(monster, decision.path[0]) < 0.08) decision.path.shift();
        if (decision.path.length) return decision.path[0];
      }
    }
    return point;
  }

  function damage(state, racer) {
    if (racer.eliminated || racer.invulnerable > 0) return;
    racer.lives--;
    racer.invulnerable = 1.5;
    if (racer.lives > 0) return;
    racer.eliminated = true;
    racer.controls = { forward: 0, turn: 0 };
    if (racer.carryingDefenseId !== null) {
      const item = state.defenses.find(item => item.id === racer.carryingDefenseId);
      Object.assign(item, { x: racer.x, z: racer.z, yaw: racer.yaw, carrierId: null });
      racer.carryingDefenseId = null;
    }
  }

  function step(state, racers, dt, inputs, moveRacer) {
    const map = state.survivalMap, previous = new Map();
    state.survivalTime += dt;
    for (const racer of racers) {
      previous.set(racer, { x: racer.x, z: racer.z });
      racer.invulnerable = Math.max(0, racer.invulnerable - dt);
      const keys = inputs(racer, dt);
      actions(state, racer, keys);
      if (racer.eliminated) continue;
      const forward = Number(Boolean(keys.w)) - Number(Boolean(keys.s));
      const turn = Number(Boolean(keys.a)) - Number(Boolean(keys.d));
      racer.controls = { forward, turn };
      const speed = SPEED * (racer.carryingDefenseId === null ? 1 : CARRY_SPEED_MULTIPLIER);
      moveRacer(racer, dt, forward, turn, speed, map.walls);
      stopAtActors(map, previous.get(racer), racer,
        state.survivalMonsters.filter(monster => monster.respawnIn === 0), R + MONSTER_RADIUS);
      racer.walk = forward ? racer.walk + dt * 11 : 0;
    }
    const alive = racers.filter(racer => !racer.eliminated);
    const monsterPrevious = new Map();
    for (const monster of state.survivalMonsters) {
      if (monster.respawnIn > 0) {
        monster.respawnIn = Math.max(0, monster.respawnIn - dt);
        if (monster.respawnIn === 0) {
          const cells = map.links.map((_, cell) => mazePosition(cell, map))
            .filter(point => alive.every(racer => distance(point, racer) > 10));
          if (!cells.length) { monster.respawnIn = 1; continue; }
          Object.assign(monster, cells[Math.floor(random() * cells.length)], { shotCooldown: SHOT_INTERVAL });
          navigation.delete(monster);
          trapDecisions.delete(monster);
        }
        continue;
      }
      const target = alive.reduce((best, racer) =>
        !best || distance(monster, racer) < distance(monster, best) ? racer : best, null);
      if (!target) continue;
      const before = { x: monster.x, z: monster.z };
      monsterPrevious.set(monster, before);
      const point = avoidTraps(state, monster, destination(map, monster, target, dt));
      const range = distance(point, monster);
      if (range > 1e-8) {
        monster.yaw = Math.atan2(point.x - monster.x, point.z - monster.z);
        const travel = Math.min(range, MONSTER_SPEEDS[monster.type] * dt);
        const next = {
          x: monster.x + Math.sin(monster.yaw) * travel,
          z: monster.z + Math.cos(monster.yaw) * travel,
        };
        const fraction = mazeClearFraction(map.walls, monster, next, MONSTER_RADIUS);
        monster.x += (next.x - monster.x) * fraction;
        monster.z += (next.z - monster.z) * fraction;
        stopAtActors(map, before, monster, alive, R + MONSTER_RADIUS);
        monster.walk += travel * 3;
      }
    }
    for (const item of state.defenses) {
      item.fireTimer = Math.max(0, (item.fireTimer ?? 0) - dt);
      if (item.carrierId !== null) item.fireTimer = 0;
      else if (item.type === "flame" && state.survivalMonsters.some(monster =>
        monster.respawnIn === 0 && inFlame(map, item, monster, MONSTER_RADIUS))) item.fireTimer = 0.3;
      item.firing = item.type === "flame" && item.fireTimer > 0;
    }
    for (const monster of state.survivalMonsters) {
      const before = monsterPrevious.get(monster);
      if (!before) continue;
      const killed = state.defenses.some(item => {
        if (item.carrierId !== null) return false;
        if (item.type === "trap") {
          const t = segmentHit(before, monster, item, MONSTER_RADIUS + TRAP_RADIUS);
          if (!Number.isFinite(t)) return false;
          const hit = { x: before.x + (monster.x - before.x) * t,
            z: before.z + (monster.z - before.z) * t };
          return mazeClearFraction(map.walls, item, hit) === 1;
        }
        return item.firing && inFlame(map, item, monster, MONSTER_RADIUS);
      });
      if (killed) { monster.respawnIn = 6; continue; }
      for (const racer of alive) {
        const from = { x: before.x - previous.get(racer).x, z: before.z - previous.get(racer).z };
        const to = { x: monster.x - racer.x, z: monster.z - racer.z };
        if ((distance(monster, racer) <= R + MONSTER_RADIUS + 1e-8 ||
          segmentHit(from, to, { x: 0, z: 0 }, R + MONSTER_RADIUS) <= 1) &&
          mazeClearFraction(map.walls, monster, racer) === 1) damage(state, racer);
      }
      const target = alive.filter(racer => !racer.eliminated).reduce((best, racer) =>
        !best || distance(monster, racer) < distance(monster, best) ? racer : best, null);
      monster.shotCooldown = Math.max(0, monster.shotCooldown - dt);
      if (target && monster.type === "blaster" && monster.shotCooldown < 1e-8 &&
        !target.eliminated && distance(monster, target) < 18 &&
        mazeClearFraction(map.walls, monster, target) === 1) {
        const yaw = Math.atan2(target.x - monster.x, target.z - monster.z);
        monster.yaw = yaw;
        state.survivalProjectiles.push({
          id: nextProjectile++, x: monster.x, z: monster.z,
          vx: Math.sin(yaw) * PROJECTILE_SPEED, vz: Math.cos(yaw) * PROJECTILE_SPEED, ttl: 4,
        });
        monster.shotCooldown = SHOT_INTERVAL;
      }
    }
    for (const racer of alive) {
      for (const item of state.defenses) {
        if (item.carrierId !== null) continue;
        if (item.type === "flame") {
          if (item.firing && inFlame(map, item, racer, R)) damage(state, racer);
        } else {
          const from = previous.get(racer);
          const t = segmentHit(from, racer, item, R + TRAP_RADIUS);
          if (!Number.isFinite(t)) continue;
          const hit = { x: from.x + (racer.x - from.x) * t, z: from.z + (racer.z - from.z) * t };
          if (mazeClearFraction(map.walls, item, hit) === 1) damage(state, racer);
        }
      }
    }
    state.survivalProjectiles = state.survivalProjectiles.filter(projectile => {
      const next = { x: projectile.x + projectile.vx * dt, z: projectile.z + projectile.vz * dt };
      const wall = mazeClearFraction(map.walls, projectile, next, 0.12);
      let victim = null, first = Infinity;
      for (const racer of alive) {
        if (racer.eliminated) continue;
        const from = { x: projectile.x - previous.get(racer).x, z: projectile.z - previous.get(racer).z };
        const to = { x: next.x - racer.x, z: next.z - racer.z };
        const hit = segmentHit(from, to, { x: 0, z: 0 }, R + 0.12);
        if (hit < first && hit < wall) { first = hit; victim = racer; }
      }
      if (victim) { damage(state, victim); return false; }
      Object.assign(projectile, next, { ttl: projectile.ttl - dt });
      return wall === 1 && projectile.ttl > 0;
    });
  }

  function advance(state, racers, dt, inputs, moveRacer) {
    for (let remaining = dt; remaining > 1e-8;) {
      const slice = Math.min(remaining, 0.025);
      step(state, racers, slice, inputs, moveRacer);
      remaining -= slice;
      const survivors = racers.filter(racer => !racer.eliminated);
      if (survivors.length <= 1) return survivors;
    }
    return null;
  }

  return { reset, actions, chooseControls, advance };
}
