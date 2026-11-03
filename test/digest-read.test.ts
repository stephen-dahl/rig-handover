import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readNight } from '../src/digest/read.js';
import type { NightDigest } from '../src/digest/types.js';

function rowFor(digest: NightDigest | null, job: string) {
  const row = digest?.rows.find((r) => r.job === job);
  if (row === undefined) throw new Error(`no row for ${job}`);
  return row;
}

describe('readNight on runs/2026-10-28.jsonl', () => {
  const digest = readNight('runs', '2026-10-28');

  it('finds 5 jobs and 1 bad line', () => {
    expect(digest?.night).toBe('2026-10-28');
    expect(digest?.rows).toHaveLength(5);
    expect(digest?.badLines).toBe(1);
  });

  it('sorts rows by job', () => {
    expect(digest?.rows.map((r) => r.job)).toEqual([
      'digest/render',
      'fixtures/refresh',
      'lane/sync',
      'notes/backup',
      'rig/rotate-logs',
    ]);
  });

  it('counts parsed lines per status', () => {
    expect(digest?.counts).toEqual({ ok: 10, retry: 4, fail: 1 });
  });

  it('keeps the last error after a later line passes', () => {
    expect(rowFor(digest, 'fixtures/refresh')).toEqual({
      job: 'fixtures/refresh',
      owner: 'rook',
      runs: 4,
      retries: 3,
      fails: 0,
      lastStatus: 'ok',
      lastError: 'upstream 503',
      firstAt: '2026-10-29T01:30:00+01:00',
      lastAt: '2026-10-29T01:37:00+01:00',
    });
  });

  it('counts a fail and its error', () => {
    const row = rowFor(digest, 'notes/backup');
    expect(row.fails).toBe(1);
    expect(row.lastError).toBe('quota exceeded');
  });

  it('keeps a row whose owner is null', () => {
    expect(rowFor(digest, 'digest/render').owner).toBeNull();
  });

  it('does not count the truncated line toward its job', () => {
    expect(rowFor(digest, 'lane/sync').runs).toBe(8);
  });
});

describe('readNight on temp files', () => {
  let dir: string;

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'rig-digest-'));
  });

  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  function readLines(night: string, text: string) {
    writeFileSync(join(dir, `${night}.jsonl`), text);
    return readNight(dir, night);
  }

  it('returns a digest with no rows for an empty file', () => {
    expect(readLines('2026-01-01', '')).toEqual({
      night: '2026-01-01',
      rows: [],
      badLines: 0,
      counts: { ok: 0, retry: 0, fail: 0 },
    });
  });

  it('returns null for a missing file', () => {
    expect(readNight(dir, '2026-01-02')).toBeNull();
  });

  it('returns null for a bad night string, even when the file exists', () => {
    writeFileSync(join(dir, 'x.jsonl'), '');
    expect(readNight(join(dir, 'sub'), '../x')).toBeNull();
    expect(readNight(dir, 'x')).toBeNull();
    expect(readNight(dir, '2026-1-1')).toBeNull();
  });

  it('reads a CRLF file and skips its blank lines', () => {
    const line = (at: string) => JSON.stringify({ at, job: 'a', status: 'ok', owner: 'rook' });
    const digest = readLines('2026-01-03', `${line('t1')}\r\n\r\n${line('t2')}\r\n`);
    expect(digest?.badLines).toBe(0);
    expect(digest?.rows).toHaveLength(1);
    expect(rowFor(digest, 'a').runs).toBe(2);
    expect(rowFor(digest, 'a').lastAt).toBe('t2');
  });

  it('counts every malformed shape as bad', () => {
    const good = { at: 't', job: 'a', status: 'ok', owner: null };
    const bad = [
      'not json',
      'null',
      '[]',
      '42',
      { ...good, at: 1 },
      { ...good, job: null },
      { ...good, status: 'done' },
      { ...good, owner: 7 },
      { ...good, error: null },
      { at: 't', status: 'ok' },
    ];
    const text = bad.map((b) => (typeof b === 'string' ? b : JSON.stringify(b))).join('\n');
    const digest = readLines('2026-01-04', text);
    expect(digest?.badLines).toBe(bad.length);
    expect(digest?.rows).toEqual([]);
  });

  it('reads an absent owner as null and takes owner from the last parsed line', () => {
    const lines = [
      { at: 't1', job: 'a', status: 'ok', owner: 'rook' },
      { at: 't2', job: 'a', status: 'ok' },
      { at: 't1', job: 'b', status: 'ok', owner: null },
      { at: 't2', job: 'b', status: 'ok', owner: 'rook' },
    ];
    const digest = readLines('2026-01-05', lines.map((l) => JSON.stringify(l)).join('\n'));
    expect(rowFor(digest, 'a').owner).toBeNull();
    expect(rowFor(digest, 'b').owner).toBe('rook');
  });

  it('keeps times as logged and in log order, without converting them', () => {
    const lines = [
      { at: '2026-01-06T05:00:00+09:00', job: 'a', status: 'ok', owner: null },
      { at: '2026-01-06T01:00:00-05:00', job: 'a', status: 'ok', owner: null },
      { at: 'not a time', job: 'a', status: 'ok', owner: null },
    ];
    const digest = readLines('2026-01-06', lines.map((l) => JSON.stringify(l)).join('\n'));
    expect(rowFor(digest, 'a').firstAt).toBe('2026-01-06T05:00:00+09:00');
    expect(rowFor(digest, 'a').lastAt).toBe('not a time');
  });

  it('sorts in code-unit order, not locale order', () => {
    const lines = ['a', 'B', 'ä', 'Z'].map((job) => JSON.stringify({ at: 't', job, status: 'ok', owner: null }));
    const digest = readLines('2026-01-07', lines.join('\n'));
    expect(digest?.rows.map((r) => r.job)).toEqual(['B', 'Z', 'a', 'ä']);
  });
});
