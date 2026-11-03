import { createGame } from "./lobby.js";
import { createInput } from "./input.js";
import { LAPS_TO_WIN } from "./track.js";
import { createWorld } from "./world.js";
import { createSoundEffects } from "./audio.js";
import { DOOR_COUNT, GATE_HALF_DEPTH } from "./doors.js";

const game = createGame();
const world = await createWorld();
const sounds = createSoundEffects();
const { state, rival } = game;
const hud = document.getElementById("hud");
const message = document.getElementById("msg");
const result = document.getElementById("result");
const countdown = document.getElementById("countdown");
const gameMenu = document.getElementById("game-menu");
const menuOptions = document.getElementById("menu-options");
const minigameOptions = document.getElementById("minigame-options");
const menuTitle = document.getElementById("menu-title");
let menuStep = null;

function openMenu() {
  menuStep = "main";
  menuTitle.textContent = "Choose a minigame";
  menuOptions.hidden = false;
  minigameOptions.hidden = true;
  gameMenu.hidden = false;
  input.clear();
  document.getElementById("random-minigame").focus();
}

function closeMenu() {
  menuStep = null;
  gameMenu.hidden = true;
}

function startMinigame(selection) {
  sounds.unlock();
  if (selection === "random") game.enterMinigame();
  else if (selection === "track") game.enterTrack();
  else if (selection === "doors") game.enterDoors();
  else game.enterPillows();
  closeMenu();
  input.clear();
  world.resetCamera(state);
}

document.getElementById("random-minigame").addEventListener("click", () => {
  startMinigame("random");
});
document.getElementById("choose-minigame").addEventListener("click", () => {
  menuStep = "choose";
  menuTitle.textContent = "Choose a minigame";
  menuOptions.hidden = true;
  minigameOptions.hidden = false;
  minigameOptions.querySelector("button").focus();
});
for (const button of minigameOptions.querySelectorAll("[data-minigame]")) {
  button.addEventListener("click", () => startMinigame(button.dataset.minigame));
}
document.getElementById("back-to-menu").addEventListener("click", () => {
  menuStep = "main";
  menuOptions.hidden = false;
  minigameOptions.hidden = true;
  document.getElementById("choose-minigame").focus();
});
document.getElementById("close-menu").addEventListener("click", closeMenu);

const input = createInput(key => {
  if (menuStep !== null) {
    if (key === "escape") {
      if (menuStep === "choose") document.getElementById("back-to-menu").click();
      else closeMenu();
    }
    return;
  }
  if (state.scene === "finished" && key === "enter") {
    game.returnToButton();
    input.clear();
    world.resetCamera(state);
  } else if (state.scene === "lobby" && key === "e" && game.nearButton()) {
    openMenu();
  }
});
world.resetCamera(state);

function doorsPassed(racer) {
  return state.doors.filter(door => racer.z > door.z + GATE_HALF_DEPTH).length;
}

function updateUI() {
  hud.textContent = state.scene === "lobby"
    ? `W/S move | A/D turn | ${
      game.nearButton() ? "Press E to choose a minigame" : "Walk to the red button to play a minigame"
    }`
    : state.minigame === "doors"
      ? `DOOR DASH | Doors: You ${doorsPassed(state)}/${DOOR_COUNT} | Rival ${doorsPassed(rival)}/${DOOR_COUNT} | Monster ${Math.max(0, Math.min(state.z, rival.z) - state.monster.z).toFixed(0)}m behind | One door per gate is secretly yours | W/S move | A/D turn`
    : state.minigame === "pillows"
      ? `PILLOW DODGE | You: ${state.lives}/3 lives | Rival: ${rival.lives}/3 lives | Survived: ${state.survivalTime.toFixed(1)}s | W/S move | A/D turn${rival.intent === "tired" ? " | Rival is tired!" : ""}`
      : `RACE | You: ${state.laps} / ${LAPS_TO_WIN} laps | Red rival: ${rival.laps} / ${LAPS_TO_WIN} laps | W/S move | A/D turn | Follow the arrows`;
  const playing = state.scene === state.minigame;
  countdown.textContent = playing && state.goTimer > 0
    ? "GO!" : String(Math.ceil(state.countdown));
  countdown.style.display = state.scene === "countdown" || (state.goTimer > 0 && playing)
    ? "flex" : "none";
  result.textContent = (state.caught === "player" ? "CAUGHT! " : state.caught === "rival" ? "RIVAL CAUGHT! " :
    state.caught === "both" ? "BOTH CAUGHT! " : "") +
    (state.playerWon === null ? "DRAW!" : state.playerWon ? "VICTORY!" : "RIVAL WINS!");
  message.style.display = state.scene === "finished" ? "flex" : "none";
}

let lastCountdown = null;
let last = performance.now();
function frame(now) {
  const elapsed = (now - last) / 1000;
  last = now;
  const previousScene = state.scene;
  const { moving, dt } = game.update(
    Math.min(elapsed, 0.05), elapsed, menuStep === null ? input.keys : {}
  );
  if (state.scene === "countdown") {
    const number = Math.ceil(state.countdown);
    if (number > 0 && number !== lastCountdown) sounds.countdownBeep(number);
    lastCountdown = number;
  } else {
    if (previousScene === "countdown" && state.scene === state.minigame) sounds.startRace();
    lastCountdown = null;
  }
  sounds.updateRace(state.scene, elapsed);
  if (state.scene === "finished" && previousScene !== "finished") input.clear();
  updateUI();
  world.render(state, rival, dt, moving, game.nearButton());
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
