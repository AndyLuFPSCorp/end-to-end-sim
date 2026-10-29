// Deterministic fries: belt -> scoop -> cooler -> disposal bin. Stepped at a
// fixed rate so seeking replays the cycle exactly.
import * as THREE from 'three';
import {BELT, PILE, BIN_POS, BIN_FADE, COOLER_POS} from './timeline.js';
import {HALF_IN, FLOOR_Y, TOP_Y} from './cooler.js';
import {BIN} from './props.js';
import {SCOOP} from './robot.js';

const FRY = [0.055, 0.008, 0.008];
const HALF_T = FRY[1] / 2;
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

const COOLER_BOX = {
  x: COOLER_POS[0], z: COOLER_POS[2], half: HALF_IN,
  floor: COOLER_POS[1] + FLOOR_Y, top: COOLER_POS[1] + TOP_Y, bottom: COOLER_POS[1],
};
const BIN_BOX = {
  x: BIN_POS[0], z: BIN_POS[2], halfX: BIN.halfX - BIN.wall, halfZ: BIN.halfZ - BIN.wall,
  floor: BIN_POS[1] + BIN.floor, top: BIN_POS[1] + BIN.height,
};

export class FrySim {
  constructor(parent) {
    const geometry = new THREE.BoxGeometry(...FRY);
    const shades = [0xe8b64a, 0xdba43c, 0xf1c86a, 0xd99a33].map(color =>
      new THREE.MeshStandardMaterial({color, roughness: 0.72}));
    const random = mulberry32(5);
    this.fries = Array.from({length: PILE.count}, (_, i) => {
      const mesh = new THREE.Mesh(geometry, shades[i % shades.length]);
      mesh.castShadow = true;
      parent.add(mesh);
      const r = Math.sqrt(random()), a = random() * Math.PI * 2;
      const layer = i < 13 ? 0 : i < 20 ? 1 : 2;
      return {
        mesh,
        pile: new THREE.Vector3(PILE.x + PILE.rx * r * Math.cos(a), BELT.top + HALF_T + layer * 0.0075, PILE.z + PILE.rz * r * Math.sin(a)),
        pileYaw: random() * Math.PI,
        slot: new THREE.Vector3(-0.04 + 0.075 * random(), 0.0045 + (i % 3) * 0.0075, (random() - 0.5) * 0.085),
        slotQuat: flat(random() * Math.PI),
        releaseAt: 0.45 - 0.75 * random(),
        dropDelay: 0.18 * random(),
        restYaw: random() * Math.PI,
        stackJitter: 0.003 * random(),
        spin: new THREE.Vector3(random() - 0.5, random() - 0.5, random() - 0.5).multiplyScalar(14),
        kick: new THREE.Vector3(random() - 0.5, 0, random() - 0.5).multiplyScalar(0.08),
      };
    });
    this.reset();
  }

  reset() {
    this.landed = {cooler: 0, bin: 0};
    for (const fry of this.fries) {
      fry.mode = 'belt';
      fry.container = null;
      fry.position = fry.pile.clone();
      fry.quaternion = flat(fry.pileYaw);
      fry.velocity = new THREE.Vector3();
      fry.wait = 0;
      fry.scale = 1;
    }
  }

  land(fry, container) {
    const k = this.landed[container]++;
    fry.mode = 'rest';
    fry.container = container;
    fry.restHeight = HALF_T + 0.0075 * Math.floor(k / 9) + fry.stackJitter;
    fry.target = flat(fry.restYaw + k);
    fry.velocity.set(0, 0, 0);
  }

  // ctx: {t, travel, scoop (TCP Matrix4), capture, release, doorAngle}
  step(dt, ctx) {
    const inverse = ctx.capture ? ctx.scoop.clone().invert() : null;
    const local = new THREE.Vector3();
    const scoopQuat = new THREE.Quaternion().setFromRotationMatrix(ctx.scoop);
    const opening = new THREE.Vector3(0, 1, 0).applyQuaternion(scoopQuat);
    for (const fry of this.fries) {
      if (fry.mode === 'belt') {
        fry.position.z = fry.pile.z - BELT.travel + ctx.travel;
        if (inverse) {
          local.copy(fry.position).applyMatrix4(inverse);
          if (local.x < SCOOP.length / 2 - 0.004 && local.x > -0.065 && Math.abs(local.z) < SCOOP.width / 2 && local.y < 0.03) {
            fry.mode = 'capture';
            fry.from = fry.position.clone();
            fry.fromQuat = fry.quaternion.clone();
            fry.progress = 0;
          }
        }
      } else if (fry.mode === 'capture' || fry.mode === 'scoop') {
        const slot = fry.slot.clone().applyMatrix4(ctx.scoop);
        const quat = scoopQuat.clone().multiply(fry.slotQuat);
        if (fry.mode === 'capture') {
          fry.progress = Math.min(1, fry.progress + dt / 0.25);
          fry.position.copy(fry.from).lerp(slot, fry.progress);
          fry.quaternion.copy(fry.fromQuat).slerp(quat, fry.progress);
          if (fry.progress >= 1) fry.mode = 'scoop';
        } else {
          fry.position.copy(slot);
          fry.quaternion.copy(quat);
        }
        if (ctx.release && opening.y < fry.releaseAt) {
          fry.mode = 'fall';
          fry.velocity.copy(opening).multiplyScalar(0.15).add(fry.kick);
        }
      } else if (fry.mode === 'rest') {
        fry.quaternion.slerp(fry.target, 1 - Math.exp(-dt * 25));
        if (fry.container === 'cooler' && ctx.doorAngle > 0.12) {
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
    if (inCooler && p.y < c.top + 0.01 && p.y > c.bottom) {
      const limit = c.half - 0.012;
      if (Math.abs(p.x - c.x) > limit) { p.x = c.x + Math.sign(p.x - c.x) * limit; v.x *= -0.3; }
      if (Math.abs(p.z - c.z) > limit) { p.z = c.z + Math.sign(p.z - c.z) * limit; v.z *= -0.3; }
      if (ctx.doorAngle < 0.05 && p.y < c.floor + HALF_T + 0.0075 * Math.floor(this.landed.cooler / 9)) {
        p.y = c.floor;
        this.land(fry, 'cooler');
        p.y = c.floor + fry.restHeight;
      }
      return;
    }
    const b = BIN_BOX;
    if (Math.abs(p.x - b.x) < b.halfX && Math.abs(p.z - b.z) < b.halfZ && p.y < b.top) {
      const limitX = b.halfX - 0.02, limitZ = b.halfZ - 0.02;
      if (Math.abs(p.x - b.x) > limitX) { p.x = b.x + Math.sign(p.x - b.x) * limitX; v.x *= -0.3; }
      if (Math.abs(p.z - b.z) > limitZ) { p.z = b.z + Math.sign(p.z - b.z) * limitZ; v.z *= -0.3; }
      if (p.y < b.floor + 0.02) {
        this.land(fry, 'bin');
        p.y = b.floor + fry.restHeight;
      }
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
      else if (fry.mode === 'capture' || fry.mode === 'scoop') counts.scoop++;
      else if (fry.mode === 'fall') counts.falling++;
      else counts[fry.container]++;
    }
    return counts;
  }
}
