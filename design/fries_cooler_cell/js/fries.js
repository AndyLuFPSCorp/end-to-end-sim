// Deterministic frozen-fry simulation shared by both methods. Fries ride the
// belt, are captured into a carrier (scoop / claw), slide or drop out, fall
// under gravity, and pile up in containers. Containers have their own frame,
// so a tilting cooler carries its pile with it. Stepped at a fixed rate so
// seeking replays the cycle exactly.
import * as THREE from 'three';
import {BELT} from './common.js';

export const FRY = [0.065, 0.009, 0.009]; // 9 mm straight cut, ~5.5 g frozen
export const HALF_T = FRY[1] / 2;
const GRAVITY = 9.81;
// Loose frozen fries pack at roughly 50 % solids, so each fry adds about twice
// its own volume to a pile.
const BULK_VOLUME = FRY[0] * FRY[1] * FRY[2] / 0.5;
const Y_AXIS = new THREE.Vector3(0, 1, 0);
export const flat = yaw => new THREE.Quaternion().setFromAxisAngle(Y_AXIS, yaw);

// Height field over a container floor, in the container's frame. Landing fries
// avalanche towards lower neighbours (~25° slope as tumbling fries spread),
// rest on the settled cell and add their bulk volume to the covered cells that
// are not higher, so the pile height is volume-true (1 kg ≈ 2 L).
class HeightField {
  constructor(halfX, halfZ, floor, cell = 0.015) {
    Object.assign(this, {halfX, halfZ, floor, cell});
    this.nx = Math.max(1, Math.round((2 * halfX) / cell));
    this.nz = Math.max(1, Math.round((2 * halfZ) / cell));
    this.reset();
  }
  reset() { this.h = new Float32Array(this.nx * this.nz).fill(this.floor); }
  index(x, z) {
    const i = Math.min(this.nx - 1, Math.max(0, Math.floor((x + this.halfX) / this.cell)));
    const k = Math.min(this.nz - 1, Math.max(0, Math.floor((z + this.halfZ) / this.cell)));
    return k * this.nx + i;
  }
  at(x, z) { return this.h[this.index(x, z)]; }
  clamp(p, margin = 0.008) {
    p.x = Math.min(this.halfX - margin, Math.max(-this.halfX + margin, p.x));
    p.z = Math.min(this.halfZ - margin, Math.max(-this.halfZ + margin, p.z));
  }
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
    const base = this.at(p.x, p.z);
    const cells = [...new Set(points.map(q => this.index(q.x, q.z)))].filter(i => this.h[i] <= base + 0.004);
    const rise = BULK_VOLUME / (cells.length * this.cell * this.cell);
    for (const i of cells) this.h[i] += rise;
    return base + HALF_T;
  }
}

