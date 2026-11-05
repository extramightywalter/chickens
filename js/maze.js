import { EGG_LIMIT } from "./eggs.js";
import { R, SPEED, TURN } from "./track.js";

export const MAZE_SIZE = EGG_LIMIT * 2 * Math.sqrt(1.5);
export const MAZE_COLS = 14;
export const MAZE_CELL = MAZE_SIZE / MAZE_COLS;
export const MAZE_WALL_THICKNESS = 0.3;
export const MAZE_WALL_HEIGHT = 4.8;
export const MAZE_SIGHT_RANGE = 12;
export const MAZE_SIGHT_COS = Math.cos(Math.PI / 4);
export const MAZE_FINISH_RADIUS = 1;
const MONSTER_SPEED = SPEED * 0.38;
const CHASE_SPEED = SPEED * 0.72;
const count = MAZE_COLS * MAZE_COLS;

export function mazePosition(cell) {
  return {
    x: (cell % MAZE_COLS + 0.5) * MAZE_CELL - MAZE_SIZE / 2,
    z: (Math.floor(cell / MAZE_COLS) + 0.5) * MAZE_CELL - MAZE_SIZE / 2,
  };
}

export function mazeCellAt({ x, z }) {
  const col = Math.max(0, Math.min(MAZE_COLS - 1, Math.floor((x + MAZE_SIZE / 2) / MAZE_CELL)));
  const row = Math.max(0, Math.min(MAZE_COLS - 1, Math.floor((z + MAZE_SIZE / 2) / MAZE_CELL)));
  return row * MAZE_COLS + col;
}

function neighbors(cell) {
  const col = cell % MAZE_COLS, row = Math.floor(cell / MAZE_COLS);
  return [
    ...(col > 0 ? [cell - 1] : []), ...(col < MAZE_COLS - 1 ? [cell + 1] : []),
    ...(row > 0 ? [cell - MAZE_COLS] : []), ...(row < MAZE_COLS - 1 ? [cell + MAZE_COLS] : []),
  ];
}

export function mazePath(maze, from, to) {
  const queue = [from], parents = new Map([[from, null]]);
  for (let index = 0; index < queue.length; index++) {
    const cell = queue[index];
    if (cell === to) break;
    for (const next of maze.links[cell]) {
      if (parents.has(next)) continue;
      parents.set(next, cell);
      queue.push(next);
    }
  }
  if (!parents.has(to)) throw new Error("Maze exit is unreachable");
  const path = [];
  for (let cell = to; cell !== null; cell = parents.get(cell)) path.push(cell);
  return path.reverse();
}

export function generateMaze(random = Math.random) {
  const links = Array.from({ length: count }, () => []);
  const visited = new Set([0]), stack = [0];
  while (stack.length) {
    const cell = stack.at(-1);
    const choices = neighbors(cell).filter(next => !visited.has(next));
    if (!choices.length) {
      stack.pop();
      continue;
    }
    const next = choices[Math.floor(random() * choices.length)];
    links[cell].push(next);
    links[next].push(cell);
    visited.add(next);
    stack.push(next);
  }
  const shortcuts = links.flatMap((connected, cell) => neighbors(cell)
    .filter(next => next > cell && !connected.includes(next))
    .map(next => [cell, next]));
  // Open extra passages throughout the maze so routes can split and rejoin.
  for (let index = shortcuts.length - 1; index > 0; index--) {
    const other = Math.floor(random() * (index + 1));
    [shortcuts[index], shortcuts[other]] = [shortcuts[other], shortcuts[index]];
  }
  for (const [cell, next] of shortcuts.slice(0, 48)) {
    links[cell].push(next);
    links[next].push(cell);
  }
  const maze = { links, walls: [], start: 0, exit: 0 };
  const queue = [0], distances = new Map([[0, 0]]);
  for (let index = 0; index < queue.length; index++) {
    const cell = queue[index];
    for (const next of links[cell]) {
      if (distances.has(next)) continue;
      distances.set(next, distances.get(cell) + 1);
      queue.push(next);
    }
  }
  const farthest = Math.max(...distances.values());
  const exitCandidates = [...distances]
    .filter(([cell, distance]) => cell !== maze.start &&
      distance >= Math.ceil(farthest * 0.8) && distance < farthest)
    .map(([cell]) => cell);
  maze.exit = exitCandidates[Math.floor(random() * exitCandidates.length)] ?? queue.at(-1);
  const half = MAZE_WALL_THICKNESS / 2, limit = MAZE_SIZE / 2;
  for (let row = 0; row <= MAZE_COLS; row++) {
    for (let col = 0; col < MAZE_COLS; col++) {
      const cell = row * MAZE_COLS + col;
      if (row > 0 && row < MAZE_COLS && links[cell].includes(cell - MAZE_COLS)) continue;
      const x = col * MAZE_CELL - limit, z = row * MAZE_CELL - limit;
      maze.walls.push({ minX: x - half, maxX: x + MAZE_CELL + half, minZ: z - half, maxZ: z + half });
    }
  }
  for (let col = 0; col <= MAZE_COLS; col++) {
    for (let row = 0; row < MAZE_COLS; row++) {
      const cell = row * MAZE_COLS + col;
      if (col > 0 && col < MAZE_COLS && links[cell].includes(cell - 1)) continue;
      const x = col * MAZE_CELL - limit, z = row * MAZE_CELL - limit;
      maze.walls.push({ minX: x - half, maxX: x + half, minZ: z - half, maxZ: z + MAZE_CELL + half });
    }
  }
  maze.key = links.map(cells => cells.join(",")).join("|");
  return maze;
}

