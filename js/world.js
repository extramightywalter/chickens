import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { ARENA, CANNONS, CANNON_MUZZLE, PILLOW_RADIUS, arenaWalls } from "./pillows.js";
import {
  DOOR_HALF_WIDTH, DOOR_LEAF_OFFSET, DOOR_MODEL_SCALE, DOOR_XS, FINISH_Z, PATH_END_Z,
  PATH_HALF_WIDTH, PATH_START_Z, gateZs, pathWalls,
} from "./doors.js";
import {
  BUTTON, CELL, CHICKEN_SCALE, FINISH_LANDING, LAN_BUTTON, LOBBY_BOUNDS, LOBBY_CELL_DEPTH, LOBBY_CELL_WIDTH, LOBBY_MAP,
  START, TRACK_SURFACE_Y, WALL_H, checkpoints, cols, lobbyCellPosition, lobbyStructures, rows,
} from "./track.js";
import { DIVE_DURATION, PLAYER_COLORS, SPIN_DURATION } from "./lobby.js";
import { removeShirtCollar, shortenShirtLettering } from "./shirt-geometry.js";
import { EGG_LIMIT, EGG_MAP_SCALE, EGG_PIT_HALF_SIZE } from "./eggs.js";
import { BATTLE_ARENA, battleWalls } from "./egg-battle.js";
import { EYE_HEIGHT, FIRE_INTERVAL, gunArena, gunFloorHeight } from "./gun-arena.js";
import {
  MAZE_CELL, MAZE_SIZE, MAZE_WALL_HEIGHT, mazeClearFraction, mazePosition,
} from "./maze.js";
import {
  FLAME_HALF_ANGLE, FLAME_RANGE, SURVIVAL_MONSTER_SCALE, SURVIVAL_SIZE,
  monsterBlasterGeometryKind, parseMonsterBlaster,
} from "./survival.js";
import {
  CANNON_FINISH_Z, CANNON_FOOTPRINT, CANNON_LAUNCH_Y, CANNON_REQUIRED_OVERLAP,
  CANNON_SPACING, CANNON_STAGES, CANNON_TILE_SIZE, CANNON_WALL_OFFSET, cannonOverlap,
} from "./cannon-race.js";

const CHICKEN_YAW_OFFSET = Math.PI;
const MONSTER_SCALE = 1.4;
const DOOR_SWING = 1.7;
const divePose = racer => racer.diveTimer > 0 ?
  Math.sin(Math.PI * (1 - racer.diveTimer / DIVE_DURATION)) : 0;
const spinPose = racer => racer.spinTimer > 0 ?
  (SPIN_DURATION - racer.spinTimer) / SPIN_DURATION * Math.PI * 4 : 0;
const RIVAL_COLORS = {
  "_defaultMat(Clone)": PLAYER_COLORS[1],
  "dark(Clone)": 0x641010,
};
const chickenMaterials = new WeakMap();
const chickenColors = new WeakMap();

function createChicken(model, rival = false) {
  const chicken = model.clone(true);
  const materialsForColor = [];
  chicken.scale.setScalar(CHICKEN_SCALE);
  chicken.traverse(object => {
    if (!object.isMesh) return;
    object.castShadow = true;
    const materials = (Array.isArray(object.material) ? object.material : [object.material])
      .map(material => {
        const clone = material.clone();
        const color = rival ? RIVAL_COLORS[clone.name] : undefined;
        if (color !== undefined) clone.color.setHex(color);
        if (clone.name === "_defaultMat(Clone)" || clone.name === "dark(Clone)") {
          materialsForColor.push({
            material: clone, name: clone.name, originalColor: clone.color.clone(),
          });
        }
        return clone;
      });
    object.material = Array.isArray(object.material) ? materials : materials[0];
  });
  chickenMaterials.set(chicken, materialsForColor);
  return chicken;
}

function setChickenColor(chicken, color) {
  if (chickenColors.get(chicken) === color) return;
  for (const { material, name, originalColor } of chickenMaterials.get(chicken)) {
    if (color === null) material.color.copy(originalColor);
    else if (name === "_defaultMat(Clone)") material.color.setHex(color);
    else material.color.setHex(color).multiplyScalar(0.38);
  }
  chickenColors.set(chicken, color);
}

function setGunArmColor(rig, color) {
  if (color == null || rig.userData.armColor === color) return;
  rig.userData.armMaterial.color.setHex(color);
  rig.userData.armColor = color;
}

