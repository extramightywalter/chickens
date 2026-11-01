import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { addPaintings } from "./paintings.js";
import {
  BUTTON, CELL, MAP, START, WALL_H, checkpoints, cols, lobbyWalls, rows, trackWalls,
} from "./track.js";

const CHICKEN_YAW_OFFSET = Math.PI;
const RIVAL_COLORS = {
  "_defaultMat(Clone)": 0xd62828,
  "dark(Clone)": 0x641010,
};

function createChicken(model, rival = false) {
  const chicken = model.clone(true);
  chicken.scale.setScalar(0.7);
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
  sun.position.set(cols * CELL * 0.5 + 30, 60, rows * CELL * 0.5 - 40);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const span = Math.max(cols, rows) * CELL * 0.75;
  sun.shadow.camera.left = -span; sun.shadow.camera.right = span;
  sun.shadow.camera.top = span; sun.shadow.camera.bottom = -span;
  sun.shadow.camera.far = 200;
  const sunTarget = new THREE.Object3D();
  sunTarget.position.set(cols * CELL / 2, 0, rows * CELL / 2);
  scene.add(sunTarget); sun.target = sunTarget;
  scene.add(sun);

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(600, 600),
    new THREE.MeshLambertMaterial({ color: 0x3f9e4d })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(cols * CELL / 2, 0, rows * CELL / 2);
  ground.receiveShadow = true;
  scene.add(ground);

  const track = new THREE.Group();
  const lobby = new THREE.Group();
  scene.add(track, lobby);
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
  for (const wall of lobbyWalls) addWall(lobby, wall);
  await addPaintings(track, lobby);
  const roadMat = new THREE.MeshLambertMaterial({ color: 0xb9a77a });
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    if (MAP[j][i] === "x") continue;
    const tile = new THREE.Mesh(new THREE.PlaneGeometry(CELL, CELL), roadMat);
    tile.rotation.x = -Math.PI / 2;
    tile.position.set((i + 0.5) * CELL, 0.015, (j + 0.5) * CELL);
    tile.receiveShadow = true;
    track.add(tile);
  }

  const padMat = new THREE.MeshLambertMaterial({ color: 0xf9ed69, emissive: 0x8a7a1a });
  const pad = new THREE.Mesh(new THREE.BoxGeometry(CELL * 3, 0.1, 0.8), padMat);
  pad.position.set(START.x, 0.05, START.z);
  track.add(pad);

  const lobbyFloor = new THREE.Mesh(
    new THREE.PlaneGeometry(46, 28),
    new THREE.MeshLambertMaterial({ color: 0x394867 })
  );
  lobbyFloor.rotation.x = -Math.PI / 2;
  lobbyFloor.position.set(-46, 0.02, 15);
  lobbyFloor.receiveShadow = true;
  lobby.add(lobbyFloor);
  const buttonMat = new THREE.MeshLambertMaterial({ color: 0xc0392b });
  const button = new THREE.Mesh(new THREE.CylinderGeometry(BUTTON.r, BUTTON.r, 0.3, 32), buttonMat);
  button.position.set(BUTTON.x, 0.15, BUTTON.z);
  lobby.add(button);

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

  const { scene: chickenModel } = await new GLTFLoader().loadAsync(
    new URL("../chicken.glb", import.meta.url).href
  );
  const chicken = createChicken(chickenModel);
  const rivalChicken = createChicken(chickenModel, true);
  scene.add(chicken, rivalChicken);
  const camPos = new THREE.Vector3();
  const rivalIndicator = document.getElementById("rival-indicator");
  const cameraDirection = new THREE.Vector3();

  function resetCamera(state) {
    camPos.set(
      state.x - Math.sin(state.yaw) * 6.5, 4.2,
      state.z - Math.cos(state.yaw) * 6.5
    );
  }

  function render(state, rival, dt, moving, nearButton) {
    track.visible = state.scene !== "lobby";
    lobby.visible = state.scene === "lobby";
    rivalChicken.visible = state.scene !== "lobby";
    buttonMat.color.setHex(nearButton ? 0xff4757 : 0xc0392b);

    chicken.position.set(state.x, Math.abs(Math.sin(state.walk)) * 0.12, state.z);
    chicken.rotation.y = state.yaw + CHICKEN_YAW_OFFSET;
    chicken.rotation.z = moving ? Math.sin(state.walk) * 0.06 : 0;
    const rivalMoving = state.scene === "track" && dt > 0;
    rivalChicken.position.set(rival.x, rivalMoving ? Math.abs(Math.sin(rival.walk)) * 0.12 : 0, rival.z);
    rivalChicken.rotation.y = rival.yaw + CHICKEN_YAW_OFFSET;
    rivalChicken.rotation.z = rivalMoving ? Math.sin(rival.walk) * 0.06 : 0;

    const back = new THREE.Vector3(-Math.sin(state.yaw), 0, -Math.cos(state.yaw));
    const target = new THREE.Vector3(state.x, 0, state.z).addScaledVector(back, 6.5);
    target.y = 4.2;
    camPos.lerp(target, 1 - Math.pow(0.0001, dt));
    camera.position.copy(camPos);
    camera.lookAt(state.x, 1.6, state.z);
    rivalIndicator.style.display = state.scene === "lobby" ? "none" : "flex";
    if (state.scene !== "lobby") {
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
