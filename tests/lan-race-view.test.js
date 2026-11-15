import assert from "node:assert/strict";
import test from "node:test";
import { createLanRaceView } from "../js/lan-race-view.js";
import { DIVE_DURATION, SPIN_DURATION } from "../js/lobby.js";

function racer(id, x = 0, changes = {}) {
  return {
    id, x, z: 0, yaw: 0, walk: 0, spinTimer: 0, diveTimer: 0,
    controls: { forward: 1, turn: 0 }, eliminated: false,
    ...changes,
  };
}

test("LAN race interpolates every player at render frequency without changing snapshots", () => {
  const view = createLanRaceView();
  const snapshots = Array.from({ length: 21 }, (_, tick) =>
    Array.from({ length: 8 }, (_, index) => racer(`p${index}`, index * 2 + tick * 0.4, {
      z: tick * 0.2, yaw: tick * 0.1, walk: tick * 0.55,
    })));
  const original = structuredClone(snapshots);
  let tick = 0;
  const frames = [];
  for (let now = 0; now <= 1000; now += 10) {
    while (tick < snapshots.length && tick * 50 <= now) {
      view.push(snapshots[tick], tick * 50);
      tick++;
    }
    if (now >= 150) frames.push(view.sample(now));
  }
  for (let frame = 1; frame < frames.length; frame++) {
    for (let player = 0; player < 8; player++) {
      const before = frames[frame - 1][player], after = frames[frame][player];
      assert.ok(Math.abs(after.x - before.x - 0.08) < 1e-10);
      assert.ok(Math.abs(after.z - before.z - 0.04) < 1e-10);
      assert.ok(Math.abs(after.yaw - before.yaw - 0.02) < 1e-10);
      assert.ok(Math.abs(after.walk - before.walk - 0.11) < 1e-10);
    }
  }
  assert.deepEqual(snapshots, original);
});

test("moderate arrival jitter does not freeze players between 20 Hz updates", () => {
  const view = createLanRaceView();
  const arrivals = [0, 55, 95, 160, 195, 250, 310, 345, 405, 450, 510, 555, 600];
  let tick = 0, previous = null;
  for (let now = 0; now <= 600; now += 10) {
    while (tick < arrivals.length && arrivals[tick] <= now) {
      view.push([racer("local", tick * 0.4), racer("opponent", tick * 0.4 + 5)], arrivals[tick]);
      tick++;
    }
    const sample = view.sample(now);
    if (now >= 150 && previous) {
      const step = sample[0].x - previous[0].x;
      assert.ok(step > 0 && step < 0.12, `unexpected 10 ms movement: ${step}`);
      assert.ok(Math.abs(sample[1].x - sample[0].x - 5) < 1e-10);
    }
    previous = sample;
  }
});

test("first snapshot, stalls, elimination, and new rounds stay bounded by authoritative positions", () => {
  const view = createLanRaceView();
  assert.equal(view.sample(0), null);
  const first = [racer("p1")], last = [racer("p1", 0.4, { eliminated: true })];
  view.push(first, 0);
  assert.deepEqual(view.sample(0), first);
  view.push(last, 50);
  const middle = view.sample(125)[0];
  assert.equal(middle.x, 0.2);
  assert.equal(middle.eliminated, false);
  assert.deepEqual(view.sample(150), last);
  assert.deepEqual(view.sample(5000), last, "never extrapolate beyond the last server position");
  view.reset();
  assert.equal(view.sample(5000), null);
  const newRound = [racer("p2", 100)];
  view.push(newRound, 5010);
  assert.deepEqual(view.sample(5010), newRound);
});

test("angles and stopped walk animation do not rewind through full rotations", () => {
  const view = createLanRaceView();
  view.push([racer("p1", 0, { yaw: Math.PI * 2 - 0.1, walk: Math.PI * 20 - 0.1 })], 0);
  view.push([racer("p1", 0, { yaw: 0.1, walk: 0 })], 50);
  const middle = view.sample(125)[0];
  assert.ok(Math.abs(middle.yaw - Math.PI * 2) < 1e-10);
  assert.ok(Math.abs(middle.walk - (Math.PI * 20 - 0.05)) < 1e-10);
});

test("ability animations interpolate smoothly at activation and expiry", () => {
  const view = createLanRaceView();
  view.push([racer("p1")], 0);
  view.push([racer("p1", 0, { spinTimer: SPIN_DURATION - 0.05, diveTimer: DIVE_DURATION - 0.05 })], 50);
  const middle = view.sample(125)[0];
  assert.equal(middle.spinTimer, SPIN_DURATION - 0.025);
  assert.equal(middle.diveTimer, DIVE_DURATION - 0.025);
  view.reset();
  view.push([racer("p1", 0, { spinTimer: 0.04, diveTimer: 0.04 })], 0);
  view.push([racer("p1")], 50);
  assert.equal(view.sample(125)[0].spinTimer, 0.02);
  assert.equal(view.sample(125)[0].diveTimer, 0.02);
});

test("snapshot bursts and player ordering are matched by ID", () => {
  const view = createLanRaceView();
  view.push([racer("local"), racer("other", 5)], 0);
  view.push([racer("other", 5.4), racer("local", 0.4)], 50);
  view.push([racer("other", 5.8), racer("local", 0.8)], 50);
  const middle = view.sample(125);
  assert.equal(middle.find(player => player.id === "local").x, 0.2);
  assert.equal(middle.find(player => player.id === "other").x, 5.2);
  assert.equal(view.sample(150).find(player => player.id === "local").x, 0.8);
});
