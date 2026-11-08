import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import {
  BLASTER_HP, BULLET_SPEED, EYE_HEIGHT, FIRE_INTERVAL, createGunRound,
  gunArena, gunFloorHeight, parseGunArena,
} from "../js/gun-arena.js";
import { createGame, moveGunRacer, moveRacer } from "../js/lobby.js";
import { createLanGame } from "../js/lan-game.js";
import { R, SPEED } from "../js/track.js";
import { mazeClearFraction } from "../js/maze.js";

function lan(count = 2) {
  const game = createLanGame("gun-arena", Array.from({ length: count }, (_, n) => `p${n}`));
  game.update(3);
  return game;
}

function lineUp(game) {
  Object.assign(game.racers[0], { x: -16, z: -20, yaw: 0, pitch: 0 });
  Object.assign(game.racers[1], { x: -16, z: -16, yaw: Math.PI, pitch: 0 });
}

test("the supplied Asset Forge layout supplies floor, cover, colors and all five vents", async () => {
  const source = await readFile(new URL("../assets/models/gun arina.model", import.meta.url), "utf8");
  assert.deepEqual(parseGunArena(source), gunArena);
  assert.equal(gunArena.pieces.length, 791);
  assert.equal(gunArena.vents.length, 5);
  assert.ok(gunArena.walls.some(wall => wall.type === "hull_body"));
  assert.ok(gunArena.walls.some(wall => wall.maxY > 10));
  assert.throws(() => parseGunArena("not an arena"), /no floor/);
  assert.equal(mazeClearFraction(gunArena.walls, { x: -16, z: -20 }, { x: -16, z: -12 }, R), 1);
});

test("solo and 2-8 player LAN rounds spawn armed, separated chickens with exactly 30 HP", () => {
  const solo = createGame();
  solo.enterGunArena();
  assert.equal(solo.state.minigame, "gun-arena");
  assert.equal(solo.state.scene, "countdown");
  assert.equal(BLASTER_HP, 30);
  assert.equal(solo.state.lives, 30);
  assert.equal(solo.rival.lives, 30);
  for (let count = 2; count <= 8; count++) {
    const game = lan(count);
    assert.equal(game.racers.length, count);
    for (const racer of game.racers) {
      assert.equal(racer.lives, 30);
      assert.equal(racer.eliminated, false);
      assert.equal(racer.fireCooldown, 0);
      assert.equal(racer.shotsFired, 0);
      assert.equal(gunFloorHeight(racer.x, racer.z), 0);
      for (const wall of gunArena.walls) {
        assert.ok(Math.hypot(
          racer.x - Math.max(wall.minX, Math.min(racer.x, wall.maxX)),
          racer.z - Math.max(wall.minZ, Math.min(racer.z, wall.maxZ))) >= R);
      }
      for (const other of game.racers.filter(other => other !== racer)) {
        assert.ok(Math.hypot(racer.x - other.x, racer.z - other.z) > R * 2);
      }
    }
  }
});

test("countdown freezes movement, aiming, firing and health in solo and LAN", () => {
  const keys = { w: true, a: true, fire: true, " ": true, aimYaw: 1, aimPitch: 0.5 };
  const game = createLanGame("gun-arena", ["p0", "p1"]);
  const before = structuredClone(game.racers);
  game.update(3, new Map([["p0", keys]]));
  assert.deepEqual(game.racers, before);
  assert.deepEqual(game.state.bullets, []);
  const solo = createGame();
  solo.enterGunArena();
  const position = { x: solo.state.x, z: solo.state.z, yaw: solo.state.yaw };
  solo.update(0.05, 3, keys);
  assert.deepEqual({ x: solo.state.x, z: solo.state.z, yaw: solo.state.yaw }, position);
  assert.deepEqual(solo.state.bullets, []);
});

test("bullets fire from eye level in the aimed direction and do not damage their owner", () => {
  const game = lan();
  lineUp(game);
  game.update(0.01, new Map([["p0", { fire: true }]]));
  const bullet = game.state.bullets[0];
  assert.equal(bullet.ownerId, "p0");
  assert.equal(bullet.y, EYE_HEIGHT);
  assert.equal(bullet.vz, BULLET_SPEED);
  assert.equal(bullet.vx, 0);
  assert.equal(game.racers[0].lives, 30);
  assert.equal(game.racers[0].diveTimer, 0);
});

