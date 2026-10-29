// Headless check of the fries cooler cell: loads, IK converges, fries reach
// the cooler then the disposal bin. Screenshots go to $SHOT_DIR if set.
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

(async () => {
  const {child, url} = await startServer();
  const browser = await chromium.launch({args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader']});
  try {
    const page = await browser.newPage({viewport: {width: 1400, height: 860}});
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(url);
    await page.waitForFunction(() => window.cell?.ready, null, {timeout: 120000});
    const report = await page.evaluate(() => window.cell.report);
    console.log('IK report', JSON.stringify(report), 'start', JSON.stringify((await page.evaluate(() => window.cell.start.q)).map(v => +(v * 180 / Math.PI).toFixed(1))));
    check(report.failures === 0, `IK within tolerance on all ${report.samples} samples`);
    check(report.maxJointStep < 0.2, `joint path continuous (max step ${report.maxJointStep.toFixed(3)} rad)`);

    const shots = process.env.SHOT_DIR;
    const at = async (t, name) => {
      await page.evaluate(time => window.cell.seek(time), t);
      const counts = await page.evaluate(() => window.cell.counts());
      const fk = await page.evaluate(() => window.cell.checkFk());
      const tcp = await page.evaluate(() => window.cell.tcp());
      console.log(`t=${t}`, JSON.stringify(counts), 'tcp', tcp.map(v => v.toFixed(3)).join(','),
        `fk ${(fk.position * 1000).toFixed(2)}mm ${(fk.angle * 180 / Math.PI).toFixed(2)}deg`,
        `rtd ${(await page.evaluate(() => window.cell.temperature())).toFixed(2)}`);
      if (shots) await page.screenshot({path: path.join(shots, `${name}.png`)});
      return {counts, fk};
    };
    const start = await at(1.0, '01_belt');
    check(start.counts.belt === 24, 'all fries start on the belt');
    check(start.fk.position < 0.001 && start.fk.angle < 0.01, 'URDF FK matches rendered GLB TCP');
    await at(4.6, '02_scooping');
    const carry = await at(7.5, '03_carry');
    check(carry.counts.scoop === 24, 'all fries carried in the scoop');
    await at(9.7, '04_dump');
    const held = await at(13.5, '05_in_cooler');
    check(held.counts.cooler === 24, 'all fries resting in the cooler');
    await at(16.4, '06_door_open');
    const dumped = await at(19.0, '07_in_bin');
    check(dumped.counts.bin === 24, 'all fries in the disposal bin');
    await page.evaluate(() => window.cell.setSection(true));
    await page.evaluate(() => window.cell.view([0.2, 1.0, 0.7], [0.5, 0.67, 0]));
    await at(13.5, '08_section');
    await page.evaluate(() => window.cell.view([0.95, 1.0, 0.75], [0.55, 0.75, 0]));
    await page.evaluate(() => window.cell.setSection(false));
    await at(3.0, '09a_lid_closed');
    await at(6.6, '09b_lid_opening');
    await at(8.0, '09c_lid_open');
    await at(16.4, '10_cylinder_door');
    check(errors.length === 0, `no page errors${errors.length ? ': ' + errors.join(' | ') : ''}`);
  } finally {
    await browser.close();
    child.kill();
  }
})().catch(error => {
  console.error(error);
  process.exit(1);
});
