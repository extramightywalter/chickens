import { SPEED, TURN } from "./track.js";

export const CANNON_STAGES = 5;
export const CANNON_SPACING = 25;
export const CANNON_WALL_OFFSET = 15;
export const CANNON_TILE_SIZE = 1.8;
export const CANNON_FOOTPRINT = 0.9;
export const CANNON_REQUIRED_OVERLAP = 0.75;
export const CANNON_SPIN_WINDOW = 0.28;
export const CANNON_FINISH_Z = CANNON_STAGES * CANNON_SPACING;
export const CANNON_LANE_SPACING = 12;
const FLIGHT_SPEED = 10;
const WALL_TIME = CANNON_WALL_OFFSET / FLIGHT_SPEED;
const LANDING_TIME = 0.8;
const GRAVITY = 0.8;
const WALL_CENTER_Y = 2.7;
export const CANNON_LAUNCH_Y = WALL_CENTER_Y + GRAVITY * WALL_TIME ** 2 / 2;
const AIM_SPEED = 2.8;
const HALF_BODY = CANNON_FOOTPRINT / 2;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const axis = (positive, negative) => Number(Boolean(positive)) - Number(Boolean(negative));

export function cannonTimeToWall(racer) {
  return WALL_TIME - racer.cannonTime;
}

export function createCannonWalls(random = Math.random) {
  return Array.from({ length: CANNON_STAGES }, (_, stage) => {
    const tiles = Array.from({ length: 12 }, (_, index) => ({
      x: (index % 4 - 1.5) * CANNON_TILE_SIZE,
      y: (Math.floor(index / 4) + 0.5) * CANNON_TILE_SIZE,
      passable: true,
    }));
    const choices = [...tiles];
    for (let count = 0; count < 2 + stage * 2; count++) {
      const [tile] = choices.splice(Math.floor(random() * choices.length), 1);
      tile.passable = false;
    }
    return tiles;
  });
}

export function cannonOverlap(tiles, x, y) {
  const halfTile = CANNON_TILE_SIZE / 2;
  const overlap = (a, b) => Math.max(0,
    Math.min(a + HALF_BODY, b + halfTile) - Math.max(a - HALF_BODY, b - halfTile));
  const area = tiles.reduce((sum, tile) =>
    sum + (tile.passable ? overlap(x, tile.x) * overlap(y, tile.y) : 0), 0);
  return clamp(area / CANNON_FOOTPRINT ** 2, 0, 1);
}

