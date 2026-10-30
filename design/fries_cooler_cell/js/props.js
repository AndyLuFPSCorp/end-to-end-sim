// Static cell furniture: conveyor, robot pedestal, bins, floor, labels.
import * as THREE from 'three';
import {BELT, TOTE} from './common.js';

function box(parent, size, material, position) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
  mesh.position.set(...position);
  mesh.castShadow = mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

const BELT_PITCH = 0.1; // one texture repeat per 100 mm of belt

function beltTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#2f3438';
  ctx.fillRect(0, 0, 64, 64);
  ctx.fillStyle = '#4a5157';
  ctx.fillRect(0, 0, 64, 6);
  for (let i = 0; i < 40; i++) {
    ctx.fillStyle = `rgba(255,255,255,${0.02 + 0.03 * ((i * 37) % 7) / 7})`;
    ctx.fillRect((i * 23) % 64, (i * 41) % 64, 2, 2);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export function buildConveyor(m) {
  const group = new THREE.Group();
  group.name = 'Conveyor';
  const {x, width, top, zStart, zEnd} = BELT;
  const length = zEnd - zStart, cz = (zStart + zEnd) / 2;
  const texture = beltTexture();
  texture.repeat.set(1, length / BELT_PITCH);
  const beltMaterial = new THREE.MeshStandardMaterial({map: texture, roughness: 0.85});
  const surface = new THREE.Mesh(new THREE.PlaneGeometry(width, length), beltMaterial);
  surface.rotation.x = -Math.PI / 2;
  surface.position.set(x, top, cz);
  surface.receiveShadow = true;
  group.add(surface);
  box(group, [width, 0.05, length], m.dark, [x, top - 0.026, cz]);
  for (const z of [zStart, zEnd]) {
    const roller = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, width, 32), m.dark);
    roller.rotation.z = Math.PI / 2;
    roller.position.set(x, top - 0.026, z);
    group.add(roller);
  }
  for (const s of [-1, 1]) box(group, [0.03, 0.08, length + 0.04], m.aluminium, [x + s * (width / 2 + 0.015), top - 0.035, cz]);
  for (const s of [-1, 1]) box(group, [0.006, 0.04, length], m.outerSteel, [x + s * (width / 2 + 0.003), top + 0.02, cz]);
  for (const z of [zStart + 0.1, zEnd - 0.1]) {
    for (const s of [-1, 1]) box(group, [0.04, top - 0.07, 0.04], m.aluminium, [x + s * (width / 2 - 0.02), (top - 0.07) / 2, z]);
    box(group, [width, 0.03, 0.04], m.aluminium, [x, 0.15, z]);
  }
  box(group, [0.12, 0.1, 0.14], m.motor, [x - width / 2 - 0.08, top - 0.05, zStart + 0.06]);
  return {
    group,
    setTravel(travel) {
      texture.offset.y = travel / BELT_PITCH;
    },
  };
}

export function buildPedestal(m, base) {
  const group = new THREE.Group();
  box(group, [0.36, 0.02, 0.36], m.dark, [base[0], 0.01, base[2]]);
  box(group, [0.24, base[1] - 0.04, 0.24], m.outerSteel, [base[0], base[1] / 2, base[2]]);
  box(group, [0.26, 0.02, 0.26], m.outerSteel, [base[0], base[1] - 0.01, base[2]]);
  return group;
}

export const BIN = {halfX: 0.18, halfZ: 0.16, height: 0.28, wall: 0.012, floor: 0.04};

// Open-top bin; `container(name, fade)` gives the fry-sim container for it.
export function buildBin(m, position, dims = BIN, name = 'Disposal bin') {
  const group = new THREE.Group();
  group.name = name;
  group.position.set(...position);
  const {halfX, halfZ, height, wall = 0.012, floor = 0.04} = dims;
  box(group, [2 * halfX, floor, 2 * halfZ], m.bin, [0, floor / 2, 0]);
  for (const s of [-1, 1]) {
    box(group, [wall, height, 2 * halfZ], m.bin, [s * (halfX - wall / 2), height / 2, 0]);
    box(group, [2 * halfX, height, wall], m.bin, [0, height / 2, s * (halfZ - wall / 2)]);
  }
  box(group, [2 * halfX + 0.02, 0.014, 0.02], m.binRim, [0, height, halfZ]);
  group.updateMatrixWorld(true);
  return {
    group,
    container: (containerName, fade) => ({
      name: containerName, frame: group, halfX: halfX - wall, halfZ: halfZ - wall,
      floor, top: height, cell: 0.02, fade,
    }),
  };
}

