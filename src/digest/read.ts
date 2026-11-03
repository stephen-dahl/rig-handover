import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DigestRow, NightDigest, ReadNight, RunStatus } from './types.js';

type LogLine = {
  at: string;
  job: string;
  status: RunStatus;
  owner: string | null;
  error?: string;
};

function isStatus(value: unknown): value is RunStatus {
  return value === 'ok' || value === 'retry' || value === 'fail';
}

/** Returns null for any line that isn't valid JSON or doesn't match the log's shape. */
function parseLine(line: string): LogLine | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(line);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null;

  const { at, job, status, owner, error } = parsed as Record<string, unknown>;
  if (typeof at !== 'string' || typeof job !== 'string' || !isStatus(status)) return null;
  if (owner !== undefined && owner !== null && typeof owner !== 'string') return null;
  if (error !== undefined && typeof error !== 'string') return null;

  return { at, job, status, owner: owner ?? null, ...(error === undefined ? {} : { error }) };
}

function readLog(path: string): string | null {
  try {
    return readFileSync(path, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw err;
  }
}

export const readNight: ReadNight = (runsDir, night) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(night)) return null;

  const text = readLog(join(runsDir, `${night}.jsonl`));
  if (text === null) return null;

  const rows = new Map<string, DigestRow>();
  const counts: NightDigest['counts'] = { ok: 0, retry: 0, fail: 0 };
  let badLines = 0;

  for (const line of text.split(/\r?\n/)) {
    if (line.trim() === '') continue;

    const entry = parseLine(line);
    if (entry === null) {
      badLines += 1;
      continue;
    }

    counts[entry.status] += 1;

    let row = rows.get(entry.job);
    if (row === undefined) {
      row = {
        job: entry.job,
        owner: entry.owner,
        runs: 0,
        retries: 0,
        fails: 0,
        lastStatus: entry.status,
        lastError: null,
        firstAt: entry.at,
        lastAt: entry.at,
      };
      rows.set(entry.job, row);
    }

    row.runs += 1;
    if (entry.status === 'retry') row.retries += 1;
    if (entry.status === 'fail') row.fails += 1;
    row.owner = entry.owner;
    row.lastStatus = entry.status;
    row.lastAt = entry.at;
    if (entry.error !== undefined) row.lastError = entry.error;
  }

  const sorted = [...rows.values()].sort((a, b) => (a.job < b.job ? -1 : a.job > b.job ? 1 : 0));

  return { night, rows: sorted, badLines, counts };
};
