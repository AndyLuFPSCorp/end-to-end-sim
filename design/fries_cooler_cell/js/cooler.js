// Insulated cooler box: 150 mm stainless interior, 5 mm inner skin, 25 mm
// insulation, 5 mm outer skin (220 mm outside). Local frame: origin at the
// bottom centre, +Y up. The lid hinges on the top +X edge (away from the
// robot) and is tipped open by a gooseneck arm and an air cylinder on the +X
// side; the bottom door (design TBD) is a placeholder hinged on the back edge.
import * as THREE from 'three';

export const COOLER = {interior: 0.150, innerSteel: 0.005, insulation: 0.025, outerSteel: 0.005};
export const WALL = COOLER.innerSteel + COOLER.insulation + COOLER.outerSteel;
export const HALF_IN = COOLER.interior / 2;
export const HALF_OUT = HALF_IN + WALL;
export const OUTER = 2 * HALF_OUT;
export const FLOOR_Y = WALL;                 // interior floor (top of bottom door)
export const TOP_Y = WALL + COOLER.interior; // interior ceiling (underside of lid)

// Lid hinge axis (along Z) just outside the top +X edge. The gooseneck arm is
// fixed to the lid and reaches over the hinge to the cylinder's rod end, so
// retracting the cylinder pulls the arm down and tips the lid up and away.
const LID_HINGE = new THREE.Vector3(HALF_OUT + 0.01, OUTER + 0.005, 0);
const LID_PIN = new THREE.Vector3(0.06, 0.012, 0);        // rod end, lid-hinge frame
const LID_PIVOT = new THREE.Vector3(0.17, 0.04, 0);       // cylinder base pivot on the box
const ARM_PATH = [[-0.085, 0.02], [-0.035, 0.065], [0.06, 0.048], [0.06, 0.012]];
// Bottom door placeholder: hinged on the back edge (along X).
const DOOR_HINGE = new THREE.Vector3(0, 0, -HALF_OUT);
const DOOR_PIVOT = new THREE.Vector3(0.155, 0.15, -0.08);
const DOOR_PIN = new THREE.Vector3(0.155, -0.02, 0.05);   // in door-hinge frame

function box(parent, size, material, position) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
  mesh.position.set(...position);
  mesh.castShadow = mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function cylinder(parent, radius, height, material, position, axis = 'y', segments = 28) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, height, segments), material);
  if (axis === 'x') mesh.rotation.z = Math.PI / 2;
  if (axis === 'z') mesh.rotation.x = Math.PI / 2;
  mesh.position.set(...position);
  mesh.castShadow = true;
  parent.add(mesh);
  return mesh;
}

// Double-acting air cylinder: clevis-mounted body + rod, aimed pivot -> pin.
function airCylinder(parent, m, bodyLength, bore) {
  const group = new THREE.Group();
  parent.add(group);
  cylinder(group, bore, bodyLength, m.aluminium, [0, bodyLength / 2, 0]);
  cylinder(group, bore * 1.18, 0.012, m.dark, [0, 0.006, 0], 'y', 6);
  cylinder(group, bore * 1.18, 0.012, m.dark, [0, bodyLength - 0.006, 0], 'y', 6);
  box(group, [0.014, 0.016, 0.012], m.dark, [0, -0.006, 0]);
  for (const y of [0.02, bodyLength - 0.02]) {
    cylinder(group, 0.0035, 0.012, m.brass, [bore + 0.004, y, 0], 'x', 12);
    cylinder(group, 0.003, 0.008, m.tubeBlue, [bore + 0.013, y, 0], 'x', 12);
  }
  const rodGeometry = new THREE.CylinderGeometry(bore * 0.36, bore * 0.36, 1, 18).translate(0, 0.5, 0);
  const rod = new THREE.Mesh(rodGeometry, m.chrome);
  rod.castShadow = true;
  group.add(rod);
  const clevis = box(group, [0.014, 0.018, 0.012], m.dark, [0, 0, 0]);
  const up = new THREE.Vector3(0, 1, 0);
  let rest = null;
  return {
    group,
    stroke: 0,
    place(pivot, pin) {
      const span = pin.clone().sub(pivot);
      const length = span.length();
      if (rest === null) rest = length;
      this.stroke = length - rest;
      group.position.copy(pivot);
      group.quaternion.setFromUnitVectors(up, span.normalize());
      rod.position.y = bodyLength - 0.01;
      rod.scale.y = Math.max(0.001, length - bodyLength + 0.002);
      clevis.position.y = length;
    },
  };
}

