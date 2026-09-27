const statusMessages = {
  'pr-opened': 'A changelog correction PR is open. Merge it, then rerun the release workflow.',
  inconclusive: 'The final changelog audit was inconclusive. Review it and rerun the release workflow.',
  running: 'The final changelog audit did not finish. Rerun the release workflow.',
};

/** Allow release steps only after a successful audit confirms there are no changelog gaps. */
export const evaluateChangelogReleaseGate = ({ auditResult, auditStatus, targetRef, auditedHead }) => {
  if (auditResult !== 'success') {
    return { ready: false, message: `Final changelog audit job ended as ${auditResult || 'unknown'}; release is blocked.` };
  }
  if (auditStatus !== 'clean') {
    return {
      ready: false,
      message: statusMessages[auditStatus] ?? `Final changelog audit status was ${auditStatus || 'missing'}; release is blocked.`,
    };
  }
  if (!/^(main|stable\/\d+\.\d+\.x)$/.test(targetRef ?? '') || !/^[a-f0-9]{40}$/i.test(auditedHead ?? '')) {
    return { ready: false, message: 'Final changelog audit did not provide a valid target and audited revision; release is blocked.' };
  }
  return { ready: true, message: `Changelog is clean for ${targetRef}@${auditedHead}.` };
};
