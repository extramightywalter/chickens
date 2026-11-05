import assert from "node:assert/strict";
import test from "node:test";
import { createGame, moveRacer } from "../js/lobby.js";
import { createLanGame } from "../js/lan-game.js";
import { EGG_LIMIT } from "../js/eggs.js";
import {
  MAZE_CELL, MAZE_COLS, MAZE_FINISH_RADIUS, MAZE_SIZE, MAZE_WALL_THICKNESS,
  createMazeRound, generateMaze, mazeCanSee, mazeCellAt, mazeClearFraction, mazePath, mazePosition,
} from "../js/maze.js";
import { R, SPEED } from "../js/track.js";

function randomSeed(seed = 1) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

function setup(seed = 1) {
  const round = createMazeRound(randomSeed(seed));
  const state = {};
  const racers = [{ id: "one" }, { id: "two" }];
  round.reset(state, racers);
  return { round, state, racers };
}

function monsterAt(position, yaw = 0) {
  return { id: 0, ...position, yaw, walk: 0, waypoint: null, targetId: null, lastSeen: null };
}

test("maze floor is one-and-a-half times Egg Heist's area with tightly packed corridors", () => {
  assert.ok(Math.abs(MAZE_SIZE ** 2 / (EGG_LIMIT * 2) ** 2 - 1.5) < 1e-12);
  assert.equal(MAZE_COLS, 14);
  assert.ok(MAZE_CELL - MAZE_WALL_THICKNESS > R * 2);
  assert.ok(MAZE_CELL - MAZE_WALL_THICKNESS < R * 6);
});

test("new layouts are connected, bounded, and put the exit near the far end", () => {
  const keys = new Set();
  for (let seed = 1; seed <= 20; seed++) {
    const maze = generateMaze(randomSeed(seed));
    keys.add(maze.key);
    const distances = maze.links.map((_, cell) => mazePath(maze, maze.start, cell).length - 1);
    const farthest = Math.max(...distances);
    const distance = distances[maze.exit];
    assert.ok(distance >= Math.ceil(farthest * 0.8));
    assert.ok(distance < farthest);
    for (let cell = 0; cell < maze.links.length; cell++) {
      assert.equal(mazeCellAt(mazePosition(cell)), cell);
      for (const next of maze.links[cell]) {
        assert.ok(maze.links[next].includes(cell));
        assert.equal(mazeClearFraction(maze.walls, mazePosition(cell), mazePosition(next), R), 1);
      }
    }
    const start = mazePosition(0);
    assert.ok(mazeClearFraction(maze.walls, start, { x: -MAZE_SIZE, z: start.z }) < 1);
    assert.ok(mazeClearFraction(maze.walls, start, { x: start.x, z: -MAZE_SIZE }) < 1);
  }
  assert.equal(keys.size, 20);
});

test("layouts have many loops and alternate routes along the race to the exit", () => {
  for (let seed = 1; seed <= 20; seed++) {
    const maze = generateMaze(randomSeed(seed));
    const passages = maze.links.reduce((total, links) => total + links.length, 0) / 2;
    assert.equal(passages - maze.links.length + 1, 48);
    const path = mazePath(maze, maze.start, maze.exit);
    let alternatives = 0;
    for (let index = 1; index < path.length; index++) {
      const from = path[index - 1], to = path[index];
      const detour = {
        links: maze.links.map((links, cell) => links.filter(next =>
          !(cell === from && next === to) && !(cell === to && next === from))),
      };
      const reachable = new Set([maze.start]), queue = [maze.start];
      for (let n = 0; n < queue.length; n++) {
        for (const next of detour.links[queue[n]]) {
          if (reachable.has(next)) continue;
          reachable.add(next);
          queue.push(next);
        }
      }
      if (reachable.has(maze.exit)) alternatives++;
    }
    assert.ok(alternatives >= 8, `Seed ${seed} needs more alternate exit routes`);
  }
});

test("replaying generates a new layout, and each round has two to four distinct monsters", () => {
  const { round, state, racers } = setup();
  const previous = state.maze.key;
  round.reset(state, racers);
  assert.notEqual(state.maze.key, previous);
  const counts = new Set();
  for (const value of [0, 0.5, 0.999999]) {
    const other = createMazeRound(() => value), data = {};
    other.reset(data, racers);
    counts.add(data.mazeMonsters.length);
    assert.equal(new Set(data.mazeMonsters.map(mazeCellAt)).size, data.mazeMonsters.length);
    for (const monster of data.mazeMonsters) {
      assert.equal(monster.targetId, null);
      assert.equal(monster.lastSeen, null);
      assert.ok(mazePath(data.maze, 0, mazeCellAt(monster)).length > 8);
    }
  }
  assert.deepEqual([...counts], [2, 3, 4]);
});

