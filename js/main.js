import { createGame } from "./lobby.js";
import { createInput } from "./input.js";
import { LAPS_TO_WIN } from "./track.js";
import { createWorld } from "./world.js";
import { createSoundEffects } from "./audio.js";

const game = createGame();
const world = await createWorld();
const sounds = createSoundEffects();
const { state, rival } = game;
const hud = document.getElementById("hud");
const message = document.getElementById("msg");
const result = document.getElementById("result");
const countdown = document.getElementById("countdown");

const input = createInput(key => {
  if (state.scene === "finished" && key === "enter") {
    game.reset();
  } else if (state.scene === "lobby" && key === "e") {
    if (game.nearDoor()) {
      game.openDoor();
    } else if (game.nearButton()) {
      sounds.unlock();
      game.enterTrack();
    } else {
      return;
    }
  } else {
    return;
  }
  input.clear();
  world.resetCamera(state);
});
world.resetCamera(state);

function updateUI() {
  hud.textContent = state.scene === "lobby"
    ? `W/S move | A/D turn | ${
      game.nearDoor() ? "Press E to open the door" :
        game.nearButton() ? "Press E to race!" : "Walk to the red button to race"
    }`
    : `You: ${state.laps} / ${LAPS_TO_WIN} laps | Red rival: ${rival.laps} / ${LAPS_TO_WIN} laps | W/S move | A/D turn | Follow the arrows`;
  countdown.textContent = state.scene === "track" && state.goTimer > 0
    ? "GO!" : String(Math.ceil(state.countdown));
  countdown.style.display = state.scene === "countdown" || (state.goTimer > 0 && state.scene === "track")
    ? "flex" : "none";
  result.textContent = state.playerWon ? "VICTORY!" : "RIVAL WINS!";
  message.style.display = state.scene === "finished" ? "flex" : "none";
}

let lastCountdown = null;
let last = performance.now();
function frame(now) {
  const elapsed = (now - last) / 1000;
  last = now;
  const previousScene = state.scene;
  const { moving, dt } = game.update(Math.min(elapsed, 0.05), elapsed, input.keys);
  if (state.scene === "countdown") {
    const number = Math.ceil(state.countdown);
    if (number > 0 && number !== lastCountdown) sounds.countdownBeep(number);
    lastCountdown = number;
  } else {
    if (previousScene === "countdown" && state.scene === "track") sounds.startRace();
    lastCountdown = null;
  }
  sounds.updateRace(state.scene, elapsed);
  if (state.scene === "finished" && previousScene !== "finished") input.clear();
  updateUI();
  world.render(state, rival, dt, moving, game.nearButton());
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
