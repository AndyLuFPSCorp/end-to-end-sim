// Method B cooler: ICERS 6 L PU cooler box (34 × 28 × 21 cm outside, 23 × 14 ×
// 15 cm inside, lid with gasket and ice pack), clamped to a platform that tilts
// about its +X edge to dump into a bin beside it. Cooler frame: origin at the
// bottom centre, +X along the 34 cm length (away from the robot), +Z = front.
import * as THREE from 'three';

export const ICERS = {
  halfX: 0.17, halfZ: 0.14, body: 0.175, lid: 0.035,
  inner: {halfX: 0.115, halfZ: 0.07, floor: 0.025, top: 0.175},
  skin: 0.003,
};
// RTD sensing tip: 40 mm above the floor, 40 mm in from the front wall.
export const ICERS_PROBE = {x: 0, y: ICERS.inner.floor + 0.04, z: ICERS.inner.halfZ - 0.04};
// Platform hinge (world) on the +X edge; the cooler sits 0.20 m to its -X.
export const TILT_HINGE = [0.75, 0.58, 0];
export const COOLER_OFFSET = -0.20;
export const COOLER_CENTRE = [TILT_HINGE[0] + COOLER_OFFSET, TILT_HINGE[1], TILT_HINGE[2]];
// Lid hinge along X on the top back edge (cooler frame).
export const LID_HINGE = [0, ICERS.body, -ICERS.halfZ];
// Where the 2-finger gripper holds the lid: its -X (robot-side) edge, 150 mm
// from the hinge, at mid-thickness (lid-hinge frame).
export const LID_GRIP = [-ICERS.halfX + 0.005, ICERS.lid / 2, 0.15];

function box(parent, size, material, position) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
  mesh.position.set(...position);
  mesh.castShadow = mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function cylinder(parent, radius, height, material, position, axis = 'y', segments = 24) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, height, segments), material);
  if (axis === 'x') mesh.rotation.z = Math.PI / 2;
  if (axis === 'z') mesh.rotation.x = Math.PI / 2;
  mesh.position.set(...position);
  mesh.castShadow = true;
  parent.add(mesh);
  return mesh;
}

// World position of the lid grip point at lid angle `a` (radians, platform level).
export function lidGripPoint(a) {
  const g = new THREE.Vector3(...LID_GRIP).applyAxisAngle(new THREE.Vector3(1, 0, 0), -a);
  return g.add(new THREE.Vector3(...LID_HINGE)).add(new THREE.Vector3(...COOLER_CENTRE));
}