test("monsters see only in front, within range, and never through maze walls", () => {
  const maze = generateMaze(randomSeed());
  const from = mazePosition(0), target = mazePosition(maze.links[0][0]);
  const yaw = Math.atan2(target.x - from.x, target.z - from.z);
  const monster = monsterAt(from, yaw);
  assert.equal(mazeCanSee(maze, monster, target), true);
  assert.equal(mazeCanSee(maze, { ...monster, yaw: yaw + Math.PI }, target), false);
  assert.equal(mazeCanSee(maze, { ...monster, yaw: yaw + Math.PI / 2 }, target), false);
  assert.equal(mazeCanSee({ walls: [] }, monster, {
    x: from.x + Math.sin(yaw) * 13, z: from.z + Math.cos(yaw) * 13,
  }), false);
  const wall = maze.walls.find(wall => wall.maxX - wall.minX < 1);
  const z = (wall.minZ + wall.maxZ) / 2;
  assert.equal(mazeCanSee(maze, monsterAt({ x: wall.minX - 0.5, z }, Math.PI / 2),
    { x: wall.maxX + 0.5, z }), false);
});

test("patrolling does not learn an unseen player's position", () => {
  const first = setup(), second = setup();
  const center = mazePosition(0);
  first.state.mazeMonsters = [monsterAt(center, Math.PI)];
  second.state.mazeMonsters = structuredClone(first.state.mazeMonsters);
  const firstPlayers = [{ id: "hidden", x: center.x, z: center.z + 20 }];
  const secondPlayers = [{ id: "hidden", x: center.x + 20, z: center.z + 20 }];
  first.round.advance(first.state, firstPlayers, 0.02, () => {});
  second.round.advance(second.state, secondPlayers, 0.02, () => {});
  assert.deepEqual(first.state.mazeMonsters, second.state.mazeMonsters);
  assert.equal(first.state.mazeMonsters[0].targetId, null);
  assert.equal(first.state.mazeMonsters[0].lastSeen, null);
  assert.ok(first.state.mazeMonsters[0].walk > 0);
});

test("sighting triggers pursuit, losing sight remembers only the last seen position", () => {
  const { round, state } = setup();
  const center = mazePosition(0), target = mazePosition(state.maze.links[0][0]);
  const yaw = Math.atan2(target.x - center.x, target.z - center.z);
  const monster = monsterAt(center, yaw);
  state.mazeMonsters = [monster];
  const racer = { id: "seen", ...target };
  round.advance(state, [racer], 0.02, () => {});
  assert.equal(monster.targetId, racer.id);
  assert.deepEqual(monster.lastSeen, target);
  const memory = { ...monster.lastSeen };
  Object.assign(racer, { x: MAZE_SIZE * 2, z: MAZE_SIZE * 2 });
  round.advance(state, [racer], 0.02, () => {});
  assert.equal(monster.targetId, null);
  assert.deepEqual(monster.lastSeen, memory);
});

test("monsters chase a visible chicken within their own chamber and eventually forget an empty location", () => {
  const { round, state } = setup();
  const center = mazePosition(0);
  const monster = monsterAt(center);
  state.mazeMonsters = [monster];
  const racer = { id: "seen", x: center.x, z: center.z + 1 };
  round.advance(state, [racer], 0.02, () => {});
  assert.equal(monster.targetId, "seen");
  assert.ok(monster.z > center.z);
  round.advance(state, [], 1, () => {});
  assert.equal(monster.lastSeen, null);
  assert.equal(monster.targetId, null);
});

test("capture resets the chicken to the safe start, without winning the race", () => {
  const { round, state, racers } = setup();
  const cell = mazePath(state.maze, 0, state.maze.exit)[10];
  const center = mazePosition(cell);
  Object.assign(racers[0], center);
  state.mazeMonsters = [monsterAt({ x: center.x, z: center.z - 0.5 })];
  assert.equal(round.advance(state, racers, 0.02, () => {}), null);
  assert.equal(mazeCellAt(racers[0]), 0);
  assert.equal(racers[0].mazeWaypoint, null);
  assert.equal(state.mazeMonsters[0].lastSeen, null);
  const safe = { ...racers[0] };
  state.mazeMonsters = [monsterAt({ x: safe.x, z: safe.z - 0.1 })];
  round.advance(state, racers, 0.02, () => {});
  assert.deepEqual(racers[0], safe);
});

