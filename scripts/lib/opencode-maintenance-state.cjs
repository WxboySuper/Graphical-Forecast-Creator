const fs = require('node:fs')

function createScheduledContext({ trackerNumber, stateCommentId, category, period, scope, focus, limits, state }) {
  if (typeof category !== 'string' || !category || typeof period !== 'string' || !period) {
    throw new Error('Scheduled maintenance category and period are required.')
  }
  return { trackerNumber, stateCommentId, category, period, scope, focus, limits, state }
}

function applyScheduledResult(contextData, result, head, at, findingCount) {
  const { state, category, period, scope } = contextData
  if (result.status === 'complete') {
    state.jobs ??= {}
    state.jobs[category] = {
      lastSuccessPeriod: period,
      lastSuccessAt: at,
      lastScope: scope,
      head,
      findingCount,
    }
  }
  state.lastAttempt = {
    category,
    period,
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
    period: contextData.period,
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
  createScheduledContext,
  applyScheduledResult,
  markScheduledFailure,
  persistScheduledState,
}