// Fraction of a segment before it hits a wall, also used to keep the camera in its corridor.
export function mazeClearFraction(walls, from, to, padding = 0) {
  let fraction = 1;
  for (const wall of walls) {
    let near = 0, far = 1;
    for (const [axis, min, max] of [
      ["x", wall.minX - padding, wall.maxX + padding],
      ["z", wall.minZ - padding, wall.maxZ + padding],
    ]) {
      const delta = to[axis] - from[axis];
      if (Math.abs(delta) < 1e-10) {
        if (from[axis] < min || from[axis] > max) far = -1;
      } else {
        const a = (min - from[axis]) / delta, b = (max - from[axis]) / delta;
        near = Math.max(near, Math.min(a, b));
        far = Math.min(far, Math.max(a, b));
      }
    }
    if (near <= far && far >= 0) fraction = Math.min(fraction, near);
  }
  return fraction;
}

export function mazeCanSee(maze, monster, racer) {
  const dx = racer.x - monster.x, dz = racer.z - monster.z;
  const distance = Math.hypot(dx, dz);
  return distance <= MAZE_SIGHT_RANGE &&
    (distance < 1e-8 || (Math.sin(monster.yaw) * dx + Math.cos(monster.yaw) * dz) /
      distance >= MAZE_SIGHT_COS) &&
    mazeClearFraction(maze.walls, monster, racer) === 1;
}

function spawnRacer(maze, racer, index) {
  const start = mazePosition(maze.start), next = mazePosition(maze.links[maze.start][0]);
  const yaw = Math.atan2(next.x - start.x, next.z - start.z);
  const side = (index % 4 - 1.5) * 0.42, back = Math.floor(index / 4) * 0.55 - 0.275;
  Object.assign(racer, {
    x: start.x + Math.cos(yaw) * side - Math.sin(yaw) * back,
    z: start.z - Math.sin(yaw) * side - Math.cos(yaw) * back,
    yaw, mazeWaypoint: null, spinTimer: 0, diveTimer: 0,
  });
}