test("five captures eliminate a racer and finish solo and LAN races", () => {
  const solo = createGame({ random: randomSeed() });
  solo.enterMaze();
  solo.update(3);
  const soloRacer = solo.state;
  const soloCell = mazePath(solo.state.maze, 0, solo.state.maze.exit)[10];
  const soloPosition = mazePosition(soloCell);
  for (let count = 1; count <= 5; count++) {
    Object.assign(soloRacer, soloPosition);
    solo.state.mazeMonsters = [monsterAt(soloPosition)];
    solo.update(0.02);
    assert.equal(soloRacer.mazeRestarts, count);
    assert.equal(soloRacer.eliminated, count === 5);
  }
  assert.equal(solo.state.scene, "finished");
  assert.equal(solo.state.playerWon, false);

  const lan = createLanGame("maze", ["one", "two"], randomSeed());
  lan.update(3);
  const racer = lan.racers[0];
  const cell = mazePath(lan.state.maze, 0, lan.state.maze.exit)[10];
  const position = mazePosition(cell);
  for (let count = 1; count <= 5; count++) {
    Object.assign(racer, position);
    lan.state.mazeMonsters = [monsterAt(position)];
    lan.update(0.02);
    assert.equal(racer.mazeRestarts, count);
    assert.equal(racer.eliminated, count === 5);
  }
  assert.equal(lan.state.scene, "finished");
  assert.deepEqual(lan.state.winnerIds, ["two"]);
});

test("monsters patrol through doorways rather than crossing walls", () => {
  const { round, state } = setup();
  for (let tick = 0; tick < 600; tick++) {
    const previous = structuredClone(state.mazeMonsters);
    round.advance(state, [], 0.05, () => {});
    for (const [index, monster] of state.mazeMonsters.entries()) {
      assert.equal(mazeClearFraction(state.maze.walls, previous[index], monster, R), 1);
    }
  }
});

test("camera boom stops before walls and can extend through open passages", () => {
  const maze = generateMaze(randomSeed());
  const from = mazePosition(0), target = mazePosition(maze.links[0][0]);
  assert.equal(mazeClearFraction(maze.walls, from, target, 0.18), 1);
  const blocked = { x: from.x - 3, z: from.z };
  const fraction = mazeClearFraction(maze.walls, from, blocked, 0.18);
  assert.ok(fraction > 0 && fraction < 1);
  assert.equal(mazeClearFraction(maze.walls, from, {
    x: from.x + (blocked.x - from.x) * (fraction - 0.025), z: from.z,
  }, 0.18), 1);
});

test("solo countdown freezes the maze, abilities are disabled, movement cannot tunnel through walls", () => {
  const game = createGame({ random: randomSeed() });
  game.enterMaze();
  const before = structuredClone({ maze: game.state.maze, monsters: game.state.mazeMonsters,
    x: game.state.x, z: game.state.z, rival: game.rival });
  game.update(0.05, 2, { w: true, e: true, " ": true });
  assert.deepEqual({ maze: game.state.maze, monsters: game.state.mazeMonsters,
    x: game.state.x, z: game.state.z, rival: game.rival }, before);
  game.update(0.05, 1);
  game.state.yaw = -Math.PI / 2;
  game.update(1, 1, { w: true, e: true, " ": true });
  assert.equal(game.state.spinTimer, 0);
  assert.equal(game.state.diveTimer, 0);
  assert.ok(game.state.x >= -MAZE_SIZE / 2 + MAZE_WALL_THICKNESS / 2 + R - 1e-8);
  assert.equal(game.state.scene, "maze");
});

test("first exit contact wins in solo and LAN, results freeze, and leaving clears maze state", () => {
  for (const winner of ["player", "rival"]) {
    const game = createGame({ random: randomSeed() });
    game.enterMaze();
    game.update(0.05, 3);
    const exit = mazePosition(game.state.maze.exit);
    Object.assign(winner === "player" ? game.state : game.rival, exit);
    game.update(0);
    assert.equal(game.state.scene, "finished");
    assert.equal(game.state.playerWon, winner === "player");
    const before = structuredClone(game.state);
    game.update(0.05, 0.05, { w: true });
    assert.deepEqual(game.state, before);
    game.returnToButton();
    assert.equal(game.state.maze, null);
    assert.deepEqual(game.state.mazeMonsters, []);
  }
  const game = createLanGame("maze", ["one", "two", "three"], randomSeed());
  game.update(3);
  Object.assign(game.racers[2], mazePosition(game.state.maze.exit));
  game.update(0.02);
  assert.equal(game.state.scene, "finished");
  assert.deepEqual(game.state.winnerIds, ["three"]);
  const before = structuredClone(game.racers);
  game.update(1, new Map([["one", { w: true }]]));
  assert.deepEqual(game.racers, before);
});

test("same-tick arrivals award only the earliest exit contact, not array order", () => {
  const { round, state, racers } = setup();
  state.mazeMonsters = [];
  const exit = mazePosition(state.maze.exit);
  Object.assign(racers[0], { x: exit.x, z: exit.z - MAZE_FINISH_RADIUS - 0.1 });
  Object.assign(racers[1], { x: exit.x, z: exit.z - MAZE_FINISH_RADIUS - 0.01 });
  const winners = round.advance(state, racers, 0.02, (racer, dt) => { racer.z += SPEED * dt; });
  assert.deepEqual(winners, [racers[1]]);
});

