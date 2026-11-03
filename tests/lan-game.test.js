import assert from "node:assert/strict";
import test from "node:test";
import { createGame } from "../js/lobby.js";
import { createLanGame } from "../js/lan-game.js";
import { MINIGAMES } from "../js/pillows.js";
import {
  DOOR_HALF_WIDTH, DOOR_LEAF_OFFSET, DOOR_XS, FINISH_Z, GATE_HALF_DEPTH,
} from "../js/doors.js";
import {
  LAN_BUTTON, LAPS_TO_WIN, R, SPEED, START, checkpoints, isTrackSupported, lobbyStructures,
} from "../js/track.js";

function round(minigame, count = 8) {
  return createLanGame(minigame, Array.from({ length: count }, (_, n) => `player-${n}`), () => 0.1);
}

test("the LAN button is inside the right side of the LAN building and reachable", () => {
  const building = lobbyStructures.find(({ type }) => type === "laness");
  assert.ok(LAN_BUTTON.x > building.x);
  assert.ok(LAN_BUTTON.x + R < building.x + building.width / 2);
  assert.equal(LAN_BUTTON.z, building.z);
  const game = createGame();
  assert.equal(game.nearLanButton(), false);
  game.returnToLan();
  assert.equal(game.nearLanButton(), true);
  const x = game.state.x;
  game.update(0.05, 0.05, { w: true });
  assert.ok(Math.abs(game.state.x - x) < 1e-10);
  assert.ok(game.state.z < LAN_BUTTON.z);
  game.enterTrack();
  assert.equal(game.nearLanButton(), false);
});

test("all minigames support every slot count with distinct spawns and no AI movement", () => {
  for (const minigame of MINIGAMES) {
    for (let count = 2; count <= 8; count++) {
      const game = round(minigame, count);
      assert.equal(game.racers.length, count);
      assert.equal(new Set(game.racers.map(racer => `${racer.x},${racer.z}`)).size, count);
      if (minigame === "track") {
        for (const racer of game.racers) assert.equal(isTrackSupported(racer.x, racer.z), true);
      }
      const before = structuredClone(game.racers);
      game.update(2, new Map(game.racers.map(racer => [racer.id, { w: true }])));
      assert.deepEqual(game.racers, before);
      game.update(1);
      assert.equal(game.state.scene, minigame);
      assert.deepEqual(game.racers, before);
      game.update(0.05);
      assert.deepEqual(game.racers, before);
    }
  }
});

test("LAN rounds reject invalid games and slot counts", () => {
  assert.throws(() => round("missing"));
  assert.throws(() => round("track", 1));
  assert.throws(() => round("track", 9));
  assert.throws(() => createLanGame("track", ["same", "same"]));
});

test("only each human's own controls move their chicken at the normal speed", () => {
  for (const minigame of MINIGAMES) {
    const game = round(minigame);
    game.update(3);
    const before = structuredClone(game.racers);
    game.update(0.05, new Map([[game.racers[7].id, { w: true }]]));
    for (let n = 0; n < 7; n++) assert.deepEqual(game.racers[n], before[n]);
    assert.ok(Math.abs(Math.hypot(game.racers[7].x - before[7].x,
      game.racers[7].z - before[7].z) - SPEED * 0.05) < 1e-10);
  }
});

test("any of eight human racers can win the race with a real finish-line crossing", () => {
  for (let winner = 0; winner < 8; winner++) {
    const game = round("track");
    game.update(3);
    const racer = game.racers[winner];
    Object.assign(racer, {
      ...checkpoints.at(-1), laps: 0, nextCheckpoint: checkpoints.length - 1,
    });
    game.update(0.05);
    assert.equal(game.state.scene, "finished");
    assert.deepEqual(game.state.winnerIds, [racer.id]);
    const before = structuredClone(game.racers);
    game.update(1, new Map(game.racers.map(r => [r.id, { w: true }])));
    assert.deepEqual(game.racers, before);
  }
});

test("any of eight LAN racers can win by touching the red landing under the arch", () => {
  for (let winner = 0; winner < 8; winner++) {
    const game = round("track");
    game.update(3);
    Object.assign(game.racers[winner], START);
    game.update(0.05);
    assert.equal(game.state.scene, "finished");
    assert.deepEqual(game.state.winnerIds, [game.racers[winner].id]);
  }
});

