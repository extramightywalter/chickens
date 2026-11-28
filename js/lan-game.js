import {
  createGame, DIVE_SPEED_MULTIPLIER, moveGunRacer, moveRacer, moveTrackRacer,
  PLAYER_COLORS, updateAbilities,
  updateTrackProgress,
} from "./lobby.js";
import {
  LAPS_TO_WIN, SPEED, START, checkpoints, touchesFinishLanding,
} from "./track.js";
import { PILLOW_LIVES, arenaWalls, createPillowRound } from "./pillows.js";
import { FINISH_Z, createDoorRound, gateWalls, lockedWalls, pathWalls } from "./doors.js";
import { createEggRound, eggWalls } from "./eggs.js";
import { battleWalls, createEggBattleRound } from "./egg-battle.js";
import { createMazeRound, mazeCellAt, mazePath } from "./maze.js";
import { createGunRound } from "./gun-arena.js";
import { createSurvivalRound } from "./survival.js";
import { createCannonRace } from "./cannon-race.js";

export function createLanGame(minigame, playerIds, random = Math.random) {
  const game = createGame({ random });
  if (minigame === "track") game.enterTrack();
  else if (minigame === "pillows") game.enterPillows();
  else if (minigame === "doors") game.enterDoors();
  else if (minigame === "eggs") game.enterEggs();
  else if (minigame === "egg-battle") game.enterEggBattle();
  else if (minigame === "maze") game.enterMaze();
  else if (minigame === "gun-arena") game.enterGunArena();
  else if (minigame === "survival") game.enterSurvival();
  else if (minigame === "cannon-race") game.enterCannonRace();
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
  const battleRound = createEggBattleRound();
  const mazeRound = createMazeRound(random);
  const gunRound = createGunRound();
  const survivalRound = createSurvivalRound(random);
  const cannonRace = createCannonRace(random);
  const previousActionKeys = new Map();
  const eliminationTicks = new Map();
  let tick = 0;
  if (minigame === "pillows") pillowRound.reset(state, game.rival);
  if (minigame === "doors") doorRound.reset(state, game.rival);
  const racers = playerIds.map((id, index) => {
    const lane = index % 2 === 0 ? -1.6 : 1.6;
    const row = Math.floor(index / 2);
    return {
      id, number: index + 1, color: PLAYER_COLORS[index],
      x: minigame === "track" ? START.x + lane :
        minigame === "doors" ? lane : Math.sin(index / playerIds.length * Math.PI * 2) * 5,
      z: minigame === "track" ? START.z + row * 2 :
        minigame === "doors" ? -row * 2 :
          Math.cos(index / playerIds.length * Math.PI * 2) * 5,
      yaw: minigame === "track" ? Math.PI / 2 : minigame === "doors" ? 0 : Math.PI,
      laps: 0, nextCheckpoint: 1, walk: 0, lives: PILLOW_LIVES,
      spinTimer: 0, diveTimer: 0, spinCooldown: 0, diveCooldown: 0,
      stunTimer: 0, eliminated: false, doorTeam: index % 2,
      controls: { forward: 0, turn: 0 },
    };
  });
  if (minigame === "eggs") eggRound.reset(state, racers);
  if (minigame === "egg-battle") battleRound.reset(state, racers);
  if (minigame === "maze") mazeRound.reset(state, racers);
  if (minigame === "gun-arena") gunRound.reset(state, racers);
  if (minigame === "survival") survivalRound.reset(state, racers);
  if (minigame === "cannon-race") cannonRace.reset(state, racers);
  for (const racer of racers) previousActionKeys.set(racer.id, { e: false, space: false });

  function finish(winners) {
    state.scene = "finished";
    state.winnerIds = winners.map(racer => racer.id);
  }

  function advance(dt, inputs = new Map()) {
    if (state.scene === "finished") return;
    if (state.scene === "countdown") {
      for (const racer of racers) {
        if (minigame === "cannon-race") {
          cannonRace.actions(racer, inputs.get(racer.id) ?? {});
        } else if (minigame === "survival") {
          survivalRound.actions(state, racer, inputs.get(racer.id) ?? {}, false);
        } else if (minigame === "egg-battle") {
          battleRound.actions(state, racer, 0, inputs.get(racer.id) ?? {},
            previousActionKeys.get(racer.id), false);
        } else updateAbilities(racer, 0, inputs.get(racer.id) ?? {},
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
    if (minigame === "cannon-race") {
      const winners = cannonRace.advance(state, racers, dt, racer => inputs.get(racer.id) ?? {});
      if (winners) finish(winners);
      return;
    }
    if (minigame === "survival") {
      const winners = survivalRound.advance(state, racers, dt,
        racer => inputs.get(racer.id) ?? {}, moveRacer);
      if (winners) finish(winners);
      return;
    }
    if (minigame === "gun-arena") {
      const winners = gunRound.advance(state, racers, dt,
        racer => inputs.get(racer.id) ?? {}, moveGunRacer);
      if (winners) finish(winners);
      return;
    }
    if (minigame === "maze") {
      const winners = mazeRound.advance(state, racers, dt, (racer, step) => {
        const keys = inputs.get(racer.id) ?? {};
        const forward = Number(Boolean(keys.w)) - Number(Boolean(keys.s));
        const turn = Number(Boolean(keys.a)) - Number(Boolean(keys.d));
        racer.controls = { forward, turn };
        moveRacer(racer, step, forward, turn, SPEED, state.maze.walls);
        racer.walk = forward ? racer.walk + step * 11 : 0;
      });
      if (winners) finish(winners);
      return;
    }
    if (minigame === "eggs") dt = Math.min(dt, state.eggTimeLeft);
    const stunnedRacers = minigame === "eggs" ?
      new Set(racers.filter(racer => racer.stunTimer > 0)) : new Set();
    if (minigame === "eggs") eggRound.updateStuns(racers, dt);
    const previous = racers.map(({ x, z, jumpHeight }) => ({ x, z, jumpHeight }));
    for (const [index, racer] of racers.entries()) {
      const keys = inputs.get(racer.id) ?? {};
      const previousKeys = previousActionKeys.get(racer.id);
      const stunned = stunnedRacers.has(racer);
      const eggPressed = minigame === "eggs" && keys.e === true && !previousKeys.e;
      if (minigame === "egg-battle") {
        battleRound.actions(state, racer, dt, keys, previousKeys, !racer.eliminated);
      } else updateAbilities(racer, dt, minigame === "eggs" ? { ...keys, e: false } : keys,
        previousKeys, !racer.eliminated && !stunned);
      if (minigame === "eggs") previousKeys.e = keys.e === true;
      if (racer.eliminated) continue;
      const forward = Number(Boolean(keys.w)) - Number(Boolean(keys.s));
      const turn = Number(Boolean(keys.a)) - Number(Boolean(keys.d));
      const movement = stunned ? 0 : racer.diveTimer > 0 ? Math.max(forward, 1) : forward;
      const actualTurn = stunned ? 0 : turn;
      const speed = SPEED * (racer.spinTimer > 0 ? 0.5 : 1) *
        (racer.diveTimer > 0 ? DIVE_SPEED_MULTIPLIER : 1);
      racer.controls = { forward: movement, turn: actualTurn };
      const walls = minigame === "pillows" ? arenaWalls :
        minigame === "egg-battle" ? battleWalls :
        minigame === "eggs" ? eggWalls :
        [...pathWalls, ...gateWalls, ...lockedWalls(state.doors, racer.doorTeam)];
      const onTrack = minigame === "track" ?
        moveTrackRacer(racer, dt, movement, turn, speed) : true;
      if (minigame === "track" && !onTrack) {
        racer.eliminated = true;
        continue;
      }
      if (minigame !== "track") moveRacer(racer, dt, movement, actualTurn, speed, walls);
      if (eggPressed && !stunned) eggRound.interact(state, racer, racers);
      racer.walk = movement ? racer.walk + dt * 11 : 0;
      if (minigame === "track") updateTrackProgress(racer);
    }
    if (minigame === "eggs") eggRound.resolveDashCollisions(racers, previous);
    if (minigame === "pillows") {
      pillowRound.update(state, racers[1], dt, previous[0], previous[1], racers, previous);
    } else if (minigame === "doors") {
      doorRound.update(state, racers[1], dt, racers);
    } else if (minigame === "egg-battle") {
      const winners = battleRound.update(state, racers, dt, previous);
      if (winners) finish(winners);
      return;
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

  function update(dt, inputs = new Map()) {
    if (state.scene === "finished") return;
    advance(dt, inputs);
    tick++;
    for (const racer of racers) {
      if (racer.eliminated && !eliminationTicks.has(racer.id)) eliminationTicks.set(racer.id, tick);
    }
    if (state.scene !== "finished") return;
    const progress = racer => {
      if (minigame === "eggs") return racer.eggScore;
      if (minigame === "track") {
        const next = checkpoints[Math.min(racer.nextCheckpoint, checkpoints.length - 1)];
        return racer.nextCheckpoint * 1000 - Math.hypot(racer.x - next.x, racer.z - next.z);
      }
      if (minigame === "doors") return racer.z;
      if (minigame === "cannon-race") return racer.cannonStage * 1000 + racer.z;
      if (minigame === "maze") return -mazePath(state.maze, mazeCellAt(racer), state.maze.exit).length;
      return 0;
    };
    const scores = racers.map(racer => ({
      id: racer.id,
      winner: state.winnerIds.includes(racer.id),
      elimination: eliminationTicks.get(racer.id) ?? Infinity,
      progress: progress(racer),
    }));
    const compare = (a, b) => {
      if (a.winner && b.winner) return 0;
      return Number(b.winner) - Number(a.winner) || b.elimination - a.elimination ||
        (a.elimination === Infinity && b.elimination === Infinity ? b.progress - a.progress : 0);
    };
    scores.sort(compare);
    state.places = scores.map((score, index) => ({
      id: score.id,
      place: index > 0 && compare(scores[index - 1], score) === 0 ? null : index + 1,
    }));
    for (let index = 1; index < state.places.length; index++) {
      if (state.places[index].place === null) state.places[index].place = state.places[index - 1].place;
    }
  }

  return { state, racers, update };
}
