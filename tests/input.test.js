import assert from "node:assert/strict";
import test from "node:test";
import { createInput, navigateGamepadMenu, readGamepad, updateLook } from "../js/input.js";

function controller() {
  return {
    connected: true,
    mapping: "standard",
    axes: [0, 0, 0, 0],
    buttons: Array.from({ length: 16 }, () => ({ pressed: false })),
  };
}

test("arrow keys look in each direction at a frame-rate independent speed", () => {
  const initial = { yaw: 0, pitch: 0 };
  for (const [key, axis, sign] of [
    ["arrowleft", "yaw", 1], ["arrowright", "yaw", -1],
    ["arrowup", "pitch", 1], ["arrowdown", "pitch", -1],
  ]) {
    const once = updateLook(initial, { [key]: true }, 0.2);
    const twice = updateLook(updateLook(initial, { [key]: true }, 0.1), { [key]: true }, 0.1);
    assert.equal(Math.sign(once[axis]), sign);
    assert.deepEqual(once, twice);
  }
  assert.deepEqual(updateLook(initial, {
    arrowleft: true, arrowright: true, arrowup: true, arrowdown: true,
  }, 1), initial);
  assert.equal(updateLook(initial, { arrowup: true }, 10).pitch, 1.1);
  assert.equal(updateLook(initial, { arrowdown: true }, 10).pitch, -1.1);
});

test("standard gamepad maps sticks, D-pad and action buttons with a dead zone", () => {
  const pad = controller();
  pad.axes = [-0.6, -1, 0.6, -0.6];
  pad.buttons[0].pressed = true;
  pad.buttons[1].pressed = true;
  const keys = readGamepad(pad);
  assert.equal(keys.w, true);
  assert.equal(keys.a, true);
  assert.equal(keys[" "], true);
  assert.equal(keys.e, true);
  assert.ok(Math.abs(keys.lookX - 0.5) < 1e-10);
  assert.ok(Math.abs(keys.lookY + 0.5) < 1e-10);
  const look = updateLook({ yaw: 0, pitch: 0 }, keys, 1);
  assert.ok(Math.abs(look.yaw + 0.9) < 1e-10);
  assert.ok(Math.abs(look.pitch - 0.9) < 1e-10);
  pad.axes = [0.2, -0.2, 0.2, -0.2];
  pad.buttons[13].pressed = true;
  pad.buttons[15].pressed = true;
  assert.deepEqual(readGamepad(pad), {
    w: false, s: true, a: false, d: true, " ": true, e: true, lookX: 0, lookY: 0,
  });
  pad.mapping = "";
  assert.deepEqual(readGamepad(pad), {});
});

test("unmapped Linux 8BitDo Ultimate 2C uses its joystick and D-pad axes", () => {
  const pad = controller();
  pad.id = "8BitDo Ultimate 2C Wireless Controller (Vendor: 2dc8 Product: 301c)";
  pad.mapping = "";
  pad.axes = [-1, 1, 0.6, -0.6, 0, 0, 1, -1];
  pad.buttons[0].pressed = true;
  pad.buttons[1].pressed = true;
  const keys = readGamepad(pad);
  assert.deepEqual([keys.w, keys.s, keys.a, keys.d, keys[" "], keys.e],
    [true, true, true, true, true, true]);
  assert.ok(Math.abs(keys.lookX - 0.5) < 1e-10);
  assert.ok(Math.abs(keys.lookY + 0.5) < 1e-10);
  pad.id = "Unknown controller (Vendor: 1234 Product: 301c)";
  assert.deepEqual(readGamepad(pad), {});
});

test("gamepad presses fire once, merge with keyboard, clear safely and disconnect", t => {
  const windowListeners = {};
  const documentListeners = {};
  const pad = controller();
  let pads = [pad];
  const globals = {
    addEventListener: (type, listener) => { windowListeners[type] = listener; },
    document: {
      hidden: false,
      addEventListener: (type, listener) => { documentListeners[type] = listener; },
    },
    navigator: { getGamepads: () => pads },
  };
  for (const [name, value] of Object.entries(globals)) {
    const original = Object.getOwnPropertyDescriptor(globalThis, name);
    Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
    t.after(() => original ? Object.defineProperty(globalThis, name, original) : delete globalThis[name]);
  }
  const presses = [];
  const input = createInput(key => presses.push(key));
  const event = key => ({ key, target: {}, preventDefault() {}, repeat: false });

  windowListeners.keydown(event("w"));
  pad.axes[1] = -1;
  pad.buttons[0].pressed = true;
  pad.buttons[1].pressed = true;
  input.pollGamepad();
  input.pollGamepad();
  assert.deepEqual(presses, ["w", "w", " ", "e"]);
  windowListeners.keyup(event("w"));
  assert.equal(input.keys.w, true);
  assert.equal(input.keys[" "], true);
  assert.equal(input.keys.e, true);
  pad.axes[1] = 0;
  input.pollGamepad();
  assert.equal(input.keys.w, false);

  input.clear();
  input.pollGamepad();
  assert.equal(input.keys[" "], false);
  assert.equal(input.keys.e, false);
  pad.buttons[0].pressed = false;
  pad.buttons[1].pressed = false;
  input.pollGamepad();
  pad.buttons[1].pressed = true;
  input.pollGamepad();
  assert.deepEqual(presses, ["w", "w", " ", "e", "e"]);

  windowListeners.blur();
  input.pollGamepad();
  windowListeners.focus();
  input.pollGamepad();
  assert.equal(input.keys.e, false);
  pad.buttons[1].pressed = false;
  input.pollGamepad();
  pad.buttons[1].pressed = true;
  input.pollGamepad();
  assert.equal(input.keys.e, true);
  pads = [];
  input.pollGamepad();
  assert.equal(input.keys.e, false);

  pad.mapping = "";
  pad.id = "8BitDo Ultimate 2C (Vendor: 2dc8 Product: 301c)";
  pad.axes = [0, 0, 0, 0, 0, 0, 0, -1];
  pads = [{ ...pad, id: "Unknown", mapping: "" }, pad];
  input.pollGamepad();
  assert.equal(input.keys.w, true);
});

test("gamepad menu navigation skips hidden and disabled controls and changes selections", t => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "document");
  const document = { activeElement: null };
  Object.defineProperty(globalThis, "document", { value: document, configurable: true, writable: true });
  t.after(() => original ? Object.defineProperty(globalThis, "document", original) : delete globalThis.document);
  let clicked = 0;
  let changes = 0;
  const makeControl = (tagName, hidden = false, disabled = false) => ({
    tagName, disabled, closest: () => hidden ? {} : null,
    focus() { document.activeElement = this; },
    click() { clicked++; },
  });
  const button = makeControl("BUTTON");
  const select = Object.assign(makeControl("SELECT"), {
    options: [{}, {}, {}], selectedIndex: 0,
    dispatchEvent(event) { assert.equal(event.type, "change"); changes++; },
  });
  const overlay = { querySelectorAll: () => [button, makeControl("BUTTON", true), makeControl("BUTTON", false, true), select] };
  navigateGamepadMenu(overlay, "s");
  assert.equal(document.activeElement, button);
  navigateGamepadMenu(overlay, " ");
  assert.equal(clicked, 1);
  navigateGamepadMenu(overlay, "s");
  assert.equal(document.activeElement, select);
  navigateGamepadMenu(overlay, "d");
  assert.equal(select.selectedIndex, 1);
  assert.equal(changes, 1);
  navigateGamepadMenu(overlay, "w");
  assert.equal(document.activeElement, button);
});
