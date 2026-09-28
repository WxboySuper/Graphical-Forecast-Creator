import test from 'node:test'
import assert from 'node:assert/strict'
import { findMatchingCiRun, waitForMatchingCiRun } from './opencode-first-look-ci.mjs'

const sha = 'a'.repeat(40)
const matchingRun = (overrides = {}) => ({
  event: 'pull_request',
  head_sha: sha,
  pull_requests: [{ number: 42, head: { sha } }],
  created_at: '2026-09-27T00:00:00Z',
  status: 'in_progress',
  conclusion: null,
  ...overrides,
})

test('selects only a CI run matching both PR and head SHA', () => {
  assert.equal(findMatchingCiRun([
    matchingRun({
      head_sha: 'b'.repeat(40),
      pull_requests: [{ number: 42, head: { sha: 'b'.repeat(40) } }],
      status: 'completed',
    }),
    matchingRun({ pull_requests: [{ number: 43, head: { sha } }], status: 'completed' }),
    matchingRun(),
  ], 42, sha)?.status, 'in_progress')
})

test('matches a synthetic merge-commit CI run by its associated PR head SHA', () => {
  const run = matchingRun({ head_sha: 'b'.repeat(40), status: 'completed', conclusion: 'success' })
  assert.equal(findMatchingCiRun([run], 42, sha), run)
})

test('waits in the current invocation until matching CI completes', async () => {
  let currentTime = 0
  let polls = 0
  const result = await waitForMatchingCiRun({
    pullNumber: 42,
    headSha: sha,
    timeoutMs: 10_000,
    pollIntervalMs: 1_000,
    now: () => currentTime,
    sleep: async (milliseconds) => { currentTime += milliseconds },
    getCurrentHead: async () => sha,
    listRuns: async () => [matchingRun({ status: ++polls < 3 ? 'in_progress' : 'completed', conclusion: polls < 3 ? null : 'success' })],
  })

  assert.equal(result.status, 'completed')
  assert.equal(result.run.conclusion, 'success')
  assert.equal(polls, 3)
})

test('returns completed failed CI so the review can inspect its result', async () => {
  const result = await waitForMatchingCiRun({
    pullNumber: 42,
    headSha: sha,
    getCurrentHead: async () => sha,
    listRuns: async () => [matchingRun({ status: 'completed', conclusion: 'failure' })],
  })

  assert.equal(result.status, 'completed')
  assert.equal(result.run.conclusion, 'failure')
})

test('stops waiting when the PR head advances', async () => {
  let currentTime = 0
  let headChecks = 0
  const result = await waitForMatchingCiRun({
    pullNumber: 42,
    headSha: sha,
    timeoutMs: 5_000,
    pollIntervalMs: 1_000,
    now: () => currentTime,
    sleep: async (milliseconds) => { currentTime += milliseconds },
    getCurrentHead: async () => (++headChecks < 2 ? sha : 'b'.repeat(40)),
    listRuns: async () => [],
  })

  assert.equal(result.status, 'stale')
})

test('fails clearly when matching CI never completes within the deadline', async () => {
  let currentTime = 0
  await assert.rejects(waitForMatchingCiRun({
    pullNumber: 42,
    headSha: sha,
    timeoutMs: 2_000,
    pollIntervalMs: 1_000,
    now: () => currentTime,
    sleep: async (milliseconds) => { currentTime += milliseconds },
    getCurrentHead: async () => sha,
    listRuns: async () => [],
  }), /Timed out after 2000ms waiting for Checks \| CI for PR #42/)
})
