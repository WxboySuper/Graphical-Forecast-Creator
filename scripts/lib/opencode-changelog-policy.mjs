/** Check that the model result agrees with the PR's trusted impact decision. */
export const assertOpenCodeChangelogResultEligible = (result, { isDependabot, impact }) => {
  const eligible = {
    complete: impact !== 'none',
    'no-change': isDependabot && impact === 'none',
  };
  if (eligible[result.status]) return;
  const errors = {
    'no-change': 'OpenCode may return no-change only for a Dependabot PR declared Changelog-Impact: none.',
    complete: 'OpenCode returned a changelog entry for a PR declared Changelog-Impact: none.',
  };
  throw new Error(errors[result.status] ?? 'OpenCode could not produce a sufficiently grounded changelog entry; add it manually and rerun CI.');
};
