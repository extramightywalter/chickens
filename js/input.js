export function createInput(onPress, onLook = () => {}) {
  const keys = {};

  function clear() {
    for (const key of Object.keys(keys)) delete keys[key];
  }

  addEventListener("keydown", e => {
    const key = e.key.toLowerCase();
    if (e.target?.closest?.("input, select, textarea") && key !== "escape") return;
    if (key.startsWith("arrow") || key === " ") e.preventDefault();
    keys[key] = true;
    if (!e.repeat) onPress(key);
  });
  addEventListener("keyup", e => { keys[e.key.toLowerCase()] = false; });
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
  addEventListener("blur", clear);
  document.addEventListener("visibilitychange", () => { if (document.hidden) clear(); });

  return { keys, clear };
}
