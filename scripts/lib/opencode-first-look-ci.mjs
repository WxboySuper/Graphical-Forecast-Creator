const DEFAULT_TIMEOUT_MS = 45 * 60 * 1000
const DEFAULT_POLL_INTERVAL_MS = 20 * 1000

export function findMatchingCiRun(runs, pullNumber, headSha) {
  return runs
    .filter((run) => run.event === 'pull_request' && run.head_sha === headSha &&
      run.pull_requests?.some((pull) => pull.number === pullNumber))
    .sort((left, right) => Date.parse(right.created_at) - Date.parse(left.created_at))[0] ?? null
}

export async function waitForMatchingCiRun({
  listRuns,
  getCurrentHead,
  pullNumber,
  headSha,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
  now = Date.now,
  sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
  onWait = () => {},
}) {
  if (!Number.isInteger(pullNumber) || pullNumber < 1) throw new TypeError('pullNumber must be a positive integer')
  if (!/^[a-f0-9]{40}$/i.test(headSha ?? '')) throw new TypeError('headSha must be a full commit SHA')
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new TypeError('timeoutMs must be positive')
  if (!Number.isFinite(pollIntervalMs) || pollIntervalMs <= 0) throw new TypeError('pollIntervalMs must be positive')

  const deadline = now() + timeoutMs
  let matchingRun = null
  while (now() < deadline) {
    if (await getCurrentHead() !== headSha) return { status: 'stale', run: matchingRun }

    matchingRun = findMatchingCiRun(await listRuns(), pullNumber, headSha)
    if (matchingRun?.status === 'completed') return { status: 'completed', run: matchingRun }

    const remaining = deadline - now()
    if (remaining <= 0) break
    onWait(matchingRun)
    await sleep(Math.min(pollIntervalMs, remaining))
  }

  throw new Error(`Timed out after ${timeoutMs}ms waiting for Checks | CI for PR #${pullNumber} at ${headSha}.`)
}
