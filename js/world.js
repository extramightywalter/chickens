import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { addPaintings } from "./paintings.js";
import { ARENA, CANNONS, CANNON_MUZZLE, PILLOW_RADIUS, arenaWalls } from "./pillows.js";
import {
  BUTTON, CELL, CHICKEN_SCALE, LOBBY_BOUNDS, LOBBY_CELL_DEPTH, LOBBY_CELL_WIDTH, LOBBY_MAP, MAP,
  START, WALL_H, checkpoints, cols, lobbyCellPosition, lobbyStructures, rows, trackWalls,
} from "./track.js";

const CHICKEN_YAW_OFFSET = Math.PI;
const RIVAL_COLORS = {
  "_defaultMat(Clone)": 0xd62828,
  "dark(Clone)": 0x641010,
};

function createChicken(model, rival = false) {
  const chicken = model.clone(true);
  chicken.scale.setScalar(CHICKEN_SCALE);
  chicken.traverse(object => {
    if (!object.isMesh) return;
    object.castShadow = true;
    if (rival) {
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      const rivalMaterials = materials.map(material => {
        const clone = material.clone();
        const color = RIVAL_COLORS[clone.name];
        if (color !== undefined) clone.color.setHex(color);
        return clone;
      });
      object.material = Array.isArray(object.material) ? rivalMaterials : rivalMaterials[0];
    }
  });
  return chicken;
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
  scene.add(track, lobby, arena);
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
  for (const wall of trackWalls) addWall(track, wall);
  await addPaintings(track);
  const roadMat = new THREE.MeshLambertMaterial({ color: 0xb9a77a });
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    if (MAP[j][i] === "x") continue;
    const tile = new THREE.Mesh(new THREE.PlaneGeometry(CELL, CELL), roadMat);
    tile.rotation.x = -Math.PI / 2;
    tile.position.set((i + 0.5) * CELL, 0.015, (j + 0.5) * CELL);
    tile.receiveShadow = true;
    track.add(tile);
  }
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
  const loader = new GLTFLoader();
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

  const padMat = new THREE.MeshLambertMaterial({ color: 0xf9ed69, emissive: 0x8a7a1a });
  const pad = new THREE.Mesh(new THREE.BoxGeometry(CELL * 3, 0.1, 0.8), padMat);
  pad.position.set(START.x, 0.05, START.z);
  track.add(pad);

  const buttonMat = new THREE.MeshLambertMaterial({ color: 0xc0392b });
  const button = new THREE.Mesh(new THREE.CylinderGeometry(BUTTON.r, BUTTON.r, 0.3, 32), buttonMat);
  lobbyStructure.updateWorldMatrix(true, false);
  button.position.copy(lobbyStructure.worldToLocal(new THREE.Vector3(BUTTON.x, 0.15, BUTTON.z)));
  lobbyStructure.add(button);

  const arrowShape = new THREE.Shape();
  arrowShape.moveTo(0, -0.8);
  arrowShape.lineTo(-0.65, 0.4);
  arrowShape.lineTo(0.65, 0.4);
  arrowShape.closePath();
  const arrowGeo = new THREE.ShapeGeometry(arrowShape);
  for (let n = 0; n < checkpoints.length; n++) {
    const point = checkpoints[n], next = checkpoints[(n + 1) % checkpoints.length];
    const arrow = new THREE.Mesh(arrowGeo, padMat);
    arrow.rotation.set(-Math.PI / 2, 0, 0);
    arrow.rotateZ(Math.atan2(next.x - point.x, next.z - point.z));
    arrow.position.set(point.x, 0.03, point.z);
    track.add(arrow);
  }

  const { scene: chickenModel } = await loader.loadAsync(
    new URL("../assets/models/chicken.glb", import.meta.url).href
  );
  const chicken = createChicken(chickenModel);
  const rivalChicken = createChicken(chickenModel, true);
  scene.add(chicken, rivalChicken);
  const camPos = new THREE.Vector3();
  const rivalIndicator = document.getElementById("rival-indicator");
  const cameraDirection = new THREE.Vector3();

  function resetCamera(state) {
    if (state.minigame === "pillows") {
      const height = Math.max(26, 22 / camera.aspect);
      camPos.set(0, height, height * 0.55);
      return;
    }
    camPos.set(
      state.x - Math.sin(state.yaw) * 6.5, 4.2,
      state.z - Math.cos(state.yaw) * 6.5
    );
  }

  function render(state, rival, dt, moving, nearButton) {
    const pillowGame = state.minigame === "pillows";
    track.visible = state.scene !== "lobby" && !pillowGame;
    lobby.visible = state.scene === "lobby";
    arena.visible = pillowGame;
    if (pillowGame) cannons.forEach((cannon, index) => {
      cannon.rotation.y = state.cannonYaws[index];
    });
    rivalChicken.visible = state.scene !== "lobby";
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

    chicken.position.set(state.x, Math.abs(Math.sin(state.walk)) * 0.12, state.z);
    chicken.rotation.y = state.yaw + CHICKEN_YAW_OFFSET;
    chicken.rotation.z = moving ? Math.sin(state.walk) * 0.06 : 0;
    const rivalMoving = (state.scene === "track" || state.scene === "pillows") &&
      dt > 0 && rival.controls.forward !== 0;
    rivalChicken.position.set(rival.x, rivalMoving ? Math.abs(Math.sin(rival.walk)) * 0.12 : 0, rival.z);
    rivalChicken.rotation.y = rival.yaw + CHICKEN_YAW_OFFSET;
    rivalChicken.rotation.z = rivalMoving ? Math.sin(rival.walk) * 0.06 : 0;

    const back = new THREE.Vector3(-Math.sin(state.yaw), 0, -Math.cos(state.yaw));
    const target = new THREE.Vector3(state.x, 0, state.z).addScaledVector(back, 6.5);
    target.y = 4.2;
    if (pillowGame) {
      const height = Math.max(26, 22 / camera.aspect);
      target.set(0, height, height * 0.55);
    }
    camPos.lerp(target, 1 - Math.pow(0.0001, dt));
    camera.position.copy(camPos);
    if (pillowGame) camera.lookAt(0, 0, 0);
    else camera.lookAt(state.x, 1.6, state.z);
    rivalIndicator.style.display = state.scene === "lobby" || pillowGame ? "none" : "flex";
    if (state.scene !== "lobby" && !pillowGame) {
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
