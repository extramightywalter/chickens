import { R, SPEED, TURN } from "./track.js";

// Units of double-doors.glb scaled so each arch is two chickens wide.
export const DOOR_MODEL_SCALE = 2.8;
export const DOOR_COUNT = 4;
export const DOOR_SPACING = 22;
export const FINISH_Z = DOOR_SPACING * (DOOR_COUNT + 1);
export const DOOR_HALF_WIDTH = 0.5 * DOOR_MODEL_SCALE;
export const DOOR_XS = [-0.665 * DOOR_MODEL_SCALE, 0.665 * DOOR_MODEL_SCALE];
export const GATE_HALF_DEPTH = 0.52 * DOOR_MODEL_SCALE;
// The closed leaf sits just inside the gate's front face.
export const DOOR_LEAF_OFFSET = -0.39 * DOOR_MODEL_SCALE;
export const PATH_HALF_WIDTH = 1.515 * DOOR_MODEL_SCALE;
export const PATH_START_Z = -24;
export const PATH_END_Z = FINISH_Z + 8;
export const DOORS_START = { player: { x: -1.6, z: 0 }, rival: { x: 1.6, z: 0 } };
export const MONSTER_SPEED = SPEED * 0.85;
export const MONSTER_RADIUS = 1.1;
export const MONSTER_START_Z = -12;
const OPEN_DISTANCE = 4.5;
const OPEN_RATE = 3;

const WALL = 1;
export const pathWalls = [
  { minX: -PATH_HALF_WIDTH - WALL, maxX: -PATH_HALF_WIDTH, minZ: PATH_START_Z, maxZ: PATH_END_Z },
  { minX: PATH_HALF_WIDTH, maxX: PATH_HALF_WIDTH + WALL, minZ: PATH_START_Z, maxZ: PATH_END_Z },
  { minX: -PATH_HALF_WIDTH - WALL, maxX: PATH_HALF_WIDTH + WALL, minZ: PATH_START_Z - WALL, maxZ: PATH_START_Z },
  { minX: -PATH_HALF_WIDTH - WALL, maxX: PATH_HALF_WIDTH + WALL, minZ: PATH_END_Z, maxZ: PATH_END_Z + WALL },
];
export const gateZs = Array.from({ length: DOOR_COUNT }, (_, i) => DOOR_SPACING * (i + 1));
export const gateWalls = gateZs.flatMap(z => {
  const minZ = z - GATE_HALF_DEPTH, maxZ = z + GATE_HALF_DEPTH;
  return [
    { minX: -PATH_HALF_WIDTH, maxX: DOOR_XS[0] - DOOR_HALF_WIDTH, minZ, maxZ },
    { minX: DOOR_XS[0] + DOOR_HALF_WIDTH, maxX: DOOR_XS[1] - DOOR_HALF_WIDTH, minZ, maxZ },
    { minX: DOOR_XS[1] + DOOR_HALF_WIDTH, maxX: PATH_HALF_WIDTH, minZ, maxZ },
  ];
});

export function doorLeafWall(gate, side) {
  const x = DOOR_XS[side], z = gate.z + DOOR_LEAF_OFFSET;
  return { minX: x - DOOR_HALF_WIDTH, maxX: x + DOOR_HALF_WIDTH, minZ: z - 0.1, maxZ: z + 0.1 };
}

// Doors locked to one racer stay solid for them no matter how far they are open.
export function lockedWalls(doors, owner) {
  return doors.map(gate => doorLeafWall(gate, owner === "player" ? 1 - gate.playerSide : gate.playerSide));
}

