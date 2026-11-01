import assert from "node:assert/strict";
import test from "node:test";
import { collide, createGame } from "../js/game.js";
import {
  BUTTON, CELL, LAPS_TO_WIN, LOBBY_PAINTING, LOBBY_SPAWN, MAP, PAINTINGS, R, RIVAL_SPEED, SPEED, START,
  checkpoints, cols, lobbyWalls, rows, trackWalls,
} from "../js/track.js";

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
  const playerZ = game.state.z, rivalZ = game.rival.z;
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
  assert.ok(game.state.z < playerZ);
  assert.ok(game.rival.z < rivalZ);
  assert.equal(game.state.goTimer, 0);
  assert.equal(RIVAL_SPEED, SPEED);
});

test("collision handles wall edges and positions inside a wall", () => {
  const walls = [{ minX: 0, maxX: 2, minZ: 0, maxZ: 2 }];
  assert.deepEqual(collide(-0.2, 1, walls), [-R, 1]);
  assert.deepEqual(collide(1, 1, walls), [-R, 1]);
  assert.deepEqual(collide(5, 5, walls), [5, 5]);
  const game = createGame();
  for (let n = 0; n < 200; n++) game.update(0.05, 0.05, { w: true });
  assert.equal(game.state.x, -23 - R);
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

test("lobby portrait is wall-backed and faces the lobby interior", () => {
  const { x, z, yaw } = LOBBY_PAINTING;
  const nx = Math.sin(yaw), nz = Math.cos(yaw);
  const insideWall = (px, pz) => lobbyWalls.some(wall =>
    px >= wall.minX && px <= wall.maxX && pz >= wall.minZ && pz <= wall.maxZ
  );
  for (const offset of [-1.25, 0, 1.25]) {
    const px = x + Math.cos(yaw) * offset;
    const pz = z - Math.sin(yaw) * offset;
    assert.equal(insideWall(px - nx * 0.1, pz - nz * 0.1), true);
    assert.equal(insideWall(px + nx * 0.5, pz + nz * 0.5), false);
  }
  assert.ok(nx < 0);
});

test("laps require ordered checkpoints and a forward start-line crossing", () => {
  const game = createGame();
  startRace(game);
  Object.assign(game.state, { x: START.x, z: START.z + 0.1, yaw: Math.PI });
  game.update(0.05, 0.05, { w: true });
  assert.equal(game.state.laps, 0);
  assert.equal(game.state.nextCheckpoint, 1);
  for (let n = 1; n < checkpoints.length; n++) {
    Object.assign(game.state, checkpoints[n]);
    game.update(0);
    assert.equal(game.state.nextCheckpoint, (n + 1) % checkpoints.length);
  }
  Object.assign(game.state, { x: START.x, z: START.z - 0.1, yaw: 0 });
  game.update(0.05, 0.05, { w: true });
  assert.equal(game.state.laps, 0);
  assert.equal(game.state.nextCheckpoint, 0);
  game.state.yaw = Math.PI;
  game.update(0.05, 0.05, { w: true });
  assert.equal(game.state.laps, 1);
  assert.equal(game.state.nextCheckpoint, 1);
});

test("player victory freezes racers and reset clears the result", () => {
  const game = createGame();
  startRace(game);
  Object.assign(game.state, {
    x: START.x, z: START.z + 0.1, yaw: Math.PI,
    nextCheckpoint: 0, laps: LAPS_TO_WIN - 1,
  });
  game.update(0.05, 0.05, { w: true });
  assert.equal(game.state.scene, "finished");
  assert.equal(game.state.playerWon, true);
  const playerZ = game.state.z, rivalZ = game.rival.z;
  game.update(0.05, 0.05, { w: true });
  assert.equal(game.state.z, playerZ);
  assert.equal(game.rival.z, rivalZ);
  game.reset();
  assert.equal(game.state.playerWon, null);
});

test("rival completes three full laps and wins if the player stays still", () => {
  const game = createGame();
  startRace(game);
  for (let n = 0; n < 10000 && game.state.scene !== "finished"; n++) game.update(0.05);
  assert.equal(game.state.scene, "finished");
  assert.equal(game.state.playerWon, false);
  assert.equal(game.rival.laps, LAPS_TO_WIN);
  assert.equal(game.state.laps, 0);
});
