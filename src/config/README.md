# Configuration and exposure

This boundary owns build targets, the feature-exposure registry and its
selectors, navbar navigation metadata, gated route surfaces, runtime
server-capability status, exposure diagnostics, and the vendored GeoJSON
boundary dataset sources. Firebase and Sentry setup live outside this folder.

Exposure policy is fail-closed for hosted capabilities. Keep access decisions
centralized here and in `src/features`; do not duplicate entitlement or target
checks inside unrelated UI. Update policy fixtures and exposure tests with
every registry change.