export function createDoorRound(random) {
  let reaction, guesses;

  function reset(state, rival) {
    state.doors = gateZs.map(z => ({
      z, playerSide: random() < 0.5 ? 0 : 1, open: [0, 0], rattle: [0, 0],
    }));
    state.monster = { x: 0, z: MONSTER_START_Z, yaw: 0, walk: 0 };
    state.caught = null;
    state.finishZ = FINISH_Z;
    Object.assign(rival, {
      x: DOORS_START.rival.x, z: DOORS_START.rival.z, yaw: 0,
      controls: { forward: 0, turn: 0 }, intent: "guess",
    });
    reaction = 0;
    guesses = state.doors.map(() => (random() < 0.5 ? 0 : 1));
  }

  function rivalSide(gate) {
    return 1 - gate.playerSide;
  }

  function chooseControls(state, rival, dt) {
    if (dt === 0) return;
    reaction -= dt;
    if (reaction > 0) return;
    reaction = 0.12 + random() * 0.1;
    const index = state.doors.findIndex(gate => rival.z < gate.z + GATE_HALF_DEPTH + R);
    let aimX = rival.x, aimZ = FINISH_Z + 6;
    rival.intent = "run";
    if (index !== -1) {
      const gate = state.doors[index];
      // Watching the player go through a door reveals the other one.
      if (state.z > gate.z + GATE_HALF_DEPTH) guesses[index] = rivalSide(gate);
      if (guesses[index] !== rivalSide(gate) && touchingLeaf(rival, gate, guesses[index])) {
        guesses[index] = rivalSide(gate);
      }
      const doorX = DOOR_XS[guesses[index]];
      const front = gate.z - GATE_HALF_DEPTH;
      const lined = Math.abs(rival.x - doorX) < DOOR_HALF_WIDTH - R;
      rival.intent = guesses[index] === rivalSide(gate) ? "door" : "guess";
      aimX = doorX;
      if (rival.z < front - 3) aimZ = front - 1;
      else if (!lined && rival.z < front) aimZ = front - 1.4;
      else aimZ = gate.z + GATE_HALF_DEPTH + 3;
      // React faster around the gate so sidesteps don't overshoot the arch.
      if (rival.z > front - 4) reaction = 0.04 + random() * 0.04;
    }
    const yaw = Math.atan2(aimX - rival.x, aimZ - rival.z);
    const error = Math.atan2(Math.sin(yaw - rival.yaw), Math.cos(yaw - rival.yaw));
    rival.controls.turn = Math.abs(error) > TURN * 0.05 ? Math.sign(error) : 0;
    rival.controls.forward = Math.abs(error) < 1 ? 1 : 0;
  }

  function touchingLeaf(racer, gate, side) {
    const wall = doorLeafWall(gate, side);
    const cx = Math.max(wall.minX, Math.min(racer.x, wall.maxX));
    const cz = Math.max(wall.minZ, Math.min(racer.z, wall.maxZ));
    return Math.hypot(racer.x - cx, racer.z - cz) < R + 0.15;
  }

  function moveMonster(state, rival, dt) {
    const monster = state.monster;
    const target = state.z <= rival.z ? state : rival;
    let aimX = target.x, aimZ = target.z;
    const gate = state.doors.find(g => monster.z < g.z + GATE_HALF_DEPTH + 1);
    if (gate && target.z > gate.z - GATE_HALF_DEPTH) {
      const doorX = DOOR_XS[target === state ? gate.playerSide : rivalSide(gate)];
      aimX = doorX;
      aimZ = Math.abs(monster.x - doorX) < 0.4 || monster.z > gate.z - GATE_HALF_DEPTH
        ? gate.z + GATE_HALF_DEPTH + 2 : gate.z - GATE_HALF_DEPTH - 1.5;
    }
    const dx = aimX - monster.x, dz = aimZ - monster.z;
    const distance = Math.hypot(dx, dz);
    if (distance > 1e-6) {
      const step = Math.min(distance, MONSTER_SPEED * dt);
      monster.x += dx / distance * step;
      monster.z += dz / distance * step;
      monster.yaw = Math.atan2(dx, dz);
    }
    monster.walk += dt * 8;
  }

  function update(state, rival, dt) {
    if (dt === 0) return;
    moveMonster(state, rival, dt);
    for (const gate of state.doors) {
      const owners = [gate.playerSide === 0 ? state : rival, gate.playerSide === 1 ? state : rival];
      for (const side of [0, 1]) {
        const x = DOOR_XS[side], z = gate.z + DOOR_LEAF_OFFSET;
        const near = racer => racer.z < gate.z + GATE_HALF_DEPTH + 1.5 &&
          Math.hypot(racer.x - x, racer.z - z) < OPEN_DISTANCE;
        const stranger = owners[1 - side];
        gate.rattle[side] = Math.max(0, gate.rattle[side] - dt);
        // A locked door slams shut and rattles when the wrong chicken bumps it.
        const bumped = touchingLeaf(stranger, gate, side);
        if (bumped) gate.rattle[side] = 0.3;
        const opening = !bumped && (near(owners[side]) || near(state.monster));
        gate.open[side] = Math.max(0, Math.min(1, gate.open[side] + (opening ? OPEN_RATE : -OPEN_RATE * 2) * dt));
      }
    }
    const playerCaught = Math.hypot(state.x - state.monster.x, state.z - state.monster.z) < R + MONSTER_RADIUS;
    const rivalCaught = Math.hypot(rival.x - state.monster.x, rival.z - state.monster.z) < R + MONSTER_RADIUS;
    const playerFinished = state.z >= FINISH_Z, rivalFinished = rival.z >= FINISH_Z;
    if (playerCaught || rivalCaught) {
      state.caught = playerCaught && rivalCaught ? "both" : playerCaught ? "player" : "rival";
      state.scene = "finished";
      state.playerWon = playerCaught === rivalCaught ? null : rivalCaught;
    } else if (playerFinished || rivalFinished) {
      state.scene = "finished";
      state.playerWon = playerFinished === rivalFinished ? null : playerFinished;
    }
  }

  return { reset, chooseControls, update };
}
