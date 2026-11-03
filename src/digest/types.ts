// The contract for plan section 2. The page, the JSON and the board all read NightDigest, so
// they cannot disagree (ADR 0001).
export type RunStatus = 'ok' | 'retry' | 'fail';

export type DigestRow = {
  job: string;
  /** null when the log says so. Views show it as `—`. */
  owner: string | null;
  /** Parsed lines for this job. */
  runs: number;
  /** Lines with status `retry`. */
  retries: number;
  /** Lines with status `fail`. A job can fail and then pass, so lastStatus can't answer this. */
  fails: number;
  lastStatus: RunStatus;
  /** The most recent `error` for this job, even if a later line passed. */
  lastError: string | null;
  /** Time of the job's first and last lines, exactly as logged, offset included. */
  firstAt: string;
  lastAt: string;
};

export type NightDigest = {
  night: string;
  /** One row per job, sorted by job in code-unit order. Views keep this order. */
  rows: DigestRow[];
  /** Lines that didn't parse or don't match the log's shape. Blank lines don't count. */
  badLines: number;
  /** Parsed lines per status, across all jobs. */
  counts: Record<RunStatus, number>;
};

/**
 * Reads `<runsDir>/<night>.jsonl`. Never throws on bad content.
 * Returns null when `night` isn't YYYY-MM-DD or the file doesn't exist, which routes turn into 404.
 * An empty file returns a digest with no rows.
 */
export type ReadNight = (runsDir: string, night: string) => NightDigest | null;
