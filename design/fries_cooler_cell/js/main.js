import * as THREE from 'three';
import {OrbitControls} from 'three/addons/OrbitControls.js';
import {RoomEnvironment} from 'three/addons/RoomEnvironment.js';
import {ROBOT_BASE, phaseAt} from './common.js';
import {buildConveyor, buildPedestal, buildFloor, buildTote, label} from './props.js';
import {loadNova5, planTrajectory} from './robot.js';
import {FrySim} from './fries.js';

const DT = 1 / 90;
const $ = id => document.getElementById(id);
const params = new URLSearchParams(location.search);
const METHOD = (params.get('method') || 'A').toUpperCase() === 'B' ? 'B' : 'A';

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
const HOME_VIEW = {position: [1.25, 1.5, 1.85], target: [0.1, 0.62, 0.0]};
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
Object.assign(sun.shadow.camera, {left: -1.8, right: 1.8, top: 1.8, bottom: -1.8, near: 0.5, far: 7});
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
  smc: standard(0x9aa3ab, 0.6, 0.4),
  rochu: standard(0x3b4148, 0.2, 0.55),
  softFinger: standard(0xe9eef2, 0, 0.6),
  softFingerDark: standard(0xd5dce2, 0, 0.6),
  icersShell: standard(0xf7f8f8, 0, 0.55, {side: THREE.DoubleSide}),
  icersLiner: standard(0xeef1f3, 0, 0.45, {side: THREE.DoubleSide}),
  icersBlue: standard(0x2d5fae, 0.05, 0.45, {side: THREE.DoubleSide}),
  pu: standard(0xf0d48a, 0, 0.95, {side: THREE.DoubleSide}),
  gasket: standard(0x1b1d20, 0, 0.8),
  icePack: standard(0x8fd6d0, 0, 0.4),
};

scene.add(buildFloor());
const conveyor = buildConveyor(materials);
scene.add(conveyor.group);
scene.add(buildPedestal(materials, ROBOT_BASE));
const tote = buildTote(materials);
scene.add(tote.group);

const {createMethod} = await import(METHOD === 'B' ? './methodB.js' : './methodA.js');
const method = createMethod({scene, materials, label, options: {tilt: params.get('tilt')}});
const labels = new THREE.Group();
labels.add(...method.labels);
scene.add(labels);
document.title = `Fries cooler cell · ${method.title}`;
$('method').value = METHOD;
$('tilt-row').hidden = METHOD !== 'B';
if (method.options?.tilt) $('tilt').value = String(method.options.tilt);

