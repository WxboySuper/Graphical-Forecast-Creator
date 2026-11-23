import type { FullResult, Reporter, Suite, TestCase, TestResult } from '@playwright/test/reporter';

/** Prints a running "[done/total] pct%" line after each test finishes so CI logs show how far the run is. */
export default class ProgressReporter implements Reporter {
  private total = 0;
  private done = 0;

  onBegin(_config: unknown, suite: Suite): void {
    this.total = suite.allTests().length;
  }

  onTestEnd(test: TestCase, result: TestResult): void {
    // Only count a test once it has reached its final outcome (not intermediate retries).
    const willRetry = result.status !== 'passed' && result.status !== 'skipped' && result.retry < test.retries;
    if (willRetry) return;
    this.done += 1;
    const pct = this.total === 0 ? 100 : Math.floor((this.done / this.total) * 100);
    console.log(`[progress] ${this.done}/${this.total} (${pct}%)`);
  }

  onEnd(_result: FullResult): void {
    console.log(`[progress] finished ${this.done}/${this.total}`);
  }

  printsToStdio(): boolean {
    return false;
  }
}
