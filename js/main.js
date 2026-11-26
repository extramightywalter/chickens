import { createGame } from "./lobby.js";
import { createInput } from "./input.js";
import { checkpoints } from "./track.js";
import { createWorld } from "./world.js";
import { createSoundEffects } from "./audio.js";
import { DOOR_COUNT, GATE_HALF_DEPTH } from "./doors.js";
import { createLanMenu } from "./lan-menu.js";
import { createLanRaceView } from "./lan-race-view.js";
import { BLASTER_HP } from "./gun-arena.js";
import { createShop, ITEMS, outcomeReward } from "./shop.js";
import {
  CANNON_REQUIRED_OVERLAP, CANNON_SPIN_WINDOW, CANNON_STAGES, cannonOverlap, cannonTimeToWall,
} from "./cannon-race.js";

const game = createGame();
let shop;
try {
  shop = createShop(localStorage);
} catch (error) {
  document.getElementById("hud").textContent = `Could not load shop data: ${error.message}`;
  throw error;
}
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
const abilityHelp = " | E spin (2s, half speed, 3s cooldown) | Space dive (3s cooldown)";
let menuStep = null;
let shopPage = "shop";
let roundReward = null;
let soloRoundReward = null;
let processedSoloRoundId = null;
const shopMenu = document.getElementById("shop-menu");
const shopItems = document.getElementById("shop-items");
const shopStatus = document.getElementById("shop-status");
const shopTab = document.getElementById("shop-tab");
const stuffTab = document.getElementById("stuff-tab");

function renderShop() {
  document.getElementById("shop-coins").textContent = `Coins: ${shop.coins}`;
  shopTab.setAttribute("aria-pressed", String(shopPage === "shop"));
  stuffTab.setAttribute("aria-pressed", String(shopPage === "stuff"));
  shopItems.replaceChildren();
  for (const [id, item] of Object.entries(ITEMS)) {
    if (shopPage === "shop" ? item.price === undefined : !shop.owned.includes(id)) continue;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "shop-item";
    const equipped = shop.appearance[item.type] === id;
    const preview = document.createElement("span");
    preview.className = `shop-preview ${item.type === "color" ? "shop-color" : `shop-${id}`}`;
    preview.setAttribute("aria-hidden", "true");
    if (item.type === "color") preview.style.setProperty("--item-color", `#${item.color.toString(16).padStart(6, "0")}`);
    const label = document.createElement("span");
    button.textContent = shopPage === "shop"
      ? `${item.name} (${item.type}) - ${shop.owned.includes(id) ? "Owned" : `${item.price} coins`}`
      : `${item.name} (${item.type})${equipped ? " - Equipped" : ""}`;
    label.textContent = button.textContent;
    button.textContent = "";
    button.append(preview, label);
    if (shopPage === "shop") button.disabled = shop.owned.includes(id) || shop.coins < item.price;
    button.addEventListener("click", () => {
      try {
        if (shopPage === "shop") {
          if (shop.buy(id)) shopStatus.textContent = `${item.name} added to My stuff.`;
        } else if (shop.equip(id)) shopStatus.textContent = `${item.name} ${equipped && item.type !== "color" ? "removed" : "equipped"}.`;
        renderShop();
      } catch (error) {
        shopStatus.textContent = `Could not save your shop data: ${error.message}`;
      }
    });
    shopItems.append(button);
  }
}