test("each bullet causes one damage; only the 30th hit eliminates and the last survivor wins", () => {
  const game = lan();
  lineUp(game);
  const [shooter, target] = game.racers;
  for (let n = 1; n <= 30; n++) {
    shooter.fireCooldown = 0;
    game.update(0.12, new Map([["p0", { " ": true }]]));
    assert.equal(target.lives, 30 - n);
    assert.equal(target.eliminated, n === 30);
    assert.equal(shooter.lives, 30);
    assert.equal(game.state.scene, n === 30 ? "finished" : "gun-arena");
    assert.equal(game.state.bullets.length, 0);
  }
  assert.equal(game.state.scene, "finished");
  assert.deepEqual(game.state.winnerIds, ["p0"]);
  const frozen = JSON.stringify([game.state, game.racers]);
  game.update(10, new Map([["p1", { fire: true, w: true }]]));
  assert.equal(JSON.stringify([game.state, game.racers]), frozen);
});

test("holding fire respects its exact cooldown and bullets cannot hit multiple chickens", () => {
  const game = lan(3);
  lineUp(game);
  Object.assign(game.racers[2], { x: -16, z: -13 });
  game.update(FIRE_INTERVAL * 2 + 0.01, new Map([["p0", { fire: true }]]));
  assert.equal(game.racers[0].shotsFired, 3);
  assert.equal(game.racers[2].lives, 30);
  assert.equal(game.racers[1].lives, 28, "third bullet has not reached the nearest target yet");
  game.update(0.12);
  assert.equal(game.racers[1].lives, 27);
  assert.equal(game.racers[1].eliminated, false);
  game.racers[1].lives = 1;
  game.racers[0].fireCooldown = 0;
  game.update(0.12, new Map([["p0", { fire: true }]]));
  assert.equal(game.racers[1].eliminated, true);
  assert.equal(game.state.scene, "gun-arena", "two survivors must continue playing");
  const eliminated = structuredClone(game.racers[1]);
  game.update(0.1, new Map([["p1", { fire: true, w: true, a: true }]]));
  assert.deepEqual(game.racers[1], eliminated);
});

test("simultaneous final bullets draw, independent of player ordering", () => {
  for (const reverse of [false, true]) {
    const game = lan();
    lineUp(game);
    if (reverse) game.racers.reverse();
    game.racers.forEach(racer => { racer.lives = 1; });
    game.update(0.2, new Map(game.racers.map(racer => [racer.id, { fire: true }])));
    assert.equal(game.state.scene, "finished");
    assert.deepEqual(game.state.winnerIds, []);
    assert.ok(game.racers.every(racer => racer.eliminated));
  }
});

test("cover blocks bullets before a chicken behind it, including long update intervals", () => {
  const game = lan();
  Object.assign(game.racers[0], { x: -12, z: -8, yaw: Math.PI / 2 });
  Object.assign(game.racers[1], { x: -4, z: -8 });
  game.update(0.01, new Map([["p0", { fire: true }]]));
  game.update(0.5);
  assert.equal(game.racers[1].lives, 30);
  assert.equal(game.state.bullets.length, 0);
});

test("raised structures cannot be entered or climbed and normal movement speed is preserved", () => {
  const game = lan();
  Object.assign(game.racers[0], { x: -12, z: -8, yaw: Math.PI / 2 });
  game.update(2, new Map([["p0", { w: true, e: true }]]));
  assert.ok(game.racers[0].x <= -9 - R + 1e-8);
  assert.equal(game.racers[0].spinTimer, 0);
  assert.equal(game.racers[0].diveTimer, 0);
  lineUp(game);
  game.update(0.1, new Map([["p0", { w: true }]]));
  assert.ok(Math.abs(game.racers[0].z - (-20 + SPEED * 0.1)) < 1e-8);
});

test("all five vents remain traversable low steps instead of raised blockers", () => {
  for (const vent of gunArena.vents) {
    const racer = { x: vent.x, z: vent.z, yaw: 0 };
    assert.equal(gunFloorHeight(racer.x, racer.z), 0.32);
    moveGunRacer(racer, 0.05, 1, 0, SPEED, gunArena.walls);
    assert.ok(Math.abs(racer.z - vent.z - SPEED * 0.05) < 1e-8);
    assert.equal(racer.x, vent.x);
  }
});

