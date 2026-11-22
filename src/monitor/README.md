# Monitor domain

`src/monitor` contains Monitor data contracts, upstream weather/alert adapters,
layer configuration, normalization, map synchronization helpers, and the
co-located UI under `src/monitor/components`.

The Monitor mesoscale display reads the provider catalog through `src/mesoscale`
and persists only its selected model, layer IDs, and opacity values in the
existing `gfc-monitor-settings` object. Older settings receive HRRR and an empty
layer list during normalization. It does not read or write editable Mesoscale
workspace state.

Keep upstream failures and stale data explicit at this boundary. Keep generic
presentation primitives in `src/components/ui`; Monitor-specific components
belong under `src/monitor/components`. Update monitor fixtures and colocated
tests when a normalized shape changes.