export function createCannonRace(random = Math.random) {
  let inputs = new WeakMap();
  let bot = new WeakMap();

  function reset(state, racers) {
    state.cannonWalls = createCannonWalls(random);
    inputs = new WeakMap();
    bot = new WeakMap();
    racers.forEach((racer, index) => {
      const lane = (index - (racers.length - 1) / 2) * CANNON_LANE_SPACING;
      Object.assign(racer, {
        x: lane, z: -3, yaw: 0, walk: 0, eliminated: false,
        controls: { forward: 0, turn: 0 }, cannonLane: lane, cannonStage: 0,
        cannonPhase: "walk", cannonY: 0, cannonAimX: 0, cannonAimY: WALL_CENTER_Y,
        cannonTime: 0, cannonSpin: 0,
      });
    });
  }

  function actions(racer, keys) {
    const current = { launch: keys[" "] === true, spin: keys.e === true };
    const previous = inputs.get(racer);
    inputs.set(racer, current);
    return {
      launch: current.launch && !previous?.launch,
      spin: current.spin && !previous?.spin,
    };
  }

  function advanceRacer(state, racer, dt, keys) {
    const { launch, spin } = actions(racer, keys);
    const startZ = racer.cannonStage * CANNON_SPACING;
    const lane = racer.cannonLane;
    const vertical = axis(keys.w, keys.s);
    const horizontal = axis(keys.a, keys.d);
    racer.controls.forward = 0;
    racer.controls.turn = 0;
    if (racer.cannonPhase === "walk") {
      racer.controls.turn = horizontal;
      racer.yaw += horizontal * TURN * dt;
      const oldZ = racer.z;
      racer.x = lane + clamp(racer.x - lane + Math.sin(racer.yaw) * vertical * SPEED * dt, -4, 4);
      racer.z = clamp(oldZ + Math.cos(racer.yaw) * vertical * SPEED * dt, startZ - 4, startZ + 1);
      if (vertical) {
        racer.controls.forward = vertical;
        racer.walk += dt * 11;
      }
      if (racer.cannonStage === CANNON_STAGES) {
        if (oldZ >= CANNON_FINISH_Z) return 0;
        if (racer.z >= CANNON_FINISH_Z) {
          return dt * (CANNON_FINISH_Z - oldZ) / (racer.z - oldZ);
        }
      } else if (Math.hypot(racer.x - lane, racer.z - startZ) <= 0.85) {
        Object.assign(racer, {
          x: lane, z: startZ, yaw: 0, walk: 0, cannonY: CANNON_LAUNCH_Y,
          cannonPhase: "aim", cannonAimX: 0, cannonAimY: WALL_CENTER_Y,
        });
      }
    } else if (racer.cannonPhase === "aim") {
      racer.cannonAimX = clamp(racer.cannonAimX + horizontal * AIM_SPEED * dt, -3.25, 3.25);
      racer.cannonAimY = clamp(racer.cannonAimY + vertical * AIM_SPEED * dt, 0.5, 4.9);
      if (launch) Object.assign(racer, { cannonPhase: "flight", cannonTime: 0, cannonSpin: 0 });
    } else if (racer.cannonPhase === "flight") {
      if (spin || launch) racer.cannonSpin = CANNON_SPIN_WINDOW;
      const time = Math.min(WALL_TIME, racer.cannonTime + dt);
      racer.cannonSpin = Math.max(0, racer.cannonSpin - (time - racer.cannonTime));
      racer.cannonTime = time;
      racer.x = lane + racer.cannonAimX * time / WALL_TIME;
      racer.z = startZ + FLIGHT_SPEED * time;
      racer.cannonY = CANNON_LAUNCH_Y + (racer.cannonAimY - WALL_CENTER_Y) *
        time / WALL_TIME - GRAVITY * time ** 2 / 2;
      if (time === WALL_TIME) {
        const coverage = cannonOverlap(state.cannonWalls[racer.cannonStage],
          racer.cannonAimX, racer.cannonAimY);
        const cleared = racer.cannonSpin > 0 && coverage + 1e-9 >= CANNON_REQUIRED_OVERLAP;
        Object.assign(racer, {
          cannonPhase: cleared ? "land" : "fall", cannonTime: 0, eliminated: !cleared,
        });
      }
    } else if (racer.cannonPhase === "land") {
      racer.cannonTime = Math.min(LANDING_TIME, racer.cannonTime + dt);
      racer.cannonSpin = Math.max(0, racer.cannonSpin - dt);
      racer.z = startZ + CANNON_WALL_OFFSET + FLIGHT_SPEED * racer.cannonTime;
      racer.cannonY = racer.cannonAimY * (1 - (racer.cannonTime / LANDING_TIME) ** 2);
      if (racer.cannonTime === LANDING_TIME) {
        racer.cannonStage++;
        racer.cannonPhase = "walk";
      }
    } else if (racer.cannonPhase === "fall") {
      racer.cannonSpin = 0;
      racer.cannonTime += dt;
      racer.cannonY = racer.cannonAimY - racer.cannonTime * (2 + 7 * racer.cannonTime);
      if (racer.cannonY < -5) racer.cannonPhase = "out";
    }
    return Infinity;
  }

  function advance(state, racers, dt, keysFor) {
    const crossings = racers.map(racer => advanceRacer(state, racer, dt, keysFor(racer, dt)));
    const first = Math.min(...crossings);
    if (Number.isFinite(first)) return racers.filter((_, index) => Math.abs(crossings[index] - first) < 1e-9);
    if (racers.every(racer => racer.cannonPhase === "out")) return [];
    return null;
  }

  function chooseControls(state, racer, dt) {
    const steer = (error, tolerance) => Math.abs(error) <= tolerance ? 0 : Math.sign(error);
    if (racer.cannonPhase === "walk") {
      const targetZ = racer.cannonStage * CANNON_SPACING +
        (racer.cannonStage === CANNON_STAGES ? 1 : 0);
      const yaw = Math.atan2(racer.cannonLane - racer.x, targetZ - racer.z);
      const error = Math.atan2(Math.sin(yaw - racer.yaw), Math.cos(yaw - racer.yaw));
      const turn = steer(error, TURN * dt / 2);
      return { w: Math.abs(error) < 0.3, a: turn > 0, d: turn < 0 };
    }
    if (racer.cannonPhase === "aim") {
      let plan = bot.get(racer);
      if (plan?.stage !== racer.cannonStage) {
        const target = state.cannonWalls[racer.cannonStage].filter(tile => tile.passable)
          .sort((a, b) => Math.hypot(a.x, a.y - WALL_CENTER_Y) - Math.hypot(b.x, b.y - WALL_CENTER_Y))[0];
        plan = { stage: racer.cannonStage, target, delay: 1.1 };
        bot.set(racer, plan);
      }
      plan.delay -= dt;
      const side = steer(plan.target.x - racer.cannonAimX, AIM_SPEED * dt / 2);
      const up = steer(plan.target.y - racer.cannonAimY, AIM_SPEED * dt / 2);
      return { a: side > 0, d: side < 0, w: up > 0, s: up < 0,
        " ": !side && !up && plan.delay <= 0 };
    }
    return { e: racer.cannonPhase === "flight" && cannonTimeToWall(racer) <= 0.15 };
  }

  return { reset, actions, advance, chooseControls };
}