- **Curve flattening and machine-space transform (#10)**: designs now flatten
  to polylines in machine coordinates — adaptive De Casteljau subdivision
  within a stated tolerance (default 0.02 mm; straights get 1 segment, tight
  curves get many), the single SVG→machine Y-flip, and collinear-point
  simplification so short-segment curves don't flood the controller's
  128-byte buffer downstream.