test("track checkpoint order cannot be skipped by returning straight to the finish", () => {
  const game = round("track");
  game.update(3);
  Object.assign(game.racers[0], { ...checkpoints.at(-1), nextCheckpoint: 1 });
  game.update(0.05);
  assert.equal(game.racers[0].laps, 0);
  assert.equal(game.racers[0].nextCheckpoint, 1);
  assert.ok(checkpoints.length > 1);
});

test("falling off the race structure eliminates the racer and awards the survivor", () => {
  const game = round("track", 2);
  game.update(3);
  Object.assign(game.racers[0], { x: -1, yaw: Math.PI });
  game.update(0.05, new Map([[game.racers[0].id, { w: true }]]));
  assert.equal(game.racers[0].eliminated, true);
  assert.equal(game.state.scene, "finished");
  assert.deepEqual(game.state.winnerIds, [game.racers[1].id]);
});

test("pillow eliminations continue until the last survivor, including simultaneous draws", () => {
  for (const draw of [false, true]) {
    const game = round("pillows");
    game.update(3);
    function hit(racer, index) {
      racer.lives = 1;
      return { id: 100 + index, x: racer.x, z: racer.z, vx: 0, vz: 0 };
    }
    game.state.pillows = game.racers.slice(0, 6).map(hit);
    game.update(0.05);
    assert.equal(game.state.scene, "pillows");
    assert.equal(game.racers.filter(racer => racer.eliminated).length, 6);
    const eliminated = structuredClone(game.racers[0]);
    game.state.pillows = (draw ? game.racers.slice(6) : [game.racers[6]]).map(hit);
    game.update(0.05, new Map([[eliminated.id, { w: true }]]));
    assert.deepEqual(game.racers[0], eliminated);
    assert.equal(game.state.scene, "finished");
    assert.deepEqual(game.state.winnerIds, draw ? [] : [game.racers[7].id]);
  }
});

test("Door Dash gives alternating players opposite locked doors for every slot", () => {
  for (let index = 0; index < 8; index++) {
    for (const locked of [false, true]) {
      const game = round("doors");
      game.update(3);
      game.state.monster.z = -1000;
      const gate = game.state.doors[0];
      const racer = game.racers[index];
      const ownSide = racer.doorTeam === 0 ? gate.playerSide : 1 - gate.playerSide;
      const side = locked ? 1 - ownSide : ownSide;
      Object.assign(racer, {
        x: DOOR_XS[side], z: gate.z + DOOR_LEAF_OFFSET - R - 0.01,
      });
      for (let tick = 0; tick < 15; tick++) {
        game.update(0.05, new Map([[racer.id, { w: true }]]));
      }
      if (locked) assert.ok(racer.z < gate.z + DOOR_LEAF_OFFSET - R + 0.01);
      else assert.ok(racer.z > gate.z + GATE_HALF_DEPTH);
      assert.ok(DOOR_HALF_WIDTH > R);
    }
  }
});

test("Door Dash eliminates caught players without ending an eight-player round early", () => {
  const game = round("doors");
  game.update(3);
  Object.assign(game.state.monster, { x: game.racers[7].x, z: game.racers[7].z });
  game.update(0.001);
  assert.equal(game.racers[7].eliminated, true);
  assert.equal(game.state.scene, "doors");
  Object.assign(game.racers[6], { z: FINISH_Z });
  game.update(0.01);
  assert.equal(game.state.scene, "finished");
  assert.deepEqual(game.state.winnerIds, [game.racers[6].id]);
});

test("returning to the LAN button clears network state for normal single-player games", () => {
  const game = createGame();
  Object.assign(game.state, { multiplayer: true, racers: [{ id: "p1" }], eliminated: true });
  game.returnToLan();
  assert.equal(game.state.multiplayer, false);
  assert.equal(game.state.eliminated, false);
  assert.deepEqual(game.state.racers, []);
  game.enterPillows();
  game.update(0.05, 3);
  assert.equal(game.state.multiplayer, false);
});
