export function createSoundEffects() {
  let context;
  let master;
  let playerSquawkIn;
  let rivalSquawkIn;
  let audioUnavailable = false;

  function getAudio() {
    if (context) return context;
    if (!window.AudioContext) {
      if (!audioUnavailable) console.warn("Web Audio is unavailable; game sounds are disabled.");
      audioUnavailable = true;
      return null;
    }
    context = new window.AudioContext();
    master = context.createGain();
    master.gain.value = 0.45;
    master.connect(context.destination);
    return context;
  }

  function unlock() {
    const audio = getAudio();
    if (audio && audio.state !== "running") {
      audio.resume().catch(error => console.error("Could not start game audio:", error));
    }
  }

  function playTone(audio, frequency, duration, volume) {
    const now = audio.currentTime;
    const oscillator = audio.createOscillator();
    const envelope = audio.createGain();
    oscillator.type = "square";
    oscillator.frequency.setValueAtTime(frequency * 1.18, now);
    oscillator.frequency.exponentialRampToValueAtTime(frequency, now + duration);
    envelope.gain.setValueAtTime(0.0001, now);
    envelope.gain.exponentialRampToValueAtTime(volume, now + 0.012);
    envelope.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    oscillator.connect(envelope);
    envelope.connect(master);
    oscillator.start(now);
    oscillator.stop(now + duration + 0.01);
  }

  function countdownBeep(number) {
    const audio = getAudio();
    if (audio) playTone(audio, 560 + number * 95, 0.13, 0.16);
  }

  function playBlast() {
    const audio = getAudio();
    if (!audio) return;
    const now = audio.currentTime;

    const length = Math.floor(audio.sampleRate * 0.48);
    const buffer = audio.createBuffer(1, length, audio.sampleRate);
    const samples = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) samples[i] = Math.random() * 2 - 1;

    const noise = audio.createBufferSource();
    const filter = audio.createBiquadFilter();
    const noiseEnvelope = audio.createGain();
    noise.buffer = buffer;
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(900, now);
    filter.frequency.exponentialRampToValueAtTime(120, now + 0.45);
    noiseEnvelope.gain.setValueAtTime(0.0001, now);
    noiseEnvelope.gain.exponentialRampToValueAtTime(0.32, now + 0.015);
    noiseEnvelope.gain.exponentialRampToValueAtTime(0.0001, now + 0.46);
    noise.connect(filter);
    filter.connect(noiseEnvelope);
    noiseEnvelope.connect(master);
    noise.start(now);

    const boom = audio.createOscillator();
    const boomEnvelope = audio.createGain();
    boom.type = "triangle";
    boom.frequency.setValueAtTime(125, now);
    boom.frequency.exponentialRampToValueAtTime(38, now + 0.42);
    boomEnvelope.gain.setValueAtTime(0.0001, now);
    boomEnvelope.gain.exponentialRampToValueAtTime(0.4, now + 0.02);
    boomEnvelope.gain.exponentialRampToValueAtTime(0.0001, now + 0.44);
    boom.connect(boomEnvelope);
    boomEnvelope.connect(master);
    boom.start(now);
    boom.stop(now + 0.46);
  }

  function squawk(basePitch) {
    const audio = getAudio();
    if (!audio) return;
    const now = audio.currentTime;
    for (const [offset, startPitch, endPitch] of [
      [0, basePitch * 1.5, basePitch * 0.85],
      [0.15, basePitch * 1.15, basePitch * 0.62],
    ]) {
      const start = now + offset;
      const oscillator = audio.createOscillator();
      const envelope = audio.createGain();
      oscillator.type = "triangle";
      oscillator.frequency.setValueAtTime(startPitch * (0.9 + Math.random() * 0.2), start);
      oscillator.frequency.exponentialRampToValueAtTime(endPitch, start + 0.12);
      envelope.gain.setValueAtTime(0.0001, start);
      envelope.gain.exponentialRampToValueAtTime(0.2, start + 0.012);
      envelope.gain.exponentialRampToValueAtTime(0.0001, start + 0.17);
      oscillator.connect(envelope);
      envelope.connect(master);
      oscillator.start(start);
      oscillator.stop(start + 0.18);
    }
  }

  function nextSquawkTime() {
    return 20 + Math.random() * 40;
  }

  function startRace() {
    playBlast();
    playerSquawkIn = nextSquawkTime();
    rivalSquawkIn = nextSquawkTime();
  }

  function updateRace(scene, elapsed) {
    if (!["track", "pillows", "doors", "eggs", "egg-battle", "maze", "gun-arena"].includes(scene)) return;
    playerSquawkIn -= elapsed;
    rivalSquawkIn -= elapsed;
    if (playerSquawkIn <= 0) {
      squawk(390);
      playerSquawkIn = nextSquawkTime();
    }
    if (rivalSquawkIn <= 0) {
      squawk(290);
      rivalSquawkIn = nextSquawkTime();
    }
  }

  return { unlock, countdownBeep, startRace, updateRace };
}
