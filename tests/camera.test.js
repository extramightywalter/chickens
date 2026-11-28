import assert from "node:assert/strict";
import test from "node:test";
import { clampOrbitPitch, createOrbitState, orbitCamera, updateOrbit } from "../js/camera.js";
import { updateLook } from "../js/input.js";

test("arrow keys orbit the camera around the player without changing its distance", () => {
  const focus = { x: 4, y: 1.6, z: 8 };
  const position = { x: 4, y: 4.2, z: 1.5 };
  const initial = { yaw: 0, pitch: 0 };
  const distance = point => Math.hypot(point.x - focus.x, point.y - focus.y, point.z - focus.z);
  for (const [key, axis, sign] of [
    ["arrowleft", "x", 1], ["arrowright", "x", -1],
    ["arrowup", "y", 1], ["arrowdown", "y", -1],
  ]) {
    const result = orbitCamera(position, focus, updateLook(initial, { [key]: true }, 0.1));
    assert.equal(Math.sign(result[axis] - position[axis]), sign, key);
    assert.ok(Math.abs(distance(result) - distance(position)) < 1e-10, key);
  }
});

test("orbit avoids going below the player or directly overhead", () => {
  const focus = { x: 0, y: 1.6, z: 0 };
  const position = { x: 0, y: 4.2, z: -6.5 };
  const below = orbitCamera(position, focus, { yaw: 0, pitch: -1.1 });
  const above = orbitCamera(position, focus, { yaw: 0, pitch: 1.1 });
  assert.ok(below.y > focus.y);
  assert.ok(Math.hypot(above.x - focus.x, above.z - focus.z) > 0);
  const limit = clampOrbitPitch(position, focus, -1.1);
  const reversed = orbitCamera(position, focus, { yaw: 0, pitch: limit + 0.01 });
  assert.ok(reversed.y > below.y, "reversing at the limit immediately moves the camera");
});

test("orbit returns after three idle seconds and new arrow input restarts the delay", () => {
  const orbit = createOrbitState();
  updateOrbit(orbit, { arrowleft: true, arrowup: true }, 0.5, 0.5);
  const initial = { ...orbit.look };
  updateOrbit(orbit, {}, 0.05, 2.99);
  assert.deepEqual(orbit.look, initial);
  updateOrbit(orbit, {}, 0.01, 0.01);
  assert.deepEqual(orbit.look, initial);
  updateOrbit(orbit, {}, 0.05, 0.05);
  assert.ok(orbit.look.yaw < initial.yaw && orbit.look.pitch < initial.pitch);
  updateOrbit(orbit, { arrowright: true }, 0.05, 0.05);
  const resumed = { ...orbit.look };
  updateOrbit(orbit, {}, 0.05, 2.99);
  assert.deepEqual(orbit.look, resumed);
  for (let i = 0; i < 100; i++) updateOrbit(orbit, {}, 0.05, 0.05);
  assert.equal(orbit.active, false);
  assert.deepEqual(orbit.look, { yaw: 0, pitch: 0 });
});

test("return takes the shortest route after multiple orbits", () => {
  const orbit = createOrbitState();
  orbit.active = true;
  orbit.look.yaw = Math.PI * 2 + 0.5;
  updateOrbit(orbit, {}, 0.05, 3.05);
  assert.ok(orbit.look.yaw > 0 && orbit.look.yaw < 0.5);
});

test("right stick orbits and restarts the camera return timer", () => {
  const orbit = createOrbitState();
  updateOrbit(orbit, { lookX: 0.5, lookY: -0.5 }, 0.5, 0.5);
  assert.equal(orbit.active, true);
  assert.ok(orbit.look.yaw < 0);
  assert.ok(orbit.look.pitch > 0);
  const look = { ...orbit.look };
  updateOrbit(orbit, {}, 0.05, 2.99);
  assert.deepEqual(orbit.look, look);
});
