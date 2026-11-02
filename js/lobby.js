import {
  BUTTON, CELL, LAPS_TO_WIN, LOBBY_SPAWN, R, RIVAL_SPEED, SPEED, START, TURN,
  checkpoints, lobbyDoors, lobbyWalls, trackWalls,
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

function moveRacer(racer, dt, forward, turn, speed, walls) {
  racer.yaw += turn * TURN * dt;
  if (!forward) return;
  const distance = forward * speed * dt;
  [racer.x, racer.z] = collide(racer.x + Math.sin(racer.yaw) * distance, racer.z, walls);
  [racer.x, racer.z] = collide(racer.x, racer.z + Math.cos(racer.yaw) * distance, walls);
}

export function createGame({ random = Math.random } = {}) {
  const state = {};
  const rival = {};
  let driver;

  function setScene(scene, spawn, yaw) {
    Object.assign(state, {
      scene, x: spawn.x, z: spawn.z, yaw,
      laps: 0, nextCheckpoint: 1, walk: 0,
      countdown: 0, goTimer: 0, playerWon: null, openDoors: [],
    });
    Object.assign(rival, {
      x: START.x + 1.6, z: START.z, yaw: Math.PI,
      laps: 0, nextCheckpoint: 1, target: 1, walk: 0,
      controls: { forward: 1, turn: 0 }, intent: "race",
    });
    driver = {
      reaction: 0, line: 0, lane: 0, laneTimer: 0,
      lap: 0, lookAhead: 4, mistakeIn: 7 + random() * 6,
      mistake: 0, mistakeSide: 0,
    };
  }

  function nearButton() {
    return Math.hypot(state.x - BUTTON.x, state.z - BUTTON.z) < BUTTON.r + R + 1;
  }

  function nearDoor() {
    return state.scene === "lobby" && lobbyDoors.some(door =>
      !state.openDoors.includes(door.id) &&
      Math.hypot(state.x - door.x, state.z - door.z) < 2.8
    );
  }

  function openDoor() {
    const door = lobbyDoors.find(({ id, x, z }) =>
      !state.openDoors.includes(id) && Math.hypot(state.x - x, state.z - z) < 2.8
    );
    if (!door || state.scene !== "lobby") return false;
    state.openDoors.push(door.id);
    return true;
  }

  function lobbyCollisionWalls() {
    return [
      ...lobbyWalls,
      ...lobbyDoors.filter(({ id }) => !state.openDoors.includes(id)).map(({ wall }) => wall),
    ];
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

  function chooseRivalControls() {
    const lookAhead = driver.lookAhead - (driver.mistake > 0 ? 0.8 : 0);
    let target = checkpoints[rival.target];
    let previous = checkpoints[(rival.target + checkpoints.length - 1) % checkpoints.length];
    let dx = target.x - previous.x, dz = target.z - previous.z;
    let length = Math.hypot(dx, dz);
    let along = ((rival.x - previous.x) * dx + (rival.z - previous.z) * dz) / length;
    if (along >= length || Math.hypot(target.x - rival.x, target.z - rival.z) < lookAhead * 0.6) {
      rival.target = (rival.target + 1) % checkpoints.length;
      previous = target;
      target = checkpoints[rival.target];
      dx = target.x - previous.x;
      dz = target.z - previous.z;
      length = Math.hypot(dx, dz);
      along = ((rival.x - previous.x) * dx + (rival.z - previous.z) * dz) / length;
    }

    // Aim ahead along the course so steering starts before a corner.
    let ahead = Math.max(0, Math.min(length, along)) + lookAhead;
    if (ahead > length) {
      ahead -= length;
      previous = target;
      target = checkpoints[(rival.target + 1) % checkpoints.length];
      dx = target.x - previous.x;
      dz = target.z - previous.z;
      length = Math.hypot(dx, dz);
    }
    let lane = driver.line + (driver.mistake > 0 ? driver.mistakeSide * 0.5 : 0);
    const playerX = state.x - rival.x, playerZ = state.z - rival.z;
    const playerAhead = (playerX * dx + playerZ * dz) / length;
    const playerSide = (playerX * dz - playerZ * dx) / length;
    const rivalLane = ((rival.x - previous.x) * dz - (rival.z - previous.z) * dx) / length;
    const sameDirection = Math.sin(state.yaw) * dx / length + Math.cos(state.yaw) * dz / length > 0.5;
    rival.intent = "race";
    if (sameDirection && Math.abs(playerSide) < 2.5 && Math.hypot(playerX, playerZ) < 8) {
      if (playerAhead >= -1.5) {
        rival.intent = playerAhead < 2 ? "dodge" : "pass";
        lane = rivalLane + playerSide > 0 ? -1.15 : 1.15;
      } else {
        rival.intent = "defend";
        lane = Math.max(-0.9, Math.min(0.9, rivalLane + playerSide));
      }
    }
    const laneStep = rival.intent === "dodge" ? 0.6 : 0.35;
    driver.lane += Math.max(-laneStep, Math.min(laneStep, lane - driver.lane));
    const laneOffset = driver.lane;
    const aimX = previous.x + dx / length * ahead + dz / length * laneOffset;
    const aimZ = previous.z + dz / length * ahead - dx / length * laneOffset;
    const desiredYaw = Math.atan2(aimX - rival.x, aimZ - rival.z);
    const error = Math.atan2(Math.sin(desiredYaw - rival.yaw), Math.cos(desiredYaw - rival.yaw));
    // Hold actual key-like inputs between reactions instead of steering perfectly every frame.
    driver.reaction += 0.1 + random() * 0.06;
    const deadZone = TURN * 0.05;
    rival.controls.turn = Math.abs(error) > deadZone ? Math.sign(error) : 0;
    const liftForTurn = Math.abs(error) > 0.8 && random() < 0.45;
    rival.controls.forward = liftForTurn || random() < 0.025 ? 0 : 1;
  }

  function moveRival(dt) {
    if (dt === 0) return;
    driver.reaction -= dt;
    driver.laneTimer -= dt;
    driver.mistakeIn -= dt;
    driver.mistake = Math.max(0, driver.mistake - dt);
    if (driver.laneTimer <= 0 || driver.lap !== rival.laps) {
      driver.line = (random() - 0.5) * 1.4;
      driver.laneTimer = 2 + random() * 3;
      if (driver.lap !== rival.laps) {
        driver.lap = rival.laps;
        driver.lookAhead = 3.8 + random() * 0.6;
      }
    }
    const corner = checkpoints[rival.target];
    if (driver.mistakeIn <= 0 && Math.hypot(corner.x - rival.x, corner.z - rival.z) < 5) {
      driver.mistake = 0.35 + random() * 0.2;
      driver.mistakeSide = random() < 0.5 ? -1 : 1;
      driver.mistakeIn = 7 + random() * 6;
    }
    if (driver.reaction <= 0) chooseRivalControls();
    const previousZ = rival.z;
    moveRacer(rival, dt, rival.controls.forward, rival.controls.turn, RIVAL_SPEED, trackWalls);
    updateLaps(rival, previousZ);
    if (rival.controls.forward) rival.walk += dt * 11;
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
      const turn = Number(Boolean(keys["a"] || keys["arrowleft"])) -
        Number(Boolean(keys["d"] || keys["arrowright"]));
      let fwd = 0;
      if (keys["w"] || keys["arrowup"]) fwd += 1;
      if (keys["s"] || keys["arrowdown"]) fwd -= 1;
      moving = fwd !== 0;
      const walls = state.scene === "lobby" ? lobbyCollisionWalls() : trackWalls;
      moveRacer(state, dt, fwd, turn, SPEED, walls);
      if (state.scene === "track") {
        updateLaps(state, previousZ);
        if (state.scene === "track") moveRival(dt);
      }
    }
    state.walk = moving ? state.walk + dt * 11 : 0;
    return { moving, dt };
  }

  reset();
  return { state, rival, nearButton, nearDoor, openDoor, enterTrack, reset, update };
}