function closeShop() { shopMenu.hidden = true; input.clear(); }
shopTab.addEventListener("click", () => { shopPage = "shop"; shopStatus.textContent = ""; renderShop(); });
stuffTab.addEventListener("click", () => { shopPage = "stuff"; shopStatus.textContent = ""; renderShop(); });
document.getElementById("shop-close").addEventListener("click", closeShop);
const lanRaceView = createLanRaceView();
const lanMenu = createLanMenu({
  getAppearance: () => shop.appearance,
  choices: Object.fromEntries([...minigameOptions.querySelectorAll("[data-minigame]")]
    .map(button => [button.dataset.minigame, button.textContent])),
  onOpen() { input.clear(); },
  onExit() {
    if (document.pointerLockElement) document.exitPointerLock();
    lanRaceView.reset();
    game.returnToLan();
    input.clear();
    world.resetCamera(state);
  },
  onRound(round, playerId, first) {
    if (first) { lanRaceView.reset(); roundReward = null; }
    lanRaceView.push(round.racers, performance.now());
    const local = round.racers.find(racer => racer.id === playerId);
    Object.assign(state, round.state, local, {
      racers: round.racers,
      playerWon: round.state.winnerIds.length === 0 ? null : round.state.winnerIds.includes(playerId),
    });
    Object.assign(rival, round.racers.find(racer => racer.id !== playerId));
    if (round.state.scene === "finished" && roundReward === null) {
      const place = round.state.places?.find(entry => entry.id === playerId)?.place;
      const isDraw = round.state.winnerIds.length === 0 ||
        round.state.winnerIds.length === round.racers.length;
      if (round.state.roundId && place && !isDraw) {
        const coins = outcomeReward(round.racers.length, place,
          round.state.winnerIds.length, round.racers.length);
        try {
          const credited = shop.reward(round.state.roundId, coins);
          roundReward = `Place ${place}: ${coins} coin${coins === 1 ? "" : "s"} ${credited ? "earned" : "already credited"}`;
        } catch (error) {
          roundReward = `Could not save coins: ${error.message}`;
        }
      } else roundReward = "Draw: no coins awarded";
    }
    if (first) {
      input.clear();
      world.resetCamera(state);
    }
  },
});

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
  else if (selection === "eggs") game.enterEggs();
  else if (selection === "egg-battle") game.enterEggBattle();
  else if (selection === "maze") game.enterMaze();
  else if (selection === "gun-arena") game.enterGunArena();
  else if (selection === "survival") game.enterSurvival();
  else if (selection === "cannon-race") game.enterCannonRace();
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
  if (!shopMenu.hidden) {
    if (key === "escape") closeShop();
    return;
  }
  if (lanMenu.isOpen) {
    if (key === "escape") lanMenu.escape();
    return;
  }
  if (menuStep !== null) {
    if (key === "escape") {
      if (menuStep === "choose") document.getElementById("back-to-menu").click();
      else closeMenu();
    }
    return;
  }
  if (state.scene === "finished" && key === "enter") {
    if (lanMenu.active) {
      lanMenu.leave();
      return;
    }
    game.returnToButton();
    input.clear();
    world.resetCamera(state);
  } else if (state.scene === "lobby" && key === "e") {
    sounds.unlock();
    if (game.nearShop()) {
      shopPage = "shop";
      shopStatus.textContent = "";
      renderShop();
      shopMenu.hidden = false;
      input.clear();
      shopTab.focus();
    } else if (game.nearLanButton()) lanMenu.open();
    else if (game.nearButton()) openMenu();
  }
}, (dx, dy) => {
  if (state.minigame !== "gun-arena" || state.scene === "finished" || lanMenu.isOpen) return;
  input.keys.aimYaw = (input.keys.aimYaw ?? state.yaw) - dx * 0.0025;
  input.keys.aimPitch = Math.max(-1.1, Math.min(1.1,
    (input.keys.aimPitch ?? state.pitch) - dy * 0.0025));
});
world.resetCamera(state);

document.querySelector("canvas").addEventListener("click", event => {
  if (state.minigame !== "gun-arena" || state.scene === "finished") return;
  sounds.unlock();
  if (!document.pointerLockElement && event.target.requestPointerLock) {
    const request = event.target.requestPointerLock();
    request?.catch(error => console.warn("Mouse capture unavailable; click the canvas to retry:", error));
  }
});

