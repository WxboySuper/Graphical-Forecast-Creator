/**
 * Jest reporter that prints RUN / PASS / FAIL / DONE lines with a running count and percentage,
 * matching the Playwright e2e progress reporter, e.g. `[ 3/47   6%] PASS  src/foo.test.ts  1.7s`.
 * Counts completed test files only, so the percentage never reflects files that are merely running.
 */
const path = require('path');

const seconds = (ms) => `${(ms / 1000).toFixed(1)}s`;

const elapsed = (ms) => {
  const total = Math.round(ms / 1000);
  const minutes = Math.floor(total / 60);
  return minutes > 0 ? `${minutes}m${String(total % 60).padStart(2, '0')}s` : `${total}s`;
};

class ProgressReporter {
  constructor() {
    this.total = 0;
    this.finished = 0;
    this.failed = 0;
    this.startedAt = Date.now();
  }

  prefix() {
    const width = String(this.total).length;
    const pct = this.total === 0 ? 100 : Math.floor((this.finished / this.total) * 100);
    return `[${String(this.finished).padStart(width)}/${this.total} ${String(pct).padStart(3)}%]`;
  }

  label(testPath) {
    return path.relative(process.cwd(), testPath).split(path.sep).join('/');
  }

  onRunStart(results) {
    this.total = results.numTotalTestSuites;
    this.startedAt = Date.now();
  }

  onTestFileStart(test) {
    console.log(`${this.prefix()} RUN   ${this.label(test.path)}`);
  }

  onTestResult(test, result) {
    this.finished += 1;
    const failed = result.numFailingTests > 0 || Boolean(result.testExecError);
    if (failed) this.failed += 1;
    const duration = seconds(result.perfStats.end - result.perfStats.start);
    console.log(`${this.prefix()} ${failed ? 'FAIL' : 'PASS'}  ${this.label(test.path)}  ${duration}`);
  }

  onRunComplete() {
    const time = elapsed(Date.now() - this.startedAt);
    const summary = this.failed === 0
      ? `all ${this.total} test files passed in ${time}`
      : `${this.failed} of ${this.total} test files failed in ${time}`;
    console.log(`${this.prefix()} DONE  ${summary}`);
  }

  getLastError() {
    return undefined;
  }
}

module.exports = ProgressReporter;
