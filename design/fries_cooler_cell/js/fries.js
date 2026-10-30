// Deterministic 1 kg batch of frozen fries: belt stream -> funnel -> scoop
// (belt-fed, fills from the back wall) -> pour over the lip -> cooler pile ->
// disposal bin. Stepped at a fixed rate so seeking replays the cycle exactly.
import * as THREE from 'three';
import {BELT, BATCH, FUNNEL, BIN_POS, BIN_FADE, COOLER_POS, SCOOP, DEG} from './timeline.js';
import {HALF_IN, FLOOR_Y, TOP_Y} from './cooler.js';
import {BIN} from './props.js';

const FRY = [0.065, 0.009, 0.009]; // 9 mm straight cut, ~5.5 g frozen
const HALF_T = FRY[1] / 2;
// Loose frozen fries pack at roughly 50 % solids, so each fry adds about twice
// its own volume to a pile.
const BULK_VOLUME = FRY[0] * FRY[1] * FRY[2] / 0.5;
const GRAVITY = 9.81;
const Y_AXIS = new THREE.Vector3(0, 1, 0);

function mulberry32(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const flat = yaw => new THREE.Quaternion().setFromAxisAngle(Y_AXIS, yaw);

// Height field over a rectangular container floor. Landing fries avalanche
// towards lower neighbours (~25° slope as tumbling fries spread), rest on the highest cell under them
// and add their bulk volume to the cells they cover, so the pile height is
// volume-true (1 kg ≈ 2 L).
class HeightField {
  constructor(cx, cz, halfX, halfZ, floor, cell = 0.015) {
    Object.assign(this, {cx, cz, halfX, halfZ, floor, cell});
    this.nx = Math.max(1, Math.round((2 * halfX) / cell));
    this.nz = Math.max(1, Math.round((2 * halfZ) / cell));
    this.reset();
  }
  reset() { this.h = new Float32Array(this.nx * this.nz).fill(this.floor); }
  index(x, z) {
    const i = Math.min(this.nx - 1, Math.max(0, Math.floor((x - this.cx + this.halfX) / this.cell)));
    const k = Math.min(this.nz - 1, Math.max(0, Math.floor((z - this.cz + this.halfZ) / this.cell)));
    return k * this.nx + i;
  }
  at(x, z) { return this.h[this.index(x, z)]; }
  clamp(p, margin = 0.008) {
    p.x = Math.min(this.cx + this.halfX - margin, Math.max(this.cx - this.halfX + margin, p.x));
    p.z = Math.min(this.cz + this.halfZ - margin, Math.max(this.cz - this.halfZ + margin, p.z));
  }
  // Settle a fry lying at `p` with heading `yaw`; returns its centre height.
  place(p, yaw) {
    this.clamp(p);
    for (let step = 0; step < 24; step++) {
      const here = this.at(p.x, p.z);
      let best = null;
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]]) {
        const q = {x: p.x + dx * this.cell, z: p.z + dz * this.cell};
        this.clamp(q);
        const h = this.at(q.x, q.z);
        if (h < here - 0.007 && (!best || h < best.h)) best = {...q, h};
      }
      if (!best) break;
      p.x = best.x;
      p.z = best.z;
    }
    const ax = Math.cos(yaw) * FRY[0] * 0.4, az = -Math.sin(yaw) * FRY[0] * 0.4;
    const points = [[0, 0], [ax, az], [-ax, -az]].map(([dx, dz]) => ({x: p.x + dx, z: p.z + dz}));
    // Rest on the settled cell; spread the volume only over covered cells that
    // are not higher than it, so peaks do not keep growing.
    const base = this.at(p.x, p.z);
    const cells = [...new Set(points.map(q => this.index(q.x, q.z)))].filter(i => this.h[i] <= base + 0.004);
    const rise = BULK_VOLUME / (cells.length * this.cell * this.cell);
    for (const i of cells) this.h[i] += rise;
    return base + HALF_T;
  }
}

const COOLER_BOX = {
  x: COOLER_POS[0], z: COOLER_POS[2], half: HALF_IN,
  floor: COOLER_POS[1] + FLOOR_Y, top: COOLER_POS[1] + TOP_Y, bottom: COOLER_POS[1],
};
const BIN_BOX = {
  x: BIN_POS[0], z: BIN_POS[2], halfX: BIN.halfX - BIN.wall, halfZ: BIN.halfZ - BIN.wall,
  floor: BIN_POS[1] + BIN.floor, top: BIN_POS[1] + BIN.height,
};

