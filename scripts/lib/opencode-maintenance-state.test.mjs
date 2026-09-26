import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { test } from 'node:test'

const require = createRequire(import.meta.url)
const {
  applyScheduledResult,
  markScheduledFailure,
  persistScheduledState,
} = require('./opencode-maintenance-state.cjs')

function startedContext() {
  return {
    trackerNumber: 42,
    stateCommentId: 17,
    category: 'bug-hunt',
    runKey: '2026-W39',
    scope: 'src/monitor',
    state: {
      version: 1,
      jobs: {},
      lastAttempt: {
        category: 'bug-hunt',
        runKey: '2026-W39',
        status: 'started',
        scope: 'src/monitor',
      },
    },
  }
}

test('an inconclusive published result stays inconclusive when failure cleanup rereads STATE_PATH', () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'gfc-opencode-state-'))
  const statePath = path.join(directory, 'state.json')

  try {
    const contextData = startedContext()
    applyScheduledResult(contextData, { status: 'inconclusive', findings: [] }, 'abc123', '2026-09-26T14:00:00Z', 0)
    persistScheduledState(contextData, statePath)

    const failureContext = JSON.parse(readFileSync(statePath, 'utf8'))
    assert.equal(markScheduledFailure(failureContext, '2026-09-26T14:00:01Z'), false)
    assert.equal(failureContext.state.lastAttempt.status, 'inconclusive')
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

test('a failure before a result is published changes a started attempt to failed', () => {
  const contextData = startedContext()

  assert.equal(markScheduledFailure(contextData, '2026-09-26T14:00:00Z'), true)
  assert.equal(contextData.state.lastAttempt.status, 'failed')
})

test('a complete result advances the category period and cannot be downgraded to failed', () => {
  const contextData = startedContext()

  applyScheduledResult(contextData, { status: 'complete', findings: [] }, 'def456', '2026-09-26T15:00:00Z', 0)
  assert.equal(contextData.state.jobs['bug-hunt'].lastSuccessKey, '2026-W39')
  assert.equal(contextData.state.jobs['bug-hunt'].head, 'def456')
  assert.equal(markScheduledFailure(contextData, '2026-09-26T15:00:01Z'), false)
  assert.equal(contextData.state.lastAttempt.status, 'complete')
})
