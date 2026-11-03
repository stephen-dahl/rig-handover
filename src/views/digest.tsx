import type { DigestRow, NightDigest } from '../digest/types.js';

const dash = '—';

function isWarn(row: DigestRow): boolean {
  return row.retries >= 3 || row.fails > 0;
}

export function DigestPage({ digest }: { digest: NightDigest }) {
  const { night, rows, badLines } = digest;
  return (
    <>
      <h1>digest {night}</h1>
      {badLines > 0 && (
        <p class="warn">
          {badLines} {badLines === 1 ? 'line' : 'lines'} could not be read
        </p>
      )}
      {rows.length === 0 ? (
        <p class="mute">nothing ran</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>job</th>
              <th>owner</th>
              <th>runs</th>
              <th>retries</th>
              <th>fails</th>
              <th>last status</th>
              <th>last error</th>
              <th>first</th>
              <th>last</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr class={isWarn(r) ? 'warn' : undefined}>
                <td>
                  {r.job}
                  {isWarn(r) && ' [warn]'}
                </td>
                <td>{r.owner ?? dash}</td>
                <td>{r.runs}</td>
                <td>{r.retries}</td>
                <td>{r.fails}</td>
                <td>{r.lastStatus}</td>
                <td>{r.lastError ?? dash}</td>
                <td>{r.firstAt}</td>
                <td>{r.lastAt}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
