import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { test } from 'node:test'

const require = createRequire(import.meta.url)
const workflow = readFileSync(new URL('../../.github/workflows/opencode-scheduled-maintenance.yml', import.meta.url), 'utf8').replace(/\r\n/g, '\n')
const section = workflow.split('      - name: Publish actionable audit issues and save state')[1].split('      - name: Record a failed investigation attempt')[0]
const script = section.split('          script: |\n')[1].split('\n').map(line => line.slice(12)).join('\n')
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor

test('actual scheduled publisher opens below-cutoff findings, keeps security human-only, deduplicates and persists completion', async () => {
  const contextData = {
    category: 'security-daily', period: '2026-09-30', focus: 'validation',
    limits: { maxFindings: 3, confidence: 0.97 }, stateCommentId: 17,
    state: { jobs: {}, reported: {}, lastAttempt: { status: 'started' } },
  }
  const findings = [0.9, 0.85, 0.85].map((confidence, index) => ({
    title: 'Import boundary ' + index, summary: 'Untrusted import can break state.',
    evidence: 'The parser accepts invalid input.', file: 'src/utils/fileUtils.ts',
    line: 1, confidence, kind: index === 0 ? 'security' : 'bug',
  }))
  const created = []
  let persisted
  const fs = {
    readFileSync: file => file === 'state' ? JSON.stringify(persisted ?? contextData) :
      file === 'output' ? JSON.stringify({ status: 'complete', findings }) : 'source\n',
    existsSync: () => true,
  }
  const helpers = require('./opencode-maintenance-state.cjs')
  const github = {
    paginate: async () => [],
    rest: { issues: {
      listForRepo() {}, listLabelsForRepo() {},
      createLabel: async input => ({ data: input }),
      create: async input => { created.push(input) },
      updateComment: async () => {},
    } },
  }
  const run = () => new AsyncFunction('require', 'process', 'github', 'context', 'core', script)(
    name => name === 'fs' ? fs : name === 'helper' ? {
      ...helpers, persistScheduledState: data => { persisted = JSON.parse(JSON.stringify(data)) },
    } : require(name),
    { env: { STATE_PATH: 'state', OUTPUT_PATH: 'output', STATE_HELPER_PATH: 'helper' } },
    github, { repo: { owner: 'owner', repo: 'repo' }, sha: 'abc' },
    { info() {}, setFailed: message => assert.fail(message) },
  )
  await run()
  assert.equal(created.length, 3)
  assert.ok(created.every(issue => !issue.labels.includes('opencode-audit-eligible')))
  assert.ok(created.every(issue => issue.body.includes('for investigation')))
  assert.equal(persisted.state.jobs['security-daily'].lastSuccessPeriod, '2026-09-30')
  assert.equal(persisted.state.lastAttempt.status, 'complete')
  await run()
  assert.equal(created.length, 3, 'reported fingerprints prevent duplicate issues')
})