test("rival explores local passages and backtracks instead of knowing the exit", () => {
  for (const exit of [1, 16, 17]) {
    const round = createMazeRound(() => 0);
    const state = { maze: { links: [[1, 16], [0]], exit } };
    state.maze.links[16] = [0, 17];
    state.maze.links[17] = [16];
    Object.defineProperty(state.maze, "exit", {
      get() { assert.fail("Exploration must not read the exit location"); },
    });
    const racer = { ...mazePosition(0), yaw: 0, mazeWaypoint: null };
    for (const expected of [1, 0, 16, 17, 16, 0]) {
      round.chooseControls(state, racer);
      assert.equal(racer.mazeWaypoint, expected);
      Object.assign(racer, mazePosition(expected), { mazeWaypoint: null });
    }
  }
});

test("rival exploration covers every chamber in looping mazes without a known destination", () => {
  for (const seed of [1, 3, 5]) {
    const { round, state, racers } = setup(seed);
    const racer = racers[1];
    Object.assign(racer, mazePosition(state.maze.start));
    const visited = new Set([state.maze.start]);
    Object.defineProperty(state.maze, "exit", {
      get() { assert.fail("Exploration must not read the exit location"); },
    });
    for (let step = 0; step < state.maze.links.length * 2 &&
        visited.size < state.maze.links.length; step++) {
      const cell = mazeCellAt(racer);
      round.chooseControls(state, racer);
      const next = racer.mazeWaypoint;
      assert.ok(next === cell || state.maze.links[cell].includes(next));
      visited.add(next);
      Object.assign(racer, mazePosition(next), { mazeWaypoint: null });
    }
    assert.equal(visited.size, state.maze.links.length);
  }
});

test("capture and new rounds clear the rival's exploration memory", () => {
  const round = createMazeRound(() => 0), state = {}, racer = {};
  round.reset(state, [racer]);
  function exploreStart() {
    Object.assign(racer, mazePosition(state.maze.start), { mazeWaypoint: null });
    round.chooseControls(state, racer);
    assert.equal(racer.mazeWaypoint, state.maze.links[state.maze.start][0]);
  }
  exploreStart();
  const cell = mazePath(state.maze, state.maze.start, state.maze.exit)[10];
  const center = mazePosition(cell);
  Object.assign(racer, center);
  state.mazeMonsters = [monsterAt({ x: center.x, z: center.z - 0.5 })];
  round.advance(state, [racer], 0.02, () => {});
  assert.equal(mazeCellAt(racer), state.maze.start);
  exploreStart();
  round.reset(state, [racer]);
  exploreStart();
});

test("the solo rival eventually discovers the exit using normal movement and speed", () => {
  for (const seed of [1, 3, 5]) {
    const game = createGame({ random: randomSeed(seed) });
    game.enterMaze();
    game.update(0.05, 3);
    game.state.mazeMonsters = [];
    for (let tick = 0; tick < 30000 && game.state.scene === "maze"; tick++) game.update(0.05);
    assert.equal(game.state.scene, "finished");
    assert.equal(game.state.playerWon, false);
  }
});

test("eight LAN racers share one serialized maze and only their own inputs move them", () => {
  const ids = Array.from({ length: 8 }, (_, index) => `p${index}`);
  const game = createLanGame("maze", ids, randomSeed());
  assert.equal(new Set(game.racers.map(racer => `${racer.x},${racer.z}`)).size, 8);
  for (const racer of game.racers) {
    const before = { ...racer };
    moveRacer(racer, 0, 1, 0, SPEED, game.state.maze.walls);
    assert.deepEqual(racer, before);
  }
  const snapshot = JSON.parse(JSON.stringify({ state: game.state, racers: game.racers }));
  assert.equal(snapshot.state.maze.key, game.state.maze.key);
  assert.deepEqual(snapshot.state.mazeMonsters, game.state.mazeMonsters);
  const before = structuredClone(game.racers);
  game.update(3, new Map([["p0", { w: true }]]));
  assert.deepEqual(game.racers, before);
  game.update(0.05, new Map([["p7", { w: true, e: true, " ": true }]]));
  assert.deepEqual(game.racers.slice(0, 7), before.slice(0, 7));
  assert.ok(Math.abs(Math.hypot(game.racers[7].x - before[7].x,
    game.racers[7].z - before[7].z) - SPEED * 0.05) < 1e-10);
  assert.equal(game.racers[7].diveTimer, 0);
  assert.equal(game.racers[7].spinTimer, 0);
});
