import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { collide, createGame as createRandomGame, moveTrackRacer } from "../js/lobby.js";
import {
  BUTTON, CELL, CHICKEN_SCALE, CHICKEN_WIDTH, LAPS_TO_WIN, LOBBY_BOUNDS,
  LOBBY_BUILDING_WIDTH, LOBBY_CELL_DEPTH, LOBBY_CELL_WIDTH,
  LOBBY_COLS, LOBBY_MAP, LOBBY_ROWS, LOBBY_SPAWN, MAP, PAINTINGS, R, RIVAL_SPEED,
  SPEED, START, TURN, checkpoints, cols, lobbyEntrances, lobbyStructures,
  TRACK_SURFACE_Y, TRACK_CHECKPOINT_RADIUS, isTrackSupported, lobbyWalls, rows, trackWalls,
  touchesFinishLanding,
} from "../js/track.js";

function createGame(seed = 1) {
  return createRandomGame({
    random: () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 4294967296;
    },
  });
}

function startRace(game) {
  game.enterTrack();
  game.update(0.05, 3);
}

test("games have independent state and reset to the lobby", () => {
  const game = createGame();
  const other = createGame();
  assert.equal(game.state.scene, "lobby");
  assert.equal(game.state.x, LOBBY_SPAWN.x);
  assert.equal(game.nearButton(), false);
  Object.assign(game.state, BUTTON);
  assert.equal(game.nearButton(), true);
  assert.equal(other.state.x, LOBBY_SPAWN.x);
  startRace(game);
  game.reset();
  assert.equal(game.state.scene, "lobby");
  assert.equal(game.state.laps, 0);
  assert.equal(game.state.countdown, 0);
  assert.equal(game.state.playerWon, null);
  assert.equal(game.rival.laps, 0);
});

test("returning from a minigame places the player on the button", () => {
  const game = createGame();
  game.enterTrack();
  game.returnToButton();
  assert.equal(game.state.scene, "lobby");
  assert.equal(game.state.x, BUTTON.x);
  assert.equal(game.state.z, BUTTON.z);
  assert.equal(game.state.minigame, null);
  assert.equal(game.nearButton(), true);
});

test("movement and turning retain WASD and arrow key controls", () => {
  for (const key of ["w", "arrowup", "s", "arrowdown"]) {
    const game = createGame();
    const before = game.state.x;
    game.update(0.05, 0.05, { [key]: true });
    const direction = key === "w" || key === "arrowup" ? 1 : -1;
    assert.ok(Math.abs(game.state.x - before - direction * SPEED * 0.05) < 1e-10);
  }
  for (const key of ["a", "arrowleft", "d", "arrowright"]) {
    const game = createGame();
    const before = game.state.yaw;
    game.update(0.05, 0.05, { [key]: true });
    assert.equal(game.state.yaw > before, key === "a" || key === "arrowleft");
  }
});

test("countdown uses elapsed time and grants neither racer a head start", () => {
  const game = createGame();
  game.enterTrack();
  assert.equal(game.state.x, START.x - 1.6);
  assert.equal(game.rival.x, START.x + 1.6);
  assert.equal(game.rival.z, game.state.z);
  const playerX = game.state.x, playerZ = game.state.z;
  const rivalX = game.rival.x, rivalZ = game.rival.z;
  game.update(0.05, 1, { w: true });
  assert.equal(game.state.countdown, 2);
  assert.equal(game.state.z, playerZ);
  assert.equal(game.rival.z, rivalZ);
  game.update(0.05, 5, { w: true });
  assert.equal(game.state.scene, "track");
  assert.equal(game.state.z, playerZ);
  assert.equal(game.rival.z, rivalZ);
  assert.equal(game.state.goTimer, 0.7);
  game.update(0.05, 0.7, { w: true });
  assert.ok(game.state.x > playerX);
  assert.ok(game.rival.x > rivalX);
  assert.equal(game.state.goTimer, 0);
  assert.equal(RIVAL_SPEED, SPEED);
});

