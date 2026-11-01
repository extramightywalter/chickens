export function createInput(onPress) {
  const keys = {};

  function clear() {
    for (const key of Object.keys(keys)) delete keys[key];
  }

  addEventListener("keydown", e => {
    const key = e.key.toLowerCase();
    if (key.startsWith("arrow") || key === " ") e.preventDefault();
    keys[key] = true;
    if (!e.repeat) onPress(key);
  });
  addEventListener("keyup", e => { keys[e.key.toLowerCase()] = false; });
  addEventListener("blur", clear);
  document.addEventListener("visibilitychange", () => { if (document.hidden) clear(); });

  return { keys, clear };
}
