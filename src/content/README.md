# Product content

`src/content` contains static product content used by the application. Keep
content declarative and separate from route composition, feature exposure, and
domain state.

Release notes and pricing no longer live in the app. They are published on the
marketing site (`marketing/src`, see `docs/agents/codebase.md`); the app's
`/pricing` and `/updates` routes redirect there through `ExternalRedirect`.
