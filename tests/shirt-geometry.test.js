import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { removeShirtCollar, shortenShirtLettering } from "../js/shirt-geometry.js";

function shirtGeometry(file, materialName) {
  const buffer = readFileSync(new URL(`../assets/models/${file}`, import.meta.url));
  const jsonLength = buffer.readUInt32LE(12);
  const model = JSON.parse(buffer.subarray(20, 20 + jsonLength).toString());
  const binary = 28 + jsonLength;
  const primitive = model.meshes[0].primitives.find(part => model.materials[part.material].name === materialName);
  function attribute(accessorIndex, stride) {
    const accessor = model.accessors[accessorIndex];
    const offset = binary + model.bufferViews[accessor.bufferView].byteOffset + accessor.byteOffset;
    const values = Array.from({ length: accessor.count * stride }, (_, index) =>
      stride === 1 ? buffer.readUInt32LE(offset + index * 4) : buffer.readFloatLE(offset + index * 4));
    return {
      values, count: accessor.count,
      getX: i => values[i * stride],
      getY: i => values[i * stride + 1],
      getZ: i => values[i * stride + 2],
      setY: (i, y) => { values[i * stride + 1] = y; },
      setXYZ: (i, x, y, z) => { values.splice(i * stride, 3, x, y, z); },
    };
  }
  const position = attribute(primitive.attributes.POSITION, 3);
  const normal = attribute(primitive.attributes.NORMAL, 3);
  const index = attribute(primitive.indices, 1);
  return {
    position, normal, index,
    getAttribute: name => ({ position, normal })[name],
    getIndex: () => index,
    setIndex: values => { index.values.splice(0, index.values.length, ...values); index.count = values.length; },
    computeBoundingBox() {}, computeBoundingSphere() {},
  };
}

for (const [shirt, file] of [["gamer", "gamer T.glb"], ["jersey", "pitchers jersey.glb"]]) {
  test(`${shirt} collar is removed without removing the remaining details`, () => {
    const geometry = shirtGeometry(file, "metalPurple(Clone)");
    const original = [...geometry.index.values];
    const collar = vertex => geometry.position.getY(vertex) >= 0.8999 &&
      Math.abs(geometry.position.getX(vertex)) <= 0.3001 &&
      geometry.position.getZ(vertex) >= -0.2601 && geometry.position.getZ(vertex) <= 0.3001;
    const expected = [];
    let removed = 0;
    for (let i = 0; i < original.length; i += 3) {
      const triangle = original.slice(i, i + 3);
      if (triangle.every(collar)) removed++;
      else expected.push(...triangle);
    }
    assert.ok(removed > 0);
    removeShirtCollar(geometry);
    assert.deepEqual(geometry.index.values, expected);
    assert.throws(() => removeShirtCollar(geometry), /Could not find shirt collar/);
  });
}

for (const [shirt, file, material, isLetterFace, isOtherDetail] of [
  ["gamer", "gamer T.glb", "dark(Clone)", x => x < 0, x => x > 0.3],
  ["jersey", "pitchers jersey.glb", "metalPurple(Clone)", x => x > 0.59, x => x < 0],
]) {
  test(`${shirt} lettering is shorter without changing other shirt details`, () => {
    const geometry = shirtGeometry(file, material);
    const original = [...geometry.position.values];
    const vertices = new Set(geometry.index.values);
    const letterVertices = [...vertices].filter(vertex => isLetterFace(original[vertex * 3]));
    assert.ok(letterVertices.length > 0);
    const height = values => {
      const ys = letterVertices.map(vertex => values[vertex * 3 + 1]);
      return Math.max(...ys) - Math.min(...ys);
    };
    shortenShirtLettering(geometry, shirt);
    assert.ok(Math.abs(height(geometry.position.values) / height(original) - 0.55) < 1e-6);
    const otherVertices = [...vertices].filter(vertex => isOtherDetail(original[vertex * 3]));
    assert.ok(otherVertices.length > 0);
    for (const vertex of otherVertices) {
      assert.deepEqual(geometry.position.values.slice(vertex * 3, vertex * 3 + 3),
        original.slice(vertex * 3, vertex * 3 + 3));
    }
  });
}
