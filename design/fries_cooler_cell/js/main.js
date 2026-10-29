import * as THREE from 'three';
import {OrbitControls} from 'three/addons/OrbitControls.js';
import {RoomEnvironment} from 'three/addons/RoomEnvironment.js';
import {
  CYCLE, DEG, ROBOT_BASE, COOLER_POS, BIN_POS, LID, CAPTURE, RELEASE, POSES, ROBOT_SEGMENTS,
  beltTravel, lidAngle, doorAngle, phaseAt,
} from './timeline.js';
import {buildCooler, OUTER} from './cooler.js';
import {buildConveyor, buildPedestal, buildBin, buildFloor, label} from './props.js';
import {loadNova5, planTrajectory} from './robot.js';
import {FrySim} from './fries.js';

const DT = 1 / 120;
const $ = id => document.getElementById(id);

const canvas = $('scene');
const renderer = new THREE.WebGLRenderer({canvas, antialias: true, preserveDrawingBuffer: true});
renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.localClippingEnabled = true;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xf3f5f7);
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
const camera = new THREE.PerspectiveCamera(40, 1, 0.02, 30);
const HOME_VIEW = {position: [1.15, 1.45, 1.75], target: [0.0, 0.66, 0.0]};
camera.position.set(...HOME_VIEW.position);
const controls = new OrbitControls(camera, canvas);
controls.target.set(...HOME_VIEW.target);
controls.enableDamping = true;
controls.update();

scene.add(new THREE.HemisphereLight(0xffffff, 0xb9c2c9, 0.9));
const sun = new THREE.DirectionalLight(0xffffff, 2.0);
sun.position.set(1.5, 3.2, 2.2);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, {left: -1.6, right: 1.6, top: 1.6, bottom: -1.6, near: 0.5, far: 7});
sun.shadow.bias = -0.0004;
scene.add(sun);

const standard = (color, metalness, roughness, extra = {}) =>
  new THREE.MeshStandardMaterial({color, metalness, roughness, ...extra});
const materials = {
  outerSteel: standard(0xcfd4d8, 0.85, 0.32, {side: THREE.DoubleSide}),
  innerSteel: standard(0xe8ebee, 0.8, 0.2, {side: THREE.DoubleSide}),
  insulation: standard(0xf2c94c, 0, 0.92, {side: THREE.DoubleSide}),
  steel: standard(0xd4d8dc, 0.85, 0.28),
  aluminium: standard(0xb7bec6, 0.7, 0.38),
  arm: standard(0xc3c9ce, 0.8, 0.3),
  chrome: standard(0xf2f4f6, 1, 0.12),
  dark: standard(0x2b3036, 0.3, 0.6),
  frame: standard(0x8c959e, 0.6, 0.45),
  brass: standard(0xc9a548, 0.9, 0.3),
  tubeBlue: standard(0x2f7bd8, 0, 0.5),
  rtdBlue: standard(0x2563b0, 0.2, 0.5),
  cable: standard(0x1d2125, 0, 0.7),
  motor: standard(0x37516b, 0.4, 0.5),
  bin: standard(0x4b5560, 0.05, 0.75),
  binRim: standard(0xf0b429, 0.05, 0.6),
};

scene.add(buildFloor());
const conveyor = buildConveyor(materials);
scene.add(conveyor.group);
scene.add(buildPedestal(materials, ROBOT_BASE));
const cooler = buildCooler(materials);
cooler.root.position.set(...COOLER_POS);
scene.add(cooler.root);
scene.add(buildBin(materials, BIN_POS));

const labels = new THREE.Group();
labels.add(
  label('Conveyor', [-0.70, 0.92, -0.65]),
  label('Nova-5', [0, 0.32, 0.16]),
  label('Cooler box', [0.26, 0.80, 0.04]),
  label('Lid hinge', [0.66, 0.86, -0.12]),
  label('Lid air cylinder', [0.78, 0.66, 0.02]),
  label('RTD sensor', [0.50, 0.63, 0.36]),
  label('Bottom door (TBD)', [0.62, 0.50, 0.14]),
  label('Disposal', [0.50, 0.30, 0.22]),
);
scene.add(labels);

// Section view: cut the cooler shell at its mid-plane to show the wall layers.
const sectionPlane = new THREE.Plane(new THREE.Vector3(0, 0, -1), COOLER_POS[2]);
function setSection(on) {
  for (const material of cooler.shellMaterials) {
    material.clippingPlanes = on ? [sectionPlane] : [];
    material.needsUpdate = true;
  }
}

