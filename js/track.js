export const CELL = 2;
export const WALL_H = 3;
export const R = 0.7;
export const SPEED = 9;
export const TURN = 2.6;
export const LAPS_TO_WIN = 3;
export const RIVAL_SPEED = SPEED;

// Follow the sketch's long perimeter; the solid infield seals every shortcut.
export const ROUTE = [
  [51, 10], [51, 6], [37, 6], [34, 2], [19, 2], [16, 5],
  [15, 11], [3, 11], [3, 17], [28, 17], [33, 14], [51, 14],
];
export const cols = 55, rows = 21;
export const MAP = Array.from({ length: rows }, () => Array(cols).fill("x"));
for (let n = 0; n < ROUTE.length; n++) {
  const [ax, az] = ROUTE[n];
  const [bx, bz] = ROUTE[(n + 1) % ROUTE.length];
  const steps = Math.ceil(Math.hypot(bx - ax, bz - az) * 4);
  for (let t = 0; t <= steps; t++) {
    const x = Math.round(ax + (bx - ax) * t / steps);
    const z = Math.round(az + (bz - az) * t / steps);
    for (let j = z - 1; j <= z + 1; j++) {
      for (let i = x - 1; i <= x + 1; i++) MAP[j][i] = " ";
    }
  }
}
export const checkpoints = ROUTE.map(([x, z]) => ({
  x: (x + 0.5) * CELL, z: (z + 0.5) * CELL,
}));
export const START = checkpoints[0];
export const LOBBY_SPAWN = { x: -58, z: 15 };
export const BUTTON = { x: -34, z: 15, r: 1.8 };
export const PAINTINGS = [
  { x: 103, z: 10, yaw: 0 },
  { x: 55, z: 2, yaw: 0 },
  { x: 4, z: 23, yaw: Math.PI / 2 },
  { x: 40, z: 38, yaw: Math.PI },
];
export const LOBBY_PAINTING = { x: -23, z: 15, yaw: -Math.PI / 2 };

// The same wall bounds drive rendering and collision detection.
export const trackWalls = [];
for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
  if (MAP[j][i] !== "x") continue;
  const first = i;
  while (i + 1 < cols && MAP[j][i + 1] === "x") i++;
  trackWalls.push({
    minX: first * CELL, maxX: (i + 1) * CELL,
    minZ: j * CELL, maxZ: (j + 1) * CELL,
  });
}
export const lobbyWalls = [
  { minX: -70, maxX: -22, minZ: 0, maxZ: 1 },
  { minX: -70, maxX: -22, minZ: 29, maxZ: 30 },
  { minX: -70, maxX: -69, minZ: 1, maxZ: 29 },
  { minX: -23, maxX: -22, minZ: 1, maxZ: 29 },
];
