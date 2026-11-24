import { useEffect, useState } from "react";
import { api, type Me } from "../api";

interface Row { email: string; name: string | null; source: string; created_at: string; last_login_at: string | null }
interface Stats { total: number; loggedIn: number; bySource: Record<string, number> }

export default function Admin({ me, onBack }: { me: Me; onBack: () => void }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [search, setSearch] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newName, setNewName] = useState("");
  const [csvText, setCsvText] = useState<string | null>(null);
  const [preview, setPreview] = useState<any>(null);
  const [note, setNote] = useState<string | null>(null);

  const load = async () => {
    const { data } = await api("/admin/allowlist");
    if (data?.rows) { setRows(data.rows); setStats(data.stats); }
  };
  useEffect(() => { load(); }, []);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const { status, data } = await api("/admin/allowlist", { body: { email: newEmail, name: newName || undefined } });
    setNote(status === 200 ? `Added ${newEmail}` : data?.error ?? "Failed");
    if (status === 200) { setNewEmail(""); setNewName(""); load(); }
  }
  async function remove(email: string) {
    if (!confirm(`Remove ${email} from the list? They'll lose access.`)) return;
    await api(`/admin/allowlist/${encodeURIComponent(email)}`, { method: "DELETE" });
    load();
  }
  async function onFile(f: File | undefined) {
    if (!f) return;
    const text = await f.text();
    setCsvText(text);
    const { data } = await api("/admin/allowlist/csv", { body: { csv: text, dryRun: true } });
    setPreview(data);
  }
  async function importCsv() {
    if (!csvText) return;
    const { data } = await api("/admin/allowlist/csv", { body: { csv: csvText, dryRun: false } });
    setNote(data?.error ?? `Imported ${data.imported} new people (${data.alreadyPresent} already on the list).`);
    setPreview(null); setCsvText(null); load();
  }
  async function testEmail() {
    const { status, data } = await api("/admin/test-email", { method: "POST" });
    setNote(status === 200 ? `Test email sent to ${data.to}` : "Test email failed. Check the SMTP secrets.");
  }

  const shown = rows.filter((r) => `${r.email} ${r.name ?? ""}`.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="admin">
      <header className="calc-top">
        <button className="chip" onClick={onBack}>← Calculator</button>
        <div className="wordmark">ADMIN</div>
        <span className="small muted">{me.user.email}</span>
      </header>

      {stats && (
        <div className="stats">
          <div><b>{stats.total}</b><span>on the list</span></div>
          <div><b>{stats.loggedIn}</b><span>signed in</span></div>
          <div><b>{stats.bySource.form ?? 0}</b><span>form</span></div>
          <div><b>{(stats.bySource.csv ?? 0) + (stats.bySource.manual ?? 0)}</b><span>csv / manual</span></div>
        </div>
      )}

      {note && <div className="note" onClick={() => setNote(null)}>{note}</div>}

      <section className="card-box">
        <div className="label">Add a person</div>
        <form className="row-form" onSubmit={add}>
          <input type="email" placeholder="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} required />
          <input placeholder="name (optional)" value={newName} onChange={(e) => setNewName(e.target.value)} />
          <button className="btn gold small-btn">Add</button>
        </form>
      </section>

      <section className="card-box">
        <div className="label">Import Microsoft Forms export (CSV)</div>
        <p className="small muted">Forms → Responses → Open results in Excel → Save As CSV. Safe to re-import because duplicates are skipped.</p>
        <input type="file" accept=".csv,text/csv" onChange={(e) => onFile(e.target.files?.[0])} />
        {preview && (
          preview.error ? <p className="msg">{preview.error}</p> : (
            <div className="csv-preview">
              <p className="small">Columns: email = <b>{preview.columns.email}</b>, name = <b>{preview.columns.name ?? "–"}</b></p>
              <p><b>{preview.new}</b> new · {preview.alreadyPresent} already on list · {preview.invalid.length} invalid · {preview.duplicatesInFile} duplicate rows</p>
              {preview.invalid.length > 0 && <p className="small muted">Invalid rows: {preview.invalid.map((i: any) => `#${i.row} "${i.value}"`).join(", ")}</p>}
              <button className="btn gold" disabled={!preview.new} onClick={importCsv}>Import {preview.new} people</button>
            </div>
          )
        )}
      </section>

      <section className="card-box">
        <div className="label">Login email</div>
        <div className="row-form">
          <a className="btn ghost small-btn" href="/api/admin/email-preview" target="_blank" rel="noopener">Preview</a>
          <button className="btn ghost small-btn" onClick={testEmail}>Send test to me</button>
        </div>
      </section>

      <section className="card-box">
        <div className="label">Allowlist</div>
        <input placeholder="Search name or email" value={search} onChange={(e) => setSearch(e.target.value)} />
        <div className="table-wrap">
          <table className="allow">
            <thead><tr><th>Name</th><th>Email</th><th>Source</th><th>In?</th><th /></tr></thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.email}>
                  <td>{r.name ?? "–"}</td>
                  <td className="em">{r.email}</td>
                  <td><span className={`src ${r.source}`}>{r.source}</span></td>
                  <td>{r.last_login_at ? "✓" : ""}</td>
                  <td><button className="link danger" onClick={() => remove(r.email)} aria-label={`Remove ${r.email}`}>✕</button></td>
                </tr>
              ))}
              {shown.length === 0 && <tr><td colSpan={5} className="muted">Nobody yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