function resize() {
  const {clientWidth: w, clientHeight: h} = canvas.parentElement;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

// RTD thermal model (time-compressed, illustrative): the cooler holds frozen
// fries at about -18 °C, warms while the lid is open and the frozen product
// pulls it back down.
const HOLD_C = -18;
const thermal = {temperature: HOLD_C};
function stepThermal(t, dt, friesInside) {
  const open = lidAngle(t) / LID.angle;
  const T = thermal.temperature;
  thermal.temperature += dt * ((HOLD_C - T) / 7 + open * (22 - T) / 25 + friesInside * (HOLD_C - T) * 0.004);
}

const status = $('status');
status.textContent = 'Loading Nova-5…';
const robot = await loadNova5(ROBOT_BASE, materials);
scene.add(robot.root);
status.textContent = 'Planning scoop path (IK)…';
await new Promise(requestAnimationFrame);
const preferred = [180, -10, 100, 0, -90, 0].map(v => v * DEG);
const plan = planTrajectory(robot.arm, ROBOT_SEGMENTS, POSES, preferred);
const fries = new FrySim(scene);

const state = {time: 0, simTime: 0, playing: true, speed: 1};

function poseAt(t) {
  robot.pose(plan.sample(t));
  cooler.setAngles(lidAngle(t), doorAngle(t));
  conveyor.setTravel(beltTravel(t));
}

function stepTo(target) {
  while (state.simTime + DT <= target + 1e-9) {
    const t = state.simTime + DT;
    poseAt(t);
    const counts = fries.counts();
    fries.step(DT, {
      t,
      travel: beltTravel(t),
      scoop: robot.tcp.matrixWorld,
      capture: t >= CAPTURE[0] && t <= CAPTURE[1],
      release: t >= RELEASE[0] && t <= RELEASE[1],
      doorAngle: doorAngle(t),
    });
    stepThermal(t, DT, counts.cooler);
    state.simTime = t;
  }
  state.time = target;
  poseAt(target);
  fries.sync();
}

function seek(t) {
  fries.reset();
  thermal.temperature = HOLD_C;
  state.simTime = 0;
  poseAt(0);
  stepTo(Math.max(0, Math.min(CYCLE - 1e-6, t)));
}

// UI
const scrub = $('scrub');
scrub.max = CYCLE;
$('play').addEventListener('click', () => setPlaying(!state.playing));
$('restart').addEventListener('click', () => seek(0));
$('speed').addEventListener('change', e => (state.speed = Number(e.target.value)));
scrub.addEventListener('input', () => seek(Number(scrub.value)));
$('section').addEventListener('change', e => setSection(e.target.checked));
$('labels').addEventListener('change', e => (labels.visible = e.target.checked));
$('home').addEventListener('click', () => {
  camera.position.set(...HOME_VIEW.position);
  controls.target.set(...HOME_VIEW.target);
});
$('focus').addEventListener('click', () => {
  camera.position.set(COOLER_POS[0] + 0.45, COOLER_POS[1] + 0.4, 0.7);
  controls.target.set(COOLER_POS[0], COOLER_POS[1] + OUTER / 2, 0);
});
function setPlaying(on) {
  state.playing = on;
  $('play').textContent = on ? 'Pause' : 'Play';
}

// IEC 60751 Callendar–Van Dusen resistance of a Pt100.
function pt100(T) {
  const A = 3.9083e-3, B = -5.775e-7, C = T < 0 ? -4.183e-12 : 0;
  return 100 * (1 + A * T + B * T * T + C * (T - 100) * T ** 3);
}

function updateHud() {
  const t = state.time;
  scrub.value = t;
  $('clock').textContent = `${t.toFixed(1)} / ${CYCLE} s`;
  $('phase').textContent = phaseAt(t);
  const T = thermal.temperature;
  $('rtd').textContent = `${T.toFixed(1)} °C`;
  $('rtd-ohm').textContent = `${pt100(T).toFixed(2)} Ω`;
  const rod = stroke => `rod ${stroke > 0.0005 ? '+' : ''}${(stroke * 1000).toFixed(0)} mm`;
  $('lid').textContent = `${(lidAngle(t) / DEG).toFixed(0)}° · ${rod(cooler.lidCylinder.stroke)}`;
  $('door').textContent = `${(doorAngle(t) / DEG).toFixed(0)}° · ${rod(cooler.doorCylinder.stroke)}`;
  const c = fries.counts();
  $('fries').textContent = `belt ${c.belt} · scoop ${c.scoop} · cooler ${c.cooler} · bin ${c.bin}` + (c.falling ? ` · falling ${c.falling}` : '');
}

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (state.playing) {
    const next = state.time + dt * state.speed;
    if (next >= CYCLE) seek(next - CYCLE);
    else stepTo(next);
  }
  updateHud();
  controls.update();
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

seek(0);
const r = plan.report;
status.textContent = r.failures
  ? `IK: ${r.failures}/${r.samples} samples outside tolerance (max ${(r.maxPositionError * 1000).toFixed(1)} mm)`
  : 'Drag to orbit · right-drag to pan · scroll to zoom';
requestAnimationFrame(frame);

// Hooks for the headless test.
window.cell = {
  ready: true,
  robot, poses: POSES,
  report: plan.report,
  start: plan.start,
  seek(t) { setPlaying(false); seek(t); updateHud(); renderer.render(scene, camera); },
  counts: () => fries.counts(),
  temperature: () => thermal.temperature,
  setSection,
  view(position, target) { camera.position.set(...position); controls.target.set(...target); controls.update(); renderer.render(scene, camera); },
  checkFk() {
    // URDF FK (used by IK) must agree with the rendered GLB TCP.
    const q = plan.sample(state.time);
    robot.pose(q);
    const urdf = robot.arm.forward(q);
    const m = new THREE.Matrix4().compose(urdf.position, urdf.quaternion, new THREE.Vector3(1, 1, 1));
    const three = robot.fromUrdf(m);
    const a = new THREE.Vector3().setFromMatrixPosition(three);
    const b = new THREE.Vector3().setFromMatrixPosition(robot.tcp.matrixWorld);
    const qa = new THREE.Quaternion().setFromRotationMatrix(three), qb = new THREE.Quaternion().setFromRotationMatrix(robot.tcp.matrixWorld);
    return {position: a.distanceTo(b), angle: qa.angleTo(qb)};
  },
  tcp() {
    const p = new THREE.Vector3().setFromMatrixPosition(robot.tcp.matrixWorld);
    return p.toArray();
  },
};
