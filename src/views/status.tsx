import type { Status } from '../status.js';

export function StatusBoard({ status }: { status: Status }) {
  return (
    <>
      <h1>status</h1>
      <table>
        <tbody>
          <tr><th>adapter</th><td>{status.adapter}</td></tr>
          <tr><th>installed</th><td>{status.installed}</td></tr>
          <tr>
            <th>last beat</th>
            <td>{status.lastBeat ? `${status.lastBeat.at} · pid ${status.lastBeat.pid}` : <span class="warn">none</span>}</td>
          </tr>
        </tbody>
      </table>
      <h2>nights on disk</h2>
      {status.digests.length === 0 ? (
        <p class="mute">nothing in runs/</p>
      ) : (
        <ul>
          {status.digests.map((d) => (
            <li>
              <a href={`/digest/${d.night}`}>{d.night}</a>{' '}
              {d.counts ? `ok ${d.counts.ok} · retry ${d.counts.retry} · fail ${d.counts.fail}` : 'ok — · retry — · fail —'}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
