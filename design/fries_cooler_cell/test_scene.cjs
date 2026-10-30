// Headless check of the fries cooler cell, both methods: the page loads, IK
// converges continuously, and the 1 kg batch ends up where it should.
// Screenshots go to $SHOT_DIR if set.
//   node design/fries_cooler_cell/test_scene.cjs
const {spawn} = require('node:child_process');
const path = require('node:path');
const {chromium} = require('playwright');

function startServer() {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(__dirname, 'serve.mjs'), '--port', '0']);
    child.stdout.on('data', chunk => {
      const match = /(http:\/\/\S+)/.exec(String(chunk));
      if (match) resolve({child, url: match[1]});
    });
    child.on('error', reject);
    child.on('exit', code => reject(new Error(`server exited ${code}`)));
  });
}

const check = (ok, message) => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${message}`);
  if (!ok) process.exitCode = 1;
};
const kg = n => (n * 0.0055).toFixed(2);

async function open(browser, url, query) {
  const page = await browser.newPage({viewport: {width: 1400, height: 860}});
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(url + query);
  await page.waitForFunction(() => window.cell?.ready, null, {timeout: 300000});
  const shots = process.env.SHOT_DIR;
  const at = async (t, name) => {
    await page.evaluate(time => window.cell.seek(time), t);
    const counts = await page.evaluate(() => window.cell.counts());
    if (shots && name) await page.screenshot({path: path.join(shots, `${name}.png`)});
    return counts;
  };
  const view = (position, target) => page.evaluate(([p, t]) => window.cell.view(p, t), [position, target]);
  return {page, errors, at, view};
}

async function common(page, label) {
  const report = await page.evaluate(() => window.cell.report);
  check(report.failures === 0, `${label}: IK within tolerance on all ${report.samples} samples`);
  check(report.maxJointStep < 0.2, `${label}: joint path continuous (max step ${report.maxJointStep.toFixed(3)} rad)`);
  check(report.minCarry > 0.85, `${label}: loaded tool stays level / pointing down (min ${report.minCarry.toFixed(2)})`);
  return report;
}

async function fkCheck(page, label, times) {
  let worst = {position: 0, angle: 0};
  for (const t of times) {
    await page.evaluate(time => window.cell.seek(time), t);
    const fk = await page.evaluate(() => window.cell.checkFk());
    worst = {position: Math.max(worst.position, fk.position), angle: Math.max(worst.angle, fk.angle)};
  }
  check(worst.position < 0.001 && worst.angle < 0.01, `${label}: URDF FK matches every rendered TCP`);
}

(async () => {
  const {child, url} = await startServer();
  const browser = await chromium.launch({args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader']});
  try {
    // Method A: belt-fed scoop.
    {
      const {page, errors, at, view} = await open(browser, url, '?method=A');
      await common(page, 'A');
      const e = await page.evaluate(() => window.cell.expect);
      await fkCheck(page, 'A', [1, 10, 12.8]);
      const start = await at(1.0, 'A01_place_scoop');
      check(start.belt === e.batch + 170, 'A: stream starts on the belt (1 kg lane + the rest beside it)');
      await at(5.0, 'A02_belt_feeding');
      const full = await at(e.full, 'A03_scoop_full');
      check(full.carrier === e.batch, `A: belt fed exactly 1 kg into the scoop (${kg(full.carrier)} kg)`);
      check(full.tote > 0, `A: fries outside the mouth pass to overflow (${kg(full.tote)} kg so far)`);
      await at(12.8, 'A04_pour');
      const held = await at(e.inCooler, 'A05_in_cooler');
      check(held.cooler === e.batch, 'A: whole batch resting in the cooler');
      check(await page.evaluate(() => window.cell.inProduct()), 'A: RTD tip buried in the product');
      const dumped = await at(e.inBin, 'A06_in_bin');
      check(dumped.bin === e.batch, 'A: whole batch in the disposal bin');
      await view([-1.15, 1.2, 0.55], [-0.55, 0.72, -0.12]);
      await at(5.2, 'A07_feed_close');
      check(errors.length === 0, `A: no page errors${errors.length ? ': ' + errors.join(' | ') : ''}`);
      await page.close();
    }
    // Method B: soft-gripper handfuls, at the proposed 45° tilt and at 120°.
    for (const tilt of [45, 120]) {
      const label = `B@${tilt}°`;
      const {page, errors, at, view} = await open(browser, url, `?method=B&tilt=${tilt}`);
      await common(page, label);
      const e = await page.evaluate(() => window.cell.expect);
      if (tilt === 45) {
        await fkCheck(page, label, [1.3, 3.5, 28.5, 38.5]);
        await at(1.6, 'B01_grab');
        await at(3.4, 'B02_carry');
        await at(4.1, 'B03_drop');
        const filled = await at(e.full, 'B04_five_grabs');
        check(Math.abs(filled.cooler - e.batch) <= 2, `${label}: five grabs put ~1 kg in the cooler (${kg(filled.cooler)} kg)`);
        await at(28.4, 'B05_closing_lid');
        await at(e.inCooler);
        check(await page.evaluate(() => window.cell.inProduct()), `${label}: RTD tip buried in the product`);
        await at(38.4, 'B06_opening_lid');
        await view([0.25, 1.1, 1.25], [0.55, 0.62, 0]);
        await at(39.0, 'B07_lid_grip_close');
        await view([1.45, 1.75, 2.35], [-0.05, 0.8, 0.0]);
      }
      await at(45.5, `B08_tilt_${tilt}`);
      const after = await at(e.dumped);
      const out = after.bin, left = after.cooler;
      console.log(`${label}: dump result ${kg(out)} kg out, ${kg(left)} kg left in the cooler`);
      if (tilt === 45) check(out < 0.1 * e.batch, `${label}: a 45° tilt does NOT empty the cooler (expected: fries rest against the low wall)`);
      else check(out > 0.9 * e.batch, `${label}: a 120° tilt empties the cooler`);
      check(errors.length === 0, `${label}: no page errors${errors.length ? ': ' + errors.join(' | ') : ''}`);
      await page.close();
    }
  } finally {
    await browser.close();
    child.kill();
  }
})().catch(error => {
  console.error(error);
  process.exit(1);
});
