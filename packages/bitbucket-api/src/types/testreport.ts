/**
 * Pipeline test-report types (`GET .../steps/{step}/test_reports` and friends).
 *
 * The report summary carries aggregate counts; test cases are the individual
 * results; a case's reasons hold its failure/error output. Field names vary
 * slightly across Bitbucket responses, so counts are optional and read
 * defensively by the operation layer.
 */
export interface TestReport {
  uuid?: string;
  name?: string;
  test_suite_name?: string;
  total_test_count?: number;
  passed_test_count?: number;
  failed_test_count?: number;
  error_test_count?: number;
  skipped_test_count?: number;
  type?: string;
}

export interface TestCase {
  uuid?: string;
  name?: string;
  fully_qualified_name?: string;
  /** PASSED | FAILED | ERROR | SKIPPED — plus any value not yet known. */
  status?: 'PASSED' | 'FAILED' | 'ERROR' | 'SKIPPED' | (string & {});
  duration_in_ms?: number;
  type?: string;
}

export interface TestCaseReason {
  uuid?: string;
  /** The failure/error message. */
  message?: string;
  /** Captured stdout/stderr or stack trace, when present. */
  status_reason?: string;
  type?: string;
}
