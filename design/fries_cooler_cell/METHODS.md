# Fries cooler cell: method comparison

Both methods move a 1 kg batch of frozen fries from a conveyor into an insulated cooler, hold it for an RTD temperature reading, then dump it into a disposal bin. Both run in the 3D scene: use the **Method** selector, or `?method=A` / `?method=B`. Method B also takes `&tilt=45|90|120`.

- **A · Belt-fed scoop.** The Nova-5 sets a 2.8 L scoop lip-down on the belt. A high-throughput stream feeds 1 kg into its 140 mm mouth; there is no funnel, so the rest of the stream passes beside it. The robot carries the scoop level and pours it over the lip into the custom stainless cooler, whose air-cylinder lid opens on its own.
- **B · Soft-gripper handfuls.** The Nova-5 carries a 90° dual-gripper adapter with a 5-finger soft claw and a 2-finger soft gripper. The claw takes handfuls off a dense stream and drops them into an off-the-shelf ICERS 6 L cooler. The 2-finger gripper opens and closes its lid. The cooler sits on a platform that tilts to dump into a bin beside it.

## Comparison

Times come from this simulation. Grab weights and fill rates are estimates that need product tests.

| | A · Belt-fed scoop | B · Soft-gripper handfuls |
|---|---|---|
| Transfers per kg | 1 scoop | ~5–10 grabs at ~100–200 g each (the scene shows 5 × 200 g) |
| Cycle in this model | 26 s; robot busy ~16 s | 52 s: ~25 s grabbing, ~11 s working the lid, plus the tilt dump |
| Lid | Air cylinder; opens while the robot travels; open ~7 s per batch | Robot-operated; open ~27 s while grabbing, so more warm air gets in |
| Hitting 1 kg | One shot: belt run time or a load cell under the belt | Can top up grab by grab against a load cell under the cooler |
| Feed | Without a funnel, about half the stream passes the 140 mm mouth and must be recirculated (0.5 kg overflow per kg in the scene) | Most of the dense stream passes the pick point and must be recirculated (~1.1 kg per kg in the scene) |
| Product handling | Belt pushes fries in, no squeezing; poured at a 55° tip | Fingers squeeze frozen fries (check breakage); fries drop ~12 cm |
| Robot reach | The pour is at the Nova-5's limit: only a 55° tip, lip pointing away from the robot | Easy: the claw points down; the lid edge is close to the robot |
| Cooler | Custom stainless, 150 mm cube (3.4 L), 25 mm insulation, washable | ICERS 6 L PU, 23 × 14 × 15 cm inside, off the shelf, plastic |
| Dumping | Bottom door (design TBD); gravity empties it fully | Tilt platform; **45° dumps nothing** (see below) |
| RTD | Through the stainless wall, tip 40 mm above the floor | Drilled through the PU wall and sealed; the cable must flex with the tilt |
| Hygiene | Stainless scoop and cooler | Silicone fingers must be food-grade and rated for −18 °C contact; more parts to clean |
| Payload | Scoop + 1 kg fries ≈ 2 kg (Nova-5 rated 5 kg) | Adapter + two hands (weights not yet known) + ~0.2 kg fries |
| Hardware | Custom fabrication: cooler, lid cylinder, bottom door | Mostly catalogue parts (ROCHU, SMC), plus a tilt platform and drive |
| Main risks | Fries jamming at the scoop side walls; spills while pouring | Lid latches; grab-weight scatter; dump angle |

## Findings for method B

### The 45° tilt does not empty the cooler

The fries slide off the floor, but then come to rest against the low side wall. They only leave over the rim once the pile rises above it. The scene models this: fries leave only from above a free surface at a ~33° angle of repose, rising into the box from the lower rim. Results for the 1 kg batch in the ICERS (about 65 mm deep):

| Tilt | Dumped | Left in the cooler |
|---|---|---|
| 45° (proposed) | 0.00 kg | 0.99 kg |
| 90° | 0.77 kg | 0.22 kg |
| 120° | 0.99 kg | 0.00 kg |

A full dump needs about 120° or more. At that angle:

- **Lid:** it must be held open by a stay or strut, because at 120° gravity no longer keeps it back.
- **Cooler:** it must be clamped to the platform.
- **Drive:** a rotary drive at the hinge suits this better than a linear actuator under the platform. The scene shows a rotary drive.
- **Bin:** it must sit low enough to clear the inverted cooler.