test("collision handles wall edges and positions inside a wall", () => {
  const walls = [{ minX: 0, maxX: 2, minZ: 0, maxZ: 2 }];
  assert.deepEqual(collide(-0.2, 1, walls), [-R, 1]);
  assert.deepEqual(collide(1, 1, walls), [-R, 1]);
  assert.deepEqual(collide(5, 5, walls), [5, 5]);
  const game = createGame();
  const wall = lobbyWalls[0];
  Object.assign(game.state, {
    x: wall.minX - R - 0.1, z: (wall.minZ + wall.maxZ) / 2, yaw: Math.PI / 2,
  });
  game.update(0.05, 0.05, { w: true });
  assert.ok(game.state.x <= wall.minX - R + 1e-10);
});

test("rendered wall bounds cover exactly the solid map cells", () => {
  assert.equal(MAP.length, rows);
  for (let z = 0; z < rows; z++) {
    assert.equal(MAP[z].length, cols);
    for (let x = 0; x < cols; x++) {
      const covered = trackWalls.some(wall =>
        (x + 0.5) * CELL > wall.minX && (x + 0.5) * CELL < wall.maxX &&
        (z + 0.5) * CELL > wall.minZ && (z + 0.5) * CELL < wall.maxZ
      );
      assert.equal(covered, MAP[z][x] === "x");
    }
  }
});

test("the race route defines where the structure supports racers", () => {
  assert.equal(isTrackSupported(START.x, START.z), true);
  for (const point of checkpoints) assert.equal(isTrackSupported(point.x, point.z), true);
  assert.ok(START.x < 0, "The race should start beneath the course arch");
  assert.ok(checkpoints.at(-1).x > 100, "The finish should be on the far side");
  assert.ok(checkpoints.length > 1);
  assert.equal(TRACK_SURFACE_Y, 2.5);
  assert.equal(TRACK_CHECKPOINT_RADIUS, 2.5);
  assert.equal(isTrackSupported(-100, START.z), false);
  assert.equal(isTrackSupported(START.x, -100), false);
});

test("track movement cannot cross a gap between visible ground tiles", () => {
  const racer = {
    x: -16.980095863342285, z: 23.662500143051147, yaw: Math.PI,
  };
  assert.equal(isTrackSupported(racer.x, racer.z), true);
  assert.equal(isTrackSupported(racer.x, 13.662500143051147), true);
  assert.equal(moveTrackRacer(racer, 10 / SPEED, 1, 0, SPEED), false);
  assert.ok(racer.z > 13.662500143051147, "Movement must stop at the unsupported tile");
});

test("racers fall and lose when they leave the race structure", () => {
  const game = createGame();
  startRace(game);
  Object.assign(game.state, { x: -1, yaw: Math.PI });
  game.update(0.05, 0.05, { w: true });
  assert.equal(game.state.scene, "finished");
  assert.equal(game.state.eliminated, true);
  assert.equal(game.state.playerWon, false);
});

test("the rival falls off the race structure and gives the player the win", () => {
  const game = createGame();
  startRace(game);
  Object.assign(game.rival, { x: -1, z: START.z, yaw: Math.PI });
  game.update(0.05, 0.05);
  assert.equal(game.rival.eliminated, true);
  assert.equal(game.state.scene, "finished");
  assert.equal(game.state.playerWon, true);
});

test("exactly four paintings are wall-backed and face the drivable course", () => {
  assert.equal(PAINTINGS.length, 4);
  assert.equal(new Set(PAINTINGS.map(({ x, z }) => `${x},${z}`)).size, 4);
  for (const { x, z, yaw } of PAINTINGS) {
    const nx = Math.sin(yaw), nz = Math.cos(yaw);
    for (const offset of [-1.25, 0, 1.25]) {
      const px = x + Math.cos(yaw) * offset;
      const pz = z - Math.sin(yaw) * offset;
      const behind = MAP[Math.floor((pz - nz * 0.1) / CELL)][Math.floor((px - nx * 0.1) / CELL)];
      const inFront = MAP[Math.floor((pz + nz * 0.5) / CELL)][Math.floor((px + nx * 0.5) / CELL)];
      assert.equal(behind, "x", `Painting at ${x},${z} needs a solid wall behind it`);
      assert.equal(inFront, " ", `Painting at ${x},${z} must face the course`);
    }
  }
});

