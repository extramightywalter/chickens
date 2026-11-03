export const CELL = 2;
export const WALL_H = 3;
export const R = 0.7;
export const SPEED = 9;
export const TURN = 2.6;
export const LAPS_TO_WIN = 1;
export const TRACK_CHECKPOINT_RADIUS = 2.5;
export const TRACK_SURFACE_Y = 2.5;
const TRACK_EDGE_TOLERANCE = 0.1;
export const RIVAL_SPEED = SPEED;
export const CHICKEN_SCALE = 0.7;
// Width of chicken.glb at the player's rendered scale.
export const CHICKEN_WIDTH = 1.8561395 * CHICKEN_SCALE;
export const LOBBY_BUILDING_WIDTH = CHICKEN_WIDTH * 10;

const SKETCH_ROUTE = [
  [51, 10], [51, 6], [37, 6], [34, 2], [19, 2], [16, 5],
  [15, 11], [3, 11], [3, 17], [28, 17], [33, 14], [51, 14],
];
export const cols = 55, rows = 21;
export const MAP = Array.from({ length: rows }, () => Array(cols).fill("x"));
for (let n = 0; n < SKETCH_ROUTE.length; n++) {
  const [ax, az] = SKETCH_ROUTE[n];
  const [bx, bz] = SKETCH_ROUTE[(n + 1) % SKETCH_ROUTE.length];
  const steps = Math.ceil(Math.hypot(bx - ax, bz - az) * 4);
  for (let t = 0; t <= steps; t++) {
    const x = Math.round(ax + (bx - ax) * t / steps);
    const z = Math.round(az + (bz - az) * t / steps);
    for (let j = z - 1; j <= z + 1; j++) {
      for (let i = x - 1; i <= x + 1; i++) MAP[j][i] = " ";
    }
  }
}

const TRACK_TILE_SIZE = 5;
const TRACK_COLUMNS = 8;
const TRACK_ROWS = 38;
// Tile coordinates and origins follow the centered, rotated race-track model.
const TRACK_SOURCE_X_MIN = -3.5;
const TRACK_SOURCE_Z_MIN = -19.7;
const TRACK_WORLD_X_ORIGIN = 54.019904136657715;
const TRACK_WORLD_Z_ORIGIN = 23.662500143051147;
// One bit per source-model tile; elevated blocks are intentionally excluded.
const TRACK_TILE_MASKS = "3c3c343c18283830203c3c243c2c2838fe828282828282c66c3810302038083820380818103c";

function trackTileExists(column, row) {
  if (column < 0 || column >= TRACK_COLUMNS || row < 0 || row >= TRACK_ROWS) return false;
  const mask = Number.parseInt(TRACK_TILE_MASKS.slice(row * 2, row * 2 + 2), 16);
  return Boolean(mask & (1 << column));
}

function findTrackRoute() {
  const start = [4, 0], finish = [4, TRACK_ROWS - 1];
  const key = ([column, row]) => `${column},${row}`;
  const previous = new Map([[key(start), null]]);
  const queue = [start];
  for (let index = 0; index < queue.length && !previous.has(key(finish)); index++) {
    const [column, row] = queue[index];
    for (const next of [
      [column, row + 1], [column + 1, row], [column, row - 1], [column - 1, row],
    ]) {
      if (!trackTileExists(...next) || previous.has(key(next))) continue;
      previous.set(key(next), [column, row]);
      queue.push(next);
    }
  }
  if (!previous.has(key(finish))) throw new Error("Race track has no flat route from the arch to the finish");

  const tiles = [];
  for (let tile = finish; tile; tile = previous.get(key(tile))) tiles.push(tile);
  tiles.reverse();
  return tiles.map(([column, row]) => {
    const sourceX = TRACK_SOURCE_X_MIN + column + 0.5;
    const sourceZ = TRACK_SOURCE_Z_MIN + row + 0.5;
    return {
      x: TRACK_WORLD_X_ORIGIN + sourceZ * TRACK_TILE_SIZE,
      z: TRACK_WORLD_Z_ORIGIN - sourceX * TRACK_TILE_SIZE,
    };
  });
}

export const ROUTE = findTrackRoute();
export const checkpoints = ROUTE;
export const START = checkpoints[0];
export const FINISH_LANDING = {
  x: checkpoints.at(-1).x, z: checkpoints.at(-1).z, halfWidth: 0.8, halfDepth: 1.1,
};