function doorsPassed(racer) {
  return state.doors.filter(door => racer.z > door.z + GATE_HALF_DEPTH).length;
}

function raceProgress(racer) {
  return `${Math.round(Math.min(racer.nextCheckpoint, checkpoints.length - 1) /
    (checkpoints.length - 1) * 100)}%`;
}

function cannonHud() {
  const progress = racer => racer.eliminated ? "OUT" : `${racer.cannonStage}/${CANNON_STAGES} walls`;
  const standings = state.multiplayer
    ? state.racers.map(racer => `P${racer.number}${racer.id === state.id ? " (you)" : ""}: ${progress(racer)}`).join(" | ")
    : `You: ${progress(state)} | Rival: ${progress(rival)}`;
  let hint;
  if (state.eliminated) hint = "Eliminated - watching until the race ends";
  else if (state.cannonPhase === "aim") {
    const coverage = cannonOverlap(state.cannonWalls[state.cannonStage], state.cannonAimX, state.cannonAimY);
    const safe = coverage + 1e-9 >= CANNON_REQUIRED_OVERLAP;
    const percent = safe ? Math.round(coverage * 100) : Math.floor(coverage * 100);
    hint = `WASD / arrows aim | ${percent}% on teal (75% needed) | Space launch`;
  } else if (state.cannonPhase === "flight") {
    const remaining = cannonTimeToWall(state);
    hint = state.cannonSpin > remaining ? "Spinning!" :
      remaining < CANNON_SPIN_WINDOW ? "SPIN NOW! E or Space" : "Wait until just before the wall, then press E or Space to spin";
  } else if (state.cannonPhase === "land") hint = "Wall cleared - landing";
  else hint = state.cannonStage === CANNON_STAGES ? "Run across the checkered finish line!" :
    "WASD / arrows to walk into the cannon";
  return `${state.multiplayer ? "LAN " : ""}CANNON RACE | ${standings} | ${hint}`;
}