test("lobby map preserves the sketch with a compact footprint", () => {
  assert.equal(LOBBY_MAP.length, LOBBY_ROWS);
  assert.ok(LOBBY_MAP.every(line => line.length === LOBBY_COLS));
  assert.equal(LOBBY_BOUNDS.maxX - LOBBY_BOUNDS.minX, 108);
  assert.equal(LOBBY_BOUNDS.maxZ - LOBBY_BOUNDS.minZ, 72);
  assert.equal(LOBBY_CELL_WIDTH, 3);
  assert.equal(LOBBY_CELL_DEPTH, 7.2);
  assert.ok(LOBBY_MAP.every(line => /^[ rxyzl]+$/.test(line)));
  assert.equal(LOBBY_MAP.join("").split("x").length - 1, 4);
  assert.equal(LOBBY_MAP.join("").split("y").length - 1, 1);
  assert.equal(LOBBY_MAP.join("").split("z").length - 1, 1);
  assert.equal(LOBBY_MAP.join("").split("l").length - 1, 1);
  assert.equal(lobbyStructures.length, 7);
  assert.deepEqual(
    lobbyStructures.map(({ type }) => type).sort(),
    ["house", "house", "house", "house", "laness", "lobby", "shop"]
  );
});

test("building scales preserve model proportions at their intended chicken widths", () => {
  function modelBounds(asset) {
    const data = readFileSync(new URL(asset, import.meta.url));
    const jsonLength = data.readUInt32LE(12);
    const gltf = JSON.parse(data.toString("utf8", 20, 20 + jsonLength));
    const positions = gltf.accessors[gltf.meshes[0].primitives[0].attributes.POSITION];
    return positions.max.map((value, axis) => value - positions.min[axis]);
  }
  const [chickenWidth] = modelBounds("../assets/models/chicken.glb");
  assert.ok(Math.abs(CHICKEN_WIDTH - chickenWidth * CHICKEN_SCALE) < 1e-8);
  for (const structure of lobbyStructures) {
    const [width, , depth] = modelBounds(`../js/${structure.asset}`);
    const widthMultiplier = structure.type === "shop" ? 3 : 1;
    const rotated = structure.entranceSide === "west" || structure.entranceSide === "east";
    assert.ok(structure.scale > 1, `${structure.type} should be enlarged`);
    assert.ok(Math.abs(width * structure.scale / CHICKEN_WIDTH - 10 * widthMultiplier) < 1e-6);
    assert.ok(Math.abs(structure.modelWidth - LOBBY_BUILDING_WIDTH * widthMultiplier) < 1e-8);
    assert.ok(Math.abs(structure.modelDepth - depth * structure.scale) < 1e-6);
    assert.ok(Math.abs(structure.width - (rotated ? depth : width) * structure.scale) < 1e-6);
    assert.ok(Math.abs(structure.depth - (rotated ? width : depth) * structure.scale) < 1e-6);
  }
});

test("compact buildings leave walking space and keep the spawn and race button clear", () => {
  for (const point of [LOBBY_SPAWN, BUTTON]) {
    assert.deepEqual(collide(point.x, point.z, lobbyWalls), [point.x, point.z]);
  }
  for (const [index, structure] of lobbyStructures.entries()) {
    const bounds = {
      minX: structure.x - structure.width / 2, maxX: structure.x + structure.width / 2,
      minZ: structure.z - structure.depth / 2, maxZ: structure.z + structure.depth / 2,
    };
    for (const other of lobbyStructures.slice(index + 1)) {
      const otherBounds = {
        minX: other.x - other.width / 2, maxX: other.x + other.width / 2,
        minZ: other.z - other.depth / 2, maxZ: other.z + other.depth / 2,
      };
      const gapX = Math.max(0, bounds.minX - otherBounds.maxX, otherBounds.minX - bounds.maxX);
      const gapZ = Math.max(0, bounds.minZ - otherBounds.maxZ, otherBounds.minZ - bounds.maxZ);
      assert.ok(Math.hypot(gapX, gapZ) > R * 2, "Buildings need a chicken-wide gap");
    }
    const closestX = Math.max(bounds.minX, Math.min(BUTTON.x, bounds.maxX));
    const closestZ = Math.max(bounds.minZ, Math.min(BUTTON.z, bounds.maxZ));
    if (structure.type !== "lobby") {
      assert.ok(Math.hypot(BUTTON.x - closestX, BUTTON.z - closestZ) > BUTTON.r + R);
    }
  }
  for (const entrance of lobbyEntrances) {
    assert.deepEqual(collide(entrance.x, entrance.z, lobbyWalls), [entrance.x, entrance.z]);
  }
});

