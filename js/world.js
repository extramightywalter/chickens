import * as THREE from "three";
import { addPaintings } from "./paintings.js";
import {
  BUTTON, CELL, MAP, START, WALL_H, checkpoints, cols, lobbyWalls, rows, trackWalls,
} from "./track.js";

function buildChicken(color = 0xffffff) {
  const g = new THREE.Group();
  const white = new THREE.MeshLambertMaterial({ color });
  const orange = new THREE.MeshLambertMaterial({ color: 0xff8c1a });
  const red = new THREE.MeshLambertMaterial({ color: 0xd62828 });
  const black = new THREE.MeshLambertMaterial({ color: 0x222222 });

  const body = new THREE.Mesh(new THREE.SphereGeometry(0.55, 20, 16), white);
  body.scale.set(0.9, 0.95, 1.15);
  body.position.y = 0.8;
  g.add(body);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.32, 18, 14), white);
  head.position.set(0, 1.45, 0.45);
  g.add(head);

  const beak = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.3, 10), orange);
  beak.rotation.x = Math.PI / 2;
  beak.position.set(0, 1.45, 0.82);
  g.add(beak);

  const comb = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.22, 0.34), red);
  comb.position.set(0, 1.78, 0.42);
  g.add(comb);

  const wattle = new THREE.Mesh(new THREE.SphereGeometry(0.08, 10, 8), red);
  wattle.position.set(0, 1.26, 0.68);
  g.add(wattle);

  for (const s of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 8), black);
    eye.position.set(0.16 * s, 1.52, 0.68);
    g.add(eye);

    const wing = new THREE.Mesh(new THREE.SphereGeometry(0.3, 14, 12), white);
    wing.scale.set(0.35, 0.65, 1);
    wing.position.set(0.5 * s, 0.85, -0.05);
    g.add(wing);

    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.45, 8), orange);
    leg.position.set(0.2 * s, 0.22, 0);
    g.add(leg);

    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.05, 0.3), orange);
    foot.position.set(0.2 * s, 0.03, 0.06);
    g.add(foot);
  }

  const tail = new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 10), white);
  tail.scale.set(0.7, 1.2, 0.7);
  tail.position.set(0, 1.1, -0.6);
  tail.rotation.x = -0.5;
  g.add(tail);

  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  return g;
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

  const chicken = buildChicken();
  const rivalChicken = buildChicken(0xffc857);
  scene.add(chicken, rivalChicken);
  const camPos = new THREE.Vector3();

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
    chicken.rotation.y = state.yaw;
    chicken.rotation.z = moving ? Math.sin(state.walk) * 0.06 : 0;
    const rivalMoving = state.scene === "track" && dt > 0;
    rivalChicken.position.set(rival.x, rivalMoving ? Math.abs(Math.sin(rival.walk)) * 0.12 : 0, rival.z);
    rivalChicken.rotation.y = rival.yaw;
    rivalChicken.rotation.z = rivalMoving ? Math.sin(rival.walk) * 0.06 : 0;

    const back = new THREE.Vector3(-Math.sin(state.yaw), 0, -Math.cos(state.yaw));
    const target = new THREE.Vector3(state.x, 0, state.z).addScaledVector(back, 6.5);
    target.y = 4.2;
    camPos.lerp(target, 1 - Math.pow(0.0001, dt));
    camera.position.copy(camPos);
    camera.lookAt(state.x, 1.6, state.z);
    renderer.render(scene, camera);
  }

  return { resetCamera, render };
}
