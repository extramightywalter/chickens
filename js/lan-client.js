export function createLanClient({ onRooms, onRound, onNotice, onError }) {
  let events = null;
  let playerId = null;
  let token = null;
  let pending = null;
  let timer = null;
  let sending = false;
  let latestKeys = {};
  let cancelConnection = null;

  function disconnect(reason = new Error("LAN connection cancelled.")) {
    events?.close();
    events = null;
    playerId = null;
    token = null;
    clearInterval(timer);
    timer = null;
    cancelConnection?.(reason);
    cancelConnection = null;
  }

  async function action(action, details = {}) {
    if (!playerId) throw new Error("Connect to the LAN server first.");
    const response = await fetch("/api/lan", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...details, playerId, token, action }),
    });
    if (!response.ok) {
      const body = await response.text();
      let message = body;
      try { message = JSON.parse(body).error ?? body; } catch { /* Static servers can return HTML. */ }
      throw new Error(message || `LAN request failed (${response.status}).`);
    }
  }

  function connect() {
    if (playerId) return Promise.resolve();
    if (pending) return pending;
    pending = new Promise((resolve, reject) => {
      cancelConnection = reject;
      events = new EventSource("/api/lan/events");
      events.addEventListener("rooms", event => {
        const data = JSON.parse(event.data);
        playerId = data.playerId;
        token = data.token;
        onRooms(data);
        resolve();
      });
      events.addEventListener("round", event => onRound(JSON.parse(event.data)));
      events.addEventListener("notice", event => onNotice(JSON.parse(event.data).message));
      events.onerror = () => {
        const error = new Error("LAN server disconnected or unavailable. Run npm start and open its address on each device.");
        disconnect(error);
        onError(error.message);
      };
    }).finally(() => { pending = null; cancelConnection = null; });
    return pending;
  }

  function startControls() {
    if (timer) return;
    timer = setInterval(async () => {
      if (sending || !playerId) return;
      sending = true;
      const connection = events;
      try {
        await action("input", { keys: latestKeys });
      } catch (error) {
        if (events !== connection) return;
        disconnect(error);
        onError(error.message);
      } finally {
        sending = false;
      }
    }, 50);
  }

  return {
    connect, action, disconnect, startControls,
    setKeys(keys) { latestKeys = keys; },
  };
}