test("house and shop entrances are always open", () => {
  const game = createGame();
  for (const entrance of lobbyEntrances.filter(({ type }) => type !== "lobby")) {
    const outside = entrance.entranceSide === "north" ? -1 : 1;
    const approach = {
      x: entrance.x, z: entrance.z + outside * 1.4,
      yaw: outside === -1 ? 0 : Math.PI,
    };
    Object.assign(game.state, approach);
    for (let step = 0; step < 8; step++) game.update(0.05, 0.05, { w: true });
    assert.ok(
      (game.state.z - entrance.z) * outside < 0,
      `The ${entrance.type} entrance should be passable without an interaction`
    );
  }
});

test("houses face away from the path without turning the shop or lobby", () => {
  const houses = lobbyStructures.filter(({ type }) => type === "house");
  assert.deepEqual(houses.map(({ entranceSide }) => entranceSide), ["south", "south", "north", "north"]);
  assert.deepEqual(houses.map(({ rotation }) => rotation), [0, 0, Math.PI, Math.PI]);
  const shop = lobbyStructures.find(({ type }) => type === "shop");
  assert.equal(shop.entranceSide, "north");
  assert.equal(shop.rotation, 0);
  assert.equal(shop.entranceWidth, 3.42 * shop.scale);
  assert.equal(shop.entranceOffsetX, -0.71 * shop.scale);
  const lobby = lobbyStructures.find(({ type }) => type === "lobby");
  assert.equal(lobby.entranceSide, "west");
  assert.equal(lobby.rotation, Math.PI / 2);
});

test("house and shop entrances are clear while opposite walls remain solid", () => {
  for (const structure of lobbyStructures.filter(({ type }) => type === "house" || type === "shop")) {
    const entrance = lobbyEntrances.find(({ id }) => id === structure.id);
    assert.deepEqual(collide(entrance.x, entrance.z, lobbyWalls), [entrance.x, entrance.z]);
    const oppositeZ = structure.z - (entrance.z - structure.z);
    assert.notDeepEqual(collide(structure.x, oppositeZ, lobbyWalls), [structure.x, oppositeZ]);
  }
});

test("the lobby building is not collidable", () => {
  const lobby = lobbyStructures.find(({ type }) => type === "lobby");
  const wallPoint = { x: lobby.x, z: lobby.z - lobby.depth / 2 };
  assert.deepEqual(collide(wallPoint.x, wallPoint.z, lobbyWalls), [wallPoint.x, wallPoint.z]);
});

test("Laness sits to the player's right on a connected road branch", () => {
  const laness = lobbyStructures.find(({ type }) => type === "laness");
  assert.equal(laness.asset, "../assets/models/laness.glb");
  assert.equal(laness.rotation, 0);
  assert.ok(laness.z - laness.depth / 2 > LOBBY_SPAWN.z);
  const visited = new Set(["0,3"]);
  const queue = [[0, 3]];
  for (const [column, row] of queue) {
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const x = column + dx, z = row + dz;
      const key = `${x},${z}`;
      if (visited.has(key) || LOBBY_MAP[z]?.[x] !== "r") continue;
      visited.add(key);
      queue.push([x, z]);
    }
  }
  assert.ok(visited.has("0,6"), "A small road must run rightward from the spawn");
  assert.ok(visited.has("9,6"), "The branch must reach the front of Laness");
  const game = createGame();
  Object.assign(game.state, { yaw: 0 });
  const walkTo = (axis, target) => {
    const steps = Math.ceil((target - game.state[axis]) / (SPEED * 0.05));
    for (let step = 0; step < steps; step++) game.update(0.05, 0.05, { w: true });
    assert.ok(Math.abs(game.state[axis] - target) < SPEED * 0.05 + 1e-8);
  };
  const roadZ = LOBBY_BOUNDS.minZ + 6.5 * LOBBY_CELL_DEPTH;
  walkTo("z", roadZ);
  game.state.yaw = Math.PI / 2;
  walkTo("x", laness.x);
  game.state.yaw = 0;
  walkTo("z", laness.z);
});

