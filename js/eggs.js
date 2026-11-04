import { TURN } from "./track.js";

export const EGG_MAP_SCALE = 3;
export const EGG_DURATION = 30;
export const EGG_COUNT = 24;
export const EGG_PICKUP_RADIUS = 2.2;
export const EGG_PIT_HALF_SIZE = 3;
export const EGG_LIMIT = 21.5;
export const EGG_PITS = [
  [-6.45, -6.35], [-0.05, -6.35], [6.55, -6.35], [6.55, 0],
  [6.55, 6.35], [-0.05, 6.35], [-6.45, 6.35], [-6.45, 0],
].map(([x, z], id) => ({ id, x: x * EGG_MAP_SCALE, z: z * EGG_MAP_SCALE }));
export const eggWalls = [
  { minX: -25, maxX: -EGG_LIMIT, minZ: -25, maxZ: 25 },
  { minX: EGG_LIMIT, maxX: 25, minZ: -25, maxZ: 25 },
  { minX: -25, maxX: 25, minZ: -25, maxZ: -EGG_LIMIT },
  { minX: -25, maxX: 25, minZ: EGG_LIMIT, maxZ: 25 },
];

export function assignEggPits(count) {
  if (!Number.isInteger(count) || count < 2 || count > 8) {
    throw new Error("Egg rounds require 2-8 players");
  }
  let best = [], bestDistances = [];
  function choose(start, selected) {
    if (selected.length === count) {
      const distances = selected.flatMap((pit, index) => selected.slice(index + 1)
        .map(other => Math.hypot(pit.x - other.x, pit.z - other.z))).sort((a, b) => a - b);
      const firstDifference = distances.findIndex((value, index) =>
        Math.abs(value - (bestDistances[index] ?? -1)) > 1e-8);
      if (!best.length || (firstDifference >= 0 &&
        distances[firstDifference] > bestDistances[firstDifference])) {
        best = [...selected];
        bestDistances = distances;
      }
      return;
    }
    for (let index = start; index <= EGG_PITS.length - (count - selected.length); index++) {
      choose(index + 1, [...selected, EGG_PITS[index]]);
    }
  }
  choose(0, []);
  return best;
}

export function eggInPit(egg, pit) {
  return egg.carrierId === null &&
    Math.abs(egg.x - pit.x) <= EGG_PIT_HALF_SIZE &&
    Math.abs(egg.z - pit.z) <= EGG_PIT_HALF_SIZE;
}

export function createEggRound() {
  function reset(state, racers) {
    state.eggTimeLeft = EGG_DURATION;
    state.eggPits = assignEggPits(racers.length).map((pit, index) => ({
      ...pit, playerId: racers[index].id, number: index + 1,
    }));
    state.eggs = Array.from({ length: EGG_COUNT }, (_, id) => ({
      id, x: (id % 6 - 2.5) * 0.8, z: (Math.floor(id / 6) - 1.5) * 0.8,
      carrierId: null,
    }));
    racers.forEach((racer, index) => {
      const pit = state.eggPits[index];
      Object.assign(racer, {
        x: pit.x, z: pit.z, yaw: Math.atan2(-pit.x, -pit.z),
        carryingEggId: null, eggScore: 0,
      });
    });
  }

  function interact(state, racer) {
    if (state.eggTimeLeft <= 0) return;
    if (racer.carryingEggId !== null) {
      const egg = state.eggs.find(egg => egg.id === racer.carryingEggId);
      egg.carrierId = null;
      egg.x = racer.x;
      egg.z = racer.z;
      racer.carryingEggId = null;
      return;
    }
    const egg = state.eggs.filter(egg => egg.carrierId === null)
      .map(egg => ({ egg, distance: Math.hypot(egg.x - racer.x, egg.z - racer.z) }))
      .filter(({ distance }) => distance <= EGG_PICKUP_RADIUS)
      .sort((a, b) => a.distance - b.distance || a.egg.id - b.egg.id)[0]?.egg;
    if (egg) {
      egg.carrierId = racer.id;
      racer.carryingEggId = egg.id;
    }
  }

  function update(state, racers, elapsed) {
    for (const egg of state.eggs) {
      if (egg.carrierId === null) continue;
      const carrier = racers.find(racer => racer.id === egg.carrierId);
      egg.x = carrier.x;
      egg.z = carrier.z;
    }
    for (const racer of racers) {
      const pit = state.eggPits.find(pit => pit.playerId === racer.id);
      racer.eggScore = state.eggs.filter(egg => eggInPit(egg, pit)).length;
    }
    state.eggTimeLeft = Math.max(0, state.eggTimeLeft - elapsed);
    if (state.eggTimeLeft > 1e-8) return null;
    state.eggTimeLeft = 0;
    const high = Math.max(...racers.map(racer => racer.eggScore));
    return racers.filter(racer => racer.eggScore === high);
  }

  function chooseControls(state, racer) {
    const pit = state.eggPits.find(pit => pit.playerId === racer.id);
    const carrying = racer.carryingEggId !== null;
    const target = carrying ? pit : state.eggs
      .filter(egg => egg.carrierId === null && !eggInPit(egg, pit))
      .sort((a, b) => Math.hypot(a.x - racer.x, a.z - racer.z) -
        Math.hypot(b.x - racer.x, b.z - racer.z))[0];
    if (!target) {
      racer.controls = { forward: 0, turn: 0 };
      return;
    }
    const distance = Math.hypot(target.x - racer.x, target.z - racer.z);
    if (distance < (carrying ? 0.9 : EGG_PICKUP_RADIUS * 0.85)) {
      interact(state, racer);
      racer.controls = { forward: 0, turn: 0 };
      return;
    }
    const yaw = Math.atan2(target.x - racer.x, target.z - racer.z);
    const error = Math.atan2(Math.sin(yaw - racer.yaw), Math.cos(yaw - racer.yaw));
    racer.controls = {
      forward: Math.abs(error) < 0.8 ? 1 : 0,
      turn: Math.abs(error) > TURN * 0.025 ? Math.sign(error) : 0,
    };
  }

  return { reset, interact, update, chooseControls };
}
