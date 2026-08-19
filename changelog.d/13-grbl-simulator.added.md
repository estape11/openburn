- **GRBL 1.1 simulator over TCP (#13)**: `npm run sim` now serves a fake GRBL
  controller on `127.0.0.1:2323` so the protocol client, the UI and CI can all
  work without a laser. It models what senders get wrong on real hardware: the
  128-byte RX buffer (overflow raises an assertable event instead of silently
  corrupting commands), realtime bytes (`?`, `!`, `~`, `0x18`) intercepted
  mid-stream, `$$` settings dump, motion tracking in status reports, and
  on-demand `error:N`/`ALARM:N` injection.