test("Laness has full-width front and back access with solid side walls", () => {
  const laness = lobbyStructures.find(({ type }) => type === "laness");
  const entrances = lobbyEntrances.filter(({ type }) => type === "laness");
  assert.deepEqual(entrances.map(({ entranceSide }) => entranceSide), ["north", "south"]);
  for (const entrance of entrances) {
    assert.equal(entrance.entranceWidth, laness.width);
    for (const offset of [-0.5, -0.25, 0, 0.25, 0.5]) {
      const game = createGame();
      const outside = entrance.entranceSide === "north" ? -1 : 1;
      const x = laness.x + offset * (laness.width - 2 * (R + 0.25));
      Object.assign(game.state, {
        x, z: entrance.z + outside * 1.5, yaw: outside === -1 ? 0 : Math.PI,
      });
      const steps = Math.ceil((laness.depth + 3) / (SPEED * 0.05));
      for (let step = 0; step < steps; step++) game.update(0.05, 0.05, { w: true });
      assert.ok((game.state.z - laness.z) * outside < -laness.depth / 2,
        "Every part of each opening must allow walking all the way through");
      assert.ok(Math.abs(game.state.x - x) < 1e-8);
    }
  }
  for (const side of [-1, 1]) {
    const x = laness.x + side * laness.width / 2;
    assert.notDeepEqual(collide(x, laness.z, lobbyWalls), [x, laness.z]);
  }
});

test("the lobby model's north arch faces the road and leads to the indoor race button", () => {
  const lobby = lobbyStructures.find(({ type }) => type === "lobby");
  const entrance = lobbyEntrances.find(({ type }) => type === "lobby");
  assert.equal(lobby.asset, "../assets/models/lobby.glb");
  assert.equal(lobby.rotation, Math.PI / 2);
  assert.ok(Math.abs(lobby.entranceWidth - 1.17 * lobby.scale) < 1e-10);
  // The model's arch faces negative Z; rotation must point it west toward the road.
  assert.ok(Math.abs(-Math.sin(lobby.rotation) + 1) < 1e-10);
  const game = createGame();
  Object.assign(game.state, { x: entrance.x - 2, z: entrance.z, yaw: Math.PI / 2 });
  for (let step = 0; step < 25; step++) game.update(0.05, 0.05, { w: true });
  assert.ok(game.state.x > entrance.x + 4, "walking through the visible arch must reach the interior");
  assert.equal(game.nearButton(), true);
  assert.ok(BUTTON.x - BUTTON.r > lobby.x - lobby.width / 2);
  assert.ok(BUTTON.x + BUTTON.r < lobby.x + lobby.width / 2);
  assert.ok(BUTTON.z - BUTTON.r > lobby.z - lobby.depth / 2);
  assert.ok(BUTTON.z + BUTTON.r < lobby.z + lobby.depth / 2);
});

test("the course starts under the arch and finishes on the opposite side", () => {
  const game = createGame();
  startRace(game);
  assert.equal(game.state.x, START.x - 1.6);
  assert.equal(game.state.yaw, Math.PI / 2);
  for (let n = 1; n < checkpoints.length; n++) {
    Object.assign(game.state, checkpoints[n]);
    game.update(0);
    if (n < checkpoints.length - 1) {
      assert.equal(game.state.scene, "track");
      assert.equal(game.state.nextCheckpoint, n + 1);
    }
  }
  assert.equal(game.state.scene, "finished");
  assert.equal(game.state.laps, LAPS_TO_WIN);
  assert.equal(game.state.playerWon, true);
});

test("touching the red landing at the far-side finish lets either racer win", () => {
  for (const winner of ["player", "rival"]) {
    const game = createGame();
    startRace(game);
    assert.equal(touchesFinishLanding(game.state), false);
    assert.equal(touchesFinishLanding(game.rival), false);
    Object.assign(winner === "player" ? game.state : game.rival, checkpoints.at(-1));
    game.update(0);
    assert.equal(game.state.scene, "finished");
    assert.equal(game.state.playerWon, winner === "player");
  }
});