// Section view: cut the cooler shell at its mid-plane to show the wall layers.
const sectionPlane = new THREE.Plane(new THREE.Vector3(0, 0, -1), method.sectionZ);
function setSection(on) {
  for (const material of method.shellMaterials) {
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

const status = $('status');
status.textContent = 'Loading Nova-5…';
const robot = await loadNova5(ROBOT_BASE, materials, method.buildTool);
scene.add(robot.root);
status.textContent = 'Planning robot path (IK)…';
await new Promise(requestAnimationFrame);
const plan = planTrajectory(robot.arm, method.segments, method.poses, method.preferred);
const containers = [...method.containers, tote.container('tote')];
const fries = new FrySim(scene, method.seeds, containers);
const productFrame = containers.find(c => c.name === method.thermal.container).frame;

// RTD thermal model (time-compressed, illustrative). The cooler air starts at
// -18 °C and warms while the lid is open; the frozen product stays near
// -18 °C. The probe reads the product once the pile covers its tip, otherwise
// the air, with a first-order sensor lag.
const PRODUCT_C = -18, AMBIENT_C = 22;
const thermal = {temperature: PRODUCT_C, air: PRODUCT_C, inProduct: false};
function stepThermal(t, dt, friesInside) {
  const open = method.thermal.openFraction(t);
  thermal.air += dt * ((PRODUCT_C - thermal.air) * (friesInside ? 0.12 : 0.04) + open * (AMBIENT_C - thermal.air) / 20);
  const p = method.thermal.probe;
  thermal.inProduct = friesInside > 0 && fries.containerLevel(method.thermal.container, p.x, p.z) > p.y + 0.004;
  const reading = thermal.inProduct ? PRODUCT_C + 0.4 : thermal.air;
  thermal.temperature += dt * (reading - thermal.temperature) / 1.5;
}

const state = {time: 0, simTime: 0, playing: true, speed: 1};

function poseAt(t) {
  robot.pose(plan.sample(t));
  robot.tool.animate(method.toolState(t));
  method.update(t);
  productFrame.updateWorldMatrix(true, false);
  conveyor.setTravel(method.beltTravel(t));
}

function stepTo(target) {
  while (state.simTime + DT <= target + 1e-9) {
    const t = state.simTime + DT;
    poseAt(t);
    const travel = method.beltTravel(t);
    method.control(fries, t, DT, robot);
    fries.step(DT, {t, travel, beltSpeed: (travel - method.beltTravel(t - DT)) / DT});
    stepThermal(t, DT, fries.counts()[method.thermal.container]);
    state.simTime = t;
  }
  state.time = target;
  poseAt(target);
  fries.sync();
}

function seek(t) {
  fries.reset();
  method.reset();
  Object.assign(thermal, {temperature: PRODUCT_C, air: PRODUCT_C, inProduct: false});
  state.simTime = 0;
  poseAt(0);
  stepTo(Math.max(0, Math.min(method.cycle - 1e-6, t)));
}

// UI
const scrub = $('scrub');
scrub.max = method.cycle;
$('play').addEventListener('click', () => setPlaying(!state.playing));
$('restart').addEventListener('click', () => seek(0));
$('speed').addEventListener('change', e => (state.speed = Number(e.target.value)));
let pendingSeek = null;
scrub.addEventListener('input', () => {
  if (pendingSeek === null) requestAnimationFrame(() => { seek(pendingSeek); pendingSeek = null; });
  pendingSeek = Number(scrub.value);
});
$('section').addEventListener('change', e => setSection(e.target.checked));
$('labels').addEventListener('change', e => (labels.visible = e.target.checked));
const reload = changes => {
  const next = new URLSearchParams(location.search);
  for (const [k, v] of Object.entries(changes)) next.set(k, v);
  location.search = next.toString();
};
$('method').addEventListener('change', e => reload({method: e.target.value}));
$('tilt').addEventListener('change', e => reload({tilt: e.target.value}));
$('compare').addEventListener('click', () => ($('comparison').hidden = !$('comparison').hidden));
$('close-compare').addEventListener('click', () => ($('comparison').hidden = true));
$('home').addEventListener('click', () => {
  camera.position.set(...HOME_VIEW.position);
  controls.target.set(...HOME_VIEW.target);
});
$('focus').addEventListener('click', () => {
  camera.position.set(...method.focus.position);
  controls.target.set(...method.focus.target);
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

const rod = stroke => `rod ${stroke > 0.0005 ? '+' : ''}${(stroke * 1000).toFixed(0)} mm`;
function updateHud() {
  const t = state.time;
  scrub.value = t;
  $('clock').textContent = `${t.toFixed(1)} / ${method.cycle} s`;
  $('phase').textContent = phaseAt(method.phases, t);
  const T = thermal.temperature;
  const rows = [
    ['RTD (Pt100)', `${T.toFixed(1)} °C`, 'temp'],
    ['', `${pt100(T).toFixed(2)} Ω · ${thermal.inProduct ? 'in product' : 'in air'}`],
    ...method.hud(t, fries.counts(), rod),
  ];
  const html = rows.map(([k, v, cls]) => `<dt>${k}</dt><dd${cls ? ` class="${cls}"` : ''}>${v}</dd>`).join('');
  if ($('readout-list').innerHTML !== html) $('readout-list').innerHTML = html;
}

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (state.playing) {
    const next = state.time + dt * state.speed;
    if (next >= method.cycle) seek(next - method.cycle);
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
  method: METHOD, expect: method.expect, cycle: method.cycle,
  robot, poses: method.poses, sim: fries,
  report: plan.report,
  start: plan.start,
  seek(t) { setPlaying(false); seek(t); updateHud(); renderer.render(scene, camera); },
  counts: () => fries.counts(),
  temperature: () => thermal.temperature,
  inProduct: () => thermal.inProduct,
  coverAboveProbe() {
    const p = method.thermal.probe;
    return fries.containerLevel(method.thermal.container, p.x, p.z) - p.y;
  },
  setSection,
  view(position, target) { camera.position.set(...position); controls.target.set(...target); controls.update(); renderer.render(scene, camera); },
  checkFk() {
    // URDF FK (used by IK) must agree with every rendered TCP.
    const q = plan.sample(state.time);
    robot.pose(q);
    let worst = {position: 0, angle: 0};
    for (const [name, tcp] of Object.entries(robot.tcps)) {
      robot.arm.tool = robot.arm.tools[name];
      const urdf = robot.arm.forward(q);
      const three = robot.fromUrdf(new THREE.Matrix4().compose(urdf.position, urdf.quaternion, new THREE.Vector3(1, 1, 1)));
      const qa = new THREE.Quaternion().setFromRotationMatrix(three), qb = new THREE.Quaternion().setFromRotationMatrix(tcp.matrixWorld);
      worst = {
        position: Math.max(worst.position, new THREE.Vector3().setFromMatrixPosition(three).distanceTo(new THREE.Vector3().setFromMatrixPosition(tcp.matrixWorld))),
        angle: Math.max(worst.angle, qa.angleTo(qb)),
      };
    }
    return worst;
  },
  tcp() {
    return new THREE.Vector3().setFromMatrixPosition(Object.values(robot.tcps)[0].matrixWorld).toArray();
  },
};