function updateUI() {
  const defenseHelp = state.carryingDefenseId !== null
    ? `Carrying ${state.defenses.find(item => item.id === state.carryingDefenseId)?.type === "flame" ? "flame gun" : "trap"} (slower movement) - E to place facing forward`
    : "E to pick up a flame gun or trap";
  const controlsHelp = state.minigame === "survival" ?
    ` | ${defenseHelp} | Guns fire at nearby monsters | Traps and fire hurt you too${!state.eliminated && state.invulnerable > 0 ? " | HIT - briefly protected" : ""}${state.survivalNotice ? ` | ${state.survivalNotice}` : ""}` :
    state.minigame === "gun-arena" ?
    ` | Click to aim with mouse | Click / hold Space to shoot | ${BLASTER_HP} HP, last chicken standing` :
    state.minigame === "egg-battle" ?
    " | E pick up egg | Space throw egg / jump when empty-handed" : state.minigame === "eggs" ?
    " | E pick up / steal / drop egg | Space dash (stuns on contact)" :
    state.minigame === "maze" ? " | Find the green EXIT | Avoid monsters' sight | 5 catches = OUT" : abilityHelp;
  hud.textContent = state.scene === "lobby"
    ? `W/S move | A/D turn | ${
      game.nearLanButton() ? "Press E to host or join a LAN game" :
      game.nearShop() ? "Press E to open the shop" :
      game.nearButton() ? "Press E to choose a minigame" :
        "Red button: minigames | Blue button inside the right side of LAN: host or join"
    }`
    : state.minigame === "cannon-race" ? cannonHud()
    : state.multiplayer
      ? `LAN ${state.minigame.toUpperCase()} | You: Player ${state.number} | ${
        state.racers.map(racer => `P${racer.number}: ${racer.eliminated ? "OUT" :
          ["pillows", "egg-battle", "gun-arena", "survival"].includes(state.minigame) ?
            `${racer.lives}/${state.minigame === "gun-arena" ? BLASTER_HP : 3} HP` :
          state.minigame === "doors" ? `${doorsPassed(racer)}/${DOOR_COUNT} doors` :
          state.minigame === "eggs" ? `${racer.eggScore} eggs` :
          state.minigame === "maze" ? (racer.eliminated ? "OUT" :
            `${racer.mazeRestarts}/5 catches`) :
            raceProgress(racer)}${racer.stunTimer > 0 ? " (stunned)" : ""}`).join(" | ")
      }${state.minigame === "eggs" ? ` | ${Math.ceil(state.eggTimeLeft)}s | Your pit: P${state.number}${state.carryingEggId !== null ? " | Carrying an egg" : ""}` : ""}${state.minigame === "egg-battle" ? (state.carryingEggId !== null ? " | Holding egg - Space to throw" : " | Empty-handed - Space to jump") : ""} | W/S move | ${state.minigame === "gun-arena" ? "A/D or Left/Right strafe" : "A/D turn"}${controlsHelp}${state.eliminated ? " | Eliminated - watching until the round ends" : ""}`
    : state.minigame === "survival"
      ? `MONSTER SURVIVAL | You: ${state.lives}/3 lives | Rival: ${rival.lives}/3 lives | Last player standing wins | W/S move | A/D turn${controlsHelp}${state.eliminated ? " | OUT" : ""}`
    : state.minigame === "gun-arena"
      ? `CHICKEN BLASTER | You: ${state.lives}/${BLASTER_HP} HP | Rival: ${rival.lives}/${BLASTER_HP} HP | W/S move | A/D or Left/Right strafe${controlsHelp}`
    : state.minigame === "maze"
      ? `MAZE RACE | First to the green exit wins | Caught: ${state.mazeRestarts}/5 | ${state.mazeMonsters.length} roaming monsters | W/S move | A/D turn${controlsHelp}`
    : state.minigame === "egg-battle"
      ? `EGG BATTLE | You: ${state.lives}/3 HP | Rival: ${rival.lives}/3 HP | Last chicken standing wins${state.carryingEggId !== null ? " | Holding egg - Space to throw" : " | Empty-handed - Space to jump"} | W/S move | A/D turn${controlsHelp}`
    : state.minigame === "eggs"
      ? `EGG HEIST | ${Math.ceil(state.eggTimeLeft)}s | You: ${state.eggScore} eggs | Rival: ${rival.eggScore} eggs | Your pit: P1 (green)${state.carryingEggId !== null ? " | Carrying an egg" : ""}${state.stunTimer > 0 ? " | STUNNED" : ""} | Steal from any pit | W/S move | A/D turn${controlsHelp}`
    : state.minigame === "doors"
      ? `DOOR DASH | Doors: You ${doorsPassed(state)}/${DOOR_COUNT} | Rival ${doorsPassed(rival)}/${DOOR_COUNT} | Monster ${Math.max(0, Math.min(state.z, rival.z) - state.monster.z).toFixed(0)}m behind | One door per gate is secretly yours | W/S move | A/D turn${abilityHelp}`
    : state.minigame === "pillows"
      ? `PILLOW DODGE | You: ${state.lives}/3 lives | Rival: ${rival.lives}/3 lives | Survived: ${state.survivalTime.toFixed(1)}s | W/S move | A/D turn${abilityHelp}${rival.intent === "tired" ? " | Rival is tired!" : ""}`
      : `RACE | You: ${raceProgress(state)} | Red rival: ${raceProgress(rival)} | W/S move | A/D turn${abilityHelp} | Follow the arrows`;
  const playing = state.scene === state.minigame;
  countdown.textContent = playing && state.goTimer > 0
    ? "GO!" : String(Math.ceil(state.countdown));
  countdown.style.display = state.scene === "countdown" || (state.goTimer > 0 && playing)
    ? "flex" : "none";
  result.textContent = (state.caught === "player" ? "CAUGHT! " : state.caught === "rival" ? "RIVAL CAUGHT! " :
    state.caught === "both" ? "BOTH CAUGHT! " : "") +
    (state.playerWon === null ? "DRAW!" : state.playerWon ? "VICTORY!" : "RIVAL WINS!");
  if (state.multiplayer) {
    result.textContent = state.winnerIds.length === 0 ? "DRAW!" :
      state.winnerIds.length === state.racers.length ? "DRAW!" :
      state.winnerIds.length > 1 ? `PLAYERS ${state.racers.filter(racer =>
        state.winnerIds.includes(racer.id)).map(racer => racer.number).join(", ")} TIE!` :
      state.playerWon ? "VICTORY!" :
        `PLAYER ${state.racers.find(racer => racer.id === state.winnerIds[0]).number} WINS!`;
  }
  message.querySelector("small").textContent = state.multiplayer ?
    `${roundReward ?? ""} | Press Enter to leave the LAN game` :
    `${soloRoundReward ?? ""}${soloRoundReward ? " | " : ""}Press Enter to return to the button`;
  message.style.display = state.scene === "finished" ? "flex" : "none";
}

