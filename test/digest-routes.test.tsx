import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';

type Status = 'ok' | 'retry' | 'fail';
type JsonRow = { job: string; owner: string | null };

const line = (job: string, status: Status, at: string, owner: string | null = 'rook', error?: string) =>
  JSON.stringify({ at, job, status, owner, ...(error ? { error } : {}) });

let root: string;
let app: ReturnType<typeof createApp>;

const night = (name: string, lines: string[]) =>
  writeFileSync(join(root, 'runs', `${name}.jsonl`), lines.map((l) => l + '\n').join(''));

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'rig-digest-'));
  const runsDir = join(root, 'runs');
  mkdirSync(runsDir);
  // A file a traversal bug could reach from runsDir.
  writeFileSync(join(root, 'secret.jsonl'), line('leak/job', 'ok', '2026-10-01T00:00:00+01:00') + '\n');

  // Written out of order on purpose: zulu, alpha, mike, november.
  night('2026-11-01', [
    line('zulu/clean', 'ok', '2026-11-01T01:00:00+01:00'),
    line('alpha/retried', 'retry', '2026-11-01T02:00:00+01:00'),
    line('alpha/retried', 'retry', '2026-11-01T02:05:00+01:00'),
    line('alpha/retried', 'retry', '2026-11-01T02:10:00+01:00'),
    line('alpha/retried', 'ok', '2026-11-01T02:15:00+01:00'),
    line('mike/failed', 'fail', '2026-11-01T03:00:00+01:00', 'rook', 'disk full'),
    line('november/orphan', 'ok', '2026-11-01T04:00:00+01:00', null),
  ]);
  night('2026-11-02', []);
  night('2026-11-03', [line('good/job', 'ok', '2026-11-03T01:00:00+01:00'), '{not json']);

  app = createApp({ adapter: 'shim', installed: '2026-10-29T14:06:00+01:00', beatEverySeconds: 60, runsDir });
});

afterAll(() => rmSync(root, { recursive: true, force: true }));

function rowHtml(html: string, job: string): string {
  const chunk = html.split('<tr').find((c) => c.includes(job));
  expect(chunk, `row for ${job}`).toBeDefined();
  return chunk as string;
}

describe('GET /digest/:night', () => {
  it('renders a night with a file', async () => {
    const res = await app.request('/digest/2026-11-01');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');
    expect(await res.text()).toContain('alpha/retried');
  });

  it('404s for a night with no file', async () => {
    expect((await app.request('/digest/2026-11-30')).status).toBe(404);
  });

  it('says nothing ran for an empty file', async () => {
    const res = await app.request('/digest/2026-11-02');
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('nothing ran');
  });

  it('keeps the good jobs and reports a bad line', async () => {
    const res = await app.request('/digest/2026-11-03');
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('good/job');
    expect(html).toContain('1 line could not be read');
  });

  it('shows a null owner as a dash', async () => {
    const html = await (await app.request('/digest/2026-11-01')).text();
    expect(rowHtml(html, 'november/orphan')).toContain('—');
  });

  it('marks retried and failed jobs with the warn class, not clean ones', async () => {
    const html = await (await app.request('/digest/2026-11-01')).text();
    expect(rowHtml(html, 'alpha/retried')).toMatch(/class="[^"]*\bwarn\b/);
    expect(rowHtml(html, 'mike/failed')).toMatch(/class="[^"]*\bwarn\b/);
    expect(rowHtml(html, 'zulu/clean')).not.toMatch(/\bwarn\b/);
  });
});

describe('GET /api/digest/:night', () => {
  it('returns the digest as JSON', async () => {
    const res = await app.request('/api/digest/2026-11-01');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ night: '2026-11-01', badLines: 0 });
    expect(body.rows).toHaveLength(4);
    expect(body.counts).toEqual({ ok: 3, retry: 3, fail: 1 });
  });

  it('404s with an error body for a night with no file', async () => {
    const res = await app.request('/api/digest/2026-11-30');
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'no such night' });
  });

  it('returns no rows for an empty file', async () => {
    const res = await app.request('/api/digest/2026-11-02');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.rows).toEqual([]);
    expect(body.badLines).toBe(0);
  });

  it('counts a bad line and keeps the good rows', async () => {
    const res = await app.request('/api/digest/2026-11-03');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.badLines).toBe(1);
    expect(body.rows.map((r: JsonRow) => r.job)).toEqual(['good/job']);
  });

  it('keeps a null owner null', async () => {
    const body = await (await app.request('/api/digest/2026-11-01')).json();
    const row = body.rows.find((r: JsonRow) => r.job === 'november/orphan');
    expect(row.owner).toBeNull();
  });
});

describe('page and JSON agree', () => {
  it('lists jobs in the same sorted order', async () => {
    const body = await (await app.request('/api/digest/2026-11-01')).json();
    const jobs: string[] = body.rows.map((r: JsonRow) => r.job);
    expect(jobs).toEqual([...jobs].sort());

    const html = await (await app.request('/digest/2026-11-01')).text();
    const positions = jobs.map((j) => html.indexOf(j));
    expect(positions.every((p) => p >= 0)).toBe(true);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });
});

describe('path traversal', () => {
  it.each(['/digest/..%2Fsecret', '/api/digest/..%2Fsecret'])('404s on %s', async (path) => {
    const res = await app.request(path);
    expect(res.status).toBe(404);
    expect(await res.text()).not.toContain('leak/job');
  });
});
