import assert from "node:assert/strict";
import test from "node:test";
import { CANNON_FINISH_Z, CANNON_SPACING, CANNON_STAGES, createCannonRace } from "../js/cannon-race.js";
import { createLanGame } from "../js/lan-game.js";
import { SPEED, TURN } from "../js/track.js";

function setup() {
  const round = createCannonRace(() => 0.1);
  const state = {};
  const racers = [{}, {}];
  round.reset(state, racers);
  return { round, state, racers };
}

test("walking moves forward and backward relative to the chicken and turns in place", () => {
  for (const yaw of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
    for (const [key, sign] of [["w", 1], ["s", -1]]) {
      const { round, state, racers } = setup();
      const racer = racers[0];
      Object.assign(racer, { x: racer.cannonLane, z: -3, yaw });
      round.advance(state, racers, 0.05, current => current === racer ? { [key]: true, lookX: 1 } : {});
      assert.ok(Math.abs(racer.x - racer.cannonLane - Math.sin(yaw) * sign * SPEED * 0.05) < 1e-10);
      assert.ok(Math.abs(racer.z + 3 - Math.cos(yaw) * sign * SPEED * 0.05) < 1e-10);
    }
  }
  const { round, state, racers } = setup();
  const racer = racers[0], x = racer.x, z = racer.z;
  round.advance(state, racers, 0.05, current => current === racer ? { a: true } : {});
  assert.equal(racer.x, x);
  assert.equal(racer.z, z);
  assert.equal(racer.yaw, TURN * 0.05);
});

test("cannon aiming still uses directional inputs", () => {
  const { round, state, racers } = setup();
  const racer = racers[0];
  racer.cannonPhase = "aim";
  const x = racer.cannonAimX, y = racer.cannonAimY;
  round.advance(state, racers, 0.05, current => current === racer ? { a: true, w: true } : {});
  assert.ok(racer.cannonAimX > x);
  assert.ok(racer.cannonAimY > y);
});

test("LAN Cannon Race uses the player's facing direction", () => {
  const game = createLanGame("cannon-race", ["one", "two"], () => 0.1);
  game.update(3);
  const racer = game.racers[0];
  const x = racer.x, z = racer.z;
  racer.yaw = Math.PI / 2;
  game.update(0.05, new Map([["one", { w: true, lookX: 1 }]]));
  assert.ok(Math.abs(racer.x - x - SPEED * 0.05) < 1e-10);
  assert.ok(Math.abs(racer.z - z) < 1e-10);
});

test("finish results compare actual crossing times when approaching at an angle", () => {
  const { round, state, racers } = setup();
  for (const [index, racer] of racers.entries()) {
    Object.assign(racer, {
      cannonStage: CANNON_STAGES, z: CANNON_FINISH_Z - 0.2,
      yaw: index === 0 ? Math.PI / 3 : 0,
    });
  }
  const winners = round.advance(state, racers, 0.05, () => ({ w: true }));
  assert.deepEqual(winners, [racers[1]]);
});

test("rival steers from an offset landing into the cannon and over the finish", () => {
  for (const stage of [1, CANNON_STAGES]) {
    for (const offset of [-3, 3]) {
      const { round, state, racers } = setup();
      const racer = racers[0];
      Object.assign(racer, {
        cannonStage: stage, x: racer.cannonLane + offset,
        z: stage * CANNON_SPACING - 2, yaw: 0,
      });
      let winners = null;
      for (let i = 0; i < 400 && racer.cannonPhase === "walk" && !winners; i++) {
        winners = round.advance(state, racers, 0.05,
          current => current === racer ? round.chooseControls(state, racer, 0.05) : {});
      }
      if (stage === CANNON_STAGES) {
        assert.deepEqual(winners, [racer]);
        assert.ok(racer.z >= CANNON_FINISH_Z);
      } else assert.equal(racer.cannonPhase, "aim");
    }
  }
});