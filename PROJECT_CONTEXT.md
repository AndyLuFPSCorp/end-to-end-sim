# Project context for AI agents

Read this first. It explains what the overall project is, what hardware and machines exist, how the repositories fit together, what has been decided, and what is still open. It is a map, not a specification: each section names the document that owns the detail. When this file and a repository's own docs disagree on a detail inside that repository, the repository is more likely to be current; when they disagree on a cross-project decision dated 2026-10-27 or later, this file records the owner's decision.

Written 2026-10-27 from the four repositories in this workspace (`end-to-end-sim`, `AtomW-VLA`, `aio_atom-w_gui`, `dobot-teleoperate-recording`), the team task list export of 2026-10-21, and decisions the project owner gave directly on 2026-10-27. Anything marked **unknown** or **open** has not been decided or was not available; do not fill it in by inference. Ask.

People are referred to by role only. Do not add personal names to this file.

---

## 1. The project in brief

The company is building a **Robot Café**: a 5.00 m × 3.75 m bar where customers order pastries and drinks at a front counter (tablet or voice) and robots prepare and hand over the order.

- **Demo:** 2026-11-20. **Launch:** 2026-12-08. The task list schedules end-to-end integration and stress testing between 2026-11-13 and 2026-11-26.
- **Site:** the café is being built in the same lab in China where the humanoid robot and its onboard PC are today. Part of the team works in Canada.
- **Products:** pastries are **donuts and croissants** (task ENV-5, done). Whether packaged (wrapped) goods may be used for the humanoid is still being asked (ENV-18, open). Drinks are coffee and milk tea.

### Robots and what each one does

| Robot | Count | Job | Status of the decision |
|---|---|---|---|
| **Dobot Atom-W** wheeled humanoid | 1 | Drives to the rear shelf, picks a bun from **Rack B** with a **Lebai LMG-90 two-finger gripper holding tongs on the left wrist**, using a **VLA policy on the left arm**; drives to the packing table and drops the bun into an already-opened paper bag. Right hand stays a dexterous humanoid hand, used for gestures/emoting and possibly for picking up bags. | Decided 2026-10-27 (gripper "for now"; bag pickup by the right hand "maybe") |
| **Dobot Nova-5** #1 | 1 | Bun picking with tongs at the packing table, from **Rack A** | Decided |
| **Dobot Nova-5** #2 | 1 | Bag handling: suction-picks a flat paper bag, opens it against an opposing fixed suction gripper. The filled bag is probably carried to the pickup counter by a Nova-5 (possibly the Atom-W, depending on the final layout) | Decided 2026-10-27; bag carrier is provisional |
| **Dobot Nova-2** | 2 | Coffee bar, in a single line of equipment. The two coordinate: one makes **milk tea**, the other **coffee** | Decided 2026-10-27 |

Stale wording to ignore: the task list (BUN-8…BUN-20, ENV-2, team focus "Nova-2 bag suction") still says a **Nova-2** does bag suction, and COF-9…COF-14 and `design/coffee_bar_3d/LAYOUT_GUIDELINES.md` describe a **Nova-5** on the coffee bar. Both predate the 2026-10-27 decision above. The ME6 and MG400 in the layout editor's robot library are design alternatives, not the chosen hardware.

### Team roles (from the task list; names intentionally omitted)

Final decisions; purchasing and layout confirmation; mechanical design (adapters, flanges, screens); 3D printing, fabrication and gripper parts; coffee bar; LLM and voice; ordering platform; Atom-W VLA; vision for Nova-5 pastry picking (also Atom-W integration and AMR); Nova-5 pastry-picking motion planning; bag suction. Several people are travelling between Canada and China around 2026-11-11.

---

## 2. Physical layout

Owner: `design/coffee_bar_3d/LAYOUT_GUIDELINES.md` (updated 2026-10-08). Summary:

- Footprint **5.00 m** customer-facing frontage × **3.75 m** deep. Directions are from a customer facing the bar: **left** = ordering and the Atom-W working area; **right** = coffee equipment; **front** = ordering and pickup; **back** = bun shelves with a refill aisle behind them.
- Access: a continuous **0.50 m** clear operator route to the coffee equipment, and a **0.60 m** refill strip behind the shelves (whether it is inside the 3.75 m depth is unconfirmed). Entry doors; operators press the E-stop before entering the robot area.
- Coffee bar: one line of equipment with machine fronts visible to customers; cup and lid dispensers in a **2 × 2 cluster** inside the line (paper cups, plastic cups, paper lids, fourth position reserved and undecided). The HZ-D01 tea machine in the layout files is a floor-standing reference (60 × 70 × 152 cm); whether it is the purchased milk tea machine is **not stated**.
- Frontage: a transparent barrier with a pickup opening, a tablet and a combined mic/speaker on an inclined housing.
- **Shelves:** **2 racks, 3 tiers each, 8 columns per tier.** Each tier holds two stainless-steel trays of **350 × 450 × 48 mm**, each with **4 channels** (450 mm across the rack, 350 mm front to back). About 40 cm tier spacing and a 10 cm back-to-front drop are adjustable references. The coffee platform routes Rack A tasks to the Nova-5 and Rack B tasks to the humanoid (`docs/3rd-party/platform.md`).
- **Packing table:** carries the tongs Nova-5, the suction Nova-5, the fixed suction backplate and bag holders (one per bag size). Bag size follows the order: **1 bun → small bag, 2–6 buns → large bag** (BUN-25b); at most 6 buns per order (ORD-2b).
- Open layout items: refill strip inside or outside the footprint, door locations, exact equipment order and spacing, dispenser cell assignment, measured tray clear widths, measured machine outlet positions.

---

## 3. End-to-end order flow