export function createMazeRound(random = Math.random) {
  let exploration = new WeakMap();

  function reset(state, racers) {
    exploration = new WeakMap();
    state.maze = generateMaze(random);
    racers.forEach((racer, index) => {
      racer.mazeRestarts = 0;
      racer.eliminated = false;
      spawnRacer(state.maze, racer, index);
    });
    const candidates = Array.from({ length: count }, (_, cell) => cell)
      .filter(cell => mazePath(state.maze, 0, cell).length > 8 && cell !== state.maze.exit);
    const monsterCount = 2 + Math.floor(random() * 3);
    state.mazeMonsters = Array.from({ length: monsterCount }, (_, id) => {
      const index = Math.floor(random() * candidates.length);
      const cell = candidates.splice(index, 1)[0];
      return {
        id, ...mazePosition(cell), yaw: random() * Math.PI * 2, walk: 0,
        waypoint: null, lastSeen: null, targetId: null,
      };
    });
  }

  function chooseControls(state, racer) {
    const cell = mazeCellAt(racer);
    if (racer.mazeWaypoint === null) {
      const center = mazePosition(cell);
      if (Math.hypot(center.x - racer.x, center.z - racer.z) > 0.3) {
        racer.mazeWaypoint = cell;
      } else {
        let memory = exploration.get(racer);
        if (!memory) {
          memory = { visited: new Set([cell]), trail: [cell] };
          exploration.set(racer, memory);
        }
        const choices = state.maze.links[cell].filter(next => !memory.visited.has(next));
        if (choices.length) {
          const next = choices[Math.floor(random() * choices.length)];
          memory.visited.add(next);
          memory.trail.push(next);
          racer.mazeWaypoint = next;
        } else {
          if (memory.trail.length > 1) memory.trail.pop();
          racer.mazeWaypoint = memory.trail.at(-1);
        }
      }
    }
    const target = mazePosition(racer.mazeWaypoint);
    if (Math.hypot(target.x - racer.x, target.z - racer.z) < 0.25) racer.mazeWaypoint = null;
    const yaw = Math.atan2(target.x - racer.x, target.z - racer.z);
    const error = Math.atan2(Math.sin(yaw - racer.yaw), Math.cos(yaw - racer.yaw));
    racer.controls = {
      forward: Math.abs(error) < 0.16 ? 1 : 0,
      turn: Math.abs(error) > TURN * 0.01 ? Math.sign(error) : 0,
    };
  }

  function updateMonsters(state, racers, dt) {
    for (const monster of state.mazeMonsters) {
      const visible = racers.filter(racer => !racer.eliminated && mazeCanSee(state.maze, monster, racer))
        .sort((a, b) => Math.hypot(a.x - monster.x, a.z - monster.z) -
          Math.hypot(b.x - monster.x, b.z - monster.z));
      monster.targetId = visible[0]?.id ?? null;
      if (visible.length) monster.lastSeen = { x: visible[0].x, z: visible[0].z };
      const cell = mazeCellAt(monster);
      if (monster.lastSeen && mazeCellAt(monster.lastSeen) === cell &&
          (monster.waypoint === null || visible.length)) {
        if (Math.hypot(monster.lastSeen.x - monster.x, monster.lastSeen.z - monster.z) < 0.05 &&
            !visible.length) monster.lastSeen = null;
        else monster.waypoint = { ...monster.lastSeen };
      }
      if (monster.waypoint === null) {
        const center = mazePosition(cell);
        if (Math.hypot(center.x - monster.x, center.z - monster.z) > 0.01) {
          monster.waypoint = center;
        } else {
          const choices = state.maze.links[cell];
          const next = monster.lastSeen === null ?
            choices[Math.floor(random() * choices.length)] :
            mazePath(state.maze, cell, mazeCellAt(monster.lastSeen))[1];
          monster.waypoint = mazePosition(next);
        }
      }
      const target = monster.waypoint;
      const dx = target.x - monster.x, dz = target.z - monster.z, distance = Math.hypot(dx, dz);
      const step = Math.min(distance, (monster.lastSeen === null ? MONSTER_SPEED : CHASE_SPEED) * dt);
      if (distance > 0) {
        monster.yaw = Math.atan2(dx, dz);
        monster.x += dx / distance * step;
        monster.z += dz / distance * step;
        monster.walk += step * 2;
      }
      if (distance <= step + 1e-8) monster.waypoint = null;
      for (const [index, racer] of racers.entries()) {
        if (racer.eliminated) continue;
        // The start chamber is a safe reset point, not a place for monsters to camp.
        if (mazePath(state.maze, 0, mazeCellAt(racer)).length <= 3) continue;
        if (Math.hypot(racer.x - monster.x, racer.z - monster.z) < R * 2 &&
            mazeClearFraction(state.maze.walls, monster, racer) === 1) {
          racer.mazeRestarts++;
          racer.eliminated = racer.mazeRestarts >= 5;
          if (!racer.eliminated) spawnRacer(state.maze, racer, index);
          else racer.controls = { forward: 0, turn: 0 };
          exploration.delete(racer);
          monster.targetId = null;
          monster.lastSeen = null;
        }
      }
    }
  }

  function advance(state, racers, dt, move) {
    const steps = Math.max(1, Math.ceil(dt / 0.02)), step = dt / steps;
    const exit = mazePosition(state.maze.exit);
    for (let n = 0; n < steps; n++) {
      const arrivals = [];
      for (const racer of racers) {
        if (racer.eliminated) continue;
        const before = { x: racer.x, z: racer.z };
        move(racer, step);
        const dx = racer.x - before.x, dz = racer.z - before.z;
        const ox = before.x - exit.x, oz = before.z - exit.z;
        const a = dx * dx + dz * dz, b = 2 * (ox * dx + oz * dz);
        const c = ox * ox + oz * oz - MAZE_FINISH_RADIUS ** 2;
        const discriminant = b * b - 4 * a * c;
        const fraction = c <= 0 ? 0 : a > 0 && discriminant >= 0 ?
          (-b - Math.sqrt(discriminant)) / (2 * a) : Infinity;
        if (fraction >= 0 && fraction <= 1) arrivals.push({ racer, fraction });
      }
      if (arrivals.length) {
        arrivals.sort((a, b) => a.fraction - b.fraction);
        return [arrivals[0].racer];
      }
      if (step > 0) updateMonsters(state, racers, step);
      const survivors = racers.filter(racer => !racer.eliminated);
      if (racers.length && survivors.length <= 1) return survivors;
    }
    return null;
  }

  return { reset, chooseControls, advance };
}
