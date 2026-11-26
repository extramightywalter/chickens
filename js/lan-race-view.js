import { DIVE_DURATION, SPIN_DURATION } from "./lobby.js";

const RENDER_DELAY_MS = 100;
const lerp = (from, to, fraction) => from + (to - from) * fraction;
const angleDelta = (from, to) => Math.atan2(Math.sin(to - from), Math.cos(to - from));

export function createLanRaceView() {
  let snapshots = [];
  let latest = null;

  function trim(time) {
    while (snapshots.length > 2 && snapshots[1].time <= time) snapshots.shift();
  }

  return {
    reset() { snapshots = []; latest = null; },
    push(racers, now) {
      snapshots.push({ racers, time: now });
      latest = racers;
      trim(now - RENDER_DELAY_MS);
    },
    sample(now, localId) {
      const time = now - RENDER_DELAY_MS;
      trim(time);
      const [from, to] = snapshots;
      if (!from) return null;
      if (!to) return localId ? latest : from.racers;
      if (time >= to.time) return localId ? latest : to.racers;
      if (time <= from.time) return localId ? latest : from.racers;
      const fraction = (time - from.time) / (to.time - from.time);
      const previous = new Map(from.racers.map(racer => [racer.id, racer]));
      const sampled = to.racers.map(next => {
        const before = previous.get(next.id);
        if (!before) return next;
        const racer = {
          ...before,
          color: next.color,
          appearance: next.appearance,
          x: lerp(before.x, next.x, fraction),
          z: lerp(before.z, next.z, fraction),
          yaw: before.yaw + angleDelta(before.yaw, next.yaw) * fraction,
          pitch: lerp(before.pitch ?? 0, next.pitch ?? 0, fraction),
          jumpHeight: lerp(before.jumpHeight ?? 0, next.jumpHeight ?? 0, fraction),
          cannonY: lerp(before.cannonY ?? 0, next.cannonY ?? 0, fraction),
          cannonAimY: lerp(before.cannonAimY ?? 0, next.cannonAimY ?? 0, fraction),
          cannonTime: lerp(before.cannonTime ?? 0, next.cannonTime ?? 0, fraction),
          controls: next.controls,
          // A stopped walk phase resets to zero; do not rewind through every stride.
          walk: before.walk + (next.walk >= before.walk ? next.walk - before.walk :
            angleDelta(before.walk, next.walk)) * fraction,
        };
        for (const [key, duration] of [["spinTimer", SPIN_DURATION], ["diveTimer", DIVE_DURATION]]) {
          const start = next[key] > before[key] ? duration : before[key];
          racer[key] = lerp(start, next[key], fraction);
        }
        return racer;
      });
      if (localId) {
        const latestLocal = latest?.find(racer => racer.id === localId);
        if (latestLocal) return sampled.map(racer => racer.id === localId ? latestLocal : racer);
      }
      return sampled;
    },
  };
}
