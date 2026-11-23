import type { FullConfig, FullResult, Reporter, Suite, TestCase, TestResult } from '@playwright/test/reporter';

const seconds = (ms: number): string => `${(ms / 1000).toFixed(1)}s`;

const elapsed = (ms: number): string => {
  const total = Math.round(ms / 1000);
  const minutes = Math.floor(total / 60);
  return minutes > 0 ? `${minutes}m${String(total % 60).padStart(2, '0')}s` : `${total}s`;
};

type Outcome = 'passed' | 'skipped' | 'failed';

const VERBS: Record<Outcome, string> = { passed: 'PASS', skipped: 'SKIP', failed: 'FAIL' };

/** Classifies one attempt, honoring `test.fail()` where the expected status is a failure. */
const attemptOutcome = (test: TestCase, result: TestResult): Outcome => {
  if (result.status === 'skipped') return 'skipped';
  return result.status === test.expectedStatus ? 'passed' : 'failed';
};

/**
 * Prints RUN / PASS / FAIL / DONE lines with a running count and percentage, e.g.
 * `[ 3/47   6%] PASS  navigation.spec.ts › Navigation › opens home  1.7s`, so CI logs show how far the run is.
 */
export default class ProgressReporter implements Reporter {
  private total = 0;
  /** Latest final outcome per test id, so serial suites that re-run passed tests on retry are not counted twice. */
  private outcomes = new Map<string, Outcome>();
  private startedAt = Date.now();

  onBegin(_config: FullConfig, suite: Suite): void {
    this.total = suite.allTests().length;
    this.startedAt = Date.now();
  }

  private get finished(): number {
    return this.outcomes.size;
  }

  private get failed(): number {
    return [...this.outcomes.values()].filter((outcome) => outcome === 'failed').length;
  }

  private get skipped(): number {
    return [...this.outcomes.values()].filter((outcome) => outcome === 'skipped').length;
  }

  private prefix(count: number): string {
    const width = String(this.total).length;
    const pct = this.total === 0 ? 100 : Math.floor((count / this.total) * 100);
    return `[${String(count).padStart(width)}/${this.total} ${String(pct).padStart(3)}%]`;
  }

  private label(test: TestCase): string {
    // titlePath() is ['', project, file, ...suites, title]; drop the empty root and the project name.
    return test.titlePath().filter(Boolean).slice(1).join(' › ');
  }

  onTestBegin(test: TestCase, result: TestResult): void {
    // The counter only reflects completed tests, never ones that are merely running.
    const retry = result.retry > 0 ? ` (retry ${result.retry})` : '';
    console.log(`${this.prefix(this.finished)} RUN   ${this.label(test)}${retry}`);
  }

  onTestEnd(test: TestCase, result: TestResult): void {
    const outcome = attemptOutcome(test, result);
    const willRetry = outcome === 'failed' && result.retry < test.retries;
    if (willRetry) this.outcomes.delete(test.id);
    else this.outcomes.set(test.id, outcome);
    const note = willRetry ? ' (will retry)' : '';
    console.log(`${this.prefix(this.finished)} ${VERBS[outcome]}  ${this.label(test)}  ${seconds(result.duration)}${note}`);
  }

  onEnd(result: FullResult): void {
    const time = elapsed(Date.now() - this.startedAt);
    const summary = this.failed === 0 && result.status === 'passed'
      ? `all ${this.total} tests passed${this.skipped ? ` (${this.skipped} skipped)` : ''} in ${time}`
      : `${this.failed} of ${this.total} tests failed (${result.status}) in ${time}`;
    console.log(`${this.prefix(this.finished)} DONE  ${summary}`);
  }

  printsToStdio(): boolean {
    return false;
  }
}
