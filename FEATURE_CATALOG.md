# Feature Catalog — OpenBurn vs LightBurn

Reference competitor: **LightBurn** (docs.lightburnsoftware.com, as of v2.1,
checked 2026-08-18). This catalog is the map toward the 1:1 goal and the source
of issues. `ROADMAP.md` decides the order.

Legend: `✓` implemented · `~` partial · `✗` not implemented · `–` out of scope.
Cells reference the issue that would close them once one exists.

## A. Vector editing

| Feature | Description | OpenBurn |
|---|---|---|
| Primitive drawing | Rect, ellipse, line, polygon, path | ✗ |
| Node editing | Move/add/delete nodes, curve handles | ✗ |
| Boolean operations | Union, difference, intersection | ✗ |
| Shape offset | Inward/outward contour offset | ✗ |
| Text | System fonts, SHX, text on path, variable text | ✗ |
| Arrays / distribution | Grid & circular arrays, align/distribute | ✗ |
| Nesting | Quick Nest automatic layout | ✗ |
| Deformations | Taper warp, cylinder correction | ✗ |
| Undo history | Full history panel | ✗ |

## B. Import

| Feature | Description | OpenBurn |
|---|---|---|
| SVG | Paths, primitives, viewBox/units, nested transforms | ✗ (v0.1.0 target; no `use`/`defs`, text or external CSS in MVP) |
| AI / PDF | Adobe Illustrator, PDF vector import | ✗ |
| DXF | CAD interchange | ✗ |
| PLT/HPGL, RD, LBRN | Plotter / Ruida / LightBurn native files | ✗ |
| Raster images | PNG/JPG/BMP/GIF | ✗ |

## C. Layers & cut modes

| Feature | Description | OpenBurn |
|---|---|---|
| Color-mapped layers | Import color → layer with settings | ✗ (v0.1.0 target) |
| Per-layer settings | Power, speed, passes, output on/off | ✗ (v0.1.0 target: line mode only) |
| Fill / Offset Fill / Line+Fill | Scan filling of closed shapes | ✗ |
| Advanced per-layer | Min/max power, Z-step, air assist, overscan, tabs/bridges, ramp | ✗ |
| Tool layers | T1/T2 non-output layers | ✗ |
| Material library | Presets per material/thickness/operation | ✗ |

## D. Raster engraving

| Feature | Description | OpenBurn |
|---|---|---|
| Dithering | Jarvis, Stucki, Atkinson, ordered, halftone, newsprint | ✗ |
| Grayscale / pass-through | Power-mapped grayscale | ✗ |
| Image adjustments | Gamma, contrast, brightness | ✗ |
| Image trace | Raster → vector | ✗ |

## E. Machine control

| Feature | Description | OpenBurn |
|---|---|---|
| Network GRBL connection | TCP port 23 (GRBL 1.1 / grblHAL / FluidNC) | ✗ (v0.1.0 target) |
| Streaming | Character-counting protocol, realtime pause/resume/stop | ✗ (v0.1.0 target) |
| Jog / homing | Keyboard + buttons, step sizes | ✗ (v0.1.0 target) |
| Framing | Bounding-box outline at low power | ✗ (v0.1.0 target; contour framing later) |
| Console | Raw command send + log | ✗ (v0.1.0 target) |
| Machine settings editor | GRBL `$` settings UI | ✗ |
| USB serial | Direct serial connection | ✗ |
| Job origin control | 9-point job origin, absolute/current/user origin | ✗ (MVP: absolute coords only) |
| Ruida devices | UDP protocol, .rd job format (CO2 machines) | ✗ (transport interface designed for it) |
| Other controllers | Trocen, TopWisdom, GCC, galvo (EZCad) | ✗ |
| Camera | Lens calibration, workspace overlay, print & cut | ✗ |
| Rotary | Chuck/roller, axis substitution | ✗ |

## F. Preview & optimization

| Feature | Description | OpenBurn |
|---|---|---|
| Time estimate | Trapezoidal accel model from machine settings | ✗ (v0.1.0 target) |
| Cut order optimization | Inner-first, nearest-neighbor travel reduction | ✗ (v0.1.0 target; options panel later) |
| Simulation preview | Temporal playback, travel vs cut, scrubbing | ✗ |

## Summary

Implemented: **0** · Partial: **0** · v0.1.0 targets: **10** · Everything else
tracks the LightBurn horizon. The current gap, in order of user pain: (1) can't
talk to a machine, (2) can't import anything, (3) no layer settings, (4) no
raster, (5) no editor.