let lastCountdown = null;
let previousScene = state.scene;
let last = performance.now();
function frame(now) {
  const elapsed = (now - last) / 1000;
  last = now;
  const keys = menuStep === null && !lanMenu.isOpen && shopMenu.hidden ? input.keys : {};
  lanMenu.setKeys(keys);
  const { moving, dt } = lanMenu.active ?
    { moving: !state.eliminated &&
      (state.controls.forward !== 0 ||
        (state.minigame === "gun-arena" && state.controls.strafe !== 0)), dt: Math.min(elapsed, 0.05) } :
    game.update(Math.min(elapsed, 0.05), elapsed, keys);
  if (!lanMenu.active && Number.isFinite(input.keys.aimYaw)) input.keys.aimYaw = state.yaw;
  if (state.scene === "countdown") {
    const number = Math.ceil(state.countdown);
    if (number > 0 && number !== lastCountdown) sounds.countdownBeep(number);
    lastCountdown = number;
    if (!state.multiplayer) soloRoundReward = null;
  } else {
    if (previousScene === "countdown" && state.scene === state.minigame) sounds.startRace();
    lastCountdown = null;
  }
  if (!lanMenu.active && !state.multiplayer && state.scene === "finished" &&
      state.roundId && processedSoloRoundId !== state.roundId) {
    processedSoloRoundId = state.roundId;
    if (state.playerWon === true) {
      const coins = outcomeReward(2, 1, 1, 2);
      try {
        const credited = shop.reward(state.roundId, coins);
        soloRoundReward = `${coins} coin${coins === 1 ? "" : "s"} ${credited ? "earned" : "already credited"}`;
      } catch (error) {
        soloRoundReward = `Could not save coins: ${error.message}`;
      }
    } else if (state.playerWon === null) {
      soloRoundReward = "Draw: no coins awarded";
    } else {
      soloRoundReward = "Rival wins: no coins awarded";
    }
  }
  sounds.updateRace(state.scene, elapsed);
  if (state.scene === "finished" && previousScene !== "finished") {
    input.clear();
    if (document.pointerLockElement) document.exitPointerLock();
  }
  updateUI();
  let renderState = state;
  if (!state.multiplayer) {
    state.appearance = shop.appearance;
    state.color = ITEMS[state.appearance.color].color;
  }
  if (lanMenu.active) {
    const racers = lanRaceView.sample(now, state.id);
    const local = racers?.find(racer => racer.id === state.id);
    if (local) renderState = { ...state, ...local, racers };
  }
  const renderMoving = renderState === state ? moving :
    !renderState.eliminated && renderState.controls.forward !== 0;
  world.render(renderState, rival, dt, renderMoving, game.nearButton(), game.nearLanButton());
  previousScene = state.scene;
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
