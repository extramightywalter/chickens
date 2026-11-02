import * as THREE from "three";
import { PAINTINGS } from "./track.js";

export async function addPaintings(track) {
  const texture = await new THREE.TextureLoader().loadAsync(
    new URL("../oreo portrait.png", import.meta.url).href
  );
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.NearestFilter;

  const outerGeometry = new THREE.BoxGeometry(2.5, 2.5, 0.12);
  const innerGeometry = new THREE.BoxGeometry(2.3, 2.3, 0.14);
  const portraitGeometry = new THREE.PlaneGeometry(2.1, 2.1);
  const wood = new THREE.MeshLambertMaterial({ color: 0x4a2714 });
  const gold = new THREE.MeshLambertMaterial({ color: 0xd4a843 });
  const art = new THREE.MeshBasicMaterial({ map: texture, toneMapped: false });

  for (const { x, z, yaw } of PAINTINGS) {
    const painting = new THREE.Group();
    painting.name = "Oreo portrait";
    const outer = new THREE.Mesh(outerGeometry, wood);
    outer.position.z = 0.06;
    const inner = new THREE.Mesh(innerGeometry, gold);
    inner.position.z = 0.08;
    const portrait = new THREE.Mesh(portraitGeometry, art);
    portrait.position.z = 0.16;
    painting.add(outer, inner, portrait);
    painting.position.set(x, 1.5, z);
    painting.rotation.y = yaw;
    track.add(painting);
  }
}