export function buildIcers(m) {
  const {halfX: X, halfZ: Z, body: H, inner: I, skin} = ICERS;
  // Static stand with hinge bearings and the rotary tilt drive.
  const stand = new THREE.Group();
  stand.name = 'Tilt platform stand';
  const [hx, hy, hz] = TILT_HINGE;
  for (const x of [hx - 0.38, hx - 0.02]) {
    for (const z of [-0.15, 0.15]) box(stand, [0.03, hy - 0.04, 0.03], m.frame, [x, (hy - 0.04) / 2, z]);
  }
  for (const z of [-0.15, 0.15]) box(stand, [0.39, 0.03, 0.03], m.frame, [hx - 0.2, hy - 0.055, z]);
  for (const z of [-0.19, 0.19]) {
    box(stand, [0.04, 0.05, 0.03], m.dark, [hx, hy - 0.01, z]);
    box(stand, [0.03, hy - 0.06, 0.03], m.frame, [hx, (hy - 0.06) / 2, z]);
  }
  cylinder(stand, 0.04, 0.08, m.motor, [hx, hy, -0.26], 'z', 28);
  box(stand, [0.07, 0.09, 0.05], m.motor, [hx, hy - 0.02, -0.33]);

  // Tilting part: platform plate, clamps and the cooler.
  const pivot = new THREE.Group();
  pivot.name = 'Tilt platform';
  pivot.position.set(...TILT_HINGE);
  box(pivot, [0.42, 0.02, 0.34], m.frame, [COOLER_OFFSET, -0.01, 0]);
  cylinder(pivot, 0.012, 0.42, m.chrome, [0, -0.01, 0], 'z', 16);
  for (const s of [-1, 1]) {
    box(pivot, [0.012, 0.06, 0.2], m.dark, [COOLER_OFFSET + s * (X + 0.006), 0.03, 0]);
    box(pivot, [0.03, 0.01, 0.2], m.dark, [COOLER_OFFSET + s * (X + 0.003), 0.062, 0]);
  }

  const cooler = new THREE.Group();
  cooler.name = 'ICERS 6L cooler';
  cooler.position.x = COOLER_OFFSET;
  pivot.add(cooler);

  // Body: white skin, PU foam core, white liner (5.5 cm / 7 cm walls).
  const layers = [
    {ax: I.halfX, az: I.halfZ, bx: I.halfX + skin, bz: I.halfZ + skin, mat: m.icersLiner, y0: I.floor},
    {ax: I.halfX + skin, az: I.halfZ + skin, bx: X - skin, bz: Z - skin, mat: m.pu, y0: skin},
    {ax: X - skin, az: Z - skin, bx: X, bz: Z, mat: m.icersShell, y0: 0},
  ];
  for (const {ax, az, bx, bz, mat, y0} of layers) {
    const h = H - y0, cy = y0 + h / 2;
    for (const s of [-1, 1]) {
      box(cooler, [bx - ax, h, 2 * bz], mat, [s * (ax + bx) / 2, cy, 0]);
      box(cooler, [2 * ax, h, bz - az], mat, [0, cy, s * (az + bz) / 2]);
    }
  }
  box(cooler, [2 * X, skin, 2 * Z], m.icersShell, [0, skin / 2, 0]);
  box(cooler, [2 * (X - skin), I.floor - 2 * skin, 2 * (Z - skin)], m.pu, [0, I.floor / 2, 0]);
  box(cooler, [2 * (I.halfX + skin), skin, 2 * (I.halfZ + skin)], m.icersLiner, [0, I.floor - skin / 2, 0]);
  // Rim cap over the foam.
  for (const s of [-1, 1]) {
    box(cooler, [X - I.halfX, 0.004, 2 * Z], m.icersShell, [s * (X + I.halfX) / 2, H - 0.002, 0]);
    box(cooler, [2 * I.halfX, 0.004, Z - I.halfZ], m.icersShell, [0, H - 0.002, s * (Z + I.halfZ) / 2]);
  }
  // End handles.
  for (const s of [-1, 1]) {
    box(cooler, [0.02, 0.016, 0.12], m.icersBlue, [s * (X + 0.012), 0.15, 0]);
    for (const z of [-0.055, 0.055]) box(cooler, [0.02, 0.04, 0.012], m.icersBlue, [s * (X + 0.008), 0.13, z]);
  }
  // Magnetic catches in place of the stock over-centre latches.
  for (const x of [-0.1, 0.1]) box(cooler, [0.04, 0.012, 0.008], m.dark, [x, H - 0.008, Z + 0.004]);

  // Lid on its hinge: blue shell, PU, white liner, gasket and ice pack.
  const lid = new THREE.Group();
  lid.name = 'Lid';
  lid.position.set(...LID_HINGE);
  cooler.add(lid);
  const L = ICERS.lid;
  box(lid, [2 * X, skin, 2 * Z], m.icersLiner, [0, skin / 2, Z]);
  box(lid, [2 * X - 0.004, L - 2 * skin, 2 * Z - 0.004], m.pu, [0, L / 2, Z]);
  box(lid, [2 * X, skin, 2 * Z], m.icersBlue, [0, L - skin / 2, Z]);
  for (const s of [-1, 1]) {
    box(lid, [skin, L, 2 * Z], m.icersBlue, [s * (X - skin / 2), L / 2, Z]);
    box(lid, [2 * X, L, skin], m.icersBlue, [0, L / 2, Z + s * (Z - skin / 2)]);
  }
  // Raised ribs on top, like the stock lid.
  for (const s of [-1, 1]) box(lid, [0.05, 0.008, 2 * Z - 0.04], m.icersBlue, [s * 0.1, L + 0.004, Z]);
  box(lid, [0.12, 0.008, 0.05], m.icersBlue, [0, L + 0.004, Z + 0.09]);
  for (const x of [-0.1, 0.1]) box(lid, [0.04, 0.012, 0.008], m.dark, [x, 0.004, 2 * Z + 0.004]);
  // Gasket ring and ice pack on the underside.
  const g = {x: I.halfX + 0.012, z: I.halfZ + 0.012, t: 0.006};
  for (const s of [-1, 1]) {
    box(lid, [g.t, 0.005, 2 * g.z], m.gasket, [s * g.x, -0.0025, Z]);
    box(lid, [2 * g.x, 0.005, g.t], m.gasket, [0, -0.0025, Z + s * g.z]);
  }
  box(lid, [0.16, 0.014, 0.09], m.icePack, [0, -0.007, Z]);
  for (const x of [-0.07, 0.07]) cylinder(lid, 0.006, 0.05, m.icersBlue, [x, 0, 0], 'x', 12);

  // RTD probe in a drilled hole through the front wall, sealed with a cable gland.
  const rtd = new THREE.Group();
  rtd.name = 'RTD sensor';
  cooler.add(rtd);
  const P = ICERS_PROBE, outer = Z + 0.03;
  cylinder(rtd, 0.003, outer - P.z, m.chrome, [P.x, P.y, (outer + P.z) / 2], 'z', 16);
  cylinder(rtd, 0.011, 0.012, m.dark, [P.x, P.y, Z + 0.006], 'z', 6);
  cylinder(rtd, 0.013, 0.003, m.gasket, [P.x, P.y, Z + 0.0015], 'z', 24);
  cylinder(rtd, 0.015, 0.024, m.aluminium, [P.x, P.y, outer + 0.012], 'z', 24);
  cylinder(rtd, 0.016, 0.005, m.rtdBlue, [P.x, P.y, outer + 0.026], 'z', 24);
  const cable = new THREE.CatmullRomCurve3([
    new THREE.Vector3(P.x, P.y - 0.014, outer + 0.012),
    new THREE.Vector3(P.x + 0.02, P.y - 0.05, outer + 0.03),
    new THREE.Vector3(P.x + 0.12, -0.02, outer + 0.04),
    new THREE.Vector3(0.2, -0.04, 0.17),
  ]);
  rtd.add(new THREE.Mesh(new THREE.TubeGeometry(cable, 40, 0.003, 8), m.cable));

  return {
    stand, pivot, cooler, lid,
    shellMaterials: [m.icersShell, m.pu, m.icersLiner, m.icersBlue],
    setLid(a) { lid.rotation.x = -a; },
    setTilt(a) { pivot.rotation.z = -a; },
    // Lowest point of the inner rim on the dump side, in the cooler frame.
    rimLocal: z => new THREE.Vector3(I.halfX, I.top, z),
  };
}

