import { ARENA } from "./pillows.js";
import { R, TURN } from "./track.js";

export const BATTLE_ARENA = Object.fromEntries(
  Object.entries(ARENA).map(([key, value]) => [key, value * 2])
);
export const BATTLE_HP = 3;
export const BATTLE_PICKUP_RADIUS = 2.2;
export const JUMP_SPEED = 8;
export const JUMP_GRAVITY = 20;
export const THROW_SPEED = 24;
const { minX, maxX, minZ, maxZ } = BATTLE_ARENA;
export const battleWalls = [
  { minX: minX - 1, maxX: minX, minZ: minZ - 1, maxZ: maxZ + 1 },
  { minX: maxX, maxX: maxX + 1, minZ: minZ - 1, maxZ: maxZ + 1 },
  { minX: minX - 1, maxX: maxX + 1, minZ: minZ - 1, maxZ: minZ },
  { minX: minX - 1, maxX: maxX + 1, minZ: maxZ, maxZ: maxZ + 1 },
];

function hitTime(egg, racer, previous, dt) {
  const x = egg.x - previous.x, z = egg.z - previous.z;
  const dx = egg.vx * dt - (racer.x - previous.x);
  const dz = egg.vz * dt - (racer.z - previous.z);
  const radius = R + 0.25;
  const a = dx * dx + dz * dz;
  const b = 2 * (x * dx + z * dz);
  const c = x * x + z * z - radius * radius;
  let enter = 0, exit = 1;
  if (a === 0) {
    if (c > 0) return Infinity;
  } else {
    const discriminant = b * b - 4 * a * c;
    if (discriminant < 0) return Infinity;
    const root = Math.sqrt(discriminant);
    enter = Math.max(enter, (-b - root) / (2 * a));
    exit = Math.min(exit, (-b + root) / (2 * a));
  }
  const y = egg.y - previous.jumpHeight;
  const dy = (egg.vy * dt - 2 * dt * dt) -
    (racer.jumpHeight - previous.jumpHeight);
  if (dy === 0) {
    if (y < -0.25 || y > 1.85) return Infinity;
  } else {
    const times = [(-0.25 - y) / dy, (1.85 - y) / dy].sort((a, b) => a - b);
    enter = Math.max(enter, times[0]);
    exit = Math.min(exit, times[1]);
  }
  return enter <= exit ? enter : Infinity;
}

