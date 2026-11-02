import assert from "node:assert/strict";
import test from "node:test";
import { createSoundEffects } from "../js/audio.js";

class FakeParam {
  setValueAtTime() {}
  exponentialRampToValueAtTime() {}
}

class FakeNode {
  connect() {}
}

class FakeAudioContext {
  constructor() {
    FakeAudioContext.instance = this;
    this.currentTime = 0;
    this.sampleRate = 1000;
    this.destination = new FakeNode();
    this.oscillators = 0;
    this.sources = 0;
  }

  createGain() {
    return Object.assign(new FakeNode(), { gain: new FakeParam() });
  }

  createOscillator() {
    this.oscillators++;
    return Object.assign(new FakeNode(), {
      frequency: new FakeParam(),
      start() {},
      stop() {},
    });
  }

  createBufferSource() {
    this.sources++;
    return Object.assign(new FakeNode(), { start() {} });
  }

  createBiquadFilter() {
    return Object.assign(new FakeNode(), { frequency: new FakeParam() });
  }

  createBuffer(channels, length) {
    assert.equal(channels, 1);
    return { getChannelData: () => new Float32Array(length) };
  }
}

test("countdown beeps and both racers squawk only during the race", () => {
  const previousWindow = globalThis.window;
  globalThis.window = { AudioContext: FakeAudioContext };
  try {
    const sounds = createSoundEffects();
    sounds.countdownBeep(3);
    const context = FakeAudioContext.instance;
    assert.equal(context.oscillators, 1);

    sounds.startRace();
    assert.equal(context.oscillators, 2);
    assert.equal(context.sources, 1);
    sounds.updateRace("countdown", 60);
    sounds.updateRace("track", 19);
    assert.equal(context.oscillators, 2);

    sounds.updateRace("track", 41);
    assert.equal(context.oscillators, 6);
    sounds.updateRace("finished", 100);
    assert.equal(context.oscillators, 6);
  } finally {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  }
});

test("pillow rounds use the same start and chicken sounds", () => {
  const previousWindow = globalThis.window;
  globalThis.window = { AudioContext: FakeAudioContext };
  try {
    const sounds = createSoundEffects();
    sounds.startRace();
    const context = FakeAudioContext.instance;
    sounds.updateRace("pillows", 61);
    assert.equal(context.sources, 1);
    assert.equal(context.oscillators, 5);
  } finally {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  }
});
