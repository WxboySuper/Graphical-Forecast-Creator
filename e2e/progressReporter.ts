import type { FullResult, Reporter, Suite, TestCase, TestResult } from '@playwright/test/reporter';

const seconds = (ms: number): string => `${(ms / 1000).toFixed(1)}s`;

const elapsed = (ms: number): string => {
  const total = Math.round(ms / 1000);
  const minutes = Math.floor(total / 60);
  return minutes > 0 ? `${minutes}m${String(total % 60).padStart(2, '0')}s` : `${total}s`;
};

/**
 * Prints RUN / PASS / FAIL / DONE lines with a running count and percentage, e.g.
 * `[ 3/47   6%] PASS  chromium › navigation.spec.ts › opens home  1.7s`, so CI logs show how far the run is.
 */
export default class ProgressReporter implements Reporter {
  private total = 0;
  /** Latest final outcome per test id, so serial suites that re-run passed tests on retry are not counted twice. */
  private outcomes = new Map<string, boolean>();
  private startedAt = Date.now();

  onBegin(_config: unknown, suite: Suite): void {
    this.total = suite.allTests().length;
    this.startedAt = Date.now();
  }

  private get finished(): number {
    return this.outcomes.size;
  }

  private get failed(): number {
    return [...this.outcomes.values()].filter((ok) => !ok).length;
  }

  private prefix(count: number): string {
    const width = String(this.total).length;
    const pct = this.total === 0 ? 100 : Math.floor((count / this.total) * 100);
    return `[${String(count).padStart(width)}/${this.total} ${String(pct).padStart(3)}%]`;
  }

  private label(test: TestCase): string {
    return test.titlePath().filter(Boolean).slice(1).join(' › ');
  }

  onTestBegin(test: TestCase, result: TestResult): void {
    // The counter only reflects completed tests, never ones that are merely running.
    const retry = result.retry > 0 ? ` (retry ${result.retry})` : '';
    console.log(`${this.prefix(this.finished)} RUN   ${this.label(test)}${retry}`);
  }

  onTestEnd(test: TestCase, result: TestResult): void {
    const passed = result.status === 'passed' || result.status === 'skipped';
    const willRetry = !passed && result.retry < test.retries;
    if (willRetry) this.outcomes.delete(test.id);
    else this.outcomes.set(test.id, passed);
    const verb = result.status === 'skipped' ? 'SKIP' : passed ? 'PASS' : 'FAIL';
    const note = willRetry ? ' (will retry)' : '';
    console.log(`${this.prefix(this.finished)} ${verb}  ${this.label(test)}  ${seconds(result.duration)}${note}`);
  }

  onEnd(result: FullResult): void {
    const time = elapsed(Date.now() - this.startedAt);
    const summary = this.failed === 0 && result.status === 'passed'
      ? `all ${this.total} tests passed in ${time}`
      : `${this.failed} of ${this.total} tests failed (${result.status}) in ${time}`;
    console.log(`${this.prefix(this.finished)} DONE  ${summary}`);
  }

  printsToStdio(): boolean {
    return false;
  }
}