// Slots inside the scoop (tool frame, TCP = bowl floor centre), in fill order:
// the belt pushes fries in, so the bowl fills from the back wall forwards and
// upwards, under a ~30° slope from the open lip.
function scoopSlots(count, random) {
  const {length: L, width: W, back, front} = SCOOP;
  const slots = [];
  for (let x = -L / 2 + 0.03; x <= L / 2 - 0.02; x += 0.02) {
    const wall = front + (back - front) * (L / 2 - x) / L;
    const slope = 0.012 + Math.tan(30 * DEG) * (L / 2 - x);
    const height = Math.min(wall - 0.01, slope);
    for (let y = HALF_T + 0.001; y <= height; y += 0.0095) {
      for (let z = -W / 2 + 0.018; z <= W / 2 - 0.018; z += 0.021) {
        slots.push({
          position: new THREE.Vector3(x + (random() - 0.5) * 0.008, y, z + (random() - 0.5) * 0.006),
          order: y + 0.45 * (x + L / 2) + random() * 0.01,
        });
      }
    }
  }
  slots.sort((a, b) => a.order - b.order);
  if (slots.length < count) throw new Error(`Scoop holds ${slots.length} fries, batch is ${count}`);
  return slots.slice(0, count);
}

export class FrySim {
  constructor(parent) {
    const geometry = new THREE.BoxGeometry(...FRY);
    // Frozen fries: pale, with a matte frost.
    const shades = [0xf2e3b3, 0xe9d49a, 0xf6ebc8, 0xe4cb8a].map(color =>
      new THREE.MeshStandardMaterial({color, roughness: 0.95}));
    const random = mulberry32(7);
    const slots = scoopSlots(BATCH.count, random);
    this.cooler = new HeightField(COOLER_BOX.x, COOLER_BOX.z, COOLER_BOX.half, COOLER_BOX.half, COOLER_BOX.floor);
    this.bin = new HeightField(BIN_BOX.x, BIN_BOX.z, BIN_BOX.halfX, BIN_BOX.halfZ, BIN_BOX.floor, 0.02);
    this.fries = Array.from({length: BATCH.count}, (_, i) => {
      const mesh = new THREE.Mesh(geometry, shades[i % shades.length]);
      mesh.castShadow = true;
      parent.add(mesh);
      const z = BATCH.zFrom + (BATCH.zTo - BATCH.zFrom) * ((i + random()) / BATCH.count);
      const slot = slots[i];
      return {
        mesh,
        start: new THREE.Vector3(BELT.x + (random() * 2 - 1) * BATCH.halfWidth,
          BELT.top + HALF_T + (random() < 0.25 ? FRY[1] : 0), z),
        startYaw: random() * Math.PI,
        slot: slot.position,
        slotQuat: flat((random() - 0.5) * 0.9),
        // Tip angle (below horizontal) at which this fry slides out: front
        // and top fries go first, the back of the bowl last.
        slideAt: Math.sin(Math.min(50, 18 + 30 * (SCOOP.length / 2 - slot.position.x) / SCOOP.length
          - 6 * slot.position.y / 0.1 + 4 * random()) * DEG),
        dropDelay: 0.25 * random(),
        restYaw: random() * Math.PI,
        spin: new THREE.Vector3(random() - 0.5, random() - 0.5, random() - 0.5).multiplyScalar(12),
        kick: new THREE.Vector3(random() - 0.5, 0, random() - 0.5).multiplyScalar(0.12),
      };
    });
    this.reset();
  }

  reset() {
    this.cooler.reset();
    this.bin.reset();
    this.doorDumped = false;
    for (const fry of this.fries) {
      fry.mode = 'belt';
      fry.container = null;
      fry.position = fry.start.clone();
      fry.quaternion = flat(fry.startYaw);
      fry.velocity = new THREE.Vector3();
      fry.wait = 0;
      fry.scale = 1;
    }
  }

  land(fry, field, container) {
    fry.mode = 'rest';
    fry.container = container;
    fry.position.y = field.place(fry.position, fry.restYaw);
    fry.target = flat(fry.restYaw);
    fry.velocity.set(0, 0, 0);
  }

