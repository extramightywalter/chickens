import {
  createGame, DIVE_SPEED_MULTIPLIER, moveRacer, moveTrackRacer, updateAbilities,
  updateTrackProgress,
} from "./lobby.js";
import {
  LAPS_TO_WIN, SPEED, START, checkpoints, touchesFinishLanding,
} from "./track.js";
import { PILLOW_LIVES, arenaWalls, createPillowRound } from "./pillows.js";
import { FINISH_Z, createDoorRound, gateWalls, lockedWalls, pathWalls } from "./doors.js";
import { createEggRound, eggWalls } from "./eggs.js";

export function createLanGame(minigame, playerIds, random = Math.random) {
  const game = createGame({ random });
  if (minigame === "track") game.enterTrack();
  else if (minigame === "pillows") game.enterPillows();
  else if (minigame === "doors") game.enterDoors();
  else if (minigame === "eggs") game.enterEggs();
  else throw new Error("Unknown minigame");
  if (playerIds.length < 2 || playerIds.length > 8 || new Set(playerIds).size !== playerIds.length) {
    throw new Error("LAN games require 2-8 distinct players");
  }
  const state = game.state;
  state.multiplayer = true;
  state.winnerIds = [];
  const pillowRound = createPillowRound(random);
  const doorRound = createDoorRound(random);
  const eggRound = createEggRound();
  const previousActionKeys = new Map();
  if (minigame === "pillows") pillowRound.reset(state, game.rival);
  if (minigame === "doors") doorRound.reset(state, game.rival);
  const racers = playerIds.map((id, index) => {
    const lane = index % 2 === 0 ? -1.6 : 1.6;
    const row = Math.floor(index / 2);
    return {
      id, number: index + 1,
      x: minigame === "track" ? START.x + lane :
        minigame === "doors" ? lane : Math.sin(index / playerIds.length * Math.PI * 2) * 5,
      z: minigame === "track" ? START.z + row * 2 :
        minigame === "doors" ? -row * 2 :
          Math.cos(index / playerIds.length * Math.PI * 2) * 5,
      yaw: minigame === "track" ? Math.PI / 2 : minigame === "doors" ? 0 : Math.PI,
      laps: 0, nextCheckpoint: 1, walk: 0, lives: PILLOW_LIVES,
      spinTimer: 0, diveTimer: 0, spinCooldown: 0, diveCooldown: 0,
      eliminated: false, doorTeam: index % 2,
      controls: { forward: 0, turn: 0 },
    };
  });
  if (minigame === "eggs") eggRound.reset(state, racers);
  for (const racer of racers) previousActionKeys.set(racer.id, { e: false, space: false });

  function finish(winners) {
    state.scene = "finished";
    state.winnerIds = winners.map(racer => racer.id);
  }

  function update(dt, inputs = new Map()) {
    if (state.scene === "finished") return;
    if (state.scene === "countdown") {
      for (const racer of racers) {
        updateAbilities(racer, 0, inputs.get(racer.id) ?? {},
          previousActionKeys.get(racer.id), false);
      }
      state.countdown = Math.max(0, state.countdown - dt);
      if (state.countdown === 0) {
        state.scene = minigame;
        state.goTimer = 0.7;
      }
      return;
    }
    state.goTimer = Math.max(0, state.goTimer - dt);
    if (minigame === "eggs") dt = Math.min(dt, state.eggTimeLeft);
    const previous = racers.map(({ x, z }) => ({ x, z }));
    for (const [index, racer] of racers.entries()) {
      const keys = inputs.get(racer.id) ?? {};
      const previousKeys = previousActionKeys.get(racer.id);
      const eggPressed = minigame === "eggs" && keys.e === true && !previousKeys.e;
      updateAbilities(racer, dt, minigame === "eggs" ? { ...keys, e: false } : keys,
        previousKeys, !racer.eliminated);
      if (minigame === "eggs") previousKeys.e = keys.e === true;
      if (racer.eliminated) continue;
      const forward = Number(Boolean(keys.w || keys.arrowup)) -
        Number(Boolean(keys.s || keys.arrowdown));
      const turn = Number(Boolean(keys.a || keys.arrowleft)) -
        Number(Boolean(keys.d || keys.arrowright));
      const movement = racer.diveTimer > 0 ? Math.max(forward, 1) : forward;
      const speed = SPEED * (racer.spinTimer > 0 ? 0.5 : 1) *
        (racer.diveTimer > 0 ? DIVE_SPEED_MULTIPLIER : 1);
      racer.controls = { forward: movement, turn };
      const walls = minigame === "pillows" ? arenaWalls :
        minigame === "eggs" ? eggWalls :
        [...pathWalls, ...gateWalls, ...lockedWalls(state.doors, racer.doorTeam)];
      const onTrack = minigame === "track" ?
        moveTrackRacer(racer, dt, movement, turn, speed) : true;
      if (minigame === "track" && !onTrack) {
        racer.eliminated = true;
        continue;
      }
      if (minigame !== "track") moveRacer(racer, dt, movement, turn, speed, walls);
      if (eggPressed) eggRound.interact(state, racer);
      racer.walk = movement ? racer.walk + dt * 11 : 0;
      if (minigame === "track") updateTrackProgress(racer);
    }
    if (minigame === "pillows") {
      pillowRound.update(state, racers[1], dt, previous[0], previous[1], racers, previous);
    } else if (minigame === "doors") {
      doorRound.update(state, racers[1], dt, racers);
    } else if (minigame === "eggs") {
      const winners = eggRound.update(state, racers, dt);
      if (winners) finish(winners);
      return;
    }
    const winners = racers.filter(racer => !racer.eliminated &&
      (minigame === "track"
        ? racer.laps >= LAPS_TO_WIN || touchesFinishLanding(racer)
        : minigame === "doors" && racer.z >= FINISH_Z));
    const survivors = racers.filter(racer => !racer.eliminated);
    if (winners.length) finish(winners);
    else if (survivors.length <= 1) finish(survivors);
  }

  return { state, racers, update };
}
