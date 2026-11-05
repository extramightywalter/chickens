import {
  BUTTON, FINISH_LANDING, LAN_BUTTON, LOBBY_SPAWN, R, RIVAL_SPEED, SPEED, START, TURN,
  TRACK_CHECKPOINT_RADIUS, checkpoints, isTrackSupported, lobbyWalls, touchesFinishLanding,
} from "./track.js";
import { MINIGAMES, arenaWalls, createPillowRound } from "./pillows.js";
import { DOORS_START, createDoorRound, gateWalls, lockedWalls, pathWalls } from "./doors.js";
import { createEggRound, eggWalls } from "./eggs.js";
import { battleWalls, createEggBattleRound } from "./egg-battle.js";
import { createMazeRound } from "./maze.js";

export const SPIN_DURATION = 2;
export const DIVE_DURATION = 0.8;
export const ABILITY_COOLDOWN = 3;
export const DIVE_SPEED_MULTIPLIER = 1.5;

export function updateAbilities(racer, dt, keys, previousKeys, active) {
  racer.spinCooldown = Math.max(0, racer.spinCooldown - dt);
  racer.diveCooldown = Math.max(0, racer.diveCooldown - dt);
  const spinPressed = keys.e === true;
  const divePressed = keys[" "] === true;
  if (active && spinPressed && !previousKeys.e && racer.spinCooldown === 0) {
    racer.spinTimer = SPIN_DURATION;
    racer.spinCooldown = ABILITY_COOLDOWN;
  }
  if (active && divePressed && !previousKeys.space && racer.diveCooldown === 0) {
    racer.diveTimer = DIVE_DURATION;
    racer.diveCooldown = ABILITY_COOLDOWN;
  }
  previousKeys.e = spinPressed;
  previousKeys.space = divePressed;
  racer.spinTimer = Math.max(0, racer.spinTimer - dt);
  racer.diveTimer = Math.max(0, racer.diveTimer - dt);
}

export function collide(px, pz, walls) {
  for (const wall of walls) {
    const cx = Math.max(wall.minX, Math.min(px, wall.maxX));
    const cz = Math.max(wall.minZ, Math.min(pz, wall.maxZ));
    const dx = px - cx, dz = pz - cz;
    const d = Math.hypot(dx, dz);
    if (d >= R) continue;
    if (d > 0) {
      px = cx + dx / d * R; pz = cz + dz / d * R;
    } else {
      const exits = [
        { distance: px - wall.minX, x: wall.minX - R, z: pz },
        { distance: wall.maxX - px, x: wall.maxX + R, z: pz },
        { distance: pz - wall.minZ, x: px, z: wall.minZ - R },
        { distance: wall.maxZ - pz, x: px, z: wall.maxZ + R },
      ];
      exits.sort((a, b) => a.distance - b.distance);
      px = exits[0].x; pz = exits[0].z;
    }
  }
  return [px, pz];
}

export function moveRacer(racer, dt, forward, turn, speed, walls) {
  racer.yaw += turn * TURN * dt;
  if (!forward) return;
  const distance = forward * speed * dt;
  [racer.x, racer.z] = collide(racer.x + Math.sin(racer.yaw) * distance, racer.z, walls);
  [racer.x, racer.z] = collide(racer.x, racer.z + Math.cos(racer.yaw) * distance, walls);
}

export function moveTrackRacer(racer, dt, forward, turn, speed) {
  racer.yaw += turn * TURN * dt;
  if (touchesFinishLanding(racer)) return true;
  if (!forward || dt === 0) return isTrackSupported(racer.x, racer.z);
  const distance = forward * speed * dt;
  const steps = Math.ceil(Math.abs(distance) / 0.2);
  const step = distance / steps;
  for (let index = 0; index < steps; index++) {
    racer.x += Math.sin(racer.yaw) * step;
    racer.z += Math.cos(racer.yaw) * step;
    if (touchesFinishLanding(racer)) return true;
    if (!isTrackSupported(racer.x, racer.z)) return false;
  }
  return true;
}

export function updateTrackProgress(racer, radius = TRACK_CHECKPOINT_RADIUS) {
  if (racer.nextCheckpoint === checkpoints.length - 1) {
    if (!touchesFinishLanding(racer)) return false;
    racer.laps++;
    return true;
  }
  const point = checkpoints[racer.nextCheckpoint];
  if (Math.hypot(racer.x - point.x, racer.z - point.z) > radius) return false;
  racer.nextCheckpoint++;
  return false;
}

