import { DIVE_DURATION, SPIN_DURATION } from "./lobby.js";

const RENDER_DELAY_MS = 100;
const lerp = (from, to, fraction) => from + (to - from) * fraction;
const angleDelta = (from, to) => Math.atan2(Math.sin(to - from), Math.cos(to - from));

export function createLanRaceView() {
  let snapshots = [];

  function trim(time) {
    while (snapshots.length > 2 && snapshots[1].time <= time) snapshots.shift();
  }

  return {
    reset() { snapshots = []; },
    push(racers, now) {
      snapshots.push({ racers, time: now });
      trim(now - RENDER_DELAY_MS);
    },
    sample(now) {
      const time = now - RENDER_DELAY_MS;
      trim(time);
      const [from, to] = snapshots;
      if (!from) return null;
      if (!to) return from.racers;
      if (time >= to.time) return to.racers;
      if (time <= from.time) return from.racers;
      const fraction = (time - from.time) / (to.time - from.time);
      const previous = new Map(from.racers.map(racer => [racer.id, racer]));
      return to.racers.map(next => {
        const before = previous.get(next.id);
        if (!before) return next;
        const racer = {
          ...before,
          x: lerp(before.x, next.x, fraction),
          z: lerp(before.z, next.z, fraction),
          yaw: before.yaw + angleDelta(before.yaw, next.yaw) * fraction,
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
    },
  };
}