test("A/D and Left/Right strafe in matching directions without turning", () => {
  const game = lan();
  lineUp(game);
  game.update(0.1, new Map([["p0", { aimYaw: 0.2, aimPitch: 10 }]]));
  assert.ok(Math.abs(game.racers[0].yaw - 0.2) < 1e-8);
  assert.equal(game.racers[0].pitch, 1.1);
  game.update(0.1, new Map([["p0", { aimYaw: NaN, aimPitch: Infinity }]]));
  assert.ok(Number.isFinite(game.racers[0].yaw));
  assert.ok(Number.isFinite(game.racers[0].pitch));
  for (const [key, direction] of [["a", -1], ["arrowleft", -1], ["d", 1], ["arrowright", 1]]) {
    for (const yaw of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
      const round = lan();
      lineUp(round);
      round.racers[0].yaw = yaw;
      round.update(0.1, new Map([["p0", { [key]: true }]]));
      const dx = round.racers[0].x + 16, dz = round.racers[0].z + 20;
      const screenRight = -dx * Math.cos(yaw) + dz * Math.sin(yaw);
      assert.ok(Math.abs(screenRight - direction * SPEED * 0.1) < 1e-8,
        `${key} must strafe in the camera-relative direction at yaw ${yaw}`);
      assert.ok(Math.abs(dx * Math.sin(yaw) + dz * Math.cos(yaw)) < 1e-8);
      assert.equal(round.racers[0].yaw, yaw, `${key} must not change aim`);
      assert.equal(round.racers[0].controls.strafe, direction, `${key} LAN strafe control`);
    }
  }
});

test("aiming above a chicken misses, and missed bullets expire", () => {
  const game = lan();
  lineUp(game);
  game.update(0.01, new Map([["p0", { fire: true, aimPitch: 0.9 }]]));
  game.update(2.1);
  assert.equal(game.racers[1].lives, 30);
  assert.equal(game.state.bullets.length, 0);
});

test("solo rival navigates cover and can win against an idle player", () => {
  let seed = 1;
  const game = createGame({ random: () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  } });
  game.enterGunArena();
  game.update(0.05, 3);
  for (let n = 0; n < 3600 && game.state.scene !== "finished"; n++) game.update(0.05);
  assert.equal(game.state.scene, "finished");
  assert.equal(game.state.playerWon, false);
  assert.equal(game.state.lives, 0);
  assert.ok(game.rival.shotsFired > 30, "the rival must miss some shots");
  assert.equal(game.rival.eliminated, false);
  game.returnToButton();
  assert.equal(game.state.scene, "lobby");
  assert.deepEqual(game.state.bullets, []);
  game.enterGunArena();
  assert.equal(game.state.lives, 30);
  assert.equal(game.rival.shotsFired, 0);
});

test("rival spread causes frequent misses without changing human aim or fire rate", () => {
  let seed = 7;
  const round = createGunRound(() => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  });
  const state = {};
  const racers = [{ id: "human" }, { id: "rival" }];
  round.reset(state, racers);
  const [human, rival] = racers;
  Object.assign(human, { x: -16, z: -20, yaw: 0 });
  Object.assign(rival, { x: -16, z: -12, yaw: Math.PI });
  round.chooseControls(rival, racers, 0.01);
  let hits = 0;
  const angles = [];
  for (let n = 0; n < 100; n++) {
    rival.fireCooldown = 0;
    round.fire(state, rival);
    const bullet = state.bullets.at(-1);
    const time = (human.z - bullet.z) / bullet.vz;
    const x = bullet.x + bullet.vx * time;
    const y = bullet.y + bullet.vy * time;
    if (Math.abs(x - human.x) < R + 0.08 && y >= 0 && y <= 1.9) hits++;
    angles.push(Math.atan2(bullet.vx, -bullet.vz));
    assert.ok(Math.abs(angles.at(-1)) <= 0.2);
    assert.equal(rival.fireCooldown, FIRE_INTERVAL);
    round.fire(state, rival);
    assert.equal(rival.shotsFired, n + 1, "spread does not bypass the cooldown");
    state.bullets = [];
  }
  assert.ok(hits >= 15 && hits <= 65, `expected frequent but not guaranteed misses; hit ${hits}/100`);
  assert.ok(angles.some(angle => angle < -0.1) && angles.some(angle => angle > 0.1));
  round.fire(state, human);
  const bullet = state.bullets.at(-1);
  assert.equal(bullet.vx, 0);
  assert.equal(bullet.vz, BULLET_SPEED);
  assert.equal(bullet.vy, 0);
  assert.equal(rival.yaw, Math.PI, "spread does not change navigation heading");
});

test("moving targets are swept and cannot be skipped by a fast bullet", () => {
  const round = createGunRound();
  const state = {};
  const racers = [{ id: "a" }, { id: "b" }];
  round.reset(state, racers);
  Object.assign(racers[0], { x: -16, z: -20, yaw: 0 });
  Object.assign(racers[1], { x: -17, z: -16, yaw: Math.PI / 2 });
  round.fire(state, racers[0]);
  round.advance(state, racers, 0.2, racer => racer.id === "b" ? { w: true } : {}, moveGunRacer);
  assert.equal(racers[1].lives, 29);
});