export function touchesFinishLanding(racer) {
  const closestX = Math.max(FINISH_LANDING.x - FINISH_LANDING.halfWidth,
    Math.min(racer.x, FINISH_LANDING.x + FINISH_LANDING.halfWidth));
  const closestZ = Math.max(FINISH_LANDING.z - FINISH_LANDING.halfDepth,
    Math.min(racer.z, FINISH_LANDING.z + FINISH_LANDING.halfDepth));
  return Math.hypot(racer.x - closestX, racer.z - closestZ) <= R;
}

export function isTrackSupported(x, z) {
  const sourceX = (TRACK_WORLD_Z_ORIGIN - z) / TRACK_TILE_SIZE;
  const sourceZ = (x - TRACK_WORLD_X_ORIGIN) / TRACK_TILE_SIZE;
  const column = Math.floor(sourceX - TRACK_SOURCE_X_MIN);
  const row = Math.floor(sourceZ - TRACK_SOURCE_Z_MIN);
  const tolerance = TRACK_EDGE_TOLERANCE / TRACK_TILE_SIZE;
  for (let candidateRow = row - 1; candidateRow <= row + 1; candidateRow++) {
    for (let candidateColumn = column - 1; candidateColumn <= column + 1; candidateColumn++) {
      if (trackTileExists(candidateColumn, candidateRow) &&
        sourceX >= TRACK_SOURCE_X_MIN + candidateColumn - tolerance &&
        sourceX <= TRACK_SOURCE_X_MIN + candidateColumn + 1 + tolerance &&
        sourceZ >= TRACK_SOURCE_Z_MIN + candidateRow - tolerance &&
        sourceZ <= TRACK_SOURCE_Z_MIN + candidateRow + 1 + tolerance) return true;
    }
  }
  return false;
}

export const LOBBY_BOUNDS = { minX: -70, maxX: 38, minZ: 0, maxZ: 72 };
export const LOBBY_MAP = [
  "         x",
  "         rr",
  "         rr            x",
  "rrrrrrrrrrrrr          rr",
  "r rrrrrrrrrrrrrrrr     rr",
  "r     rrrrrrrrrrrrrrrrrrrrrrrr y",
  "rrrrrrrrrrrrr    rr      rr",
  "   rrr   r       rr       rr",
  "  x      l        x       rr",
  "                          z",
].map(row => row.padEnd(36));
export const LOBBY_COLS = LOBBY_MAP[0].length;
export const LOBBY_ROWS = LOBBY_MAP.length;
export const LOBBY_CELL_WIDTH = (LOBBY_BOUNDS.maxX - LOBBY_BOUNDS.minX) / LOBBY_COLS;
export const LOBBY_CELL_DEPTH = (LOBBY_BOUNDS.maxZ - LOBBY_BOUNDS.minZ) / LOBBY_ROWS;

const LOBBY_STRUCTURE_TYPES = {
  x: {
    type: "house", asset: "../assets/models/home (2).glb", width: 2.53704023, depth: 3.121926,
  },
  y: {
    type: "lobby", asset: "../assets/models/lobby.glb", width: 3.9, depth: 5.035,
    entranceWidth: 1.17, entranceRotation: Math.PI,
  },
  z: {
    type: "shop", asset: "../assets/models/giant-building.glb", width: 8.5856, depth: 7.0548004,
    // The model's north arch is left of center and wider than the default doorway.
    scaleMultiplier: 3, offsetX: 4, entranceWidth: 3.42, entranceOffsetX: -0.71,
  },
  l: {
    type: "laness", asset: "../assets/models/laness.glb", width: 5.27735233, depth: 5.55238318,
    entranceRotation: -Math.PI,
  },
};

export function lobbyCellPosition(column, row) {
  return {
    x: LOBBY_BOUNDS.minX + (column + 0.5) * LOBBY_CELL_WIDTH,
    z: LOBBY_BOUNDS.minZ + (row + 0.5) * LOBBY_CELL_DEPTH,
  };
}