export function createGame({ random = Math.random } = {}) {
  const state = {};
  const rival = {};
  const pillowRound = createPillowRound(random);
  const doorRound = createDoorRound(random);
  const eggRound = createEggRound();
  const battleRound = createEggBattleRound();
  const mazeRound = createMazeRound(random);
  let previousActionKeys = { e: false, space: false };
  let driver;

  function setScene(scene, spawn, yaw) {
    Object.assign(state, {
      scene, x: spawn.x, z: spawn.z, yaw,
      laps: 0, nextCheckpoint: 1, walk: 0,
      spinTimer: 0, diveTimer: 0, spinCooldown: 0, diveCooldown: 0,
      countdown: 0, goTimer: 0, playerWon: null,
      minigame: null, pillows: [], survivalTime: 0, hit: null, lives: 0, cannonYaws: [],
      doors: [], monster: null, caught: null,
      eggs: [], eggPits: [], eggTimeLeft: 0, carryingEggId: null, eggScore: 0,
      stunTimer: 0,
      battleEggs: [], jumpHeight: 0, jumpVelocity: 0, throwCooldown: 0,
      maze: null, mazeMonsters: [],
      multiplayer: false, racers: [], winnerIds: [], id: null, eliminated: false,
    });
    Object.assign(rival, {
      x: START.x + 1.6, z: START.z, yaw: Math.PI / 2,
      laps: 0, nextCheckpoint: 1, target: 1, walk: 0,
      spinTimer: 0, diveTimer: 0, spinCooldown: 0, diveCooldown: 0,
      controls: { forward: 1, turn: 0 }, intent: "race", lives: 0, eliminated: false,
      id: null, carryingEggId: null, eggScore: 0, stunTimer: 0,
      jumpHeight: 0, jumpVelocity: 0, throwCooldown: 0,
    });
    driver = { reaction: 0 };
    previousActionKeys = { e: false, space: false };
  }

  function nearButton() {
    return Math.hypot(state.x - BUTTON.x, state.z - BUTTON.z) < BUTTON.r + R + 1;
  }

  function nearLanButton() {
    return state.scene === "lobby" &&
      Math.hypot(state.x - LAN_BUTTON.x, state.z - LAN_BUTTON.z) < LAN_BUTTON.r + R + 0.5;
  }

  function returnToLan() {
    setScene("lobby", LAN_BUTTON, Math.PI);
  }

  function enterTrack() {
    setScene("countdown", { x: START.x - 1.6, z: START.z }, Math.PI / 2);
    state.minigame = "track";
    state.countdown = 3;
  }

  function enterPillows() {
    setScene("countdown", { x: -3, z: 0 }, Math.PI);
    state.minigame = "pillows";
    pillowRound.reset(state, rival);
    state.countdown = 3;
  }

  function enterDoors() {
    setScene("countdown", DOORS_START.player, 0);
    state.minigame = "doors";
    doorRound.reset(state, rival);
    state.countdown = 3;
  }

  function enterMinigame() {
    const selected = MINIGAMES[Math.floor(random() * MINIGAMES.length)];
    if (selected === "track") enterTrack();
    else if (selected === "pillows") enterPillows();
    else if (selected === "doors") enterDoors();
    else if (selected === "eggs") enterEggs();
    else if (selected === "maze") enterMaze();
    else enterEggBattle();
    return selected;
  }

  function enterEggs() {
    setScene("countdown", { x: 0, z: 0 }, 0);
    state.minigame = "eggs";
    state.id = "player";
    rival.id = "rival";
    eggRound.reset(state, [state, rival]);
    state.countdown = 3;
  }

  function enterEggBattle() {
    setScene("countdown", { x: 0, z: 0 }, 0);
    state.minigame = "egg-battle";
    state.id = "player";
    rival.id = "rival";
    battleRound.reset(state, [state, rival]);
    state.countdown = 3;
  }

  function enterMaze() {
    setScene("countdown", { x: 0, z: 0 }, 0);
    state.minigame = "maze";
    state.id = "player";
    rival.id = "rival";
    mazeRound.reset(state, [state, rival]);
    state.countdown = 3;
  }

  function reset() {
    setScene("lobby", LOBBY_SPAWN, Math.PI / 2);
  }

  function returnToButton() {
    setScene("lobby", BUTTON, Math.PI / 2);
  }

  function finishRace(playerWon) {
    state.scene = "finished";
    state.playerWon = playerWon;
  }

  function chooseRivalControls() {
    rival.target = rival.nextCheckpoint;
    const target = rival.nextCheckpoint === checkpoints.length - 1 ?
      FINISH_LANDING : checkpoints[rival.nextCheckpoint];
    const desiredYaw = Math.atan2(target.x - rival.x, target.z - rival.z);
    const error = Math.atan2(Math.sin(desiredYaw - rival.yaw), Math.cos(desiredYaw - rival.yaw));
    driver.reaction += 0.1 + random() * 0.06;
    rival.controls.turn = Math.abs(error) > TURN * 0.05 ? Math.sign(error) : 0;
    rival.controls.forward = Math.abs(error) > 1.3 && random() < 0.35 ? 0 : 1;
  }

  function moveRival(dt) {
    if (dt === 0) return;
    driver.reaction -= dt;
    if (driver.reaction <= 0) chooseRivalControls();
    if (!moveTrackRacer(rival, dt, rival.controls.forward, rival.controls.turn, RIVAL_SPEED)) {
      rival.eliminated = true;
      finishRace(true);
      return;
    }
    updateTrackProgress(rival, TRACK_CHECKPOINT_RADIUS + 1.5);
    if (rival.controls.forward) rival.walk += dt * 11;
  }

  function update(dt, elapsed = dt, keys = {}) {
    if (state.minigame === "maze") {
      if (state.scene === "finished") return { moving: false, dt: 0 };
      if (state.scene === "countdown") {
        state.countdown = Math.max(0, state.countdown - elapsed);
        if (state.countdown === 0) {
          state.scene = "maze";
          state.goTimer = 0.7;
        }
        return { moving: false, dt: 0 };
      }
      state.goTimer = Math.max(0, state.goTimer - elapsed);
      const forward = Number(Boolean(keys.w || keys.arrowup)) - Number(Boolean(keys.s || keys.arrowdown));
      const turn = Number(Boolean(keys.a || keys.arrowleft)) - Number(Boolean(keys.d || keys.arrowright));
      const winners = mazeRound.advance(state, [state, rival], dt, (racer, step) => {
        if (racer === rival) mazeRound.chooseControls(state, racer);
        else racer.controls = { forward, turn };
        moveRacer(racer, step, racer.controls.forward, racer.controls.turn, SPEED, state.maze.walls);
        racer.walk = racer.controls.forward ? racer.walk + step * 11 : 0;
      });
      if (winners) finishRace(winners[0] === state);
      return { moving: forward !== 0, dt };
    }
    if (["eggs", "egg-battle"].includes(state.minigame) && state.scene === "finished") return { moving: false, dt: 0 };
    let moving = false;
    const battle = state.minigame === "egg-battle";
    const previousBattle = [state, rival].map(({ x, z, jumpHeight }) => ({ x, z, jumpHeight }));
    const eggPressed = state.scene === "eggs" && keys.e === true && !previousActionKeys.e;
    if (state.scene === "eggs") dt = Math.min(dt, state.eggTimeLeft);
    const playerStunned = state.scene === "eggs" && state.stunTimer > 0;
    const rivalStunned = state.scene === "eggs" && rival.stunTimer > 0;
    if (state.scene === "eggs") eggRound.updateStuns([state, rival], dt);
    if (battle) battleRound.actions(state, state, dt, keys, previousActionKeys, state.scene === "egg-battle");
    else updateAbilities(state, dt, state.minigame === "eggs" ? { ...keys, e: false } : keys, previousActionKeys,
      (state.scene === "eggs" && !playerStunned) ||
      ["lobby", "track", "pillows", "doors"].includes(state.scene));
    if (state.minigame === "eggs") previousActionKeys.e = keys.e === true;
    if (state.scene === "countdown") {
      state.countdown = Math.max(0, state.countdown - elapsed);
      if (state.countdown === 0) {
        state.scene = state.minigame;
        state.goTimer = 0.7;
      }
      // Neither racer gets movement from time spent in the countdown.
      dt = 0;
    } else if (state.goTimer > 0) {
      state.goTimer = Math.max(0, state.goTimer - elapsed);
    }
    if (["lobby", "track", "pillows", "doors", "eggs", "egg-battle"].includes(state.scene)) {
      const turn = Number(Boolean(keys["a"] || keys["arrowleft"])) -
        Number(Boolean(keys["d"] || keys["arrowright"]));
      let fwd = 0;
      if (keys["w"] || keys["arrowup"]) fwd += 1;
      if (keys["s"] || keys["arrowdown"]) fwd -= 1;
      if (playerStunned) fwd = 0;
      else if (state.diveTimer > 0) fwd = Math.max(fwd, 1);
      moving = fwd !== 0;
      const speed = SPEED * (state.spinTimer > 0 ? 0.5 : 1) *
        (state.diveTimer > 0 ? DIVE_SPEED_MULTIPLIER : 1);
      const activeTurn = playerStunned ? 0 : turn;
      const walls = state.scene === "lobby" ? lobbyWalls :
        state.scene === "pillows" ? arenaWalls :
        state.scene === "doors" ? [...pathWalls, ...gateWalls, ...lockedWalls(state.doors, "player")] :
        state.scene === "eggs" ? eggWalls :
        battle ? battleWalls :
        [];
      const previousPlayer = { x: state.x, z: state.z };
      const previousRival = { x: rival.x, z: rival.z };
      if (state.scene === "track") {
        if (!moveTrackRacer(state, dt, fwd, activeTurn, speed)) {
          state.eliminated = true;
          finishRace(false);
        } else {
          updateTrackProgress(state);
        }
        if (state.scene === "track") moveRival(dt);
      } else {
        moveRacer(state, dt, fwd, activeTurn, speed, walls);
      }
      if (state.scene === "pillows") {
        pillowRound.chooseControls(state, rival, dt);
        moveRacer(rival, dt, rival.controls.forward, rival.controls.turn, SPEED, walls);
        rival.walk = rival.controls.forward ? rival.walk + dt * 11 : 0;
        pillowRound.update(state, rival, dt, previousPlayer, previousRival);
      } else if (state.scene === "doors") {
        doorRound.chooseControls(state, rival, dt);
        const rivalWalls = [...pathWalls, ...gateWalls, ...lockedWalls(state.doors, "rival")];
        moveRacer(rival, dt, rival.controls.forward, rival.controls.turn, SPEED, rivalWalls);
        rival.walk = rival.controls.forward ? rival.walk + dt * 11 : 0;
        doorRound.update(state, rival, dt);
      } else if (battle && dt > 0) {
        battleRound.chooseControls(state, rival, [state, rival]);
        battleRound.actions(state, rival, dt, {}, {}, true);
        moveRacer(rival, dt, rival.controls.forward, rival.controls.turn, SPEED, battleWalls);
        rival.walk = rival.controls.forward ? rival.walk + dt * 11 : 0;
        const winners = battleRound.update(state, [state, rival], dt, previousBattle);
        if (winners) finishRace(winners.length === 0 ? null : winners[0] === state);
      } else if (state.scene === "eggs" && dt > 0) {
        if (eggPressed && !playerStunned) eggRound.interact(state, state, [state, rival]);
        if (!rivalStunned) eggRound.chooseControls(state, rival, [state, rival]);
        else rival.controls = { forward: 0, turn: 0 };
        if (!rivalStunned) moveRacer(rival, dt, rival.controls.forward, rival.controls.turn, SPEED, eggWalls);
        rival.walk = rival.controls.forward ? rival.walk + dt * 11 : 0;
        eggRound.resolveDashCollisions([state, rival], [previousPlayer, previousRival]);
        const winners = eggRound.update(state, [state, rival], elapsed);
        if (winners) finishRace(winners.length === 2 ? null : winners[0] === state);
      }
      if (state.scene === "track") {
        const playerTouched = touchesFinishLanding(state);
        const rivalTouched = touchesFinishLanding(rival);
        if (playerTouched || rivalTouched) {
          finishRace(playerTouched === rivalTouched ? null : playerTouched);
        }
      }
    }
    state.walk = moving ? state.walk + dt * 11 : 0;
    return { moving, dt };
  }

  reset();
  return {
    state, rival, nearButton, nearLanButton, returnToLan, enterTrack, enterPillows, enterDoors, enterEggs, enterEggBattle, enterMaze, enterMinigame,
    reset, returnToButton, update,
  };
}
