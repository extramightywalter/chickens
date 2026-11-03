import { R, TURN } from "./track.js";

export const MINIGAMES = ["track", "pillows", "doors"];
export const ARENA = { minX: -9, maxX: 9, minZ: -9, maxZ: 9 };
export const PILLOW_RADIUS = 0.6;
export const PILLOW_LIVES = 3;
export const CANNON_MUZZLE = 1.65;
export const CANNONS = [
  { x: -12, z: 0 }, { x: 12, z: 0 },
  { x: 0, z: -12 }, { x: 0, z: 12 },
];
export const arenaWalls = [
  { minX: -10, maxX: -9, minZ: -10, maxZ: 10 },
  { minX: 9, maxX: 10, minZ: -10, maxZ: 10 },
  { minX: -10, maxX: 10, minZ: -10, maxZ: -9 },
  { minX: -10, maxX: 10, minZ: 9, maxZ: 10 },
];

function hitTime(pillow, racer, previous, dt) {
  const x = pillow.x - previous.x, z = pillow.z - previous.z;
  const dx = pillow.vx * dt - (racer.x - previous.x);
  const dz = pillow.vz * dt - (racer.z - previous.z);
  const c = x * x + z * z - (R + PILLOW_RADIUS) ** 2;
  if (c <= 0) return 0;
  const a = dx * dx + dz * dz;
  if (a === 0) return Infinity;
  const b = 2 * (x * dx + z * dz);
  const discriminant = b * b - 4 * a * c;
  if (discriminant < 0) return Infinity;
  const t = (-b - Math.sqrt(discriminant)) / (2 * a);
  return t >= 0 && t <= 1 ? t : Infinity;
}

export function createPillowRound(random) {
  let spawnIn, nextId, tiresAt, reaction, destination;

  function reset(state, rival) {
    state.pillows = [];
    state.survivalTime = 0;
    state.lives = PILLOW_LIVES;
    state.cannonYaws = CANNONS.map(({ x, z }) => Math.atan2(-x, -z));
    Object.assign(rival, {
      x: 3, z: 0, yaw: Math.PI, lives: PILLOW_LIVES,
      controls: { forward: 0, turn: 0 },
    });
    spawnIn = 0.8;
    nextId = 0;
    tiresAt = 22 + random() * 6;
    reaction = 0;
    destination = { x: 3, z: -5 };
  }

  function chooseControls(state, rival, dt) {
    if (dt === 0) return;
    reaction -= dt;
    if (reaction > 0) return;
    reaction = 0.16 + random() * 0.12;
    rival.intent = state.survivalTime >= tiresAt ? "tired" : "dodge";
    if (rival.intent === "tired") {
      rival.controls = { forward: 0, turn: 0 };
      return;
    }

    let threat;
    let soonest = Infinity;
    for (const pillow of state.pillows) {
      const dx = rival.x - pillow.x, dz = rival.z - pillow.z;
      const t = (dx * pillow.vx + dz * pillow.vz) / (pillow.vx ** 2 + pillow.vz ** 2);
      const miss = Math.hypot(dx - pillow.vx * t, dz - pillow.vz * t);
      if (t > 0 && t < 1.4 && miss < R + PILLOW_RADIUS + 1 && t < soonest) {
        threat = pillow;
        soonest = t;
      }
    }
    if (threat) {
      const speed = Math.hypot(threat.vx, threat.vz);
      const choices = [-1, 1].map(side => ({
        x: Math.max(-6, Math.min(6, rival.x + side * threat.vz / speed * 4)),
        z: Math.max(-6, Math.min(6, rival.z - side * threat.vx / speed * 4)),
      }));
      destination = choices.sort((a, b) =>
        Math.hypot(b.x - rival.x, b.z - rival.z) - Math.hypot(a.x - rival.x, a.z - rival.z)
      )[0];
    } else if (Math.hypot(destination.x - rival.x, destination.z - rival.z) < 2) {
      destination = { x: (random() - 0.5) * 12, z: (random() - 0.5) * 12 };
    }
    const yaw = Math.atan2(destination.x - rival.x, destination.z - rival.z);
    const error = Math.atan2(Math.sin(yaw - rival.yaw), Math.cos(yaw - rival.yaw));
    rival.controls.turn = Math.abs(error) > TURN * 0.05 ? Math.sign(error) : 0;
    rival.controls.forward = Math.abs(error) < 1 ? 1 : 0;
  }

  function update(state, rival, dt, previousPlayer, previousRival) {
    if (dt === 0) return;
    state.survivalTime += dt;
    const hits = [];
    for (const pillow of state.pillows) {
      const playerHit = hitTime(pillow, state, previousPlayer, dt);
      const rivalHit = hitTime(pillow, rival, previousRival, dt);
      const time = Math.min(playerHit, rivalHit);
      if (Number.isFinite(time)) {
        hits.push({ pillow, time, player: playerHit === time, rival: rivalHit === time });
      }
      pillow.x += pillow.vx * dt;
      pillow.z += pillow.vz * dt;
    }
    hits.sort((a, b) => a.time - b.time);
    const consumed = new Set();
    for (let i = 0; i < hits.length;) {
      const time = hits[i].time;
      do {
        const hit = hits[i++];
        consumed.add(hit.pillow);
        if (hit.player) state.lives = Math.max(0, state.lives - 1);
        if (hit.rival) rival.lives = Math.max(0, rival.lives - 1);
      } while (i < hits.length && hits[i].time === time);
      if (state.lives === 0 || rival.lives === 0) {
        state.scene = "finished";
        state.playerWon = state.lives === rival.lives ? null : rival.lives === 0;
        state.hit = state.lives === rival.lives ? "both" : state.lives === 0 ? "player" : "rival";
        break;
      }
    }
    state.pillows = state.pillows.filter(pillow =>
      !consumed.has(pillow) && Math.abs(pillow.x) < 16 && Math.abs(pillow.z) < 16
    );
    if (state.scene === "finished") return;
    spawnIn -= dt;
    if (spawnIn > 0) return;
    spawnIn += Math.max(0.35, 1 - state.survivalTime * 0.02);
    const target = nextId % 2 === 0 ? state : rival;
    const cannonIndex = Math.floor(random() * CANNONS.length);
    const cannon = CANNONS[cannonIndex];
    const distance = Math.hypot(target.x - cannon.x, target.z - cannon.z);
    const dx = (target.x - cannon.x) / distance;
    const dz = (target.z - cannon.z) / distance;
    state.cannonYaws[cannonIndex] = Math.atan2(dx, dz);
    const speed = 8 + Math.min(state.survivalTime * 0.18, 5);
    state.pillows.push({
      id: nextId++, x: cannon.x + dx * CANNON_MUZZLE, z: cannon.z + dz * CANNON_MUZZLE,
      vx: dx * speed, vz: dz * speed,
    });
  }

  return { reset, chooseControls, update };
}
