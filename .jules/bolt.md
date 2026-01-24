## 2024-05-23 - Mocking Infinite Loops
**Learning:** Mocking hooks like `useMap` with a function that returns a new object on every call can trigger infinite re-render loops in components that use the hook return value in `useEffect` dependencies.
**Action:** Use a stable object reference (defined outside the mock factory or using `const`) when mocking hooks that return objects.

## 2024-05-23 - React Leaflet ESM Testing
**Learning:** `react-leaflet` v4 is ESM-only and causes syntax errors in standard Jest environments. `jest.mock` with `requireActual` fails because it tries to parse the ESM module.
**Action:** Completely mock `react-leaflet` components with simple div replacements and do not use `requireActual`.
## 2024-05-23 - DeepSource Mocking
**Learning:** `jest.mock` factories are hoisted above imports, so `require` is necessary to load modules like `react`. DeepSource flags this as a violation (`JS-C1003`).
**Action:** Use `// skipcq: JS-C1003` inside mock factories to suppress this specific warning instead of rewriting mocks unnecessarily.
## 2024-05-23 - Mock Class Linting
**Learning:** Mock classes often trigger 'empty class' or 'method not using this' linter rules.
**Action:** Use `// skipcq: JS-0323` (no this) and ensure classes have at least one constructor or member to satisfy `JS-0045`.
## 2024-05-23 - Linting Mock Classes
**Learning:** Suppressing linter warnings for empty mock classes or methods requires specific codes (e.g., `JS-0105` for missing `this`, `JS-0327` for empty class). Returning `this` in mock methods is a cleaner fix than suppression for fluent interfaces.
**Action:** Always prefer implementing minimal mock logic (like returning `this`) over suppression when possible.
## 2024-05-23 - DeepSource Correct Suppression Codes
**Learning:**
- `JS-0359`: Use this code to suppress strict mode violations for `require` statements inside `jest.mock` factories. `JS-C1003` is incorrect/deprecated for this specific linter rule.
- `JS-0019`: Use this code to suppress warnings for usage of the `any` type.
**Action:** Always verify the exact DeepSource code (e.g., from the dashboard or error message) before applying suppressions.
