import { createLanClient } from "./lan-client.js";

export function createLanMenu({ choices, onRound, onExit, onOpen }) {
  const overlay = document.getElementById("lan-menu");
  const title = document.getElementById("lan-title");
  const status = document.getElementById("lan-status");
  const options = document.getElementById("lan-options");
  const settings = document.getElementById("lan-settings");
  const games = document.getElementById("lan-games");
  const waiting = document.getElementById("lan-waiting");
  const members = document.getElementById("lan-members");
  const back = document.getElementById("lan-back");
  const close = document.getElementById("lan-close");
  const selection = document.getElementById("lan-selection");
  const labels = { random: "Random", ...choices };
  for (const [value, label] of Object.entries(labels)) {
    selection.add(new Option(label, value));
  }
  let page = "main";
  let data = { games: [], room: null };
  let active = false;
  let busy = false;
  let connected = false;

  function show(next) {
    page = next;
    options.hidden = next !== "main";
    settings.hidden = next !== "host";
    games.hidden = next !== "browse";
    waiting.hidden = next !== "waiting";
    back.hidden = next === "main" || next === "waiting";
    title.textContent = next === "host" ? "Host a game" : next === "browse" ? "Join a game" :
      next === "waiting" ? `${labels[data.room.selection]} - ${data.room.members.length}/${data.room.slots}` :
        "LAN games";
    close.textContent = next === "waiting" ? "Leave game" : "Cancel";
  }

  function render() {
    for (const button of overlay.querySelectorAll("button")) {
      button.disabled = busy || (!connected && button !== close);
    }
    if (data.room) {
      show("waiting");
      members.replaceChildren();
      for (let index = 0; index < data.room.slots; index++) {
        const id = data.room.members[index];
        const item = document.createElement("li");
        item.textContent = id ? `Player ${index + 1}${id === data.playerId ? " (you)" : ""}${id === data.room.hostId ? " - host" : ""}` :
          "Waiting for a player...";
        members.append(item);
      }
    } else if (page === "waiting") show("main");
    const focusedRoom = document.activeElement?.dataset.roomId;
    games.replaceChildren();
    if (data.games.length === 0) {
      const empty = document.createElement("p");
      empty.textContent = "No games yet. Host a game, or wait for one to appear.";
      games.append(empty);
    }
    for (const room of data.games) {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.roomId = room.id;
      button.textContent = `${labels[room.selection]} - ${room.members.length}/${room.slots} players`;
      button.disabled = busy || !connected;
      button.addEventListener("click", () => run(() => client.action("join", { roomId: room.id })));
      games.append(button);
      if (focusedRoom === room.id) button.focus();
    }
  }

  function endRound(message) {
    const wasActive = active;
    active = false;
    if (wasActive) onExit();
    if (message) {
      overlay.hidden = false;
      onOpen();
      status.textContent = message;
    }
  }

  const client = createLanClient({
    onRooms(next) {
      data = next;
      connected = true;
      render();
    },
    onRound(round) {
      const first = !active;
      active = true;
      overlay.hidden = true;
      status.textContent = "";
      client.startControls();
      onRound(round, data.playerId, first);
    },
    onNotice(message) { endRound(message); },
    onError(message) {
      connected = false;
      data = { games: [], room: null };
      endRound(message);
      show("main");
      render();
    },
  });

  async function run(action) {
    if (busy) return;
    busy = true;
    status.textContent = "";
    render();
    try { await action(); }
    catch (error) { status.textContent = error.message; }
    finally { busy = false; render(); }
  }

  async function leave() {
    await run(async () => {
      if (connected) await client.action("leave");
      client.disconnect();
      connected = false;
      endRound();
      overlay.hidden = true;
    });
  }

  document.getElementById("lan-host").addEventListener("click", () => {
    show("host");
    selection.focus();
  });
  document.getElementById("lan-play").addEventListener("click", () => {
    show("browse");
    games.querySelector("button")?.focus();
  });
  settings.addEventListener("submit", event => {
    event.preventDefault();
    run(() => client.action("host", {
      selection: selection.value, slots: Number(document.getElementById("lan-slots").value),
    }));
  });
  back.addEventListener("click", () => {
    show("main");
    document.getElementById("lan-host").focus();
  });
  close.addEventListener("click", leave);

  return {
    get isOpen() { return !overlay.hidden; },
    get active() { return active; },
    setKeys: client.setKeys,
    leave,
    escape() { if (page === "host" || page === "browse") back.click(); else leave(); },
    async open() {
      onOpen();
      overlay.hidden = false;
      show("main");
      render();
      status.textContent = "Connecting to LAN server...";
      try {
        await client.connect();
        status.textContent = "";
        document.getElementById("lan-host").focus();
      } catch (error) {
        status.textContent = error.message;
      }
    },
  };
}
