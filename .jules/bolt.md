## 2024-05-23 - Mocking Infinite Loops
**Learning:** Mocking hooks like `useMap` with a function that returns a new object on every call can trigger infinite re-render loops in components that use the hook return value in `useEffect` dependencies.
**Action:** Use a stable object reference (defined outside the mock factory or using `const`) when mocking hooks that return objects.

## 2024-05-23 - React Leaflet ESM Testing
**Learning:** `react-leaflet` v4 is ESM-only and causes syntax errors in standard Jest environments. `jest.mock` with `requireActual` fails because it tries to parse the ESM module.
**Action:** Completely mock `react-leaflet` components with simple div replacements and do not use `requireActual`.
