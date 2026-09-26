import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { test } from 'node:test'

const require = createRequire(import.meta.url)
const { isWorkPathAllowed, parseAuditIssue } = require('./opencode-audit-worker.cjs')

const machineMarker = '<!-- gfc-opencode-audit:v1 fingerprint=0123456789abcdefabcd category=audit-weekly kind=bug file=src/monitor/MonitorMap.tsx scope=src/monitor -->'

function auditIssue({ author = 'github-actions[bot]', labels = ['opencode-audit', 'opencode-audit-eligible'], marker = machineMarker } = {}) {
  return {
    state: 'open',
    user: { login: author },
    labels: labels.map((name) => ({ name })),
    body: `Verified finding\n\n${marker}`,
  }
}

test('only bot-authored audit findings with the workflow label and marker are eligible', () => {
  assert.equal(parseAuditIssue(auditIssue())?.scope, 'src/monitor')
  assert.equal(parseAuditIssue(auditIssue({ author: 'public-user' })), null)
  assert.equal(parseAuditIssue(auditIssue({ labels: ['opencode-audit'] })), null)
  assert.equal(parseAuditIssue(auditIssue({ marker: '<!-- gfc-opencode-finding:0123456789abcdefabcd -->' })), null)
})

test('implementation changes stay inside the issue scope and reject sensitive paths', () => {
  assert.equal(isWorkPathAllowed('src/monitor/MonitorMap.tsx', 'src/monitor'), true)
  assert.equal(isWorkPathAllowed('src/forecast/ForecastMap.tsx', 'src/monitor'), false)
  assert.equal(isWorkPathAllowed('src/monitor/../../server/auth.ts', 'src/monitor'), false)
  assert.equal(isWorkPathAllowed('src/monitor/secrets/config.ts', 'src/monitor'), false)
  assert.equal(isWorkPathAllowed('src/monitor/.env.local', 'src/monitor'), false)
})
