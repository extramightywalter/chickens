export const CELL = 2;
export const WALL_H = 3;
export const R = 0.7;
export const SPEED = 9;
export const TURN = 2.6;
export const LAPS_TO_WIN = 3;
export const RIVAL_SPEED = SPEED;
export const CHICKEN_SCALE = 0.7;
// Width of chicken.glb at the player's rendered scale.
export const CHICKEN_WIDTH = 1.8561395 * CHICKEN_SCALE;
export const LOBBY_BUILDING_WIDTH = CHICKEN_WIDTH * 10;

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

export const LOBBY_BOUNDS = { minX: -70, maxX: 38, minZ: 0, maxZ: 72 };
export const LOBBY_MAP = [
  "         x",
  "         rr",
  "         rr            x",
  "rrrrrrrrrrrrr          rr",
  "  rrrrrrrrrrrrrrrr     rr",
  "      rrrrrrrrrrrrrrrrrrrrrrrr y",
  "    rr           rr      rr",
  "   rrr           rr       rr",
  "  x               x       rr",
  "                          z",
].map(row => row.padEnd(36));
export const LOBBY_COLS = LOBBY_MAP[0].length;
export const LOBBY_ROWS = LOBBY_MAP.length;
export const LOBBY_CELL_WIDTH = (LOBBY_BOUNDS.maxX - LOBBY_BOUNDS.minX) / LOBBY_COLS;
export const LOBBY_CELL_DEPTH = (LOBBY_BOUNDS.maxZ - LOBBY_BOUNDS.minZ) / LOBBY_ROWS;

const LOBBY_STRUCTURE_TYPES = {
  x: { type: "house", asset: "../home.glb", width: 1.728000164, depth: 1.8472936 },
  y: { type: "games", asset: "../games.glb", width: 3.9, depth: 5.035 },
  z: { type: "shop", asset: "../tests/shop.glb", width: 8.5856, depth: 7.55700434 },
};

export function lobbyCellPosition(column, row) {
  return {
    x: LOBBY_BOUNDS.minX + (column + 0.5) * LOBBY_CELL_WIDTH,
    z: LOBBY_BOUNDS.minZ + (row + 0.5) * LOBBY_CELL_DEPTH,
  };
}

export const lobbyStructures = LOBBY_MAP.flatMap((line, row) =>
  [...line].flatMap((key, column) => {
    const structure = LOBBY_STRUCTURE_TYPES[key];
    if (!structure) return [];
    const position = lobbyCellPosition(column, row);
    const scale = LOBBY_BUILDING_WIDTH / structure.width;
    return [{
      ...structure, ...position, key, scale,
      width: structure.width * scale, depth: structure.depth * scale,
    }];
  })
);
export const LOBBY_SPAWN = lobbyCellPosition(0, 3);
export const BUTTON = { ...lobbyCellPosition(27, 5), r: 1.8 };

// The same wall bounds drive collision detection around the lobby buildings.
export const lobbyWalls = lobbyStructures.map(({ x, z, width, depth }) => ({
  minX: x - width / 2, maxX: x + width / 2,
  minZ: z - depth / 2, maxZ: z + depth / 2,
}));

export const PAINTINGS = [
  { x: 103, z: 10, yaw: 0 },
  { x: 55, z: 2, yaw: 0 },
  { x: 4, z: 23, yaw: Math.PI / 2 },
  { x: 40, z: 38, yaw: Math.PI },
];

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