1. A customer orders on the tablet or by voice (LLM). The ordering platform (`coffee-platform`) creates the order, reserves inventory and a pickup counter, and expands each pastry unit into its own task. Drinks become coffee-bar sessions.
2. Pastry tasks: Rack A → Nova-5 (`nova5_arm`); Rack B → Atom-W (`humanoid_robot`). Both deposit into an open bag at the packing table.
3. **Atom-W loop per bun** (orchestrated by the GUI's **Order Flow** tab, `aio_atom-w_gui/ORDER_FLOW_DESIGN.md`): accept a Rack B task → AMR drives to the shelf tag → arm glides to the pre-pick configuration → **VLA grabs the bun** → retract and verify the bun is in the gripper → arm glides to the pre-drop configuration → AMR drives to the bag station → head camera finds the bag opening → **Bag Drop** planner (not the VLA) moves over the opening, releases and retracts → AMR returns to the shelf for more work or to the start tag. Progress and outcome are reported to the platform.
4. Bag side: Nova-5 #2 picks a bag from the holder, opens it against the fixed suction; the bag stays until all buns are in and the arms are clear; the filled bag goes to the pickup counter (carrier provisional, see §1).
5. Coffee bar: the two Nova-2s make the drinks; a pickup-area camera blocks robot motion into an occupied pickup spot (VIS-11/12, COF-14).
6. The order becomes READY when all parts are done; collection marks it COMPLETED.

Semantics already worked out in this repository (software only): retries are counted after the first attempt; navigation, VLA and whole-cycle retries have separate budgets; collision, crash or an unknown physical outcome causes a **hold**, not a blind retry; partially fulfilled orders keep their real successful quantity. See `docs/decisions.md`, `docs/humanoid-harness/FLOW.md`. The platform still has open defects around partial orders, completion replay and cancellation (`docs/master-verification-report.md`, I01–I07).

Note: `humanoid_harness` places buns into "counters 1–4", and its flow ends at a counter. That reflects the original brief; the current physical design drops buns into a bag at the packing table.

---

## 4. The Atom-W humanoid

### Hardware

- Dobot Atom-W (URDF variant "P3"). Two **7-DoF arms** (shoulder pitch/roll/yaw, elbow pitch/roll, wrist pitch/yaw), **torso yaw**, **3-joint lift**, **2-DoF head** (yaw, pitch), **differential-drive AMR base** (cannot strafe). Base footprint about 70 × 51 cm.
- Hands: 6-DoF dexterous hands (docs call them OHand/ROHand). Hand position feedback is effectively constant on this robot, so commanded-versus-measured finger residuals cannot detect a grasp.
- **Left wrist:** the dexterous hand was replaced by a **Lebai LMG-90** two-finger gripper with tongs (in place by 2026-10-25). Control is Modbus RTU over USB-RS485 (115200 8N1), driven directly from PC2, 0–100 % aperture. The mount transform and TCP are provisional and unmeasured (`aio_atom-w_gui/urdf/variants/atom_w_left_lebai/`). With the hand removed, that side's hand slots report out-of-range placeholder values; the GUI bridge handles this (VLA_BRIDGE D30).
- **Cameras** (all USB on PC2):
  - Head: Intel RealSense **D455**, serial 254822301804, plus the vendor's head stereo camera ("DECXIN", read from vendor shared memory).
  - Wrists: RealSense **D405** — left 260522279464, right 260622270925. This mapping was measured on the robot (AtomW-VLA `config/topology.env`) and matches the GUI docs. The vendor `teleop/teleop_config.ini` in the recorder repo labels them the other way round; the vendor hand cameras are disabled there (`use_hand_camera = False`), so do not take side assignments from that file.
  - No waist camera and no wrist force/torque sensor.
- **No software E-stop exists** on the Atom-W today (the vendor emergency-state message has no subscriber). A site-wide software E-stop for all robots is planned (BUN-26, COF-16, HUM-14, E2E-7b).

### Computers on the robot

- **PC2** is the developer onboard PC: Ubuntu 20.04, RTX 5000 Ada Embedded 16 GB, i9-13900HX. It runs the GUI, the recorder, the camera frame servers and the VLA stack (Docker). Addresses: robot network `192.168.8.13` (fixed); site Wi-Fi and office wired addresses are DHCP and change — current values are in `AtomW-VLA/config/topology.env`. Credentials are not recorded here.
- **PC1** is a vendor computer, referenced only by vendor docs (between PC2's teleop service and the phone app). None of the four repositories deploys code to it.
- Firmware state machine must be **FSM 2** (debug) for any motion; the FSM message is volatile and must be re-sent after a bridge starts.

### Conventions that cause real damage when wrong

- **Lift:** never jog or command the lift through general motion paths. A lift jog once pitched the robot forward violently and damaged hardware (`aio_atom-w_gui/LIFT_SAFETY.md`). Lift moves only through its own guarded saved-route API.
- **One commander at a time:** exactly one process may command the robot. Never run `robot.sh smoke|home|jog|initpos|setpos` while the GUI bridge is armed. The vendor remote counts as a commander.
- **Joint order:** head is `[head_yaw, head_pitch]` (yaw first). On the DDS wire, hand arrays are **right-first**; in our software, arms and hands are left-first. Recordings made before 2026-08-26 in the GUI have swapped head keys. Map joints by name, not by index, across repositories.
- **28-value layout** used by recordings and the VLA: `left_arm 0–6, left_hand 7–12, right_arm 13–19, right_hand 20–25, head 26–27`, radians. Hand columns within each 6 are pinky, ring, middle, index, thumb bend, thumb rotation. Source of truth: `AtomW-VLA/atomw_vla/common/joints.py`. The recorder's 32-value layout adds torso and the 3 lift joints in a different order (`dobot-teleoperate-recording/pastry_teach/joints.py`).
- **Joint limits are fixed once calibrated**: trained models normalise against them.
- **Vendor sync behaviour:** in teleoperation the vendor only publishes arm commands while "sync" is on, refuses sync if any joint is more than 90° off, and uses kp 200/kd 8 (kp 300/kd 15 on shoulders). Repeated right-shoulder/elbow overcurrent alarms (8752) happened on abrupt handovers.

### The VLA (learned grasping)

**Decided 2026-10-27:** the bun grasp is a VLA policy on the **left arm with the Lebai gripper and tongs**. The previous right-arm dexterous-hand VLA line (all "protocol A croissant" runs) is **discontinued**.

What this means for the code (none of it exists yet in `AtomW-VLA`):

- Action/state for the new policy: left arm 7 joints + 1 gripper aperture. The current default everywhere is the right arm with 13 values (`ACTIVE_SIDE="right"`, converter `--dims right13`, which also drops the `wrist_left` camera).
- The recorder already records the gripper per frame and its own converter emits `action.left_gripper` / `observation.left_gripper` (aperture ÷ 100, 0 = shut, 1 = open; train action on `sent_pct`, state on `meas_pct`). Reuse that contract.
- New data must be collected with the new trays and real donuts/croissants (HUM-6), then trained (HUM-7). **Acceptance: 99 % grasp success over 100 trials (HUM-8).**
- `AtomW-VLA/atomw_vla/sim/grab_harness.py` still models an old 40 × 30 cm basket and a dexterous hand.
- The GUI also contains a non-learned **Pick & Place → Lebai (Left)** page (segmentation + aiming IK). Its role in the final pipeline is not stated; the decision is that the VLA does the grasp.

Lessons from the discontinued right-hand line that are about the system, not the hand (details in `AtomW-VLA/docs/engineering/training_log.md`):

- Main model family is **π0.5 via openpi (JAX), full fine-tune**; GR00T N1.7 and ACT are fallbacks. Training is offline on the RTX 5090 training machine and rented AutoDL H800 instances; inference runs on PC2 in bf16 (fp32 does not fit in 16 GB).
- The wrist camera dominates target selection; the head camera mostly sees the robot's own hand.
- Starting posture (including torso/lift height) and shelf placement relative to the robot strongly affect success; recordings use a fixed start pose and a handover procedure ("protocol A").
- Inference output needs smoothing/blending to avoid joint jumps; acceptance gates and deployment profiles live in `AtomW-VLA/config/deploy_profiles.toml` and `docs/engineering/deploy_inference_quality.md`.
- Best documented real-robot result before the switch: 9 of 18 trials succeeded on the first grasp (2026-10-23, right hand, croissants).

### How the VLA runs on PC2

Docker, host networking (`AtomW-VLA/docs/setup/robot_deploy_setup.md`, entry script `scripts/pc2/robot.sh`):

- **bridge** container (Python 3.10, vendor `UpperControl`, CycloneDDS 0.10.5) serving JSON over TCP **:8447**. The GUI can host this bridge itself instead (VLA_BRIDGE design).
- **openpi** policy server, websocket **:8000** (GR00T server :5555 for that family).
- **run_inference** control loop, control port **:8448** used by the GUI's VLA Eval tab. Current docs give 30 Hz (recorder settings, GUI bridge design); the older AtomW-VLA setup guide says 20 Hz.
- The policy is fed measured joint state, not the last command.

---

## 5. Other subsystems

- **Nova-5 bun picking:** `nova5_ros2` (ROS 2 Humble, MoveIt 2, C++ node) + `bun-coordinate-server` (HTTP vision: `/detect`, `/aim`, `/grasp_check`, `/health`). Units differ across the boundary (metres/degrees in ROS results, radians for HTTP orientation, millimetres for widths). Tongs are Lebai on the Nova-5 as well. A ZED Mini on a permanent bracket feeds the bag stack-height algorithm (VIS-1…VIS-3, BUN-16).
- **Bag station:** Nova-5 #2 with an 80 × 80 mm four-cup suction tool; fixed opposing suction on a backplate; flat bags in passive holders. Stack-height algorithm and bag pipeline are tasks BUN-16 and BUN-20; bag-side error handling BUN-27b.
- **Coffee bar:** two coordinating Nova-2s (one milk tea, one coffee). The milk tea machine has been chosen and purchased; it has Modbus communication and a sugar dispenser among its features; its model is **not recorded here**. Which repository holds the coffee-bar control code is **unknown**.
- **Ordering platform:** `coffee-platform` (NestJS/Node, PostgreSQL/Prisma, REST + Socket.IO namespace `/socket-bridge`, API port 3001, kiosk and admin web UIs). Checkout is a mock; a real payment system is launch-only (ORD-1). `platform-client` (Python 3.10+) provides `hr_client` (humanoid protocol, external `PickExecutor` hook) and `vision_client`. Whether `coffee-platform` is the final ordering platform is **unknown**; descriptions here come from end-to-end-sim's 2026-09-18 review.
- **Voice/LLM ordering:** tablet plus a microphone and speaker built into the ordering counter; three languages; noisy-room testing; knowledge answers from company material; uses a cloud ASR API (E2E-7c tests network loss). Which repository holds it is **unknown**.
- **Other vision:** ceiling Hikvision camera + NVR for bun inventory counting (VIS-4…VIS-6); one product-presence camera over the pickup spots (model chosen in VIS-7, not recorded here); sharing the Atom-W head D455 stream with the LLM (HUM-3/HUM-4).
- **Automated charging** for the Atom-W is planned (HUM-13). The layout studio contains a charging dock with a 545 × 572 × 280 mm envelope.

---

## 6. Machines

| Machine | Where | OS | GPU | Used for |
|---|---|---|---|---|
| PC2 (robot onboard) | China lab, on the Atom-W | Ubuntu 20.04 | RTX 5000 Ada Embedded 16 GB | GUI, recorder, camera servers, VLA inference (Docker) |
| Training machine | China | Ubuntu 24.04 | RTX 5090 32 GB | VLA training (Docker only; never connects to the robot) |
| Workstation | Canada | Ubuntu 24.04 | RTX 5090 | Replay/visualisation, local GPU inference; also runs the voice stack, so GPU memory is shared |
| Sim/collection PC | China | Windows 11 | RTX 5080 | Isaac Sim 5.1 data collection with Quest 3 (`AtomW-VLA/scripts/sim/sim.bat`) |
| Developer Windows machine (workspace `D:\Work\FPS\Robotics`) | not stated | Windows 11 + WSL2 Ubuntu 22.04 | GUI docs record an RTX 5070 Ti used from WSL | Development; end-to-end-sim's ROS 2 Humble/PostgreSQL staging; cuRobo/GraspGenX servers |
| AutoDL rented instances | cloud (China) | Ubuntu 22.04 images | H800 | Large training runs; ledger in `AtomW-VLA/config/topology.env` |
| PC1 (vendor) | not stated | not stated | not stated | Vendor computer; no repository deploys to it |

Python environments that matter:

- PC2 conda env **`FPS-Atom`** runs the recorder; the recorder docs state it is **Python 3.8** because the vendor teleop `.so` files are cp38-only. The GUI docs launch from `FPS-Atom` and also state the robot runs Python 3.12. Which interpreter each GUI launcher actually uses is **unresolved**; check on the robot before installing packages.
- VLA training/inference: Docker images only (Python 3.12, torch 2.7.1+cu128, lerobot 0.6.1, openpi JAX). Do not create host conda environments for it.
- End-to-end-sim: Python 3.10+, standard library for the harness; ROS 2 Humble and Node 22 in WSL for the integration runs.

Repositories are on GitHub. How code reaches PC2 is described differently by repository (git bundle in the recorder README; `git fetch` in the GUI docs); follow the target repository's README.

---

## 7. Networking and ports (PC2 unless stated)

| Port | Service |
|---|---|
| 8447 | VLA DDS bridge (JSON lines over TCP) |
| 8448 | VLA run_inference control port |
| 8000 | openpi policy server (websocket) |
| 5555 | GR00T policy server |
| 5000 | RealSense frame server, protocol 1 (colour only) |
| 5001 / 5002 / 5003 | Frame servers protocol 2: head D455 / right wrist / left wrist |
| 8765 | GUI Head API (Socket.IO) |
| 8767 | GUI Body API |
| 8449 / 8769 | GUI scenario sim world port / viewer |
| 8012 | Vendor VR teleop web page (`https://192.168.8.13:8012`) |
| 3001 | coffee-platform API / Socket.IO `/socket-bridge` |
| 5556 / 5560 | GraspGenX / cuRobo servers (developer box) |
| 8766 | end-to-end-sim layout studio (`design/coffee_bar_3d/serve_viewer.py`) |

DDS: CycloneDDS on the robot network interface (`enp111s0` on PC2). Topics include `rt/upper/{cmd,state}`, `rt/lower/{cmd,state}` (lift), `rt/hands/{cmd,state}`, `rt/amr/{cmd,state}`, `rt/set/fsm/id`.

---

## 8. Repositories

| Repository | What it is | Start with |
|---|---|---|
| `end-to-end-sim` (this one) | (a) Software simulator of the humanoid pick loop and platform protocol, with recovery/hold semantics and acceptance runs against the real platform client; (b) the café **Layout Studio** (browser and Electron) with reach, IK, collision and flow previews | `README.md`, `design/coffee_bar_3d/LAYOUT_GUIDELINES.md`, `design/coffee_bar_3d/EDITOR_GUIDE.md` |
| `AtomW-VLA` | VLA data conversion, training and on-robot deployment for the Atom-W; Isaac Sim collection | `CLAUDE.md` (Chinese), `docs/engineering/training_log.md`, `config/README.md`, `scripts/README.md` |
| `aio_atom-w_gui` | PySide6 all-in-one Atom-W GUI on PC2: joints, cameras, AMR, IK/motion planning, VLA Eval, Bag Drop, **Order Flow**, Lebai pick & place, plus Body/Head APIs and a scenario sim | `README.md`, `AGENTS.md`, `docs/ATOMW_PIPELINE_HANDOFF.md`, `ORDER_FLOW_DESIGN.md` |
| `dobot-teleoperate-recording` | VR teleoperation recorder (Quest 3, vendor stack) that records LeRobot-convertible episodes with depth and the head D455, the protocol-A start-pose/handover procedure, per-hand gripper support, and a motion library | `README.md`, `OPERATOR_GUIDE_zh.md` (operators), `LEFT_GRIPPER_HANDOFF.md` |
| `coffee-platform`, `platform-client`, `nova5_ros2`, `bun-coordinate-server`, `robo-cvstudio`, `realsense_frame_server`, `nova5-calib`, `curobo` | Ordering platform, platform clients, Nova-5 ROS stack and vision, synthetic vision studio, shared camera server, Nova-5 calibration/Lebai driver origin, motion planner | Not in this workspace; summarised in `docs/3rd-party/` as of 2026-09-18 |

Vendor material: `AtomW-VLA/docs/dobot_docs/` (PDF manuals). Some of those PDFs may describe other Atom models (for example a legged startup guide and a 29-DoF joint table); verify with the vendor before relying on them. The vendor navigation stack is proprietary (topological map), not ROS 2 Nav2. Licensed subsets of vendor code that are Apache-2.0 are vendored in `AtomW-VLA/third_party/`; do not push other vendor code to GitHub.

---

## 9. Rules stated in the repositories

Each repository has its own agent rules; read them before editing it. They differ on commit/push permissions and coding style.

- `aio_atom-w_gui/AGENTS.md`: never run hardware motion as validation; a commit does not authorise a push; pure-ASCII Python and the project's coding checks.
- `AtomW-VLA/CLAUDE.md` (Chinese): everything runs in Docker; runtime output and logs in English; paths must not contain Chinese characters (vendor data tools fail); hardware parameters must be checked against the vendor PDFs, not memory.
- `dobot-teleoperate-recording/LEFT_GRIPPER_HANDOFF.md`: one-line shell commands, pure-ASCII Python 3.8 source, no commit or push unless asked.
- `end-to-end-sim/README.md`: use fresh isolated state per independent test; captured journals, ledgers and databases are evidence and must not be edited to force a result.
- Secrets (tokens, passwords) live in each machine's git-ignored `.env` or with the owner; do not commit them or copy them into docs.

---

## 10. Known stale or conflicting statements

| Where | Says | Current |
|---|---|---|
| Task list (BUN-8…20, ENV-2, team focus) | Nova-2 does bag suction | Nova-5 #2 does bag suction |
| Task list (COF-9…14), `LAYOUT_GUIDELINES.md` | Nova-5 on the coffee bar | Two Nova-2s on the coffee bar |
| `AtomW-VLA/README.md`, parts of its `CLAUDE.md` | Right arm, dexterous hand, separate place policy, GR00T as the main model | Left arm + Lebai gripper; grab only; π0.5/openpi is the main family |
| `humanoid_harness` flow | Bun placed into counters 1–4 | Bun dropped into an open bag at the packing table |
| `layouts/coffee-bar-nova5-floor-tea.json` | L-shaped counter proposal | Superseded by the single-line requirements |
| Recorder `teleop/teleop_config.ini` | Left/right D405 serials swapped | Measured mapping in §4 |
| `ORDER_FLOW_DESIGN.md`, `VLA_BRIDGE_DESIGN.md` headers | "Nothing here is built/implemented" | Both are built (GUI README and later decisions) |

---

## 11. Open questions

- Whether the filled bag is carried to the counter by a Nova-5 or the Atom-W (final layout).
- Whether packaged pastries may be used for the Atom-W (ENV-18).
- Left-arm VLA: data collection procedure with the gripper, action layout implementation, Lebai mount/TCP calibration.
- Coffee-bar control repository; milk tea machine model and protocol details; coffee machine models.
- Repositories holding the voice/LLM stack and the final ordering platform.
- Product-presence camera model; layout items listed in §2.
- Which Python interpreter the GUI launchers use on PC2 (§6).
- Real values for AMR tags, pre-pick/travel/pre-drop poses, retry budgets and operator rescue procedure (still simulation placeholders in `humanoid_harness`).

---

## 12. Glossary

- **VLA:** vision-language-action policy; here π0.5 via openpi unless stated.
- **Protocol A:** the recorder's fixed-start-pose recording procedure with a smooth handover from robot hold to operator control.
- **Leg:** a registered training run configuration in `AtomW-VLA/config/openpi/legs.toml`.
- **Deploy profile:** a named inference configuration in `AtomW-VLA/config/deploy_profiles.toml`.
- **Bag Drop / Order Flow / VLA Eval:** tabs in `aio_atom-w_gui`.
- **FSM 2:** the Atom-W firmware state that allows motion from PC2.
- **Rack A / Rack B:** the two bun racks; the platform routes A to the Nova-5 and B to the Atom-W.
- **Counter:** a pickup destination in the platform (1–4); same thing as "box" in the platform's terms.