export function buildCooler(m) {
  const root = new THREE.Group();
  root.name = 'Cooler box';
  const layers = [
    {a: HALF_IN, b: HALF_IN + COOLER.innerSteel, material: m.innerSteel},
    {a: HALF_IN + COOLER.innerSteel, b: HALF_OUT - COOLER.outerSteel, material: m.insulation},
    {a: HALF_OUT - COOLER.outerSteel, b: HALF_OUT, material: m.outerSteel},
  ];
  const height = COOLER.interior, cy = WALL + height / 2;
  for (const {a, b, material} of layers) {
    const t = b - a, c = (a + b) / 2;
    for (const s of [-1, 1]) {
      box(root, [t, height, 2 * b], material, [s * c, cy, 0]);
      box(root, [2 * a, height, t], material, [0, cy, s * c]);
    }
  }

  // Lid and bottom door: the same 5 / 25 / 5 mm sandwich, full 220 mm footprint.
  // `face` is the cavity-side face height; sign stacks layers up (+1) or down (-1).
  const slabs = (parent, sign, x, face, z) => {
    const stack = [[m.innerSteel, COOLER.innerSteel], [m.insulation, COOLER.insulation], [m.outerSteel, COOLER.outerSteel]];
    let y = face;
    for (const [material, t] of stack) {
      box(parent, [OUTER, t, OUTER], material, [x, y + sign * t / 2, z]);
      y += sign * t;
    }
  };
  const lid = new THREE.Group();
  lid.name = 'Lid';
  lid.position.copy(LID_HINGE);
  root.add(lid);
  slabs(lid, 1, -LID_HINGE.x, TOP_Y - LID_HINGE.y, 0);
  // Trapezoid bracket on the lid carrying the gooseneck arm.
  const lidTop = OUTER - LID_HINGE.y;
  const trapezoid = new THREE.Shape();
  trapezoid.moveTo(-0.135, lidTop);
  trapezoid.lineTo(-0.065, lidTop);
  trapezoid.lineTo(-0.075, lidTop + 0.03);
  trapezoid.lineTo(-0.12, lidTop + 0.03);
  trapezoid.closePath();
  const bracket = new THREE.Mesh(new THREE.ExtrudeGeometry(trapezoid, {depth: 0.03, bevelEnabled: false}), m.arm);
  bracket.position.z = -0.015;
  bracket.castShadow = true;
  lid.add(bracket);
  for (let i = 0; i < ARM_PATH.length - 1; i++) {
    const a = new THREE.Vector3(...ARM_PATH[i], 0), b = new THREE.Vector3(...ARM_PATH[i + 1], 0);
    const span = b.clone().sub(a);
    const bar = box(lid, [span.length() + 0.012, 0.012, 0.016], m.arm, [0, 0, 0]);
    bar.position.copy(a).addScaledVector(span, 0.5);
    bar.rotation.z = Math.atan2(span.y, span.x);
  }
  cylinder(lid, 0.004, 0.034, m.chrome, LID_PIN.toArray(), 'z', 12);
  // Hinge: two knuckles on the axis, leaves on the lid top and the +X wall.
  for (const z of [-0.07, 0.07]) {
    cylinder(lid, 0.006, 0.045, m.chrome, [0, 0, z], 'z', 16);
    box(lid, [0.025, 0.003, 0.045], m.chrome, [-0.0125, lidTop + 0.0015, z]);
    box(root, [0.003, 0.03, 0.045], m.chrome, [HALF_OUT + 0.0015, OUTER - 0.02, z]);
  }

  const door = new THREE.Group();
  door.position.copy(DOOR_HINGE);
  root.add(door);
  slabs(door, -1, 0, WALL, HALF_OUT);
  box(door, [0.04, 0.05, 0.04], m.outerSteel, [0.13, 0, 0.05]);
  cylinder(door, 0.004, 0.03, m.chrome, DOOR_PIN.toArray(), 'x', 12);

  for (const x of [-0.06, 0.06]) cylinder(root, 0.006, 0.045, m.chrome, [x, 0, -HALF_OUT - 0.003], 'x', 16);

  // Cylinder base-pivot brackets on the +X wall.
  box(root, [LID_PIVOT.x - HALF_OUT + 0.006, 0.03, 0.03], m.outerSteel, [(HALF_OUT + LID_PIVOT.x + 0.006) / 2, LID_PIVOT.y + 0.004, LID_PIVOT.z]);
  box(root, [0.045, 0.03, 0.03], m.outerSteel, [0.1325, DOOR_PIVOT.y, DOOR_PIVOT.z]);
  const lidCylinder = airCylinder(root, m, 0.11, 0.012);
  const doorCylinder = airCylinder(root, m, 0.11, 0.01);

  // RTD (Pt100) probe drilled through the front wall into the cavity.
  const rtd = new THREE.Group();
  rtd.name = 'RTD sensor';
  root.add(rtd);
  const probeY = 0.13;
  const probeTip = HALF_IN - 0.03;
  const probeOuter = HALF_OUT + 0.035;
  cylinder(rtd, 0.003, probeOuter - probeTip, m.chrome, [0, probeY, (probeOuter + probeTip) / 2], 'z', 16);
  cylinder(rtd, 0.008, 0.008, m.outerSteel, [0, probeY, HALF_OUT + 0.004], 'z', 6);
  cylinder(rtd, 0.016, 0.026, m.aluminium, [0, probeY, probeOuter + 0.012], 'z', 28);
  cylinder(rtd, 0.017, 0.006, m.rtdBlue, [0, probeY, probeOuter + 0.028], 'z', 28);
  const cablePath = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, probeY - 0.016, probeOuter + 0.012),
    new THREE.Vector3(0.01, 0.06, probeOuter + 0.03),
    new THREE.Vector3(0.06, -0.02, probeOuter + 0.04),
    new THREE.Vector3(0.2, -0.07, 0.2),
  ]);
  const cable = new THREE.Mesh(new THREE.TubeGeometry(cablePath, 40, 0.003, 8), m.cable);
  rtd.add(cable);
  const tipWorld = new THREE.Vector3(0, probeY, probeTip);

  // Stand: four legs, two cross beams under front / back mounting tabs.
  const legTop = 0.07, legBottom = -0.56;
  for (const x of [-0.21, 0.21]) {
    for (const z of [-0.21, 0.21]) {
      box(root, [0.03, legTop - legBottom, 0.03], m.frame, [x, (legTop + legBottom) / 2, z]);
      box(root, [0.05, 0.01, 0.05], m.dark, [x, legBottom + 0.005, z]);
    }
  }
  for (const z of [-0.21, 0.21]) {
    box(root, [0.45, 0.03, 0.03], m.frame, [0, legTop + 0.015, z]);
    box(root, [0.45, 0.025, 0.025], m.frame, [0, legBottom + 0.12, z]);
    for (const x of [-0.08, 0.08]) box(root, [0.04, 0.006, 0.1], m.outerSteel, [x, legTop + 0.033, Math.sign(z) * 0.16]);
  }
  for (const x of [-0.21, 0.21]) box(root, [0.025, 0.025, 0.45], m.frame, [x, legBottom + 0.12, 0]);

  const pin = new THREE.Vector3();
  const api = {
    root, lid, door, lidCylinder, doorCylinder, rtdTip: tipWorld, lidHinge: LID_HINGE,
    shellMaterials: [m.innerSteel, m.insulation, m.outerSteel],
    setAngles(lidAngle, doorAngle) {
      lid.rotation.z = -lidAngle;
      door.rotation.x = doorAngle;
      lid.updateMatrix();
      door.updateMatrix();
      lidCylinder.place(LID_PIVOT, pin.copy(LID_PIN).applyMatrix4(lid.matrix));
      doorCylinder.place(DOOR_PIVOT, pin.copy(DOOR_PIN).applyMatrix4(door.matrix));
    },
  };
  api.setAngles(0, 0);
  return api;
}