let structureIndex = 0;
export const lobbyStructures = LOBBY_MAP.flatMap((line, row) =>
  [...line].flatMap((key, column) => {
    const structure = LOBBY_STRUCTURE_TYPES[key];
    if (!structure) return [];
    const position = lobbyCellPosition(column, row);
    const scale = LOBBY_BUILDING_WIDTH / structure.width * (structure.scaleMultiplier ?? 1);
    const side = key === "x" ? (row < 3 ? "south" : "north") :
      key === "y" ? "west" : key === "l" ? "north" : "south";
    const modelWidth = structure.width * scale, modelDepth = structure.depth * scale;
    const rotated = side === "west" || side === "east";
    return [{
      ...structure, ...position, x: position.x + (structure.offsetX ?? 0), key, scale,
      id: `${structure.type}-${structureIndex++}`,
      entranceSide: structure.type === "house" ? side :
        structure.type === "shop" ? "north" : side,
      entranceWidth: structure.type === "laness" ? modelWidth :
        structure.entranceWidth ? scale * structure.entranceWidth :
        Math.max(2.8, scale * 0.55),
      entranceOffsetX: scale * (structure.entranceOffsetX ?? 0),
      rotation: { south: 0, west: -Math.PI / 2, north: Math.PI, east: Math.PI / 2 }[side] +
        (structure.entranceRotation ?? 0),
      modelWidth, modelDepth,
      width: rotated ? modelDepth : modelWidth,
      depth: rotated ? modelWidth : modelDepth,
    }];
  })
);
export const LOBBY_SPAWN = lobbyCellPosition(0, 3);
const lobbyStructure = lobbyStructures.find(({ type }) => type === "lobby");
export const BUTTON = {
  x: lobbyStructure.x + 1,
  z: lobbyStructure.z,
  r: 1.8,
};
const lanStructure = lobbyStructures.find(({ type }) => type === "laness");
export const LAN_BUTTON = {
  x: lanStructure.x + lanStructure.width / 2 - 2,
  z: lanStructure.z,
  r: 1.2,
};

const LOBBY_WALL_THICKNESS = 0.2;
function entrancePoint(structure) {
  const { x, z, width, depth, entranceSide } = structure;
  return {
    x: entranceSide === "west" ? x - width / 2 :
      entranceSide === "east" ? x + width / 2 : x + (structure.entranceOffsetX ?? 0),
    z: entranceSide === "north" ? z - depth / 2 :
      entranceSide === "south" ? z + depth / 2 : z,
  };
}
function wall(minX, maxX, minZ, maxZ) {
  return { minX, maxX, minZ, maxZ };
}

export const lobbyEntrances = lobbyStructures.flatMap(structure => {
  const front = { ...structure, ...entrancePoint(structure) };
  if (structure.type !== "laness") return [front];
  const back = { ...structure, entranceSide: "south" };
  return [front, { ...back, ...entrancePoint(back) }];
});

export const lobbyWalls = lobbyStructures
  .filter(({ type }) => type === "house" || type === "shop" || type === "laness")
  .flatMap(structure => {
    const { x, z, width, depth, entranceSide, entranceWidth } = structure;
    const minX = x - width / 2, maxX = x + width / 2;
    const minZ = z - depth / 2, maxZ = z + depth / 2;
    if (structure.type === "laness") {
      return [
        wall(minX, minX + LOBBY_WALL_THICKNESS, minZ, maxZ),
        wall(maxX - LOBBY_WALL_THICKNESS, maxX, minZ, maxZ),
      ];
    }
    const entranceX = x + (structure.entranceOffsetX ?? 0);
    const halfOpening = entranceWidth / 2;
    const walls = [];
    if (entranceSide === "north" || entranceSide === "south") {
      const faceZ = entranceSide === "north" ? minZ : maxZ - LOBBY_WALL_THICKNESS;
      walls.push(
        wall(minX, entranceX - halfOpening, faceZ, faceZ + LOBBY_WALL_THICKNESS),
        wall(entranceX + halfOpening, maxX, faceZ, faceZ + LOBBY_WALL_THICKNESS)
      );
    } else {
      const faceX = entranceSide === "west" ? minX : maxX - LOBBY_WALL_THICKNESS;
      walls.push(
        wall(faceX, faceX + LOBBY_WALL_THICKNESS, minZ, z - halfOpening),
        wall(faceX, faceX + LOBBY_WALL_THICKNESS, z + halfOpening, maxZ)
      );
    }
    if (entranceSide !== "west") walls.push(wall(minX, minX + LOBBY_WALL_THICKNESS, minZ, maxZ));
    if (entranceSide !== "east") walls.push(wall(maxX - LOBBY_WALL_THICKNESS, maxX, minZ, maxZ));
    if (entranceSide !== "north") walls.push(wall(minX, maxX, minZ, minZ + LOBBY_WALL_THICKNESS));
    if (entranceSide !== "south") walls.push(wall(minX, maxX, maxZ - LOBBY_WALL_THICKNESS, maxZ));
    return walls;
  });

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