export function createEggBattleRound() {
  function reset(state, racers) {
    state.battleEggs = Array.from({ length: 25 }, (_, id) => {
      const x = (id % 5 - 2) * 6, z = (Math.floor(id / 5) - 2) * 6;
      return { id, x, z, y: 0.05, homeX: x, homeZ: z,
        carrierId: null, ownerId: null, flying: false, respawn: 0 };
    });
    racers.forEach((racer, index) => {
      const angle = index / racers.length * Math.PI * 2;
      Object.assign(racer, {
        x: Math.sin(angle) * 12, z: Math.cos(angle) * 12, yaw: angle + Math.PI,
        lives: BATTLE_HP, eliminated: false, carryingEggId: null,
        jumpHeight: 0, jumpVelocity: 0, throwCooldown: 0,
        controls: { forward: 0, turn: 0 },
      });
    });
  }

  function pickup(state, racer) {
    if (racer.eliminated || racer.carryingEggId !== null) return;
    const egg = state.battleEggs.filter(egg => egg.carrierId === null &&
      !egg.flying && egg.respawn === 0 &&
      Math.hypot(egg.x - racer.x, egg.z - racer.z) <= BATTLE_PICKUP_RADIUS)
      .sort((a, b) => Math.hypot(a.x - racer.x, a.z - racer.z) -
        Math.hypot(b.x - racer.x, b.z - racer.z))[0];
    if (!egg) return;
    egg.carrierId = racer.id;
    racer.carryingEggId = egg.id;
  }

  function space(state, racer) {
    if (racer.eliminated) return;
    if (racer.carryingEggId === null) {
      if (racer.jumpHeight === 0) racer.jumpVelocity = JUMP_SPEED;
      return;
    }
    if (racer.throwCooldown > 0) return;
    const egg = state.battleEggs.find(egg => egg.id === racer.carryingEggId);
    Object.assign(egg, {
      x: racer.x, z: racer.z, y: racer.jumpHeight + 1.1,
      vx: Math.sin(racer.yaw) * THROW_SPEED, vz: Math.cos(racer.yaw) * THROW_SPEED,
      vy: 2, carrierId: null, ownerId: racer.id, flying: true,
    });
    racer.carryingEggId = null;
    racer.throwCooldown = 0.8;
  }

  function actions(state, racer, dt, keys, previousKeys, active) {
    if (active && !racer.eliminated) {
      if (keys.e && !previousKeys.e) pickup(state, racer);
      if (keys[" "] && !previousKeys.space) space(state, racer);
      racer.throwCooldown = Math.max(0, racer.throwCooldown - dt);
      racer.jumpHeight = Math.max(0, racer.jumpHeight +
        racer.jumpVelocity * dt - JUMP_GRAVITY * dt * dt / 2);
      racer.jumpVelocity = racer.jumpHeight > 0 ?
        racer.jumpVelocity - JUMP_GRAVITY * dt : 0;
    }
    previousKeys.e = keys.e === true;
    previousKeys.space = keys[" "] === true;
  }

  function update(state, racers, dt, previous) {
    for (const egg of state.battleEggs) {
      if (egg.carrierId !== null) {
        const carrier = racers.find(racer => racer.id === egg.carrierId);
        egg.x = carrier.x;
        egg.z = carrier.z;
        egg.y = carrier.jumpHeight + 2;
        if (carrier.eliminated) {
          carrier.carryingEggId = null;
          egg.carrierId = null;
          egg.y = 0.05;
        }
      } else if (egg.respawn > 0) {
        egg.respawn = Math.max(0, egg.respawn - dt);
        if (egg.respawn === 0) {
          Object.assign(egg, { x: egg.homeX, z: egg.homeZ, y: 0.05, ownerId: null });
        }
      } else if (egg.flying) {
        const hits = racers.map((racer, index) => ({
          racer, time: racer.eliminated || racer.id === egg.ownerId ? Infinity :
            hitTime(egg, racer, previous[index], dt),
        })).sort((a, b) => a.time - b.time);
        if (Number.isFinite(hits[0].time)) {
          const target = hits[0].racer;
          target.lives = Math.max(0, target.lives - 1);
          target.eliminated = target.lives === 0;
          egg.flying = false;
          egg.respawn = 2;
        } else {
          egg.x += egg.vx * dt;
          egg.z += egg.vz * dt;
          egg.y += egg.vy * dt - 2 * dt * dt;
          egg.vy -= 4 * dt;
          if (egg.y <= 0.05 || egg.x <= minX + 0.5 || egg.x >= maxX - 0.5 ||
            egg.z <= minZ + 0.5 || egg.z >= maxZ - 0.5) {
            egg.flying = false;
            egg.respawn = 2;
          }
        }
      }
    }
    // Drop any egg held by a chicken eliminated later in the projectile loop.
    for (const racer of racers) {
      if (!racer.eliminated || racer.carryingEggId === null) continue;
      const egg = state.battleEggs.find(egg => egg.id === racer.carryingEggId);
      Object.assign(egg, { carrierId: null, x: racer.x, z: racer.z, y: 0.05 });
      racer.carryingEggId = null;
    }
    const survivors = racers.filter(racer => !racer.eliminated);
    return survivors.length <= 1 ? survivors : null;
  }

  function chooseControls(state, racer, racers) {
    const carrying = racer.carryingEggId !== null;
    const targets = carrying ? racers.filter(other => other !== racer && !other.eliminated) :
      state.battleEggs.filter(egg => !egg.flying && egg.respawn === 0 && egg.carrierId === null);
    const target = targets.sort((a, b) => Math.hypot(a.x - racer.x, a.z - racer.z) -
      Math.hypot(b.x - racer.x, b.z - racer.z))[0];
    if (!target || racer.eliminated) {
      racer.controls = { forward: 0, turn: 0 };
      return;
    }
    const distance = Math.hypot(target.x - racer.x, target.z - racer.z);
    const yaw = Math.atan2(target.x - racer.x, target.z - racer.z);
    const error = Math.atan2(Math.sin(yaw - racer.yaw), Math.cos(yaw - racer.yaw));
    racer.controls = {
      forward: Math.abs(error) < 0.8 && distance > (carrying ? 10 : 1.5) ? 1 : 0,
      turn: Math.abs(error) > TURN * 0.02 ? Math.sign(error) : 0,
    };
    if (!carrying && distance <= BATTLE_PICKUP_RADIUS) pickup(state, racer);
    else if (carrying && distance < 16 && Math.abs(error) < 0.08) space(state, racer);
  }

  return { reset, pickup, space, actions, update, chooseControls };
}
