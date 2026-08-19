# OpenBurn

![version](https://img.shields.io/badge/version-0.0.1-blue)
![license](https://img.shields.io/badge/license-MIT-green)
![status](https://img.shields.io/badge/status-pre--alpha-red)

Open-source laser cutting and engraving software. The long-term goal is feature
parity with [LightBurn](https://lightburnsoftware.com/); the first milestone is
much smaller and much more useful than it sounds: **load an SVG, frame it, and
cut it on a GRBL laser connected over the network**.

> **Status: pre-alpha.** Nothing works yet. See [ROADMAP.md](ROADMAP.md) for
> what is coming and [FEATURE_CATALOG.md](FEATURE_CATALOG.md) for the full map
> against LightBurn.

## How it works

Browsers cannot open raw TCP sockets, so OpenBurn ships as a small local server
plus a web UI (the CNCjs / LaserWeb model):

```
Browser (Vue 3 UI) ──HTTP/WebSocket──> OpenBurn server (Node) ──TCP:23──> GRBL laser
                                       (runs on your PC or a Raspberry Pi
                                        next to the machine)
```

| Package | What it is |
|---|---|
| `packages/core` | Pure TypeScript, no I/O: SVG parsing → intermediate representation → path planning → G-code generation. Runs in Node and the browser. |
| `packages/server` | Node server: TCP transport, GRBL protocol (character-counting streaming, real-time commands), REST + WebSocket API, GRBL simulator. |
| `packages/web` | Vue 3 + TypeScript UI: workspace canvas, color-mapped layers, device panel, jog/framing, job control. |

**Supported controllers (MVP):** GRBL 1.1 / grblHAL / FluidNC over TCP port 23
(telnet-style). This covers most modern diode lasers with network modules
(Sculpfun, Ortur, Atomstack, Creality Falcon, ESP3D bridges…). Ruida (CO2) and
USB serial are planned — the transport layer is an interface for that reason.

## Quickstart (development)

Requires Node 22 (`nvm use` reads `.nvmrc`).

```bash
npm ci
npm run sim     # GRBL simulator on localhost (develop without hardware)
npm run dev     # server + UI
npm test
```

## Contributing

Read [DEVELOPMENT_GUIDE.md](DEVELOPMENT_GUIDE.md) first — it defines the
workflow (GitHub Flow, one issue = one PR), commit conventions, testing rules
(mutation-verified tests) and code conventions. Issues use the templates; PRs
use the template including the "Findings during development" section.

**License note for contributors:** OpenBurn is MIT. Porting algorithms from
MIT-licensed projects ([meerk40t](https://github.com/meerk40t/meerk40t),
[CNCjs](https://github.com/cncjs/cncjs)) is welcome with attribution. Do **not**
copy or closely paraphrase code from AGPL/GPL projects (e.g. LaserWeb4,
LaserGRBL).

## License

[MIT](LICENSE)
