import { updateLook } from "./input.js";

export function createOrbitState() {
  return { look: { yaw: 0, pitch: 0 }, idleTime: 0, active: false };
}

export function updateOrbit(state, keys, dt, elapsed) {
  if (keys.arrowleft || keys.arrowright || keys.arrowup || keys.arrowdown || keys.lookX || keys.lookY) {
    state.active = true;
    state.idleTime = 0;
    state.look = updateLook(state.look, keys, dt);
  } else if (state.active) {
    state.idleTime += elapsed;
    if (state.idleTime <= 3) return;
    const yaw = Math.atan2(Math.sin(state.look.yaw), Math.cos(state.look.yaw));
    const remaining = Math.exp(-5 * Math.min(dt, state.idleTime - 3));
    state.look = { yaw: yaw * remaining, pitch: state.look.pitch * remaining };
    if (Math.abs(state.look.yaw) < 0.001 && Math.abs(state.look.pitch) < 0.001) {
      state.look = { yaw: 0, pitch: 0 };
      state.active = false;
    }
  }
}

export function clampOrbitPitch(position, focus, pitch) {
  const elevation = Math.atan2(position.y - focus.y,
    Math.hypot(position.x - focus.x, position.z - focus.z));
  return Math.max(0.08 - elevation, Math.min(Math.PI / 2 - 0.08 - elevation, pitch));
}

export function orbitCamera(position, focus, look) {
  const x = position.x - focus.x;
  const y = position.y - focus.y;
  const z = position.z - focus.z;
  const horizontal = Math.hypot(x, z);
  const distance = Math.hypot(horizontal, y);
  const elevation = Math.atan2(y, horizontal) + clampOrbitPitch(position, focus, look.pitch);
  const angle = Math.atan2(x, z) - look.yaw;
  const radius = distance * Math.cos(elevation);
  return {
    x: focus.x + Math.sin(angle) * radius,
    y: focus.y + Math.sin(elevation) * distance,
    z: focus.z + Math.cos(angle) * radius,
  };
}
