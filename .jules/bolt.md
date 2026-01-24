## 2024-05-23 - Mocking Infinite Loops
**Learning:** Mocking hooks like `useMap` with a function that returns a new object on every call can trigger infinite re-render loops in components that use the hook return value in `useEffect` dependencies.
**Action:** Use a stable object reference (defined outside the mock factory or using `const`) when mocking hooks that return objects.

## 2024-05-23 - React Leaflet ESM Testing
**Learning:** `react-leaflet` v4 is ESM-only and causes syntax errors in standard Jest environments. `jest.mock` with `requireActual` fails because it tries to parse the ESM module.
**Action:** Completely mock `react-leaflet` components with simple div replacements and do not use `requireActual`.
## 2024-05-23 - DeepSource Mocking
**Learning:** `jest.mock` factories are hoisted above imports, so `require` is necessary to load modules like `react`. DeepSource flags this as a violation (`JS-C1003`).
**Action:** Use `// skipcq: JS-C1003` inside mock factories to suppress this specific warning instead of rewriting mocks unnecessarily.
