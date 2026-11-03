import { createGame, moveRacer, moveTrackRacer, updateTrackProgress } from "./lobby.js";
import {
  LAPS_TO_WIN, SPEED, START, checkpoints, touchesFinishLanding,
} from "./track.js";
import { PILLOW_LIVES, arenaWalls, createPillowRound } from "./pillows.js";
import { FINISH_Z, createDoorRound, gateWalls, lockedWalls, pathWalls } from "./doors.js";

export function createLanGame(minigame, playerIds, random = Math.random) {
  const game = createGame({ random });
  if (minigame === "track") game.enterTrack();
  else if (minigame === "pillows") game.enterPillows();
  else if (minigame === "doors") game.enterDoors();
  else throw new Error("Unknown minigame");
  if (playerIds.length < 2 || playerIds.length > 8 || new Set(playerIds).size !== playerIds.length) {
    throw new Error("LAN games require 2-8 distinct players");
  }
  const state = game.state;
  state.multiplayer = true;
  state.winnerIds = [];
  const pillowRound = createPillowRound(random);
  const doorRound = createDoorRound(random);
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
      eliminated: false, doorTeam: index % 2,
      controls: { forward: 0, turn: 0 },
    };
  });

  function finish(winners) {
    state.scene = "finished";
    state.winnerIds = winners.map(racer => racer.id);
  }

  function update(dt, inputs = new Map()) {
    if (state.scene === "finished") return;
    if (state.scene === "countdown") {
      state.countdown = Math.max(0, state.countdown - dt);
      if (state.countdown === 0) {
        state.scene = minigame;
        state.goTimer = 0.7;
      }
      return;
    }
    state.goTimer = Math.max(0, state.goTimer - dt);
    const previous = racers.map(({ x, z }) => ({ x, z }));
    for (const [index, racer] of racers.entries()) {
      if (racer.eliminated) continue;
      const keys = inputs.get(racer.id) ?? {};
      const forward = Number(Boolean(keys.w || keys.arrowup)) -
        Number(Boolean(keys.s || keys.arrowdown));
      const turn = Number(Boolean(keys.a || keys.arrowleft)) -
        Number(Boolean(keys.d || keys.arrowright));
      racer.controls = { forward, turn };
      const walls = minigame === "pillows" ? arenaWalls :
        [...pathWalls, ...gateWalls, ...lockedWalls(state.doors, racer.doorTeam)];
      const onTrack = minigame === "track" ?
        moveTrackRacer(racer, dt, forward, turn, SPEED) : true;
      if (minigame === "track" && !onTrack) {
        racer.eliminated = true;
        continue;
      }
      if (minigame !== "track") moveRacer(racer, dt, forward, turn, SPEED, walls);
      racer.walk = forward ? racer.walk + dt * 11 : 0;
      if (minigame === "track") updateTrackProgress(racer);
    }
    if (minigame === "pillows") {
      pillowRound.update(state, racers[1], dt, previous[0], previous[1], racers, previous);
    } else if (minigame === "doors") {
      doorRound.update(state, racers[1], dt, racers);
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
