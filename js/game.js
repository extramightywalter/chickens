import {
  BUTTON, CELL, LAPS_TO_WIN, LOBBY_SPAWN, R, RIVAL_SPEED, SPEED, START, TURN,
  checkpoints, lobbyWalls, trackWalls,
} from "./track.js";

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

export function createGame() {
  const state = {};
  const rival = {};

  function setScene(scene, spawn, yaw) {
    Object.assign(state, {
      scene, x: spawn.x, z: spawn.z, yaw,
      laps: 0, nextCheckpoint: 1, walk: 0,
      countdown: 0, goTimer: 0, playerWon: null,
    });
    Object.assign(rival, {
      x: START.x + 1.6, z: START.z, yaw: Math.PI,
      laps: 0, nextCheckpoint: 1, target: 1, walk: 0,
    });
  }

  function nearButton() {
    return Math.hypot(state.x - BUTTON.x, state.z - BUTTON.z) < BUTTON.r + R + 1;
  }

  function enterTrack() {
    setScene("countdown", { x: START.x - 1.6, z: START.z }, Math.PI);
    state.countdown = 3;
  }

  function reset() {
    setScene("lobby", LOBBY_SPAWN, Math.PI / 2);
  }

  function finishRace(playerWon) {
    state.scene = "finished";
    state.playerWon = playerWon;
  }

  function updateLaps(racer, previousZ) {
    const point = checkpoints[racer.nextCheckpoint];
    if (Math.hypot(racer.x - point.x, racer.z - point.z) > CELL * 2) return;
    if (racer.nextCheckpoint === 0) {
      if (previousZ <= START.z || racer.z > START.z) return;
      racer.laps++;
      if (racer.laps === LAPS_TO_WIN) finishRace(racer === state);
    }
    racer.nextCheckpoint = (racer.nextCheckpoint + 1) % checkpoints.length;
  }

  function moveRival(dt) {
    const target = checkpoints[rival.target];
    const dx = target.x - rival.x, dz = target.z - rival.z;
    const distance = Math.hypot(dx, dz);
    const step = Math.min(RIVAL_SPEED * dt, distance);
    const previousZ = rival.z;
    if (distance > 0) {
      rival.yaw = Math.atan2(dx, dz);
      [rival.x, rival.z] = collide(
        rival.x + dx / distance * step, rival.z + dz / distance * step, trackWalls
      );
    }
    if (Math.hypot(target.x - rival.x, target.z - rival.z) < 0.001) {
      rival.target = (rival.target + 1) % checkpoints.length;
    }
    updateLaps(rival, previousZ);
    rival.walk += dt * 11;
  }

  function update(dt, elapsed = dt, keys = {}) {
    let moving = false;
    const previousZ = state.z;
    if (state.scene === "countdown") {
      state.countdown = Math.max(0, state.countdown - elapsed);
      if (state.countdown === 0) {
        state.scene = "track";
        state.goTimer = 0.7;
      }
      // Neither racer gets movement from time spent in the countdown.
      dt = 0;
    } else if (state.goTimer > 0) {
      state.goTimer = Math.max(0, state.goTimer - elapsed);
    }
    if (state.scene === "lobby" || state.scene === "track") {
      if (keys["a"] || keys["arrowleft"]) state.yaw += TURN * dt;
      if (keys["d"] || keys["arrowright"]) state.yaw -= TURN * dt;
      let fwd = 0;
      if (keys["w"] || keys["arrowup"]) fwd += 1;
      if (keys["s"] || keys["arrowdown"]) fwd -= 1;
      if (fwd) {
        moving = true;
        const walls = state.scene === "lobby" ? lobbyWalls : trackWalls;
        const dx = Math.sin(state.yaw) * fwd * SPEED * dt;
        const dz = Math.cos(state.yaw) * fwd * SPEED * dt;
        [state.x, state.z] = collide(state.x + dx, state.z, walls);
        [state.x, state.z] = collide(state.x, state.z + dz, walls);
      }
      if (state.scene === "track") {
        updateLaps(state, previousZ);
        if (state.scene === "track") moveRival(dt);
      }
    }
    state.walk = moving ? state.walk + dt * 11 : 0;
    return { moving, dt };
  }

  reset();
  return { state, rival, nearButton, enterTrack, reset, update };
}
