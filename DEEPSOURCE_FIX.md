Fix all 71 DeepSource issues in this codebase. Work in the current branch (feature/test-coverage-per-file).

Rules:
- Fix ONLY the code quality issues, NOT the test logic
- Run `npm test` after to verify nothing breaks
- Commit after each group of fixes
- Work through ALL 71 issues

Issue patterns to fix:

1. JS-0400 (boolean attrs): Change `open={true}` → `open`, `isOpen={true}` → `isOpen`, `allowSignUp={true}` → `allowSignUp`, `canSave={true}` → `canSave`, `premiumActive={true}` → `premiumActive`, `isExpiredPremium={true}` → `isExpiredPremium`, `isLoading={true}` → `isLoading`, `viewOnly={true}` → `viewOnly`
2. JS-0116 (async without await): Remove `async` from `act(async () => {` where there are no actual await calls
3. JS-0323 (any types): Replace `: any` with properly typed interfaces in mock declarations
4. JS-0321 (empty arrow functions): Replace `() => {}` with `() => undefined`
5. JS-0356 (unused vars): Remove `originalLocation` and unused `result` variables
6. JS-0339 (non-null assertion): Replace `cycle1Button!` with proper null check
7. JS-D1001 (missing doc comment): Add JSDoc to `hasData` function in CycleHistoryModal
8. JS-0424 (useless fragment): Remove `<>...</>` fragment wrapper in CopyFromPreviousModal.tsx body
9. JS-0117 (regex without u flag): Add 'u' flag to regex in CycleManager.test.tsx
10. JS-W1042 (redundant undefined): Remove `undefined` from `mockResolvedValue(undefined)`

Files affected:
- src/billing/EntitlementProvider.test.tsx
- src/components/Beta/BetaAuthCard.test.tsx
- src/components/CloudCycleManager/CloudSaveLoadModals.test.tsx
- src/components/CloudCycleManager/CloudToolbarButton.test.tsx
- src/components/CycleManager/CopyFromPreviousModal.tsx
- src/components/CycleManager/CycleHistoryModal.tsx
- src/components/CycleManager/CycleManager.test.tsx
- src/components/Layout/AppLayout.test.tsx
- src/components/PrivacyPolicy/PrivacyPolicyModal.test.tsx
- src/components/Toast/Toast.test.tsx
- src/components/Toolbar/ToolbarPanel.test.tsx
