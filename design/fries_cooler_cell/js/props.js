// Static cell furniture: conveyor, robot pedestal, disposal bin, floor, labels.
import * as THREE from 'three';
import {BELT, FUNNEL} from './timeline.js';

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
  // Funnel guide plates (2 mm above the belt) steer the stream into the scoop mouth.
  for (const s of [-1, 1]) {
    const a = new THREE.Vector3(x + s * FUNNEL.halfIn, 0, FUNNEL.zIn), b = new THREE.Vector3(x + s * FUNNEL.halfOut, 0, FUNNEL.zOut);
    const span = b.clone().sub(a);
    const plate = box(group, [0.004, 0.05, span.length()], m.outerSteel, [0, top + 0.027, 0]);
    plate.position.x = (a.x + b.x) / 2;
    plate.position.z = (a.z + b.z) / 2;
    plate.rotation.y = Math.atan2(span.x, span.z);
    box(group, [Math.abs(FUNNEL.halfIn - width / 2) + 0.01, 0.006, 0.03], m.outerSteel, [x + s * (FUNNEL.halfIn + width / 2) / 2, top + 0.05, FUNNEL.zIn]);
  }
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

export function buildBin(m, position) {
  const group = new THREE.Group();
  group.name = 'Disposal bin';
  group.position.set(...position);
  const {halfX, halfZ, height, wall, floor} = BIN;
  box(group, [2 * halfX, floor, 2 * halfZ], m.bin, [0, floor / 2, 0]);
  for (const s of [-1, 1]) {
    box(group, [wall, height, 2 * halfZ], m.bin, [s * (halfX - wall / 2), height / 2, 0]);
    box(group, [2 * halfX, height, wall], m.bin, [0, height / 2, s * (halfZ - wall / 2)]);
  }
  box(group, [2 * halfX + 0.02, 0.014, 0.02], m.binRim, [0, height, halfZ]);
  return group;
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
