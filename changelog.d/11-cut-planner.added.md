- **Cut planner (#11)**: polylines are now ordered into an executable job —
  holes always cut before the outline that contains them (containment depth
  over closed paths, per layer), nearest-neighbor travel within each depth,
  layers by priority, output-off layers skipped, and per-layer passes. Cut
  moves carry their layer's power/feed so the job is self-contained for the
  emitter.
