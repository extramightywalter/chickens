const HEIGHT_SCALE = 0.55;

export function removeShirtCollar(geometry) {
  const position = geometry.getAttribute("position");
  const index = geometry.getIndex();
  if (!position || !index) throw new Error("Invalid shirt collar geometry.");
  const isCollar = vertex => {
    const x = position.getX(vertex), y = position.getY(vertex), z = position.getZ(vertex);
    return y >= 0.8999 && Math.abs(x) <= 0.3001 && z >= -0.2601 && z <= 0.3001;
  };
  const remaining = [];
  for (let i = 0; i < index.count; i += 3) {
    const triangle = [index.getX(i), index.getX(i + 1), index.getX(i + 2)];
    if (!triangle.every(isCollar)) remaining.push(...triangle);
  }
  if (remaining.length === index.count) throw new Error("Could not find shirt collar.");
  geometry.setIndex(remaining);
}

export function shortenShirtLettering(geometry, shirt) {
  const position = geometry.getAttribute("position");
  const normal = geometry.getAttribute("normal");
  const index = geometry.getIndex();
  if (!position || !normal || !index || !["gamer", "jersey"].includes(shirt)) {
    throw new Error("Invalid shirt lettering geometry.");
  }
  const isLetter = vertex => {
    const x = position.getX(vertex), y = position.getY(vertex), z = position.getZ(vertex);
    return shirt === "gamer" ? x < 0 :
      x > 0.399 && Math.abs(z) < 0.351 && y > 0.199 && y < 0.701;
  };
  const letters = new Set();
  for (let i = 0; i < index.count; i += 3) {
    const vertices = [index.getX(i), index.getX(i + 1), index.getX(i + 2)];
    if (vertices.every(isLetter)) vertices.forEach(vertex => letters.add(vertex));
  }
  if (!letters.size) throw new Error(`Could not find ${shirt} shirt lettering.`);
  const ys = [...letters].map(vertex => position.getY(vertex));
  const centerY = (Math.min(...ys) + Math.max(...ys)) / 2;
  for (const vertex of letters) {
    position.setY(vertex, centerY + (position.getY(vertex) - centerY) * HEIGHT_SCALE);
    const x = normal.getX(vertex), y = normal.getY(vertex) / HEIGHT_SCALE, z = normal.getZ(vertex);
    const length = Math.hypot(x, y, z);
    if (length > 0) normal.setXYZ(vertex, x / length, y / length, z / length);
  }
  position.needsUpdate = true;
  normal.needsUpdate = true;
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
}
