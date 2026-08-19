- **TCP transport and GRBL streaming protocol (#14)**: the server can now talk
  to a network GRBL 1.1 / grblHAL / FluidNC controller (raw TCP, port 23,
  TCP_NODELAY). Streaming uses character-counting flow control against the
  128-byte RX ring — the planner stays fed on short segments without ever
  overflowing the controller — with realtime `?`/`!`/`~`/`0x18` bypassing the
  queue, `$$` settings read on connect, per-line progress, and hard guarantees
  on the ugly paths: `error:N` aborts reporting the exact failing line, soft
  reset tears down the un-acked ledger (no post-reset deadlock), and a dropped
  connection fails the job instead of hanging it.
