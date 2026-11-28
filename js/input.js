export function updateLook(look, keys, dt) {
  const horizontal = Math.max(-1, Math.min(1,
    Number(Boolean(keys.arrowleft)) - Number(Boolean(keys.arrowright)) - (keys.lookX || 0)));
  const vertical = Math.max(-1, Math.min(1,
    Number(Boolean(keys.arrowup)) - Number(Boolean(keys.arrowdown)) - (keys.lookY || 0)));
  return {
    yaw: look.yaw + horizontal * 1.8 * dt,
    pitch: Math.max(-1.1, Math.min(1.1, look.pitch + vertical * 1.8 * dt)),
  };
}

function stick(value) {
  if (!Number.isFinite(value) || Math.abs(value) <= 0.2) return 0;
  return Math.sign(value) * Math.min(1, (Math.abs(value) - 0.2) / 0.8);
}

function isUltimate2C(gamepad) {
  return gamepad.mapping === "" &&
    /\bVendor:\s*2dc8\s+Product:\s*301c\b/i.test(gamepad.id) &&
    gamepad.axes.length >= 8 && gamepad.buttons.length >= 2;
}

function isSupportedGamepad(gamepad) {
  return gamepad?.connected && (gamepad.mapping === "standard" || isUltimate2C(gamepad));
}

export function readGamepad(gamepad) {
  if (!isSupportedGamepad(gamepad)) return {};
  const x = stick(gamepad.axes[0]);
  const y = stick(gamepad.axes[1]);
  const pressed = index => Boolean(gamepad.buttons[index]?.pressed);
  const raw = gamepad.mapping !== "standard";
  const dpadX = raw ? stick(gamepad.axes[6]) : 0;
  const dpadY = raw ? stick(gamepad.axes[7]) : 0;
  return {
    w: y < 0 || (raw ? dpadY < 0 : pressed(12)),
    s: y > 0 || (raw ? dpadY > 0 : pressed(13)),
    a: x < 0 || (raw ? dpadX < 0 : pressed(14)),
    d: x > 0 || (raw ? dpadX > 0 : pressed(15)),
    " ": pressed(0),
    e: pressed(1),
    lookX: stick(gamepad.axes[2]),
    lookY: stick(gamepad.axes[3]),
  };
}

export function navigateGamepadMenu(overlay, key) {
  const controls = Array.from(overlay.querySelectorAll("button, select"))
    .filter(control => !control.disabled && !control.closest("[hidden]"));
  const current = controls.indexOf(document.activeElement);
  if (key === "w" || key === "s") {
    const next = current < 0 ? 0 : (current + (key === "w" ? -1 : 1) + controls.length) % controls.length;
    controls[next]?.focus();
  } else if ((key === "a" || key === "d") && current >= 0 && controls[current].tagName === "SELECT") {
    const select = controls[current];
    const next = Math.max(0, Math.min(select.options.length - 1, select.selectedIndex + (key === "a" ? -1 : 1)));
    if (next !== select.selectedIndex) {
      select.selectedIndex = next;
      select.dispatchEvent(new Event("change", { bubbles: true }));
    }
  } else if (key === " " && current >= 0 && controls[current].tagName === "BUTTON") {
    controls[current].click();
  }
}

export function createInput(onPress, onLook = () => {}) {
  const keys = {};
  const keyboard = {};
  let gamepad = {};
  let previousButtons = {};
  const blocked = new Set();
  let focused = true;

  function merge(key) {
    keys[key] = Boolean(keyboard[key] || gamepad[key]);
  }

  function clear() {
    for (const key of Object.keys(gamepad)) if (gamepad[key]) blocked.add(key);
    for (const key of Object.keys(keyboard)) delete keyboard[key];
    gamepad = {};
    for (const key of Object.keys(keys)) delete keys[key];
  }

  function pollGamepad() {
    if (!focused || document.hidden) return;
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const next = readGamepad(Array.from(pads).find(isSupportedGamepad));
    for (const key of blocked) if (!next[key]) blocked.delete(key);
    for (const key of blocked) next[key] = key.startsWith("look") ? 0 : false;
    gamepad = next;
    for (const key of ["w", "s", "a", "d", " ", "e"]) merge(key);
    keys.lookX = next.lookX || 0;
    keys.lookY = next.lookY || 0;
    const pressed = Object.fromEntries(["w", "s", "a", "d", " ", "e"].map(key => [key, Boolean(next[key])]));
    for (const key of Object.keys(pressed)) {
      if (pressed[key] && !previousButtons[key] && !blocked.has(key)) onPress(key, "gamepad");
    }
    previousButtons = pressed;
  }

  addEventListener("keydown", e => {
    const key = e.key.toLowerCase();
    if (e.target?.closest?.("input, select, textarea") && key !== "escape") return;
    if (key.startsWith("arrow") || key === " ") e.preventDefault();
    keyboard[key] = true;
    merge(key);
    if (!e.repeat) onPress(key);
  });
  addEventListener("keyup", e => {
    const key = e.key.toLowerCase();
    keyboard[key] = false;
    merge(key);
  });
  addEventListener("mousedown", e => {
    if (e.button === 0 && e.target instanceof HTMLCanvasElement) keys.fire = true;
  });
  addEventListener("mouseup", e => { if (e.button === 0) keys.fire = false; });
  addEventListener("mousemove", e => {
    if (document.pointerLockElement) onLook(e.movementX, e.movementY);
  });
  document.addEventListener("pointerlockchange", () => {
    if (!document.pointerLockElement) clear();
  });
  addEventListener("blur", () => { focused = false; clear(); });
  addEventListener("focus", () => { focused = true; });
  document.addEventListener("visibilitychange", () => { if (document.hidden) clear(); });

  return { keys, clear, pollGamepad };
}