### Lid latches

The stock ICERS over-centre latches need a pull, a snap and a large arc. That is hard for a soft 2-finger gripper and costs robot time.

The scene assumes the latches are replaced with magnetic catches. The gripper then just lifts and lowers the lid. It grips the lid's robot-side edge 150 mm from the hinge and rides up with it to 100°.

Without latches the gasket is only compressed by the lid's weight and the magnets. Check the seal, or add a light hold-down.

### RTD hole and sealing (your gasket question)

Yes, seal it. Drill through the outer shell, the PU foam and the inner liner, and:

- **Fitting:** mount the probe in a compression cable gland on the outside, or in a thermowell with a gland, so it can be replaced.
- **Inner liner:** seal the hole around the probe with food-safe silicone.
- **Foam bore:** seal the bare PU inside the bore too, so moisture can't get into the foam and freeze there.
- **Position:** keep the tip about 40 mm above the floor so it sits in the product.

The lid already has its own gasket, the black ring in the photo.

I took "RTU sensor" to mean an RTD (resistance temperature detector). If you meant a Modbus RTU device, tell me and I'll change it.

## Parts list review (method B)

Conflicts with the description, or within the list:

1. **Two 2-finger grippers.** Items 3 (BMC-2GN4087[H]/MN, straight-through mount) and 11 (BML-2GN4087[H]/MN, side mount) are both listed, but the method has one 2-finger hand. BMC suits a 90° adapter face; BML only makes sense if the hand must sit on its side. The /MN suffix is unverified for both; only /M was found.
2. **Two controllers.** Item 2, RCU-21MPP-01, couldn't be verified. Item 13, LCU-E2 with the item 12 EK-PV regulator, is confirmed and is the two-module version: one channel for the claw and one for the 2-finger gripper. One of them is probably redundant.
3. **Finger kit mismatch.** Item 7 is PK-BV5, but ROCHU's page for the FM-B8V4 finger (item 6) calls for PK-BV4.
4. **Orphan plugs.** Item 8, PN-268, comes from the PK-CP191 kit for the CP-191 connecting flange. Item 9, PN-175, belongs to the P-R3030 profile. Neither the CP-191 nor the P-R3030 is on the list, so either parts are missing or these plugs aren't needed.
5. **Finger travel.** The catalogue gives 37 mm outward travel (vacuum) and 61 mm inward (pressure) per finger, not 74 mm. This sets how wide the claw opens, and so how much one grab can take.
6. **Adapter.** RMA-02-90 wasn't found. The SMC RMMA1-20T090-E reference is rated 20 kg, not 25 kg. That rating doesn't limit anything here, because the Nova-5's 5 kg payload does; the adapter's own weight and offset matter more. A plate matching the Nova-5's tool flange is also needed.
7. **FCM-R08 and SMP-5L.** No per-finger flow adjustment is documented, so all five fingers act together, which is fine for a claw. The food-grade, ISO 50 and 5 kg claims for the SMP-5L aren't backed by its datasheet.

Not on the list but needed:

- **RTD:** a Pt100 probe, cable gland and sealant, plus an input for it (transmitter or PLC card).
- **Air:** compressed air, and vacuum for opening the fingers. Check whether the LCU-E2 generates vacuum itself.
- **Tilt platform:** rotary drive, bearings, frame, cooler clamp and lid stay.
- **Cooler:** the ICERS 6 L itself, and magnetic catches to replace the latches.
- **Robot side:** a flange adapter plate, and hose and cable management along the arm.
- **Fingers:** a material rated for direct contact with −18 °C food; check ROCHU's temperature range.
- **Scale:** a load cell, if the batch is topped up to 1 kg grab by grab.

## Assumptions in the scene

- **Adapter geometry:** both output faces sit 45° off the flange axis, 90° apart.
- **Claw:** five fingers about 90 mm long, on a 34 mm radius.
- **2-finger gripper:** fingers about 87 mm long.
- **Grabs:** 36 fries (≈200 g) per grab, from a dense patch at the pick point; the belt indexes 120 mm between grabs.
- **Lid:** opens to 100°, with a lid stay assumed for the tilt.
- **Cooler steady state:** the cycle starts with the lid open, left that way after the previous dump.
- **Dump model:** an angle-of-repose rule (33°), not a granular simulation.
