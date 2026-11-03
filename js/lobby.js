import {
  BUTTON, LAN_BUTTON, LAPS_TO_WIN, LOBBY_SPAWN, R, RIVAL_SPEED, SPEED, START, TURN,
  TRACK_CHECKPOINT_RADIUS, checkpoints, isTrackSupported, lobbyWalls, touchesArchLanding,
} from "./track.js";
import { MINIGAMES, arenaWalls, createPillowRound } from "./pillows.js";
import { DOORS_START, createDoorRound, gateWalls, lockedWalls, pathWalls } from "./doors.js";

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
  if (!forward || dt === 0) return isTrackSupported(racer.x, racer.z);
  const distance = forward * speed * dt;
  const steps = Math.ceil(Math.abs(distance) / 0.2);
  const step = distance / steps;
  for (let index = 0; index < steps; index++) {
    racer.x += Math.sin(racer.yaw) * step;
    racer.z += Math.cos(racer.yaw) * step;
    if (!isTrackSupported(racer.x, racer.z)) return false;
  }
  return true;
}

export function createGame({ random = Math.random } = {}) {
  const state = {};
  const rival = {};
  const pillowRound = createPillowRound(random);
  const doorRound = createDoorRound(random);
  let driver;

  function setScene(scene, spawn, yaw) {
    Object.assign(state, {
      scene, x: spawn.x, z: spawn.z, yaw,
      laps: 0, nextCheckpoint: 1, walk: 0,
      countdown: 0, goTimer: 0, playerWon: null,
      minigame: null, pillows: [], survivalTime: 0, hit: null, lives: 0, cannonYaws: [],
      doors: [], monster: null, caught: null,
      multiplayer: false, racers: [], winnerIds: [], id: null, eliminated: false,
    });
    Object.assign(rival, {
      x: START.x + 1.6, z: START.z, yaw: Math.PI / 2,
      laps: 0, nextCheckpoint: 1, target: 1, walk: 0,
      controls: { forward: 1, turn: 0 }, intent: "race", lives: 0, eliminated: false,
    });
    driver = { reaction: 0 };
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
    else enterDoors();
    return selected;
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

  function updateLaps(racer, radius = TRACK_CHECKPOINT_RADIUS) {
    const point = checkpoints[racer.nextCheckpoint];
    if (Math.hypot(racer.x - point.x, racer.z - point.z) > radius) return;
    if (racer.nextCheckpoint === checkpoints.length - 1) {
      racer.laps++;
      if (racer.laps >= LAPS_TO_WIN) finishRace(racer === state);
      return;
    }
    racer.nextCheckpoint++;
  }

  function chooseRivalControls() {
    rival.target = rival.nextCheckpoint;
    const target = checkpoints[rival.nextCheckpoint];
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
    updateLaps(rival, TRACK_CHECKPOINT_RADIUS + 1.5);
    if (rival.controls.forward) rival.walk += dt * 11;
  }

  function update(dt, elapsed = dt, keys = {}) {
    let moving = false;
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
    if (["lobby", "track", "pillows", "doors"].includes(state.scene)) {
      const turn = Number(Boolean(keys["a"] || keys["arrowleft"])) -
        Number(Boolean(keys["d"] || keys["arrowright"]));
      let fwd = 0;
      if (keys["w"] || keys["arrowup"]) fwd += 1;
      if (keys["s"] || keys["arrowdown"]) fwd -= 1;
      moving = fwd !== 0;
      const walls = state.scene === "lobby" ? lobbyWalls :
        state.scene === "pillows" ? arenaWalls :
        state.scene === "doors" ? [...pathWalls, ...gateWalls, ...lockedWalls(state.doors, "player")] :
        [];
      const previousPlayer = { x: state.x, z: state.z };
      const previousRival = { x: rival.x, z: rival.z };
      if (state.scene === "track") {
        if (!moveTrackRacer(state, dt, fwd, turn, SPEED)) {
          state.eliminated = true;
          finishRace(false);
        } else updateLaps(state);
        if (state.scene === "track") moveRival(dt);
      } else {
        moveRacer(state, dt, fwd, turn, SPEED, walls);
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
      }
      if (state.scene === "track") {
        const playerTouched = touchesArchLanding(state);
        const rivalTouched = touchesArchLanding(rival);
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
    state, rival, nearButton, nearLanButton, returnToLan, enterTrack, enterPillows, enterDoors, enterMinigame,
    reset, returnToButton, update,
  };
}