export function buildTote(m) {
  return buildBin(m, TOTE.position, {...TOTE, floor: 0.03}, 'Overflow tote');
}

export function buildFloor() {
  const group = new THREE.Group();
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(8, 8),
    new THREE.MeshStandardMaterial({color: 0xdfe3e6, roughness: 0.95}));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  group.add(floor);
  const grid = new THREE.GridHelper(8, 80, 0xb8bfc5, 0xccd2d6);
  grid.position.y = 0.0005;
  group.add(grid);
  return group;
}

// Screen-space label (constant size whatever the zoom); `size` is a fraction
// of the viewport height.
export function label(text, position, size = 0.032) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  const font = '600 44px system-ui, -apple-system, Segoe UI, sans-serif';
  ctx.font = font;
  const width = Math.ceil(ctx.measureText(text).width) + 40;
  canvas.width = width;
  canvas.height = 72;
  ctx.font = font;
  ctx.fillStyle = 'rgba(20, 28, 36, 0.78)';
  ctx.beginPath();
  ctx.roundRect(0, 0, width, 72, 18);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 20, 38);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({map: texture, depthTest: false, transparent: true, sizeAttenuation: false}));
  sprite.scale.set(size * width / 72, size, 1);
  sprite.position.set(...position);
  sprite.renderOrder = 10;
  return sprite;
}

// Simple operator mannequin for scale: `height` metres tall, standing with its
// feet at the origin, facing +Z (rotate the group to place it).
export function buildOperator(height = 1.75) {
  const group = new THREE.Group();
  group.name = `Operator ${height.toFixed(2)} m`;
  const k = height / 1.75;
  const mat = color => new THREE.MeshStandardMaterial({color, roughness: 0.8});
  const skin = mat(0xd9a77f), trousers = mat(0x2f3a4a), jacket = mat(0xf4f6f7), vest = mat(0xc6e042),
    boots = mat(0x1e2226), net = mat(0xffffff);
  const part = (geometry, material, x, y, z) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x * k, y * k, z * k);
    mesh.scale.setScalar(k);
    mesh.castShadow = mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  };
  for (const s of [-1, 1]) {
    part(new THREE.BoxGeometry(0.11, 0.07, 0.27), boots, s * 0.095, 0.035, 0.04);
    part(new THREE.CapsuleGeometry(0.065, 0.72, 6, 16), trousers, s * 0.095, 0.47, 0);
    const arm = part(new THREE.CapsuleGeometry(0.047, 0.52, 6, 16), jacket, s * 0.235, 1.135, 0.01);
    arm.rotation.z = s * 0.09;
    part(new THREE.SphereGeometry(0.05, 16, 12), skin, s * 0.262, 0.815, 0.025);
  }
  part(new THREE.BoxGeometry(0.34, 0.16, 0.2), trousers, 0, 0.9, 0);
  const torso = part(new THREE.CapsuleGeometry(0.15, 0.32, 8, 20), jacket, 0, 1.2, 0);
  torso.scale.set(1.18 * k, k, 0.72 * k);
  const hiVis = part(new THREE.CapsuleGeometry(0.153, 0.22, 8, 20), vest, 0, 1.2, 0);
  hiVis.scale.set(1.19 * k, k, 0.74 * k);
  part(new THREE.CylinderGeometry(0.05, 0.055, 0.1, 16), skin, 0, 1.47, 0);
  part(new THREE.SphereGeometry(0.105, 24, 18), skin, 0, 1.625, 0.005);
  // Food-plant hairnet cap; its top sits at the full height.
  const cap = part(new THREE.SphereGeometry(0.112, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), net, 0, 1.638, -0.005);
  cap.scale.set(k, 1.0 * k, k);
  return group;
}
