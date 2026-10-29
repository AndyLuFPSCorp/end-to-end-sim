# Fries cooler cell

A small three.js scene. A conveyor (left) delivers a pile of fries. A Nova-5 (middle) scoops them and pours them into an insulated cooler box (right). Later, the cooler's bottom door drops them into a disposal bin.

## Run

From the repository root (Node 18+, no `npm install` needed):

```sh
node design/fries_cooler_cell/serve.mjs
```

Open **http://127.0.0.1:8770/fries_cooler_cell/**. Options: `--port 8080`, and `--host 0.0.0.0` to open it from another computer. The server serves `design/` because the scene reuses the coffee-bar studio's vendored three.js, Nova-5 model and IK (`../coffee_bar_3d/{vendor,editor,robot-library}`). Any static server rooted at `design/` works too, e.g. `python3 -m http.server -d design 8770`.

Controls: drag to orbit, right-drag to pan, scroll to zoom. The panel has play/pause, speed, a timeline scrubber, **Section view** (cuts the cooler shell to show its layers) and camera presets.

## What is modelled

| Part | Model |
|---|---|
| Nova-5 | `coffee_bar_3d/robot-library/nova5_suction.glb` (from `nova5_lebai_tongs.urdf`) with the suction head hidden and a 100 × 110 mm stainless fry scoop on the flange. Joint motion comes from the studio's `SuctionArm` IK (`editor/ik-core.js`), with the scoop as the tool. |
| Cooler | 150 mm cube stainless interior, then 5 mm stainless, 25 mm insulation and 5 mm stainless outer skin (220 mm outside). The lid and the bottom door use the same 5/25/5 mm stack. Both hinge on the back edge. |
| Lid actuator | Clevis-mounted air cylinder on the +X side. Its rod drives a lever bracket on the lid (≈58 mm stroke → 100° open). |
| Bottom door | Second air cylinder on the +X side (≈34 mm stroke → 95° open) dumps into the disposal bin. |
| RTD | Pt100 probe drilled through the front wall, 30 mm into the cavity, with connection head and cable. The HUD shows a time-compressed temperature and the matching Pt100 resistance. |

Cycle (22 s): belt delivers → scoop pushes the pile against the far guide rail → lid opens → arm carries the fries round the front → rolls the scoop to pour → lid closes → hold (RTD) → bottom door opens → disposal.

Short moves (approach, scoop, pour) are straight Cartesian IK paths. Transfers are joint-space moves to the nearest IK branch. The IK is solved in the browser when the page loads.

## Test

```sh
node design/fries_cooler_cell/test_scene.cjs
```

Uses Playwright and headless Chromium. It checks that the IK converges on every sample with a continuous joint path, and that URDF FK matches the rendered GLB. It also checks that all 24 fries reach the scoop, the cooler and then the bin, and that the page has no errors. Set `SHOT_DIR=<dir>` to save screenshots.

## Layout (metres, +Y up, +Z towards the default camera)

All values are in `js/timeline.js`: robot base 0.40 m high at the origin, belt top 0.72 m at x = −0.70, cooler bottom 0.56 m at x = 0.50, and the disposal bin under the cooler.
