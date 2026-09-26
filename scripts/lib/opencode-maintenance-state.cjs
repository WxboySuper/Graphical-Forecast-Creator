const fs = require('node:fs')

function applyScheduledResult(contextData, result, head, at, findingCount) {
  const { state, category, runKey, scope } = contextData
  if (result.status === 'complete') {
    state.jobs ??= {}
    state.jobs[category] = {
      lastSuccessKey: runKey,
      lastSuccessAt: at,
      lastScope: scope,
      head,
      findingCount,
    }
  }
  state.lastAttempt = {
    category,
    runKey,
    at,
    status: result.status,
    scope,
    findingCount: result.findings.length,
  }
  return state
}

function markScheduledFailure(contextData, at) {
  if (contextData.state.lastAttempt?.status !== 'started') return false
  contextData.state.lastAttempt = {
    category: contextData.category,
    runKey: contextData.runKey,
    at,
    status: 'failed',
    scope: contextData.scope,
    details: 'See the failed workflow run for diagnostics.',
  }
  return true
}

function persistScheduledState(contextData, statePath) {
  fs.writeFileSync(statePath, JSON.stringify(contextData), 'utf8')
}

module.exports = {
  applyScheduledResult,
  markScheduledFailure,
  persistScheduledState,
}
