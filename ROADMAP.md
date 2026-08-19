# Roadmap

Conventions: effort **S/M/L**, value **High/Medium/Low**. Every release ends
with a **concrete demo** and a `VERSION` bump + git tag. One milestone per
release. `FEATURE_CATALOG.md` holds the full map against LightBurn; this file
holds the order.

## v0.1.0 — MVP: cut an SVG over the network

**Goal:** load an SVG, assign power/speed per color layer, frame it, and cut it
on a GRBL 1.1 / grblHAL / FluidNC laser connected via TCP (port 23).

| Feature | Effort | Value | Notes |
|---|---|---|---|
| Repo scaffolding, CI, process docs | S | High | This file, templates, changelog.d, workflows |
| core: IR (Document/Layer/Shape/Toolpath) | S | High | The contract everything else consumes |
| core: SVG parser (viewBox, units, nested transforms, primitives→path, layers by stroke color) | L | High | No `use`/`defs`, no text, no external CSS in MVP |
| core: flattening (svgpath + bezier-js, adaptive tolerance) + Y-flip + mm | M | High | Collinear simplification to keep G-code small |
| core: planner (inner-first containment + nearest-neighbor) | M | High | Cut holes before outlines |
| core: G-code emitter (GRBL laser dialect) | S | High | G21/G90, M4 dynamic power, S scaled by $30 |
| server: TCP transport + GRBL protocol (character-counting streaming, realtime `? ! ~ 0x18`, `$$` read) | L | High | The heart of the MVP |
| server: GRBL simulator over TCP | M | High | Built BEFORE the protocol; tests + hardware-less dev |
| server: REST + WebSocket API | M | High | jobs, device, jog, frame; live status/progress |
| web: workspace canvas + layer panel + device panel | L | High | |
| web: jog/home/framing, console, start/pause/stop, progress + time estimate | M | High | Estimate from $$ accel/rate (trapezoidal model) |
| E2E: Playwright against server + simulator | M | Medium | load → configure → "cut" on sim |

**Demo:** open the UI, load `demo.svg`, set the red layer to 80% / 500 mm/min,
connect to the laser's IP, frame, press Start, watch progress, get a cut part.

## v0.2.0 — Quality of life (tentative)

Raster engraving (image dithering), USB serial transport, job time estimate
refinements, material presets (save/load layer settings), path optimization
options panel. To be re-planned after v0.1.0 ships.

## Later (unordered backlog)

Vector editor (nodes, boolean ops, text), Ruida/CO2 backend (UDP, .rd format),
camera, rotary, offset fill/kerf (clipper), multi-language UI, desktop packaging
(Tauri wrapper around the same packages).

## Plan summary

| Release | Focus | Status |
|---|---|---|
| v0.1.0 | MVP: SVG → network GRBL cut | 🚧 in progress |
| v0.2.0 | Raster + serial + presets | ⬜ planned |

## Hygiene rule

A milestone is only trustworthy if issues close when their work lands on
`main` — link PRs with `Closes #N` (English keyword; CI enforces it).

## Not in the plan (intentionally)

- **Self-hosted CI runners** — repo is public; arbitrary PR code on a
  self-hosted runner is a known risk (documented in the parent project's guide).
- **npm/Docker publishing** — until v0.1.0 there is nothing an end user would
  install; revisit then.
- **Feature parity checklist chasing** — parity with LightBurn is the horizon,
  not the sprint plan; each release must stand on its own demo.
- **xTool proprietary protocol** — needs reverse engineering; out until the
  GRBL path is solid.
