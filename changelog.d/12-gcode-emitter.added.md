- **G-code emitter (#12)**: jobs now compile to GRBL laser programs — `G21/G90`
  header, `M4` dynamic power (M3 available), `S` scaled from percent by the
  machine's real `$30`, `G0` travels and `G1` cuts with modal economy (`F`/`S`
  only on change, unchanged axes omitted, zero-length moves dropped) so the
  stream stays small for the 128-byte controller ring. With this, the whole
  core pipeline closes: **SVG in → cuttable program out**, pinned by a golden
  end-to-end test.
