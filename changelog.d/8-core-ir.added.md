- **Intermediate representation for designs and toolpaths (#8)**: `@openburn/core`
  now defines the project's data contract — `Design → Layer → Shape` on the
  import side and `Polyline → Toolpath → Job` on the machine side. The Toolpath
  seam is what will let non-G-code backends (Ruida) plug in later without
  touching the CAM. Includes deliberately timid `DEFAULT_LAYER_SETTINGS`
  (20% power / 1000 mm/min) so an unconfigured layer marks material instead of
  burning it.
