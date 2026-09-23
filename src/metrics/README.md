# Client metrics

`src/metrics` owns `useUserMetrics` and its tests. The hook reads the
signed-in user's hosted `userMetrics` document (activity streak, total active
days, cycles created, cloud cycles saved, discussions written, verification
sessions run) and exposes it with loading and error state for the account
page. The hook only reads; it writes nothing and never feeds authorization or
feature-exposure decisions.

Without hosted auth the hook returns zeroed defaults. Update the metrics tests
when document fields, normalization rules, or load lifecycle behavior change.
