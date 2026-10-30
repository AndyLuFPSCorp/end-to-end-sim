# Fries cooler cell

A three.js scene of a 1 kg frozen-fries cycle with two alternative methods. In both, a conveyor (left) feeds a Nova-5 (middle), which loads an insulated cooler (right). The cooler holds the batch for an RTD reading, then dumps it into a disposal bin.

- **A · Belt-fed scoop.** A 2.8 L scoop rests lip-down on the belt and a high-throughput stream feeds it. There is no funnel, so the rest of the stream passes beside it. The robot pours the scoop into a custom stainless cooler with an air-cylinder lid and a bottom door.
- **B · Soft-gripper handfuls.** A dual-gripper adapter carries a 5-finger soft claw and a 2-finger soft gripper. The claw grabs handfuls into an ICERS 6 L cooler, and the 2-finger gripper works the lid. A tilt platform dumps the cooler.

**[METHODS.md](METHODS.md)** has the comparison, the tilt-angle finding, and the review of the method B parts list.

## Run

From the repository root (Node 18+, no `npm install` needed):

```sh
node design/fries_cooler_cell/serve.mjs
```

Open **http://127.0.0.1:8770/fries_cooler_cell/**:

- Pick a method in the panel, or add `?method=B` to the URL.
- For method B, the dump angle is a selector, or `&tilt=45|90|120`.
- **Compare methods** opens the comparison table.

Server options: `--port 8080`, and `--host 0.0.0.0` to open it from another computer. The server serves `design/` because the scene reuses the coffee-bar studio's vendored three.js, Nova-5 model and IK (`../coffee_bar_3d/{vendor,editor,robot-library}`). Any static server rooted at `design/` works too, e.g. `python3 -m http.server -d design 8770`.

Controls: drag to orbit, right-drag to pan, scroll to zoom. The panel also has:

- play/pause, speed and a timeline scrubber;
- **Section view**, which cuts the cooler shell to show its layers and the product pile;
- camera presets.

The HUD shows the RTD reading (in product / in air) and where the batch is, in kg.

## What is modelled

| Part | Model |
|---|---|
| Batch | 1 kg ≈ 180 straight-cut frozen fries (9 × 9 × 65 mm, ~5.5 g), about 2 L loose. |
| Nova-5 | `coffee_bar_3d/robot-library/nova5_suction.glb` (from `nova5_lebai_tongs.urdf`) with the suction head swapped for this cell's tool. Joint motion comes from the studio's `SuctionArm` IK (`editor/ik-core.js`), with each TCP as the tool. |
| A · scoop | Dustpan style, ≈2.8 L: 140 mm wide (fits the 150 mm opening), 250 mm long, 120 mm back wall tapering to 50 mm. It rests on the belt; the 1 kg lane feeds in, filling from the back wall forwards. |
| A · pour | The lip pivots 60 mm above the opening and tips 55°, past the ~35–40° slide angle of frozen fries. It points away from the robot, which is the only tip direction the Nova-5 can follow continuously in this layout. |
| A · cooler | 150 mm cube stainless interior, then 5 mm stainless, 25 mm insulation and 5 mm stainless (220 mm outside). The lid hinges on the edge away from the robot. A gooseneck arm and a pivot-mounted air cylinder tip it open (retract ≈66 mm → 95°). Bottom door: **design TBD** (placeholder). |
| B · tool | 90° dual adapter (SMC RMMA1-20T090 class): a 5-finger claw (ROCHU SMP-5L plate, 5 × FM-B8V4 fingers, FCM-R08 flange module) and a 2-finger gripper (BMC-2GN4087 class). Both hands sit 45° off the flange axis. |
| B · grabbing | 5 grabs of ~200 g each from a dense stream; the belt indexes 120 mm between grabs. Fries the claw doesn't take go to the overflow tote. |
| B · cooler | ICERS 6 L: 34 × 28 × 21 cm outside, 23 × 14 × 15 cm inside, PU walls, lid gasket and ice pack. The stock latches are replaced by magnetic catches. The 2-finger gripper pinches the lid's robot-side edge and rides it open to 100° and back. |
| B · dump | The platform tilts about its far edge (rotary drive). Fries leave only from above a 33° free surface through the low rim. 45° dumps nothing; 120° empties it. |
| RTD | Pt100 with its tip 40 mm above the floor and 40 mm into the cavity, so it sits in the product pile. In B it goes through a drilled hole sealed with a cable gland. The temperatures are illustrative and time-compressed; the resistance is the IEC 60751 value. |
| Piles | A volume-true heightfield: each fry adds its bulk volume (50 % packing) and slumps to a ~25° slope. Containers carry their pile when they move. |

Short moves are straight Cartesian IK paths. Transfers are Cartesian or joint-space moves to the nearest IK branch, and the loaded tool is kept level (A) or pointing down (B). The planner:

- tries each IK branch of the start pose and keeps one that tracks the whole cycle continuously;
- reuses configurations for poses it revisits;
- caches repeated moves.

It runs in the browser when the page loads.

## Test

```sh
node design/fries_cooler_cell/test_scene.cjs
```

Uses Playwright and headless Chromium, and runs method A, method B at 45° and method B at 120°. It checks that:

- the IK converges on every sample with a continuous joint path;
- URDF FK matches every rendered TCP;
- the loaded tool stays level or pointing down;
- the 1 kg batch reaches the cooler and the RTD is buried in it;
- method A empties into its bin;
- method B's 45° tilt leaves the cooler full and its 120° tilt empties it;
- the page has no errors.

Set `SHOT_DIR=<dir>` to save screenshots.

## Layout (metres, +Y up, +Z towards the default camera)

Shared values are in `js/common.js`:

- Nova-5 base at the origin, 0.40 m high.
- Belt top at 0.72 m, centred on x = −0.55, running towards +Z into an overflow tote.

Method-specific placement is in `js/methodA.js` and `js/methodB.js`; for method B, see also `js/icers.js`:

- A: cooler bottom at 0.56 m, x = 0.50.
- B: ICERS on a platform at 0.58 m, centred on x = 0.55, with the tilt hinge at x = 0.75 and the bin beyond it.
