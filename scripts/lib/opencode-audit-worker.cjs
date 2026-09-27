const path = require('node:path')

const auditMarkerPattern = /<!-- gfc-opencode-audit:v1 fingerprint=([a-f0-9]{20}) category=(bug-hunt|audit-weekly|audit-monthly) kind=(bug|security|dependency|documentation|test|maintainability|architecture) file=([A-Za-z0-9._/-]+) scope=([A-Za-z0-9._/-]+) -->/
const eligibleRoots = ['src/monitor/', 'src/forecast/', 'src/verification/', 'src/components/', 'src/utils/', 'docs/']
const highRiskPath = /(^|\/)(billing|auth|authorization|security|entitlement|payment|stripe|deploy|deployment|secrets?)(\/|\.|$)/i
const eligibleKinds = new Set(['bug', 'documentation', 'test', 'maintainability'])
const MAX_IMPLEMENTATION_FILES = 8
const MAX_IMPLEMENTATION_DIFF_BYTES = 32 * 1024

function parseAuditIssue(issue) {
  if (issue.pull_request || issue.state !== 'open' || issue.user?.login !== 'github-actions[bot]') return null
  const labels = new Set(issue.labels?.map((label) => typeof label === 'string' ? label : label.name))
  if (!labels.has('opencode-audit') || !labels.has('opencode-audit-eligible')) return null
  const match = issue.body?.match(auditMarkerPattern)
  if (!match) return null
  const [, fingerprint, category, kind, file, scope] = match
  const normalizedFile = file.replace(/\/+/g, '/')
  const normalizedScope = scope.replace(/\/+/g, '/')
  if (normalizedFile.startsWith('/') || normalizedFile.split('/').includes('..')) return null
  if (path.posix.dirname(normalizedFile) !== normalizedScope) return null
  if (!eligibleKinds.has(kind) || !eligibleRoots.some((root) => normalizedFile.startsWith(root)) || highRiskPath.test(normalizedFile)) return null
  return { fingerprint, category, kind, file: normalizedFile, scope: normalizedScope }
}

function isWorkPathAllowed(file, scope) {
  if (typeof file !== 'string' || typeof scope !== 'string' || !scope) return false
  const normalizedFile = file.replace(/\\/g, '/')
  const normalizedScope = scope.replace(/\\/g, '/').replace(/\/$/, '')
  if (normalizedFile.startsWith('/') || normalizedFile.split('/').includes('..')) return false
  if (normalizedFile !== normalizedScope && !normalizedFile.startsWith(`${normalizedScope}/`)) return false
  return !highRiskPath.test(normalizedFile) && !/(^|\/)\.env(?:\.|$)/i.test(normalizedFile)
}

function implementationSizeLimit(paths, diffBytes) {
  if (paths.length > MAX_IMPLEMENTATION_FILES) {
    return `The generated change touches ${paths.length} files; the limit is ${MAX_IMPLEMENTATION_FILES}.`
  }
  if (!Number.isSafeInteger(diffBytes) || diffBytes < 0 || diffBytes > MAX_IMPLEMENTATION_DIFF_BYTES) {
    return `The generated diff is ${diffBytes} bytes; the limit is ${MAX_IMPLEMENTATION_DIFF_BYTES} bytes.`
  }
  return null
}

function sensitiveEnvironmentPaths(paths) {
  return paths.filter((file) => {
    const basename = path.posix.basename(file.replace(/\\/g, '/'))
    return basename === '.env' || (basename.startsWith('.env.') && basename !== '.env.example')
  })
}

function sparseCheckoutPatterns({ scope, excludedPaths }) {
  const patterns = scope
    ? ['/*', '!/*/']
    : ['/*']
  if (scope) {
    const segments = scope.split('/')
    let current = ''
    for (let index = 0; index < segments.length; index += 1) {
      current = current ? `${current}/${segments[index]}` : segments[index]
      patterns.push(`/${current}/`)
      if (index < segments.length - 1) patterns.push(`!/${current}/*/`)
    }
    patterns.push(`/${scope}/**`)
  }
  for (const file of excludedPaths) {
    const escaped = file.replace(/\\/g, '/').replace(/[\\*?\[\]]/g, '\\$&')
    patterns.push(`!/${escaped}`)
  }
  return patterns
}

module.exports = {
  implementationSizeLimit,
  isWorkPathAllowed,
  parseAuditIssue,
  sensitiveEnvironmentPaths,
  sparseCheckoutPatterns,
}
