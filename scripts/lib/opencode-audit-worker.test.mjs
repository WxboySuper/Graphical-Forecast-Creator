import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'

const require = createRequire(import.meta.url)
const {
  implementationSizeLimit,
  isWorkPathAllowed,
  parseAuditIssue,
  sensitiveEnvironmentPaths,
  sparseCheckoutPatterns,
} = require('./opencode-audit-worker.cjs')

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

test('focused implementation changes fit the deterministic size boundary', () => {
  assert.equal(implementationSizeLimit(['src/monitor/map.tsx', 'src/monitor/map.test.tsx'], 24_000), null)
  assert.match(implementationSizeLimit(Array.from({ length: 9 }, (_, index) => `src/monitor/${index}.ts`), 100), /limit is 8/)
  assert.match(implementationSizeLimit(['src/monitor/map.tsx'], 32_769), /limit is 32768 bytes/)
})

test('validator accepts a focused change and routes an oversized diff to human review', () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'gfc-opencode-size-check-'))
  const validatorPath = path.resolve('scripts/validate-opencode-audit-work.mjs')
  let caseNumber = 0

  const runCase = (files) => {
    const name = `case-${caseNumber++}`
    const fixture = path.join(directory, name)
    mkdirSync(path.join(fixture, 'docs', 'maintenance'), { recursive: true })
    execFileSync('git', ['init', '-q'], { cwd: fixture })
    execFileSync('git', ['config', 'user.name', 'OpenCode Validator Test'], { cwd: fixture })
    execFileSync('git', ['config', 'user.email', 'opencode-validator-test@example.invalid'], { cwd: fixture })
    writeFileSync(path.join(fixture, 'docs', 'maintenance', 'README.md'), 'Existing documentation.\n')
    execFileSync('git', ['add', '.'], { cwd: fixture })
    execFileSync('git', ['-c', 'commit.gpgsign=false', 'commit', '-qm', 'test fixture'], { cwd: fixture })
    for (const [name, contents] of Object.entries(files)) {
      writeFileSync(path.join(fixture, 'docs', 'maintenance', name), contents)
    }

    const outputPath = path.join(directory, `${name}-model-output.md`)
    const githubOutput = path.join(directory, `${name}-github-output.txt`)
    writeFileSync(outputPath, 'A focused documentation fix with a clear result.')
    writeFileSync(githubOutput, '')
    const result = spawnSync(process.execPath, [validatorPath], {
      cwd: fixture,
      encoding: 'utf8',
      env: {
        ...process.env,
        AUDIT_SCOPE: 'docs/maintenance',
        OPENCODE_OUTPUT_PATH: outputPath,
        GITHUB_OUTPUT: githubOutput,
      },
    })
    const outputs = readFileSync(githubOutput, 'utf8')
    rmSync(fixture, { recursive: true, force: true })
    return { result, outputs }
  }

  try {
    const accepted = runCase({ 'fix.md': 'Small focused change.\n', 'fix.test.md': 'Focused verification note.\n' })
    assert.equal(accepted.result.status, 0, accepted.result.stderr)
    assert.match(accepted.outputs, /needs_human=false/)
    assert.match(accepted.outputs, /changed_paths=\[/)

    const rejected = runCase({ 'large.md': `${'Large proposed implementation.\n'.repeat(1200)}` })
    assert.equal(rejected.result.status, 0, rejected.result.stderr)
    assert.match(rejected.outputs, /needs_human=true/)
    assert.match(rejected.outputs, /changed_paths=\[\]/)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

test('workspace preparation hides tracked environment files, retains .env.example, and preserves requested scope', () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'gfc-opencode-workspace-'))
  const scriptPath = path.resolve('scripts/prepare-opencode-workspace.mjs')

  try {
    execFileSync('git', ['init', '-q'], { cwd: directory })
    execFileSync('git', ['config', 'user.name', 'OpenCode Workspace Test'], { cwd: directory })
    execFileSync('git', ['config', 'user.email', 'opencode-workspace-test@example.invalid'], { cwd: directory })
    mkdirSync(path.join(directory, 'src', 'monitor'), { recursive: true })
    mkdirSync(path.join(directory, 'src', 'forecast'), { recursive: true })
    writeFileSync(path.join(directory, '.env.production'), 'not-a-real-secret\n')
    writeFileSync(path.join(directory, '.env.example'), 'EXAMPLE=value\n')
    writeFileSync(path.join(directory, 'src', 'monitor', '.env.local'), 'not-a-real-secret\n')
    writeFileSync(path.join(directory, 'package.json'), '{}\n')
    writeFileSync(path.join(directory, 'src', 'monitor', 'map.ts'), 'export {}\n')
    writeFileSync(path.join(directory, 'src', 'forecast', 'map.ts'), 'export {}\n')
    execFileSync('git', ['add', '.'], { cwd: directory })
    execFileSync('git', ['-c', 'commit.gpgsign=false', 'commit', '-qm', 'test fixture'], { cwd: directory })

    execFileSync(process.execPath, [scriptPath], {
      cwd: directory,
      env: { ...process.env, OPENCODE_WORKSPACE_SCOPE: 'src/monitor' },
      stdio: 'pipe',
    })

    assert.equal(existsSync(path.join(directory, '.env.production')), false)
    assert.equal(existsSync(path.join(directory, 'src', 'monitor', '.env.local')), false)
    assert.equal(existsSync(path.join(directory, '.env.example')), true)
    assert.equal(existsSync(path.join(directory, 'package.json')), true)
    assert.equal(existsSync(path.join(directory, 'src', 'monitor', 'map.ts')), true)
    assert.equal(existsSync(path.join(directory, 'src', 'forecast', 'map.ts')), false)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

test('only sensitive tracked environment names are excluded', () => {
  assert.deepEqual(sensitiveEnvironmentPaths([
    '.env.production',
    'src/server/.env.local',
    '.env.example',
    'docs/environment.md',
  ]), ['.env.production', 'src/server/.env.local'])
  assert.deepEqual(sparseCheckoutPatterns({ scope: null, excludedPaths: ['.env.production'] }), ['/*', '!/.env.production'])
  assert.deepEqual(sparseCheckoutPatterns({ scope: null, excludedPaths: ['src/[tenant]/.env.local'] }), ['/*', '!/src/\\[tenant\\]/.env.local'])
})