export async function createWorld() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x87ceeb);
  scene.fog = new THREE.Fog(0x87ceeb, 40, 110);
  const lobbyCenterX = (LOBBY_BOUNDS.minX + LOBBY_BOUNDS.maxX) / 2;
  const lobbyCenterZ = (LOBBY_BOUNDS.minZ + LOBBY_BOUNDS.maxZ) / 2;

  const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.1, 300);
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(innerWidth, innerHeight);
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  document.body.appendChild(renderer.domElement);

  addEventListener("resize", () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
  });

  scene.add(new THREE.HemisphereLight(0xffffff, 0x446644, 0.9));
  const sun = new THREE.DirectionalLight(0xfff2cc, 1.2);
  sun.position.set(lobbyCenterX + 30, 600, lobbyCenterZ - 40);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const span = Math.max(
    LOBBY_BOUNDS.maxX - LOBBY_BOUNDS.minX,
    LOBBY_BOUNDS.maxZ - LOBBY_BOUNDS.minZ
  ) * 0.75;
  sun.shadow.camera.left = -span; sun.shadow.camera.right = span;
  sun.shadow.camera.top = span; sun.shadow.camera.bottom = -span;
  sun.shadow.camera.far = 1200;
  const sunTarget = new THREE.Object3D();
  sunTarget.position.set(lobbyCenterX, 0, lobbyCenterZ);
  scene.add(sunTarget); sun.target = sunTarget;
  scene.add(sun);

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(600, 600),
    new THREE.MeshLambertMaterial({ color: 0x3f9e4d })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(lobbyCenterX, 0, lobbyCenterZ);
  ground.receiveShadow = true;
  scene.add(ground);

  const track = new THREE.Group();
  const lobby = new THREE.Group();
  const arena = new THREE.Group();
  const doorCourse = new THREE.Group();
  const eggArena = new THREE.Group();
  const battleArena = new THREE.Group();
  const mazeArena = new THREE.Group();
  const gunCourse = new THREE.Group();
  scene.add(track, lobby, arena, doorCourse, eggArena, battleArena, mazeArena, gunCourse);
  const partGroups = new Map();
  for (const piece of gunArena.pieces) {
    const key = piece.color.join(",");
    if (!partGroups.has(key)) partGroups.set(key, []);
    partGroups.get(key).push(piece);
  }
  for (const pieces of partGroups.values()) {
    const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshLambertMaterial({ color: new THREE.Color(...pieces[0].color) }), pieces.length);
    const transform = new THREE.Object3D();
    pieces.forEach((piece, index) => {
      transform.position.set(piece.x, piece.y, piece.z);
      transform.rotation.y = piece.angle;
      transform.scale.set(piece.width, piece.height, piece.depth);
      transform.updateMatrix();
      mesh.setMatrixAt(index, transform.matrix);
    });
    mesh.castShadow = mesh.receiveShadow = true;
    gunCourse.add(mesh);
  }
  const ventMaterial = new THREE.MeshLambertMaterial({ color: 0x263344 });
  for (const vent of gunArena.vents) {
    for (let n = -3; n <= 3; n++) {
      const slat = new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.025, 0.06), ventMaterial);
      slat.position.set(vent.x, 0.335, vent.z + n * 0.23);
      gunCourse.add(slat);
    }
  }
  const bulletMeshes = new Map();
  const bulletGeometry = new THREE.CylinderGeometry(0.055, 0.055, 0.55, 6);
  const bulletMaterial = new THREE.MeshBasicMaterial({ color: 0xffe270 });
  const mazeFloor = new THREE.Mesh(
    new THREE.PlaneGeometry(MAZE_SIZE, MAZE_SIZE),
    new THREE.MeshLambertMaterial({ color: 0x6d7565 })
  );
  mazeFloor.rotation.x = -Math.PI / 2;
  mazeFloor.position.y = 0.02;
  mazeFloor.receiveShadow = true;
  mazeArena.add(mazeFloor);
  const mazeWallGeometry = new THREE.BoxGeometry(1, 1, 1);
  const mazeWallMaterial = new THREE.MeshLambertMaterial({ color: 0x536779 });
  let mazeKey = null, mazeWallMesh;
  const mazeExit = new THREE.Mesh(
    new THREE.CylinderGeometry(1, 1, 0.06, 32),
    new THREE.MeshLambertMaterial({ color: 0x33ff77, emissive: 0x116633 })
  );
  const mazeStart = new THREE.Mesh(
    new THREE.CylinderGeometry(MAZE_CELL * 0.4, MAZE_CELL * 0.4, 0.04, 32),
    new THREE.MeshLambertMaterial({ color: 0x55ccff, emissive: 0x114466 })
  );
  const exitCanvas = document.createElement("canvas");
  exitCanvas.width = 256;
  exitCanvas.height = 64;
  const exitContext = exitCanvas.getContext("2d");
  exitContext.fillStyle = "#145c2b";
  exitContext.fillRect(0, 0, 256, 64);
  exitContext.fillStyle = "#ffffff";
  exitContext.font = "bold 48px sans-serif";
  exitContext.textAlign = "center";
  exitContext.fillText("EXIT", 128, 50);
  const mazeExitSign = new THREE.Sprite(new THREE.SpriteMaterial({
    map: new THREE.CanvasTexture(exitCanvas),
  }));
  mazeExitSign.scale.set(2.4, 0.6, 1);
  mazeArena.add(mazeStart, mazeExit, mazeExitSign);
  const battleFloor = new THREE.Mesh(
    new THREE.PlaneGeometry(BATTLE_ARENA.maxX - BATTLE_ARENA.minX,
      BATTLE_ARENA.maxZ - BATTLE_ARENA.minZ),
    new THREE.MeshLambertMaterial({ color: 0x78a760 })
  );
  battleFloor.rotation.x = -Math.PI / 2;
  battleFloor.position.y = 0.025;
  battleFloor.receiveShadow = true;
  battleArena.add(battleFloor);
  for (const wall of battleWalls) {
    const rail = new THREE.Mesh(
      new THREE.BoxGeometry(wall.maxX - wall.minX, 0.45, wall.maxZ - wall.minZ),
      new THREE.MeshLambertMaterial({ color: 0xf9ed69 })
    );
    rail.position.set((wall.minX + wall.maxX) / 2, 0.225, (wall.minZ + wall.maxZ) / 2);
    battleArena.add(rail);
  }
  const battleGrid = new THREE.GridHelper(
    BATTLE_ARENA.maxX - BATTLE_ARENA.minX, 12, 0x526e38, 0x6a9550
  );
  battleGrid.position.y = 0.03;
  battleArena.add(battleGrid);
  const arenaFloor = new THREE.Mesh(
    new THREE.PlaneGeometry(ARENA.maxX - ARENA.minX, ARENA.maxZ - ARENA.minZ),
    new THREE.MeshLambertMaterial({ color: 0x527bac })
  );
  arenaFloor.rotation.x = -Math.PI / 2;
  arenaFloor.position.y = 0.025;
  arenaFloor.receiveShadow = true;
  arena.add(arenaFloor);
  const railMaterial = new THREE.MeshLambertMaterial({ color: 0xf9ed69 });
  for (const wall of arenaWalls) {
    const rail = new THREE.Mesh(
      new THREE.BoxGeometry(wall.maxX - wall.minX, 0.25, wall.maxZ - wall.minZ),
      railMaterial
    );
    rail.position.set((wall.minX + wall.maxX) / 2, 0.125, (wall.minZ + wall.maxZ) / 2);
    arena.add(rail);
  }
  const wallMat = new THREE.MeshLambertMaterial({ color: 0x8a5a2b });
  const wallTopMat = new THREE.MeshLambertMaterial({ color: 0xa9743c });
  function addWall(group, wall) {
    const width = wall.maxX - wall.minX, depth = wall.maxZ - wall.minZ;
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(width, WALL_H, depth),
      [wallMat, wallMat, wallTopMat, wallMat, wallMat, wallMat]
    );
    mesh.position.set(wall.minX + width / 2, WALL_H / 2, wall.minZ + depth / 2);
    mesh.castShadow = mesh.receiveShadow = true;
    group.add(mesh);
  }
  const loader = new GLTFLoader();
  const [{ scene: eggMap }, { scene: eggModel }] = await Promise.all([
    loader.loadAsync(new URL("../assets/models/egg-game-map.glb", import.meta.url).href),
    loader.loadAsync(new URL("../assets/models/egg.glb", import.meta.url).href),
  ]);
  eggMap.scale.setScalar(EGG_MAP_SCALE);
  eggMap.traverse(object => {
    if (!object.isMesh) return;
    object.receiveShadow = true;
  });
  // The supplied stepped map has small gaps between some floor pieces.
  const eggBase = new THREE.Mesh(
    new THREE.PlaneGeometry(45, 45),
    new THREE.MeshLambertMaterial({ color: 0x777785 })
  );
  eggBase.rotation.x = -Math.PI / 2;
  eggBase.position.y = -0.02;
  eggBase.receiveShadow = true;
  eggArena.add(eggMap, eggBase);
  eggArena.updateMatrixWorld(true);
  const eggRay = new THREE.Raycaster();
  const eggHeights = new Map();
  function eggFloorY(x, z) {
    const key = `${Math.round(x * 10)},${Math.round(z * 10)}`;
    if (!eggHeights.has(key)) {
      eggRay.set(new THREE.Vector3(x, 20, z), new THREE.Vector3(0, -1, 0));
      const hit = eggRay.intersectObjects([eggMap, eggBase], true)[0];
      if (!hit) throw new Error(`Egg arena has no floor at ${x}, ${z}`);
      eggHeights.set(key, hit.point.y);
    }
    return eggHeights.get(key);
  }
  const eggBounds = new THREE.Box3().setFromObject(eggModel);
  const eggCenter = eggBounds.getCenter(new THREE.Vector3());
  const eggScale = 0.75 / eggBounds.getSize(new THREE.Vector3()).y;
  eggModel.scale.setScalar(eggScale);
  eggModel.position.set(-eggCenter.x * eggScale, -eggBounds.min.y * eggScale,
    -eggCenter.z * eggScale);
  const eggMeshes = [];
  const battleEggMeshes = [];
  const pitMarkers = Array.from({ length: 8 }, () => {
    const group = new THREE.Group();
    const size = EGG_PIT_HALF_SIZE * 2;
    const border = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(size, 0.05, size)),
      new THREE.LineBasicMaterial({ color: 0xffffff })
    );
    border.position.y = EGG_MAP_SCALE + 0.1;
    group.add(border);
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 64;
    const texture = new THREE.CanvasTexture(canvas);
    const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthTest: false }));
    label.position.y = 5.5;
    label.scale.set(5, 1.25, 1);
    group.add(label);
    eggArena.add(group);
    return { group, border, canvas, texture, text: null };
  });
  const { scene: raceTrackModel } = await loader.loadAsync(
    new URL("../race-track.glb", import.meta.url).href
  );
  raceTrackModel.scale.setScalar(5);
  raceTrackModel.rotation.y = Math.PI / 2;
  const raceTrackBounds = new THREE.Box3().setFromObject(raceTrackModel);
  const raceTrackCenter = raceTrackBounds.getCenter(new THREE.Vector3());
  raceTrackModel.position.set(
    cols * CELL / 2 - raceTrackCenter.x,
    -raceTrackBounds.min.y,
    rows * CELL / 2 - raceTrackCenter.z
  );
  raceTrackModel.updateMatrixWorld(true);
  const trackChickenHeights = new Map();
  const trackChickenFalls = new Map();
  function trackChickenY(id, walk, eliminated, dt) {
    if (!eliminated) {
      trackChickenFalls.delete(id);
      trackChickenHeights.set(id, TRACK_SURFACE_Y);
      return (trackChickenHeights.get(id) ?? 0) + Math.abs(Math.sin(walk)) * 0.12;
    }
    const fallTime = Math.min(1, (trackChickenFalls.get(id) ?? 0) + dt);
    trackChickenFalls.set(id, fallTime);
    if (fallTime >= 1) return null;
    return (trackChickenHeights.get(id) ?? TRACK_SURFACE_Y) - fallTime * fallTime * 14;
  }
  raceTrackModel.traverse(object => {
    if (!object.isMesh) return;
    object.castShadow = true;
    object.receiveShadow = true;
  });
  track.add(raceTrackModel);
  const roadMat = new THREE.MeshLambertMaterial({ color: 0xb9a77a });
  for (let j = 0; j < LOBBY_MAP.length; j++) {
    for (let i = 0; i < LOBBY_MAP[j].length; i++) {
      if (LOBBY_MAP[j][i] !== "r") continue;
      const tile = new THREE.Mesh(
        new THREE.PlaneGeometry(LOBBY_CELL_WIDTH, LOBBY_CELL_DEPTH), roadMat
      );
      tile.rotation.x = -Math.PI / 2;
      const position = lobbyCellPosition(i, j);
      tile.position.set(position.x, 0.015, position.z);
      tile.receiveShadow = true;
      lobby.add(tile);
    }
  }
  const { scene: cannonModel } = await loader.loadAsync(
    new URL("../assets/models/cannon.glb", import.meta.url).href
  );
  const cannonBounds = new THREE.Box3().setFromObject(cannonModel);
  const cannonCenter = cannonBounds.getCenter(new THREE.Vector3());
  const cannonScale = 2.4 / cannonBounds.getSize(new THREE.Vector3()).z;
  cannonModel.scale.setScalar(cannonScale);
  cannonModel.position.set(
    -cannonCenter.x * cannonScale, -cannonBounds.min.y * cannonScale,
    -cannonCenter.z * cannonScale
  );
  cannonModel.traverse(object => {
    if (!object.isMesh) return;
    object.castShadow = object.receiveShadow = true;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) {
      if (material.name === "_defaultMat(Clone)") material.color.setHex(0x536375);
    }
  });
  const cannons = CANNONS.map(({ x, z }) => {
    const cannon = new THREE.Group();
    cannon.add(cannonModel.clone(true));
    const barrelMaterial = new THREE.MeshLambertMaterial({ color: 0x78889b, side: THREE.DoubleSide });
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.55, 1.8, 20, 1, true), barrelMaterial);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.95, CANNON_MUZZLE - 0.9);
    barrel.castShadow = true;
    cannon.add(barrel);
    const muzzle = new THREE.Mesh(new THREE.TorusGeometry(0.45, 0.09, 8, 20), barrelMaterial);
    muzzle.position.set(0, 0.95, CANNON_MUZZLE);
    cannon.add(muzzle);
    const bore = new THREE.Mesh(
      new THREE.CircleGeometry(0.43, 20),
      new THREE.MeshLambertMaterial({ color: 0x10151c })
    );
    bore.position.set(0, 0.95, CANNON_MUZZLE - 0.15);
    cannon.add(bore);
    for (const side of [-1, 1]) {
      const wheel = new THREE.Mesh(
        new THREE.CylinderGeometry(0.6, 0.6, 0.25, 16),
        new THREE.MeshLambertMaterial({ color: 0x68472c })
      );
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(side * 1.1, 0.6, -0.3);
      wheel.castShadow = true;
      cannon.add(wheel);
    }
    cannon.position.set(x, 0, z);
    arena.add(cannon);
    return cannon;
  });
  const cannonCourse = new THREE.Group();
  scene.add(cannonCourse);
  const tileFrame = new THREE.EdgesGeometry(new THREE.BoxGeometry(CANNON_TILE_SIZE, CANNON_TILE_SIZE, 0.24));
  const passFrame = new THREE.LineBasicMaterial({ color: 0x24ffe0 });
  const solidFrame = new THREE.LineBasicMaterial({ color: 0xff9c8b });
  const tileBox = new THREE.BoxGeometry(CANNON_TILE_SIZE - 0.05, CANNON_TILE_SIZE - 0.05, 0.23);
  const passTile = new THREE.MeshBasicMaterial({
    color: 0x13c7ac, transparent: true, opacity: 0.16, depthWrite: false,
  });
  const solidTile = new THREE.MeshLambertMaterial({ color: 0xb93752, emissive: 0x4a0e23 });
  const platformBox = new THREE.BoxGeometry(8.6, 0.55, 5.7);
  const platformMaterial = new THREE.MeshLambertMaterial({ color: 0x314e64 });
  const finishGeometry = new THREE.BoxGeometry(0.86, 0.035, 0.45);
  const checkers = [0xffffff, 0x202630].map(color => new THREE.MeshBasicMaterial({ color }));
  const aimMarker = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(
    [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([x, y]) =>
      new THREE.Vector3(x * CANNON_FOOTPRINT / 2, y * CANNON_FOOTPRINT / 2, 0))),
  new THREE.LineBasicMaterial({ depthTest: false }));
  aimMarker.renderOrder = 10;
  cannonCourse.add(aimMarker);
  const laneMeshes = new Map();
  let cannonLayout = "";

  function renderCannonCourse(state, rival) {
    const racers = state.multiplayer ? state.racers : [state, rival];
    const layout = JSON.stringify([racers.map(racer => racer.cannonLane), state.cannonWalls]);
    if (cannonLayout !== layout) {
      cannonLayout = layout;
      for (const lane of laneMeshes.values()) cannonCourse.remove(lane);
      laneMeshes.clear();
      for (const racer of racers) {
        const lane = new THREE.Group();
        lane.position.x = racer.cannonLane;
        cannonCourse.add(lane);
        laneMeshes.set(racer.cannonLane, lane);
        for (let stage = 0; stage <= CANNON_STAGES; stage++) {
          const z = stage * CANNON_SPACING;
          const platform = new THREE.Mesh(platformBox, platformMaterial);
          platform.position.set(0, -0.275, z - 1.5);
          platform.receiveShadow = true;
          lane.add(platform);
          if (stage === CANNON_STAGES) break;
          const cannon = cannons[0].clone(true);
          cannon.position.set(0, 0, z);
          cannon.scale.setScalar(1.45);
          lane.add(cannon);
          for (const tile of state.cannonWalls[stage]) {
            const block = new THREE.Mesh(tileBox, tile.passable ? passTile : solidTile);
            block.position.set(tile.x, tile.y, z + CANNON_WALL_OFFSET);
            block.add(new THREE.LineSegments(tileFrame, tile.passable ? passFrame : solidFrame));
            lane.add(block);
          }
        }
        for (let i = 0; i < 10; i++) {
          for (let row = 0; row < 2; row++) {
            const square = new THREE.Mesh(finishGeometry, checkers[(i + row) % 2]);
            square.position.set((i - 4.5) * 0.86, 0.02, CANNON_FINISH_Z + (row - 0.5) * 0.45);
            lane.add(square);
          }
        }
      }
    }
    aimMarker.visible = state.cannonPhase === "aim" && state.scene !== "finished";
    if (!aimMarker.visible) return;
    const overlap = cannonOverlap(state.cannonWalls[state.cannonStage], state.cannonAimX, state.cannonAimY);
    aimMarker.material.color.setHex(overlap + 1e-9 >= CANNON_REQUIRED_OVERLAP ? 0xffffff : 0xffb137);
    aimMarker.position.set(state.cannonLane + state.cannonAimX, state.cannonAimY,
      state.cannonStage * CANNON_SPACING + CANNON_WALL_OFFSET - 0.14);
  }

  function poseCannonRacer(model, racer) {
    model.visible = racer.cannonPhase !== "aim" && racer.cannonPhase !== "out";
    model.position.y += racer.cannonY - (racer.cannonY > 0 || racer.eliminated ? CANNON_FOOTPRINT / 2 : 0);
    model.rotation.y += racer.cannonSpin * 44;
    if (racer.cannonPhase === "fall") model.rotation.x = Math.min(1.2, racer.cannonTime * 3);
  }
  const { scene: pillowModel } = await loader.loadAsync(
    new URL("../pillow.glb", import.meta.url).href
  );
  const pillowBounds = new THREE.Box3().setFromObject(pillowModel);
  const pillowSize = pillowBounds.getSize(new THREE.Vector3());
  const pillowScale = PILLOW_RADIUS * 2 / Math.max(pillowSize.x, pillowSize.z);
  const pillowCenter = pillowBounds.getCenter(new THREE.Vector3());
  pillowModel.position.copy(pillowCenter).multiplyScalar(-pillowScale);
  pillowModel.scale.setScalar(pillowScale);
  const bluePillowMaterial = new THREE.MeshLambertMaterial({ color: 0x1675ff });
  pillowModel.traverse(object => {
    if (!object.isMesh) return;
    object.castShadow = true;
    object.material = bluePillowMaterial;
  });
  const pillowMeshes = new Map();

  const doorPath = new THREE.Mesh(
    new THREE.PlaneGeometry(PATH_HALF_WIDTH * 2, PATH_END_Z - PATH_START_Z),
    new THREE.MeshLambertMaterial({ color: 0x9a8f80 })
  );
  doorPath.rotation.x = -Math.PI / 2;
  doorPath.position.set(0, 0.02, (PATH_START_Z + PATH_END_Z) / 2);
  doorPath.receiveShadow = true;
  doorCourse.add(doorPath);
  for (const wall of pathWalls) addWall(doorCourse, wall);
  const finishLine = new THREE.Mesh(
    new THREE.PlaneGeometry(PATH_HALF_WIDTH * 2, 1.2),
    new THREE.MeshLambertMaterial({ color: 0xf9ed69, emissive: 0x8a7a1a })
  );
  finishLine.rotation.x = -Math.PI / 2;
  finishLine.position.set(0, 0.04, FINISH_Z);
  doorCourse.add(finishLine);

  const { scene: gateModel } = await loader.loadAsync(
    new URL("../assets/models/double-doors.glb", import.meta.url).href
  );
  let leafMaterial;
  gateModel.traverse(object => {
    if (!object.isMesh) return;
    object.castShadow = object.receiveShadow = true;
    if (!object.material.name.startsWith("metalPurple")) return;
    leafMaterial = object.material;
    // Collapse the model's fixed door panels (purple quads below the arch ceilings).
    const position = object.geometry.attributes.position;
    const index = object.geometry.index.array;
    for (let t = 0; t < index.length; t += 3) {
      const top = Math.max(position.getY(index[t]), position.getY(index[t + 1]), position.getY(index[t + 2]));
      if (top < 2.1) index[t + 1] = index[t + 2] = index[t];
    }
    object.geometry.index.needsUpdate = true;
  });
  gateModel.scale.setScalar(DOOR_MODEL_SCALE);
  const gateBounds = new THREE.Box3().setFromObject(gateModel);
  const gateCenter = gateBounds.getCenter(new THREE.Vector3());
  gateModel.position.set(-gateCenter.x, -gateBounds.min.y, -gateCenter.z);
  const leafWidth = DOOR_HALF_WIDTH * 2, leafBottom = 0.199 * DOOR_MODEL_SCALE;
  const leafStraight = 1.3 * DOOR_MODEL_SCALE;
  const leafShape = new THREE.Shape();
  leafShape.moveTo(0, 0);
  leafShape.lineTo(leafWidth, 0);
  leafShape.lineTo(leafWidth, leafStraight);
  leafShape.absarc(leafWidth / 2, leafStraight, leafWidth / 2, 0, Math.PI, false);
  leafShape.lineTo(0, 0);
  const leafGeometry = new THREE.ExtrudeGeometry(leafShape, { depth: 0.2, bevelEnabled: false });
  leafGeometry.translate(0, 0, -0.1);
  const knobMaterial = new THREE.MeshLambertMaterial({ color: 0xf9ed69 });
  const gates = gateZs.map(z => {
    const gate = new THREE.Group();
    gate.add(gateModel.clone(true));
    gate.position.set(0, 0, z);
    doorCourse.add(gate);
    const leaves = DOOR_XS.map((x, side) => {
      const hinge = new THREE.Group();
      hinge.position.set(x + (side === 0 ? -DOOR_HALF_WIDTH : DOOR_HALF_WIDTH), leafBottom, DOOR_LEAF_OFFSET);
      const leaf = new THREE.Mesh(leafGeometry, leafMaterial);
      leaf.castShadow = true;
      if (side === 1) leaf.position.x = -leafWidth;
      hinge.add(leaf);
      const knob = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 8), knobMaterial);
      knob.position.set(side === 0 ? leafWidth - 0.4 : -leafWidth + 0.4, leafStraight * 0.6, -0.15);
      hinge.add(knob);
      gate.add(hinge);
      return hinge;
    });
    return leaves;
  });

  const { scene: monsterModel } = await loader.loadAsync(
    new URL("../assets/models/monster.glb", import.meta.url).href
  );
  monsterModel.scale.setScalar(MONSTER_SCALE);
  const monsterBounds = new THREE.Box3().setFromObject(monsterModel);
  const monsterCenter = monsterBounds.getCenter(new THREE.Vector3());
  monsterModel.position.set(-monsterCenter.x, -monsterBounds.min.y, -monsterCenter.z);
  const monsterMaterials = [];
  monsterModel.traverse(object => {
    if (!object.isMesh) return;
    object.castShadow = true;
    object.material = object.material.clone();
    object.material.transparent = true;
    monsterMaterials.push(object.material);
  });
  const monster = new THREE.Group();
  monster.add(monsterModel);
  doorCourse.add(monster);
  const mazeMonsterMeshes = Array.from({ length: 4 }, () => {
    const group = new THREE.Group();
    const model = monsterModel.clone(true);
    model.scale.multiplyScalar(0.65);
    model.position.multiplyScalar(0.65);
    model.traverse(object => {
      if (!object.isMesh) return;
      object.material = object.material.clone();
      object.material.opacity = 1;
      object.material.depthWrite = true;
      object.material.transparent = false;
    });
    const facing = new THREE.Group();
    facing.rotation.y = Math.PI;
    facing.add(model);
    group.add(facing);
    const arrow = new THREE.Mesh(
      new THREE.ConeGeometry(0.25, 0.7, 3),
      new THREE.MeshBasicMaterial({ color: 0xffbb33 })
    );
    arrow.rotation.x = Math.PI / 2;
    arrow.position.set(0, 0.15, 1.1);
    group.add(arrow);
    mazeArena.add(group);
    return { group, arrow };
  });
  const [flameAsset, trapAsset, runnaAsset, blasterResponse] = await Promise.all([
    loader.loadAsync(new URL("../assets/models/flame gun.glb", import.meta.url).href),
    loader.loadAsync(new URL("../assets/models/trap.glb", import.meta.url).href),
    loader.loadAsync(new URL("../assets/models/runna monster.glb", import.meta.url).href),
    fetch(new URL("../assets/models/monster blaster.model", import.meta.url)),
  ]);
  if (!blasterResponse.ok) throw new Error(`Could not load Monster Blaster (${blasterResponse.status}).`);
  const monsterBlasterModel = new THREE.Group();
  for (const piece of parseMonsterBlaster(await blasterResponse.text())) {
    const kind = monsterBlasterGeometryKind(piece.type);
    const geometry = kind === "barrel" ? new THREE.CylinderGeometry(0.24, 0.3, 0.9, 12) :
      kind === "spike" ? new THREE.ConeGeometry(0.35, 1, 8) :
      kind === "leg" ? new THREE.CapsuleGeometry(0.22, 0.56, 4, 8) :
      kind === "ring" ? new THREE.TorusGeometry(0.34, 0.12, 6, 12) :
      kind === "body" ? new THREE.SphereGeometry(0.55, 10, 8) :
      new THREE.BoxGeometry(0.8, 0.8, 0.8);
    if (kind === "barrel") geometry.rotateX(Math.PI / 2);
    if (kind === "ring") geometry.rotateY(Math.PI / 2);
    const mesh = new THREE.Mesh(geometry,
      new THREE.MeshLambertMaterial({ color: new THREE.Color(...piece.color) }));
    mesh.position.fromArray(piece.position);
    mesh.rotation.set(...piece.rotation.map(angle => angle * Math.PI / 180));
    mesh.scale.fromArray(piece.scale);
    monsterBlasterModel.add(mesh);
  }
  function survivalModel(source, height, yaw = 0) {
    const model = source.clone(true);
    const bounds = new THREE.Box3().setFromObject(model);
    const scale = height / (bounds.max.y - bounds.min.y);
    const center = bounds.getCenter(new THREE.Vector3());
    const group = new THREE.Group();
    model.scale.multiplyScalar(scale);
    model.position.sub(new THREE.Vector3(center.x, bounds.min.y, center.z)).multiplyScalar(scale);
    model.traverse(object => {
      if (!object.isMesh) return;
      object.castShadow = true;
      object.material = object.material.clone();
    });
    group.rotation.y = yaw;
    group.add(model);
    return group;
  }
  const survivalModels = {
    monster: survivalModel(monsterModel, 1.65 * SURVIVAL_MONSTER_SCALE, Math.PI),
    runna: survivalModel(runnaAsset.scene, 1.6 * SURVIVAL_MONSTER_SCALE, Math.PI),
    blaster: survivalModel(monsterBlasterModel, 1.7 * SURVIVAL_MONSTER_SCALE),
    flame: survivalModel(flameAsset.scene, 0.85, Math.PI),
    trap: survivalModel(trapAsset.scene, 0.45),
  };
  const survivalMonsterMeshes = new Map(), defenseMeshes = new Map(), projectileMeshes = new Map();
  const flameGeometry = new THREE.ConeGeometry(0.24, 1, 7);
  flameGeometry.rotateX(-Math.PI / 2);
  const flameMaterial = new THREE.MeshBasicMaterial({
    color: 0xff8a16, transparent: true, opacity: 0.65, depthWrite: false,
  });
  const projectileGeometry = new THREE.SphereGeometry(0.16, 8, 6);
  const projectileMaterial = new THREE.MeshBasicMaterial({ color: 0xff3366 });
  let survivalLayout = null;

  function renderSurvival(state, rival) {
    if (survivalLayout !== state.survivalMap.key) {
      survivalLayout = state.survivalMap.key;
      for (const meshes of [survivalMonsterMeshes, defenseMeshes, projectileMeshes]) {
        for (const mesh of meshes.values()) mazeArena.remove(mesh);
        meshes.clear();
      }
    }
    for (const hazard of state.survivalMonsters) {
      let mesh = survivalMonsterMeshes.get(hazard.id);
      if (!mesh) {
        mesh = new THREE.Group();
        mesh.add(survivalModels[hazard.type].clone(true));
        survivalMonsterMeshes.set(hazard.id, mesh);
        mazeArena.add(mesh);
      }
      mesh.visible = hazard.respawnIn === 0;
      mesh.position.set(hazard.x, Math.abs(Math.sin(hazard.walk)) * 0.08, hazard.z);
      mesh.rotation.y = hazard.yaw;
    }
    const racers = state.multiplayer ? state.racers : [state, rival];
    for (const item of state.defenses) {
      let mesh = defenseMeshes.get(item.id);
      if (!mesh) {
        mesh = new THREE.Group();
        mesh.add(survivalModels[item.type].clone(true));
        mesh.userData.flames = item.type === "flame" ?
          Array.from({ length: 5 }, () => {
            const flame = new THREE.Mesh(flameGeometry, flameMaterial);
            mesh.add(flame);
            return flame;
          }) : [];
        defenseMeshes.set(item.id, mesh);
        mazeArena.add(mesh);
      }
      const carrier = item.carrierId === null ? null : racers.find(racer => racer.id === item.carrierId);
      const yaw = carrier ? carrier.yaw : item.yaw;
      mesh.position.set(carrier ? carrier.x + Math.sin(yaw) * 0.7 : item.x,
        carrier ? 1 : 0, carrier ? carrier.z + Math.cos(yaw) * 0.7 : item.z);
      mesh.rotation.y = yaw;
      mesh.userData.flames.forEach((flame, index) => {
        flame.visible = !carrier && item.firing;
        if (!flame.visible) return;
        const angle = (index / 4 * 2 - 1) * FLAME_HALF_ANGLE;
        const end = { x: item.x + Math.sin(yaw + angle) * FLAME_RANGE,
          z: item.z + Math.cos(yaw + angle) * FLAME_RANGE };
        const reach = FLAME_RANGE * mazeClearFraction(state.survivalMap.walls, item, end);
        flame.rotation.y = angle;
        flame.position.set(Math.sin(angle) * reach / 2, 0.65, Math.cos(angle) * reach / 2);
        flame.scale.set(1 + Math.sin(state.survivalTime * 25 + index) * 0.15, 1, reach);
      });
    }
    const active = new Set(state.survivalProjectiles.map(shot => shot.id));
    for (const [id, mesh] of projectileMeshes) if (!active.has(id)) {
      mazeArena.remove(mesh);
      projectileMeshes.delete(id);
    }
    for (const shot of state.survivalProjectiles) {
      let mesh = projectileMeshes.get(shot.id);
      if (!mesh) {
        mesh = new THREE.Mesh(projectileGeometry, projectileMaterial);
        projectileMeshes.set(shot.id, mesh);
        mazeArena.add(mesh);
      }
      mesh.position.set(shot.x, 0.9, shot.z);
    }
  }
  let lobbyStructure;
  await Promise.all(lobbyStructures.map(async structure => {
    const { scene: model } = await loader.loadAsync(
      new URL(structure.asset, import.meta.url).href
    );
    model.scale.setScalar(structure.scale);
    const bounds = new THREE.Box3().setFromObject(model);
    const center = bounds.getCenter(new THREE.Vector3());
    model.position.set(-center.x, -bounds.min.y, -center.z);
    model.traverse(object => {
      if (!object.isMesh) return;
      object.castShadow = true;
      object.receiveShadow = true;
    });
    const structureGroup = new THREE.Group();
    structureGroup.position.set(structure.x, 0, structure.z);
    structureGroup.rotation.y = structure.rotation;
    structureGroup.add(model);
    lobby.add(structureGroup);
    if (structure.type === "lobby") lobbyStructure = structureGroup;
  }));

  const arrowMat = new THREE.MeshLambertMaterial({ color: 0xf9ed69, emissive: 0x8a7a1a });
  const landing = new THREE.Mesh(
    new THREE.BoxGeometry(FINISH_LANDING.halfWidth * 2, 0.06, FINISH_LANDING.halfDepth * 2),
    new THREE.MeshLambertMaterial({ color: 0xd62828, emissive: 0x581010 })
  );
  landing.position.set(FINISH_LANDING.x, TRACK_SURFACE_Y + 0.03, FINISH_LANDING.z);
  landing.receiveShadow = true;
  track.add(landing);

  const buttonMat = new THREE.MeshLambertMaterial({ color: 0xc0392b });
  const button = new THREE.Mesh(new THREE.CylinderGeometry(BUTTON.r, BUTTON.r, 0.3, 32), buttonMat);
  lobbyStructure.updateWorldMatrix(true, false);
  button.position.copy(lobbyStructure.worldToLocal(new THREE.Vector3(BUTTON.x, 0.15, BUTTON.z)));
  lobbyStructure.add(button);
  const lanButtonMat = new THREE.MeshLambertMaterial({ color: 0x2288dd });
  const lanButton = new THREE.Mesh(
    new THREE.CylinderGeometry(LAN_BUTTON.r, LAN_BUTTON.r, 0.3, 32), lanButtonMat
  );
  lanButton.position.set(LAN_BUTTON.x, 0.15, LAN_BUTTON.z);
  lobby.add(lanButton);
  const signCanvas = document.createElement("canvas");
  signCanvas.width = 512;
  signCanvas.height = 128;
  const signContext = signCanvas.getContext("2d");
  signContext.fillStyle = "#22243a";
  signContext.fillRect(0, 0, 512, 128);
  signContext.fillStyle = "#ffffff";
  signContext.font = "bold 42px sans-serif";
  signContext.textAlign = "center";
  signContext.fillText("LAN: HOST / JOIN", 256, 58);
  signContext.font = "30px sans-serif";
  signContext.fillText("Press E at blue button", 256, 104);
  const lanSign = new THREE.Sprite(new THREE.SpriteMaterial({
    map: new THREE.CanvasTexture(signCanvas), depthTest: false,
  }));
  lanSign.position.set(LAN_BUTTON.x, 3.5, LAN_BUTTON.z);
  lanSign.scale.set(6, 1.5, 1);
  lobby.add(lanSign);

  const arrowShape = new THREE.Shape();
  arrowShape.moveTo(0, -0.8);
  arrowShape.lineTo(-0.65, 0.4);
  arrowShape.lineTo(0.65, 0.4);
  arrowShape.closePath();
  const arrowGeo = new THREE.ShapeGeometry(arrowShape);
  for (let n = 1; n < checkpoints.length - 1; n++) {
    const point = checkpoints[n], next = checkpoints[n + 1];
    const arrow = new THREE.Mesh(arrowGeo, arrowMat);
    arrow.rotation.set(-Math.PI / 2, 0, 0);
    arrow.rotateZ(Math.atan2(next.x - point.x, next.z - point.z));
    arrow.position.set(point.x, TRACK_SURFACE_Y + 0.03, point.z);
    track.add(arrow);
  }

  const { scene: chickenModel } = await loader.loadAsync(
    new URL("../assets/models/chicken.glb", import.meta.url).href
  );
  const outfitModels = Object.fromEntries(await Promise.all([
    ["cap", "baseball hat.glb"], ["headphones", "headphones.glb"],
    ["gamer", "gamer T.glb"], ["jersey", "pitchers jersey.glb"],
  ].map(async ([id, file]) => [id, (await loader.loadAsync(
    new URL(`../assets/models/${file}`, import.meta.url).href
  )).scene])));
  for (const [shirt, material] of [["gamer", "dark(Clone)"], ["jersey", "metalPurple(Clone)"]]) {
    let foundLetters = false, foundCollar = false;
    outfitModels[shirt].traverse(object => {
      if (!object.isMesh || ![material, "metalPurple(Clone)"].includes(object.material.name)) return;
      object.geometry = object.geometry.clone();
      if (object.material.name === material) {
        shortenShirtLettering(object.geometry, shirt);
        foundLetters = true;
      }
      if (object.material.name === "metalPurple(Clone)") {
        removeShirtCollar(object.geometry);
        foundCollar = true;
      }
    });
    if (!foundLetters || !foundCollar) throw new Error(`Could not find ${shirt} shirt material.`);
  }
  function addOutfits(model) {
    function fit(source, width, bottom, centerZ, yaw, proportions = [1, 1, 1]) {
      const group = new THREE.Group();
      const outfit = source.clone(true);
      outfit.traverse(object => {
        if (!object.isMesh) return;
        object.material = Array.isArray(object.material) ?
          object.material.map(material => material.clone()) : object.material.clone();
      });
      group.add(outfit);
      group.rotation.y = yaw;
      let bounds = new THREE.Box3().setFromObject(group);
      group.scale.setScalar(width / bounds.getSize(new THREE.Vector3()).x);
      group.scale.multiply(new THREE.Vector3(...proportions));
      bounds = new THREE.Box3().setFromObject(group);
      const center = bounds.getCenter(new THREE.Vector3());
      group.position.set(-center.x, bottom - bounds.min.y, centerZ - center.z);
      return group;
    }
    const outfits = {
      cap: fit(outfitModels.cap, 1.05, 2.02, -0.38, Math.PI / 2),
      headphones: fit(outfitModels.headphones, 1.35, 1.52, -0.45, 0),
      gamer: fit(outfitModels.gamer, 2.4, 1.05, 0.18, Math.PI / 2, [1, 0.6, 0.75]),
      jersey: fit(outfitModels.jersey, 2.4, 1.05, 0.18, Math.PI / 2, [1, 0.6, 0.75]),
    };
    for (const outfit of Object.values(outfits)) {
      outfit.visible = false;
      model.add(outfit);
    }
    return appearance => {
      for (const [id, outfit] of Object.entries(outfits)) {
        outfit.visible = appearance?.hat === id || appearance?.clothing === id;
      }
    };
  }
  const chicken = createChicken(chickenModel);
  const dressPlayer = addOutfits(chicken);
  const playerMaterials = [];
  chicken.traverse(object => {
    if (!object.isMesh) return;
    const materials = (Array.isArray(object.material) ? object.material : [object.material])
      .map(material => {
        playerMaterials.push({
          material, opacity: material.opacity, transparent: material.transparent,
          depthWrite: material.depthWrite,
        });
        return material;
      });
    object.material = Array.isArray(object.material) ? materials : materials[0];
  });
  const rivalChicken = createChicken(chickenModel, true);
  scene.add(chicken, rivalChicken);
  const lanChickens = Array.from({ length: 7 }, () => {
    const model = createChicken(chickenModel, true);
    model.visible = false;
    scene.add(model);
    return model;
  });
  const dressLan = lanChickens.map(addOutfits);
  const { scene: blasterModel } = await loader.loadAsync(
    new URL("../assets/models/chicken blaster.glb", import.meta.url).href
  );
  const wingMaterial = new THREE.MeshLambertMaterial({ color: 0xfff5dc });
  const handMaterial = new THREE.MeshLambertMaterial({ color: 0xffb52e });
  function weaponRig(firstPerson) {
    const rig = new THREE.Group();
    const armMaterial = wingMaterial.clone();
    rig.userData.armMaterial = armMaterial;
    const gun = blasterModel.clone(true);
    gun.scale.setScalar(firstPerson ? 0.25 : 0.32);
    gun.position.set(0.32, firstPerson ? -0.65 : 0.7, firstPerson ? -0.9 : -0.85);
    rig.add(gun);
    const grips = firstPerson ? [
      [[0.52, -0.8, -0.25], [0.35, -0.39, -0.79]],
      [[-0.42, -0.8, -0.3], [0.23, -0.4, -1.05]],
    ] : [
      [[0.55, 1.15, 0], [0.38, 1.06, -0.63]],
      [[-0.55, 1.15, 0], [0.21, 1.06, -1.05]],
    ];
    for (const [start, end] of grips) {
      const a = new THREE.Vector3(...start), b = new THREE.Vector3(...end);
      const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.11, a.distanceTo(b), 4, 8), armMaterial);
      arm.position.copy(a).lerp(b, 0.5);
      arm.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
      const hand = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), handMaterial);
      hand.position.copy(b);
      rig.add(arm, hand);
    }
    if (firstPerson) rig.traverse(object => {
      if (!object.isMesh) return;
      object.material = Array.isArray(object.material) ?
        object.material.map(material => material === armMaterial ? material : material.clone()) :
        object.material === armMaterial ? object.material : object.material.clone();
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        material.depthTest = false;
        material.depthWrite = false;
      }
      object.renderOrder = 10;
      object.castShadow = false;
    });
    return rig;
  }
  const heldWeapon = weaponRig(true);
  heldWeapon.visible = false;
  camera.add(heldWeapon);
  scene.add(camera);
  const opponentWeapons = [rivalChicken, ...lanChickens].map(model => {
    const rig = weaponRig(false);
    rig.scale.setScalar(1 / CHICKEN_SCALE);
    rig.visible = false;
    model.add(rig);
    return rig;
  });
  const [rivalWeapon, ...lanWeapons] = opponentWeapons;
  const crosshair = document.getElementById("crosshair");
  const camPos = new THREE.Vector3();
  const cameraFocus = new THREE.Vector3();
  const focusTarget = new THREE.Vector3();
  let cameraFocusInitialized = false;
  const rivalIndicator = document.getElementById("rival-indicator");
  const cameraDirection = new THREE.Vector3();

  function resetCamera(state) {
    cameraFocusInitialized = false;
    if (state.minigame === "pillows") {
      const height = Math.max(26, 22 / camera.aspect);
      camPos.set(0, height, height * 0.55);
      return;
    }
    camPos.set(
      state.x - Math.sin(state.yaw) * 6.5, 4.2,
      state.z - Math.cos(state.yaw) * 6.5
    );
    if (state.minigame === "eggs") positionEggCamera(camPos, state);
    if (["maze", "survival"].includes(state.minigame)) positionMazeCamera(camPos, state);
  }

  function positionMazeCamera(position, state) {
    const desired = {
      x: state.x - Math.sin(state.yaw) * 2.5,
      z: state.z - Math.cos(state.yaw) * 2.5,
    };
    const map = state.minigame === "survival" ? state.survivalMap : state.maze;
    const fraction = Math.max(0, mazeClearFraction(map.walls, state, desired, 0.18) - 0.025);
    position.set(state.x + (desired.x - state.x) * fraction, 3,
      state.z + (desired.z - state.z) * fraction);
  }

  function positionEggCamera(position, state) {
    position.x = THREE.MathUtils.clamp(position.x, -EGG_LIMIT, EGG_LIMIT);
    position.z = THREE.MathUtils.clamp(position.z, -EGG_LIMIT, EGG_LIMIT);
    position.y = Math.max(eggFloorY(state.x, state.z),
      eggFloorY(position.x, position.z)) + 4.2;
  }

  function render(state, rival, dt, moving, nearButton, nearLanButton) {
    const pillowGame = state.minigame === "pillows";
    const doorGame = state.minigame === "doors";
    const trackGame = state.minigame === "track";
    const eggGame = state.minigame === "eggs";
    const battleGame = state.minigame === "egg-battle";
    const mazeGame = state.minigame === "maze";
    const survivalGame = state.minigame === "survival";
    const corridorGame = mazeGame || survivalGame;
    const gunGame = state.minigame === "gun-arena";
    const cannonGame = state.minigame === "cannon-race";
    ground.visible = !trackGame && !eggGame && !gunGame && !cannonGame;
    track.visible = trackGame;
    lobby.visible = state.scene === "lobby";
    arena.visible = pillowGame;
    doorCourse.visible = doorGame;
    eggArena.visible = eggGame;
    battleArena.visible = battleGame;
    mazeArena.visible = corridorGame;
    gunCourse.visible = gunGame;
    cannonCourse.visible = cannonGame;
    if (cannonGame) renderCannonCourse(state, rival);
    crosshair.hidden = !gunGame || state.scene === "finished" || state.eliminated;
    heldWeapon.visible = gunGame && !state.eliminated;
    setGunArmColor(heldWeapon, state.color);
    opponentWeapons.forEach(rig => { rig.visible = gunGame; });
    if (gunGame) {
      const recoil = Math.max(0, (state.fireCooldown - FIRE_INTERVAL + 0.12) / 0.12);
      heldWeapon.position.set(0, moving ? Math.sin(state.walk) * 0.012 : 0, recoil * 0.08);
      heldWeapon.rotation.x = recoil * 0.06;
      const active = new Set(state.bullets.map(bullet => bullet.id));
      for (const [id, mesh] of bulletMeshes) {
        if (active.has(id)) continue;
        gunCourse.remove(mesh);
        bulletMeshes.delete(id);
      }
      for (const bullet of state.bullets) {
        let mesh = bulletMeshes.get(bullet.id);
        if (!mesh) {
          mesh = new THREE.Mesh(bulletGeometry, bulletMaterial);
          bulletMeshes.set(bullet.id, mesh);
          gunCourse.add(mesh);
        }
        mesh.position.set(bullet.x, bullet.y, bullet.z);
        mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0),
          new THREE.Vector3(bullet.vx, bullet.vy, bullet.vz).normalize());
      }
    }
    if (corridorGame) {
      const map = survivalGame ? state.survivalMap : state.maze;
      mazeFloor.scale.setScalar(survivalGame ? SURVIVAL_SIZE / MAZE_SIZE : 1);
      mazeExit.visible = mazeExitSign.visible = mazeGame;
      const start = survivalGame ? { x: 0, z: 0 } : mazePosition(map.start);
      if (mazeGame) {
        const exit = mazePosition(map.exit);
        mazeExit.position.set(exit.x, 0.07, exit.z);
        mazeExitSign.position.set(exit.x, 2.6, exit.z);
      }
      mazeStart.position.set(start.x, 0.06, start.z);
      if (mazeKey !== map.key) {
        mazeKey = map.key;
        if (mazeWallMesh) {
          mazeArena.remove(mazeWallMesh);
          mazeWallMesh.dispose();
        }
        mazeWallMesh = new THREE.InstancedMesh(
          mazeWallGeometry, mazeWallMaterial, map.walls.length
        );
        const transform = new THREE.Object3D();
        map.walls.forEach((wall, index) => {
          transform.position.set((wall.minX + wall.maxX) / 2, MAZE_WALL_HEIGHT / 2,
            (wall.minZ + wall.maxZ) / 2);
          transform.scale.set(wall.maxX - wall.minX, MAZE_WALL_HEIGHT, wall.maxZ - wall.minZ);
          transform.updateMatrix();
          mazeWallMesh.setMatrixAt(index, transform.matrix);
        });
        mazeWallMesh.castShadow = mazeWallMesh.receiveShadow = true;
        mazeWallMesh.instanceMatrix.needsUpdate = true;
        mazeArena.add(mazeWallMesh);
      }
      mazeMonsterMeshes.forEach(({ group, arrow }, index) => {
        const hazard = mazeGame ? state.mazeMonsters[index] : null;
        group.visible = Boolean(hazard);
        if (!hazard) return;
        group.position.set(hazard.x, Math.abs(Math.sin(hazard.walk)) * 0.1, hazard.z);
        group.rotation.y = hazard.yaw;
        arrow.material.color.setHex(hazard.lastSeen === null ? 0xffbb33 : 0xff3333);
      });
      for (const meshes of [survivalMonsterMeshes, defenseMeshes, projectileMeshes]) {
        for (const mesh of meshes.values()) mesh.visible = survivalGame;
      }
      if (survivalGame) renderSurvival(state, rival);
    }
    if (battleGame) {
      while (battleEggMeshes.length < state.battleEggs.length) {
        const mesh = new THREE.Group();
        mesh.add(eggModel.clone(true));
        battleArena.add(mesh);
        battleEggMeshes.push(mesh);
      }
      battleEggMeshes.forEach((mesh, index) => {
        const egg = state.battleEggs[index];
        mesh.visible = Boolean(egg && egg.respawn === 0);
        if (!egg) return;
        mesh.position.set(egg.x, egg.y, egg.z);
        mesh.rotation.x = egg.flying ? mesh.rotation.x + dt * 12 : 0;
      });
    }
    if (eggGame) {
      while (eggMeshes.length < state.eggs.length) {
        const mesh = new THREE.Group();
        mesh.add(eggModel.clone(true));
        eggArena.add(mesh);
        eggMeshes.push(mesh);
      }
      eggMeshes.forEach((mesh, index) => {
        const egg = state.eggs[index];
        mesh.visible = Boolean(egg);
        if (!egg) return;
        mesh.position.set(egg.x, eggFloorY(egg.x, egg.z) +
          (egg.carrierId === null ? 0.05 : 2.2), egg.z);
      });
      pitMarkers.forEach((marker, index) => {
        const pit = state.eggPits[index];
        marker.group.visible = Boolean(pit);
        if (!pit) return;
        marker.group.position.set(pit.x, 0, pit.z);
        const own = pit.playerId === state.id;
        const text = `P${pit.number}${own ? " - YOU" : ""}`;
        if (marker.text === text) return;
        marker.text = text;
        marker.border.material.color.setHex(own ? 0x33ff66 : 0xff6666);
        const context = marker.canvas.getContext("2d");
        context.fillStyle = own ? "#145c2b" : "#6b2020";
        context.fillRect(0, 0, 256, 64);
        context.fillStyle = "#ffffff";
        context.font = "bold 36px sans-serif";
        context.textAlign = "center";
        context.fillText(text, 128, 45);
        marker.texture.needsUpdate = true;
      });
    }
    if (doorGame) {
      state.doors.forEach((door, index) => gates[index].forEach((hinge, side) => {
        const shake = door.rattle[side] > 0 ? Math.sin(door.rattle[side] * 60) * 0.04 : 0;
        hinge.rotation.y = (side === 0 ? -1 : 1) * (door.open[side] * DOOR_SWING + shake);
      }));
      const step = state.scene === "doors" && dt > 0;
      monster.position.set(
        state.monster.x, step ? Math.abs(Math.sin(state.monster.walk)) * 0.25 : 0, state.monster.z
      );
      monster.rotation.y = state.monster.yaw + Math.PI;
      monster.rotation.z = step ? Math.sin(state.monster.walk) * 0.08 : 0;
      // Fade the monster while it is between the chase camera and the player.
      const close = Math.hypot(state.monster.x - state.x, state.monster.z - state.z) < 7.5;
      for (const material of monsterMaterials) {
        material.opacity = close ? 0.35 : 1;
        material.depthWrite = !close;
      }
    }
    if (pillowGame) cannons.forEach((cannon, index) => {
      cannon.rotation.y = state.cannonYaws[index];
    });
    const playerTrackY = trackGame ?
      trackChickenY("player", state.walk, state.eliminated, dt) : null;
    const rivalTrackY = trackGame && !state.multiplayer ?
      trackChickenY("rival", rival.walk, rival.eliminated, dt) : null;
    rivalChicken.visible = state.scene !== "lobby" && !state.multiplayer &&
      (!(battleGame || gunGame || survivalGame) || !rival.eliminated) &&
      (!trackGame || !rival.eliminated || rivalTrackY !== null);
    setChickenColor(chicken, state.color);
    dressPlayer(state.appearance);
    setChickenColor(rivalChicken, state.multiplayer ? null : rival.color);
    if (!state.multiplayer) setGunArmColor(rivalWeapon, rival.color);
    chicken.visible = !gunGame && (!state.eliminated || (trackGame && playerTrackY !== null));
    const opponents = state.multiplayer ? state.racers.filter(racer => racer.id !== state.id) : [];
    lanChickens.forEach((model, index) => {
      const racer = opponents[index];
      const trackY = racer && trackGame ?
        trackChickenY(`lan-${racer.id}`, racer.walk, racer.eliminated, dt) : null;
      if (racer) {
        setChickenColor(model, racer.color);
        dressLan[index](racer.appearance);
        setGunArmColor(lanWeapons[index], racer.color);
      }
      model.visible = Boolean(racer && (!racer.eliminated || (trackGame && trackY !== null)));
      if (!racer) return;
      model.position.set(racer.x, trackGame ? trackY ?? 0 :
        (eggGame ? eggFloorY(racer.x, racer.z) : gunGame ? gunFloorHeight(racer.x, racer.z) : 0) +
        Math.abs(Math.sin(racer.walk)) * 0.12, racer.z);
      model.position.y += divePose(racer) * 0.8 + (battleGame ? racer.jumpHeight : 0);
      model.rotation.set(-divePose(racer) * 0.75,
        racer.yaw + CHICKEN_YAW_OFFSET + spinPose(racer),
        (racer.controls.forward || (gunGame && racer.controls.strafe)) &&
          !racer.eliminated ? Math.sin(racer.walk) * 0.06 : 0);
      if (cannonGame) poseCannonRacer(model, racer);
    });
    const activePillows = new Set(state.pillows.map(pillow => pillow.id));
    for (const [id, mesh] of pillowMeshes) {
      if (activePillows.has(id)) continue;
      arena.remove(mesh);
      pillowMeshes.delete(id);
    }
    for (const pillow of state.pillows) {
      let mesh = pillowMeshes.get(pillow.id);
      if (!mesh) {
        mesh = new THREE.Group();
        mesh.add(pillowModel.clone(true));
        pillowMeshes.set(pillow.id, mesh);
        arena.add(mesh);
      }
      mesh.position.set(pillow.x, 0.95, pillow.z);
      mesh.rotation.set(0.15, Math.atan2(pillow.vx, pillow.vz), 0);
    }
    buttonMat.color.setHex(nearButton ? 0xff4757 : 0xc0392b);
    lanButtonMat.color.setHex(nearLanButton ? 0x55ccff : 0x2288dd);

    chicken.position.set(state.x, trackGame ? playerTrackY ?? 0 :
      (eggGame ? eggFloorY(state.x, state.z) : 0) +
      Math.abs(Math.sin(state.walk)) * 0.12, state.z);
    chicken.position.y += divePose(state) * 0.8 + (battleGame ? state.jumpHeight : 0);
    chicken.rotation.set(-divePose(state) * 0.75,
      state.yaw + CHICKEN_YAW_OFFSET + spinPose(state),
      moving ? Math.sin(state.walk) * 0.06 : 0);
    const rivalMoving = ["track", "pillows", "doors", "eggs", "egg-battle", "maze", "gun-arena", "survival", "cannon-race"].includes(state.scene) &&
      dt > 0 && (rival.controls.forward !== 0 || (gunGame && rival.controls.strafe !== 0));
    rivalChicken.position.set(rival.x, trackGame ? rivalTrackY ?? 0 :
      (eggGame ? eggFloorY(rival.x, rival.z) : gunGame ? gunFloorHeight(rival.x, rival.z) : 0) +
      (rivalMoving ? Math.abs(Math.sin(rival.walk)) * 0.12 : 0), rival.z);
    rivalChicken.rotation.y = rival.yaw + CHICKEN_YAW_OFFSET;
    rivalChicken.position.y += battleGame ? rival.jumpHeight : 0;
    rivalChicken.rotation.z = rivalMoving ? Math.sin(rival.walk) * 0.06 : 0;
    rivalChicken.rotation.x = 0;
    if (cannonGame) {
      poseCannonRacer(chicken, state);
      if (!state.multiplayer) poseCannonRacer(rivalChicken, rival);
    }

    const back = new THREE.Vector3(-Math.sin(state.yaw), 0, -Math.cos(state.yaw));
    const target = new THREE.Vector3(state.x, 0, state.z).addScaledVector(back, 6.5);
    const followHeight = trackGame ? trackChickenHeights.get("player") ?? 0 :
      eggGame ? eggFloorY(state.x, state.z) : 0;
    target.y = followHeight + 4.2;
    if (pillowGame) {
      const height = Math.max(26, 22 / camera.aspect);
      target.set(0, height, height * 0.55);
    }
    if (eggGame) positionEggCamera(target, state);
    if (corridorGame) positionMazeCamera(target, state);
    if (gunGame) target.set(state.x, gunFloorHeight(state.x, state.z) + EYE_HEIGHT, state.z);
    if (cannonGame) target.set(state.x + 2.3, Math.max(4.4, state.cannonY + 2), state.z - 7);
    // Keep the chase camera directly behind the player in these arenas.
    if (doorGame || eggGame || battleGame || corridorGame || gunGame) camPos.copy(target);
    else camPos.lerp(target, 1 - Math.pow(0.0001, dt));
    camera.position.copy(camPos);
    const fadePlayer = (corridorGame && Math.hypot(camPos.x - state.x, camPos.z - state.z) < 1.5) ||
      (survivalGame && state.invulnerable > 0 && Math.sin(state.survivalTime * 30) > 0);
    for (const original of playerMaterials) {
      const { material } = original;
      const transparent = fadePlayer || original.transparent;
      if (material.transparent !== transparent) {
        material.transparent = transparent;
        material.needsUpdate = true;
      }
      material.opacity = original.opacity * (fadePlayer ? 0.2 : 1);
      material.depthWrite = !fadePlayer && original.depthWrite;
    }
    if (gunGame) camera.lookAt(state.x + Math.sin(state.yaw) * Math.cos(state.pitch),
      target.y + Math.sin(state.pitch), state.z + Math.cos(state.yaw) * Math.cos(state.pitch));
    else if (cannonGame) camera.lookAt(state.cannonLane, 2, state.z + 6);
    else if (pillowGame) camera.lookAt(0, 0, 0);
    else {
      focusTarget.set(state.x, followHeight + 1.6, state.z);
      if (!cameraFocusInitialized) {
        cameraFocus.copy(focusTarget);
        cameraFocusInitialized = true;
      } else if (state.multiplayer && trackGame) {
        cameraFocus.lerp(focusTarget, 1 - Math.pow(0.0001, dt));
      } else cameraFocus.copy(focusTarget);
      camera.lookAt(cameraFocus);
    }
    rivalIndicator.style.display = state.scene === "lobby" || pillowGame || eggGame || corridorGame || gunGame || cannonGame || state.multiplayer ? "none" : "flex";
    if (rivalIndicator.style.display !== "none") {
      const direction = new THREE.Vector3(rival.x, 1.2, rival.z).sub(camera.position);
      camera.getWorldDirection(cameraDirection);
      const behind = direction.dot(cameraDirection) < 0;
      const point = new THREE.Vector3(rival.x, 2.2, rival.z).project(camera);
      if (behind) {
        point.x = -point.x;
        point.y = -point.y;
      }
      const onScreen = !behind && point.z >= -1 && point.z <= 1 &&
        point.x >= -0.9 && point.x <= 0.9 && point.y >= -0.85 && point.y <= 0.85;
      const x = Math.max(28, Math.min(innerWidth - 28, (point.x * 0.5 + 0.5) * innerWidth));
      const y = Math.max(28, Math.min(innerHeight - 28, (-point.y * 0.5 + 0.5) * innerHeight));
      rivalIndicator.classList.toggle("offscreen", !onScreen);
      rivalIndicator.style.left = `${x}px`;
      rivalIndicator.style.top = `${y}px`;
      rivalIndicator.style.setProperty("--arrow-angle", `${Math.atan2(-point.y, point.x)}rad`);
    }
    renderer.render(scene, camera);
  }

  return { resetCamera, render };
}