  // ctx: {t, travel, scoop (TCP Matrix4), capture, release, doorAngle}
  step(dt, ctx) {
    const inverse = ctx.capture ? ctx.scoop.clone().invert() : null;
    const local = new THREE.Vector3();
    const scoopQuat = new THREE.Quaternion().setFromRotationMatrix(ctx.scoop);
    const forward = new THREE.Vector3(1, 0, 0).applyQuaternion(scoopQuat);
    if (ctx.doorAngle > 0.12 && !this.doorDumped) {
      this.doorDumped = true;
      this.cooler.reset();
    }
    for (const fry of this.fries) {
      if (fry.mode === 'belt') {
        fry.position.z = fry.start.z + ctx.travel;
        const z = fry.position.z;
        if (z > FUNNEL.zIn) {
          // Guide plates squeeze the stream to the scoop mouth and line fries up with the flow.
          const u = Math.min(1, (z - FUNNEL.zIn) / (FUNNEL.zOut - FUNNEL.zIn));
          const half = FUNNEL.halfIn + (FUNNEL.halfOut - FUNNEL.halfIn) * u - 0.012;
          fry.position.x = BELT.x + Math.max(-half, Math.min(half, fry.position.x - BELT.x));
          fry.quaternion.slerp(flat(Math.PI / 2 + (fry.startYaw - Math.PI / 2) * 0.15), 0.04);
        }
        if (inverse) {
          local.copy(fry.position).applyMatrix4(inverse);
          if (local.x < SCOOP.length / 2 + 0.006 && Math.abs(local.z) < SCOOP.width / 2 + 0.02) {
            fry.mode = 'capture';
            fry.from = local.clone();
            fry.fromQuat = fry.quaternion.clone().premultiply(scoopQuat.clone().invert());
            fry.progress = 0;
          }
        }
      } else if (fry.mode === 'capture' || fry.mode === 'scoop') {
        if (fry.mode === 'capture') {
          // Pushed in by the fries behind it: slide from the lip to its slot.
          fry.progress = Math.min(1, fry.progress + dt / 0.45);
          const e = fry.progress * (2 - fry.progress);
          fry.local = fry.from.clone().lerp(fry.slot, e);
          fry.localQuat = fry.fromQuat.clone().slerp(fry.slotQuat, e);
          if (fry.progress >= 1) fry.mode = 'scoop';
        } else {
          fry.local = fry.slot;
          fry.localQuat = fry.slotQuat;
        }
        fry.position.copy(fry.local).applyMatrix4(ctx.scoop);
        fry.quaternion.copy(scoopQuat).multiply(fry.localQuat);
        if (ctx.release && -forward.y > fry.slideAt) {
          fry.mode = 'slide';
          fry.local = fry.local.clone();
        }
      } else if (fry.mode === 'slide') {
        // Slide down the tipped floor and off the lip.
        fry.local.x += dt * 0.7;
        fry.local.y = Math.max(HALF_T, fry.local.y - dt * 0.05);
        fry.position.copy(fry.local).applyMatrix4(ctx.scoop);
        fry.quaternion.copy(scoopQuat).multiply(fry.slotQuat);
        if (fry.local.x > SCOOP.length / 2 + 0.01) {
          fry.mode = 'fall';
          fry.velocity.copy(forward).multiplyScalar(0.12).add(fry.kick);
        }
      } else if (fry.mode === 'rest') {
        fry.quaternion.slerp(fry.target, 1 - Math.exp(-dt * 25));
        if (fry.container === 'cooler' && this.doorDumped && ctx.doorAngle > 0.12) {
          fry.mode = 'fall';
          fry.container = null;
          fry.wait = fry.dropDelay;
          fry.velocity.set(0, 0, 0);
        }
        if (fry.container === 'bin') fry.scale = 1 - Math.min(1, Math.max(0, (ctx.t - BIN_FADE[0]) / (BIN_FADE[1] - BIN_FADE[0])));
      } else if (fry.mode === 'fall') {
        if (fry.wait > 0) {
          fry.wait -= dt;
          continue;
        }
        fry.velocity.y -= GRAVITY * dt;
        fry.position.addScaledVector(fry.velocity, dt);
        const spin = fry.spin.clone().multiplyScalar(dt);
        fry.quaternion.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(spin.x, spin.y, spin.z))).normalize();
        this.contain(fry, ctx);
      }
    }
  }

  contain(fry, ctx) {
    const p = fry.position, v = fry.velocity;
    const c = COOLER_BOX;
    const inCooler = Math.abs(p.x - c.x) < c.half + 0.012 && Math.abs(p.z - c.z) < c.half + 0.012;
    if (inCooler && p.y < c.top + 0.035 && p.y > c.bottom) {
      const limit = c.half - 0.01;
      if (Math.abs(p.x - c.x) > limit) { p.x = c.x + Math.sign(p.x - c.x) * limit; v.x *= -0.3; }
      if (Math.abs(p.z - c.z) > limit) { p.z = c.z + Math.sign(p.z - c.z) * limit; v.z *= -0.3; }
      if (ctx.doorAngle < 0.05 && p.y - HALF_T < this.cooler.at(p.x, p.z)) this.land(fry, this.cooler, 'cooler');
      return;
    }
    const b = BIN_BOX;
    if (Math.abs(p.x - b.x) < b.halfX && Math.abs(p.z - b.z) < b.halfZ && p.y < b.top) {
      this.bin.clamp(p, 0.02);
      if (p.y - HALF_T < this.bin.at(p.x, p.z)) this.land(fry, this.bin, 'bin');
      return;
    }
    if (p.y < HALF_T) {
      p.y = HALF_T;
      v.set(0, 0, 0);
      fry.mode = 'rest';
      fry.container = 'floor';
      fry.target = flat(fry.restYaw);
    }
  }

  // Top of the product pile in the cooler at (x, z), world Y.
  coolerLevel(x, z) {
    return this.cooler.at(x, z);
  }

  sync() {
    for (const fry of this.fries) {
      fry.mesh.position.copy(fry.position);
      fry.mesh.quaternion.copy(fry.quaternion);
      fry.mesh.scale.setScalar(Math.max(0.001, fry.scale));
      fry.mesh.visible = fry.scale > 0.002;
    }
  }

  counts() {
    const counts = {belt: 0, scoop: 0, cooler: 0, bin: 0, falling: 0, floor: 0};
    for (const fry of this.fries) {
      if (fry.mode === 'belt') counts.belt++;
      else if (fry.mode === 'capture' || fry.mode === 'scoop' || fry.mode === 'slide') counts.scoop++;
      else if (fry.mode === 'fall') counts.falling++;
      else counts[fry.container]++;
    }
    return counts;
  }
}