// Container spec: {name, frame (Object3D), halfX, halfZ, floor, top, cell,
// catches(t) -> bool, fade: [t0, t1]}. Footprint and heights are in the frame.
export class FrySim {
  constructor(parent, seeds, containers) {
    this.seeds = seeds;
    this.containers = containers.map(c => ({...c, field: new HeightField(c.halfX, c.halfZ, c.floor, c.cell)}));
    this.byName = Object.fromEntries(this.containers.map(c => [c.name, c]));
    const shades = [0xf2e3b3, 0xe9d49a, 0xf6ebc8, 0xe4cb8a].map(c => new THREE.Color(c));
    // Frozen fries: pale, with a matte frost.
    this.mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(...FRY),
      new THREE.MeshStandardMaterial({color: 0xffffff, roughness: 0.95}), seeds.length);
    this.mesh.castShadow = true;
    this.mesh.frustumCulled = false;
    seeds.forEach((_, i) => this.mesh.setColorAt(i, shades[i % shades.length]));
    parent.add(this.mesh);
    this.matrix = new THREE.Matrix4();
    this.reset();
  }

  reset() {
    for (const c of this.containers) c.field.reset();
    this.fries = this.seeds.map((seed, i) => ({
      index: i,
      tag: seed.tag,
      rand: seed.rand,
      mode: 'belt',
      start: seed.position.clone(),
      position: seed.position.clone(),
      quaternion: flat(seed.yaw),
      velocity: new THREE.Vector3(),
      scale: 1,
    }));
  }

  // --- transitions used by the method controllers ---------------------------
  capture(fry, carrier, slot, slotQuat, duration) {
    const inverse = carrier.matrixWorld.clone().invert();
    const carrierQuat = new THREE.Quaternion().setFromRotationMatrix(carrier.matrixWorld);
    Object.assign(fry, {
      mode: 'held', carrier, slot, slotQuat, duration, progress: 0,
      from: fry.position.clone().applyMatrix4(inverse),
      fromQuat: carrierQuat.invert().multiply(fry.quaternion),
    });
  }
  release(fry, velocity, delay = 0) {
    Object.assign(fry, {mode: 'fall', carrier: null, container: null, wait: delay});
    fry.velocity.copy(velocity);
  }
  slideOut(fry, speed, exitX, exitSpeed) {
    Object.assign(fry, {mode: 'slide', slideSpeed: speed, exitX, exitSpeed, local: fry.local.clone()});
  }
  spill(fry, target, speed, exitVelocity) {
    Object.assign(fry, {mode: 'spill', spillTarget: target, spillSpeed: speed, exitVelocity});
  }
  dropContainer(name, maxDelay = 0.25) {
    this.byName[name].field.reset();
    for (const fry of this.fries) {
      if (fry.mode === 'rest' && fry.container === name) this.release(fry, new THREE.Vector3(), maxDelay * fry.rand);
    }
  }
  containerLevel(name, x, z) {
    return this.byName[name].field.at(x, z);
  }

  // --- physics ----------------------------------------------------------------
  step(dt, ctx) {
    for (const c of this.containers) {
      c.matrix = c.frame.matrixWorld;
      c.inverse = c.matrix.clone().invert();
      c.quat = new THREE.Quaternion().setFromRotationMatrix(c.matrix);
      c.catching = c.catches ? c.catches(ctx.t) : true;
    }
    const beltSpeed = ctx.beltSpeed || 0;
    for (const fry of this.fries) {
      switch (fry.mode) {
        case 'belt':
          fry.position.z = fry.start.z + ctx.travel;
          if (fry.position.z > BELT.zEnd) this.release(fry, new THREE.Vector3(0, 0, Math.max(0.15, beltSpeed)));
          break;
        case 'held': {
          const m = fry.carrier.matrixWorld;
          const carrierQuat = new THREE.Quaternion().setFromRotationMatrix(m);
          fry.progress = Math.min(1, fry.progress + dt / fry.duration);
          const e = fry.progress * (2 - fry.progress);
          fry.local = fry.from.clone().lerp(fry.slot, e);
          fry.position.copy(fry.local).applyMatrix4(m);
          fry.quaternion.copy(carrierQuat).multiply(fry.fromQuat.clone().slerp(fry.slotQuat, e));
          break;
        }
        case 'slide': {
          const m = fry.carrier.matrixWorld;
          fry.local.x += dt * fry.slideSpeed;
          fry.local.y = Math.max(HALF_T, fry.local.y - dt * 0.05);
          fry.position.copy(fry.local).applyMatrix4(m);
          if (fry.local.x > fry.exitX) {
            const forward = new THREE.Vector3().setFromMatrixColumn(m, 0).normalize();
            this.release(fry, forward.multiplyScalar(fry.exitSpeed).add(new THREE.Vector3(fry.rand - 0.5, 0, 0.5 - fry.rand).multiplyScalar(0.12)));
          }
          break;
        }
        case 'spill': {
          const target = fry.spillTarget();
          const d = target.clone().sub(fry.position);
          const stepLength = fry.spillSpeed * dt;
          if (d.length() <= stepLength) this.release(fry, fry.exitVelocity.clone());
          else fry.position.addScaledVector(d.normalize(), stepLength);
          break;
        }
        case 'rest': {
          const c = this.byName[fry.container];
          fry.position.copy(fry.local).applyMatrix4(c.matrix);
          fry.quaternion.slerp(c.quat.clone().multiply(fry.localQuat), 1 - Math.exp(-dt * 25));
          if (c.fade) fry.scale = 1 - Math.min(1, Math.max(0, (ctx.t - c.fade[0]) / (c.fade[1] - c.fade[0])));
          break;
        }
        case 'fall': {
          if (fry.wait > 0) {
            fry.wait -= dt;
            break;
          }
          fry.velocity.y -= GRAVITY * dt;
          fry.position.addScaledVector(fry.velocity, dt);
          const s = (fry.rand - 0.5) * 24 * dt;
          fry.quaternion.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(s, 0.7 * s, -1.3 * s))).normalize();
          this.contain(fry);
          break;
        }
      }
    }
  }

  contain(fry) {
    const p = fry.position, v = fry.velocity;
    for (const c of this.containers) {
      if (!c.catching) continue;
      const local = p.clone().applyMatrix4(c.inverse);
      const margin = 0.012;
      if (Math.abs(local.x) > c.halfX + margin || Math.abs(local.z) > c.halfZ + margin) continue;
      // The band below the floor must exceed one step of fall (~4 cm at 3 m/s).
      if (local.y > c.top + 0.035 || local.y < c.floor - 0.1) continue;
      const lx = c.halfX - 0.01, lz = c.halfZ - 0.01;
      if (Math.abs(local.x) > lx) { local.x = Math.sign(local.x) * lx; v.x *= -0.3; }
      if (Math.abs(local.z) > lz) { local.z = Math.sign(local.z) * lz; v.z *= -0.3; }
      if (local.y - HALF_T < c.field.at(local.x, local.z)) {
        const yaw = fry.rand * Math.PI * 7;
        local.y = c.field.place(local, yaw);
        Object.assign(fry, {mode: 'rest', container: c.name, local, localQuat: flat(yaw), carrier: null});
        v.set(0, 0, 0);
      }
      p.copy(local).applyMatrix4(c.matrix);
      return;
    }
    if (p.y < HALF_T) {
      p.y = HALF_T;
      v.set(0, 0, 0);
      Object.assign(fry, {mode: 'floor'});
    }
  }

  sync() {
    const scale = new THREE.Vector3();
    this.fries.forEach((fry, i) => {
      scale.setScalar(Math.max(0.0001, fry.scale));
      this.matrix.compose(fry.position, fry.quaternion, scale);
      this.mesh.setMatrixAt(i, this.matrix);
    });
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  // Counts by where each fry is: belt, carrier (held/sliding), falling, floor,
  // and each container name.
  counts() {
    const counts = {belt: 0, carrier: 0, falling: 0, floor: 0};
    for (const c of this.containers) counts[c.name] = 0;
    for (const fry of this.fries) {
      if (fry.mode === 'belt') counts.belt++;
      else if (fry.mode === 'held' || fry.mode === 'slide') counts.carrier++;
      else if (fry.mode === 'fall' || fry.mode === 'spill') counts.falling++;
      else if (fry.mode === 'floor') counts.floor++;
      else counts[fry.container]++;
    }
    return counts;
  }
}
