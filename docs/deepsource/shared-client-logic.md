# Shared client logic documentation policy

The shared client layer is organized around small, purpose-specific modules rather than a single service boundary:

- `src/hooks/` coordinates React lifecycle state and user actions.
- `src/lib/` contains reusable validation, persistence, analytics, and domain helpers.
- `src/monitor/` adapts external observations into monitor state and map-ready data.
- `src/utils/` contains pure parsing, normalization, grading, and geometry operations.

These modules use descriptive names, typed parameters, and nearby module-level documentation for the contracts that are not obvious from a signature. Generic comments that only repeat a symbol name do not improve that contract and should not be added solely to satisfy JS-D1001.

The repository therefore skips generic DeepSource documentation coverage categories for these shared helpers. New documentation is expected when a function has behavior, invariants, failure modes, or integration rules that a reader cannot infer from its name and types.