test("simultaneous contact with the red landing is a draw", () => {
  const game = createGame();
  startRace(game);
  Object.assign(game.state, checkpoints.at(-1));
  Object.assign(game.rival, checkpoints.at(-1));
  game.update(0);
  assert.equal(game.state.scene, "finished");
  assert.equal(game.state.playerWon, null);
});

test("player victory freezes racers and reset clears the result", () => {
  const game = createGame();
  startRace(game);
  Object.assign(game.state, {
    ...checkpoints.at(-1), nextCheckpoint: checkpoints.length - 1,
  });
  game.update(0);
  assert.equal(game.state.scene, "finished");
  assert.equal(game.state.playerWon, true);
  const playerX = game.state.x, rivalX = game.rival.x;
  game.update(0.05, 0.05, { w: true });
  assert.equal(game.state.x, playerX);
  assert.equal(game.rival.x, rivalX);
  game.reset();
  assert.equal(game.state.playerWon, null);
});

test("the rival stays on the flat course and reaches the far-side finish", () => {
  const game = createRandomGame({ random: () => 0.5 });
  startRace(game);
  for (let n = 0; n < 1200 && game.state.scene === "track"; n++) {
    game.update(0.05);
    assert.equal(isTrackSupported(game.rival.x, game.rival.z), true);
  }
  assert.equal(game.state.scene, "finished");
  assert.equal(game.state.playerWon, false);
  assert.equal(game.rival.laps, LAPS_TO_WIN);
  assert.ok(game.rival.x > START.x);
});

test("rival moves forward along its heading rather than sliding sideways", () => {
  const game = createGame();
  startRace(game);
  for (let n = 0; n < 12; n++) {
    const { x, z } = game.rival;
    game.update(0.05);
    const dx = game.rival.x - x, dz = game.rival.z - z;
    assert.ok(Math.abs(dx * Math.cos(game.rival.yaw) - dz * Math.sin(game.rival.yaw)) < 1e-10);
    assert.ok(dx * Math.sin(game.rival.yaw) + dz * Math.cos(game.rival.yaw) >= 0);
  }
});

test("rival holds its steering inputs between reactions", () => {
  const game = createGame();
  startRace(game);
  const dt = 1 / 120;
  const turns = new Set();
  let lastChange = 0;
  for (let n = 0; n < 20 / dt; n++) {
    const previous = { ...game.rival.controls };
    game.update(dt);
    const { turn, forward } = game.rival.controls;
    assert.ok([-1, 0, 1].includes(turn));
    assert.ok([0, 1].includes(forward));
    turns.add(turn);
    if (n > 0 && (turn !== previous.turn || forward !== previous.forward)) {
      assert.ok((n - lastChange) * dt >= 0.09, "Inputs should be held between reactions");
      lastChange = n;
    }
  }
  assert.equal(turns.size, 3);
});

test("reset clears held rival inputs and reactions to the player", () => {
  const game = createGame();
  startRace(game);
  for (let n = 0; n < 80; n++) game.update(0.05);
  game.reset();
  assert.deepEqual(game.rival.controls, { forward: 1, turn: 0 });
  assert.equal(game.rival.intent, "race");
  const before = { ...game.rival, controls: { ...game.rival.controls } };
  game.update(0.05);
  assert.deepEqual(game.rival, before);
  game.enterTrack();
  game.update(0.05, 1);
  assert.deepEqual(game.rival.controls, { forward: 1, turn: 0 });
  assert.equal(game.rival.walk, 0);
});

for (const dt of [1 / 120, 1 / 60, 0.05]) {
  test(`rival respects movement limits and finishes the flat route at dt=${dt}`, () => {
    const game = createGame();
    startRace(game);
    for (let n = 0; n < 60 / dt && game.state.scene !== "finished"; n++) {
      const { x, z, yaw } = game.rival;
      game.update(dt);
      assert.ok(Math.abs(game.rival.yaw - yaw) <= TURN * dt + 1e-10);
      assert.ok(Math.hypot(game.rival.x - x, game.rival.z - z) <= RIVAL_SPEED * dt + 1e-10);
      assert.equal(isTrackSupported(game.rival.x, game.rival.z), true);
    }
    assert.equal(game.state.scene, "finished");
    assert.equal(game.state.playerWon, false);
    assert.equal(game.rival.laps, LAPS_TO_WIN);
    assert.equal(game.state.laps, 0);
  });
}
