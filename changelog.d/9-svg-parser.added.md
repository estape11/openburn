- **SVG import (#9)**: `@openburn/core` can now parse an SVG document into the
  IR — viewBox and physical units (mm/cm/in/pt/px) resolved to millimeters,
  nested transforms composed correctly, all primitives (rect incl. rounded,
  circle, ellipse, line, polyline, polygon) reduced to path form with arcs
  normalized to cubics, and shapes grouped into layers by stroke color (fill as
  fallback). Unsupported content (`use`/`defs`, text, images, CSS beyond inline
  `style`) is reported as import warnings instead of being dropped silently.
