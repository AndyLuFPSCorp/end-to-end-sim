# Fries cooler cell

A small three.js scene of a 1 kg frozen-fries cycle. The Nova-5 (middle) sets a scoop lip-down on the conveyor (left) and the belt feeds the fries into it. The robot carries the full scoop to an insulated cooler box (right) and pours it in over the lip. Later, the cooler's bottom door drops the batch into a disposal bin.

## Run

From the repository root (Node 18+, no `npm install` needed):

```sh
node design/fries_cooler_cell/serve.mjs
```

Open **http://127.0.0.1:8770/fries_cooler_cell/**. Options: `--port 8080`, and `--host 0.0.0.0` to open it from another computer. The server serves `design/` because the scene reuses the coffee-bar studio's vendored three.js, Nova-5 model and IK (`../coffee_bar_3d/{vendor,editor,robot-library}`). Any static server rooted at `design/` works too, e.g. `python3 -m http.server -d design 8770`.

Controls: drag to orbit, right-drag to pan, scroll to zoom. The panel has play/pause, speed, a timeline scrubber, **Section view** (cuts the cooler shell to show its layers and the product pile) and camera presets. The HUD shows the RTD reading and where the batch is, in kg.

## What is modelled

| Part | Model |
|---|---|
| Batch | 1 kg ≈ 180 straight-cut frozen fries (9 × 9 × 65 mm, ~5.5 g). At ~0.5 kg/L loose that is about 2 L of product. |
| Nova-5 | `coffee_bar_3d/robot-library/nova5_suction.glb` (from `nova5_lebai_tongs.urdf`) with the suction head hidden and a fry scoop on the flange. Joint motion comes from the studio's `SuctionArm` IK (`editor/ik-core.js`), with the scoop as the tool. |
| Scoop | Dustpan style, ≈2.8 L: 140 mm wide (fits the 150 mm opening), 250 mm long, 120 mm back wall tapering to 50 mm at the open front. A bevelled lip lets it rest on the belt. With ~1 kg fries and a ~1 kg stainless scoop, the payload is ~2 kg about 0.2 m off the flange. The Nova-5 is rated for 5 kg. |
| Loading | The scoop rests lip-down on the belt facing upstream. Guide plates funnel the stream into the 140 mm mouth, and the moving belt pushes the fries in. They fill the bowl from the back wall forwards under a ~30° slope. The robot then tilts the lip up 15° and lifts. |
| Pour | The lip pivots 60 mm above the opening and tips 55° (past the ~35–40° slide angle of frozen fries on stainless). It points away from the robot, so the bowl hangs clear of the lid. Fries slide out front-first. |
| Cooler | 150 mm cube stainless interior, then 5 mm stainless, 25 mm insulation and 5 mm stainless outer skin (220 mm outside). The lid and the bottom door use the same 5/25/5 mm stack. The pile is volume-true: a heightfield where each fry adds its bulk volume. 1 kg settles about 85 mm deep. |
| Lid actuator | Hinge on the top edge on the side away from the robot. A gooseneck arm, fixed to the lid by a trapezoid bracket, reaches over the hinge to the rod end of a vertical air cylinder. The cylinder base is pivot-mounted on the cooler wall. Retracting the cylinder (≈66 mm) pulls the arm down and tips the lid 95° up and away from the opening. |
| RTD | Pt100 probe through the front wall, with its tip 40 mm above the floor and 40 mm into the cavity, so it sits inside the product pile. The HUD shows when the probe is in product or in air. Temperatures are illustrative and time-compressed: frozen product about −18 °C, cooler air warming while the lid or door is open. The resistance is the IEC 60751 value. |
| Bottom door | **Design TBD.** Placeholder: back-hinged door on a second cylinder, so the dump to the disposal bin can be shown. |

Cycle (26 s): set scoop on belt → belt feeds 1 kg → tilt and lift → level carry round the front while the lid tips open → pour over the lip → lid closes → hold (RTD in product) → bottom door opens → disposal.

Short moves (setting down, lifting, pouring) are straight Cartesian IK paths. The carry is also Cartesian, so the loaded scoop stays within 15° of level. The planner tries each IK branch of the start pose and keeps one that tracks the whole cycle continuously. The IK is solved in the browser when the page loads.

## Reach limits found while planning

- In this layout the Nova-5 can only follow a continuous forward pour of about 55°, and only with the lip pointing away from the robot. Deeper tips, or other directions, need a wrist flip partway through.
- 55° is enough for frozen fries, but sticky or iced product may need a deeper tip, a shake, or a steeper-walled scoop. That would mean moving the cooler or robot.
- A rolled side pour (the earlier small scoop) does not work at 1 kg: the 250 mm side would overhang the 150 mm opening.

## Test

```sh
node design/fries_cooler_cell/test_scene.cjs
```

Uses Playwright and headless Chromium. It checks that:

- the IK converges on every sample with a continuous joint path;
- URDF FK matches the rendered GLB;
- the loaded scoop stays near level;
- the whole 1 kg batch reaches the scoop, the cooler and then the bin;
- the RTD tip is buried in product during the hold;
- the page has no errors.

Set `SHOT_DIR=<dir>` to save screenshots.

## Layout (metres, +Y up, +Z towards the default camera)

All values are in `js/timeline.js`:

- Nova-5 base at the origin, 0.40 m high.
- Belt top at 0.72 m, centred on x = −0.55, running towards +Z.
- Cooler bottom at 0.56 m, centred on x = 0.50.
- Disposal bin under the cooler.
