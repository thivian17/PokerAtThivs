import { useEffect, useState } from "react";
import { api, type Me } from "../api";

interface Row { email: string; name: string | null; source: string; created_at: string; last_login_at: string | null }
interface Stats { total: number; loggedIn: number; bySource: Record<string, number> }

export default function Admin({ me, onBack, onUnlocked }: { me: Me; onBack: () => void; onUnlocked: () => void }) {
  if (!me.adminUnlocked) return <AdminUnlock me={me} onBack={onBack} onUnlocked={onUnlocked} />;
  return <AdminPanel me={me} onBack={onBack} />;
}

function AdminUnlock({ me, onBack, onUnlocked }: { me: Me; onBack: () => void; onUnlocked: () => void }) {
  const [pw, setPw] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const { status, data } = await api("/auth/admin-unlock", { body: { password: pw } });
    if (status === 200) return onUnlocked();
    setPw("");
    setMsg(data?.status === "rate_limited" ? `Too many tries. Wait ${data.retryAfterSeconds}s.` : "Wrong password.");
  }
  return (
    <div className="admin">
      <header className="calc-top">
        <button className="chip" onClick={onBack}>← Calculator</button>
        <div className="wordmark">ADMIN</div>
        <span />
      </header>
      <form className="panel" onSubmit={submit}>
        <h2>Host check</h2>
        <p className="muted">Signed in as <b>{me.user.email}</b>. Enter the admin password to manage the guest list.</p>
        <input type="password" autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} autoFocus required />
        <button className="btn gold">Unlock</button>
        {msg && <p className="msg">{msg}</p>}
      </form>
    </div>
  );
}

function AdminPanel({ me, onBack }: { me: Me; onBack: () => void }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [search, setSearch] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newName, setNewName] = useState("");
  const [bulkText, setBulkText] = useState("");
  const [bulkPreview, setBulkPreview] = useState<BulkPreview | null>(null);
  const [csvText, setCsvText] = useState<string | null>(null);
  const [preview, setPreview] = useState<any>(null);
  const [showCsv, setShowCsv] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [note, setNote] = useState<{ text: string; bad?: boolean } | null>(null);

  const load = async () => {
    const { data } = await api("/admin/allowlist");
    if (data?.rows) { setRows(data.rows); setStats(data.stats); }
  };
  useEffect(() => { load(); }, []);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const { status, data } = await api("/admin/allowlist", { body: { email: newEmail, name: newName || undefined } });
    if (status === 200) { setNote({ text: `Added ${data.email}. They can sign in now.` }); setNewEmail(""); setNewName(""); load(); }
    else setNote({ text: data?.error ?? "Couldn't add that person", bad: true });
  }
  async function remove(r: Row) {
    if (!confirm(`Remove ${r.name ?? r.email}? They'll lose access right away.`)) return;
    await api(`/admin/allowlist/${encodeURIComponent(r.email)}`, { method: "DELETE" });
    setNote({ text: `Removed ${r.email}` });
    load();
  }
  async function saveName(email: string) {
    const { status, data } = await api(`/admin/allowlist/${encodeURIComponent(email)}`, { method: "PATCH", body: { name: editName } });
    if (status !== 200) setNote({ text: data?.error ?? "Couldn't save", bad: true });
    setEditing(null); load();
  }

  async function previewBulk() {
    if (!bulkText.trim()) return;
    const { status, data } = await api<BulkPreview>("/admin/allowlist/bulk", { body: { text: bulkText, dryRun: true } });
    if (status === 200) setBulkPreview(data); else setNote({ text: (data as any)?.error ?? "Couldn't read that paste", bad: true });
  }
  async function importBulk() {
    const { status, data } = await api<BulkPreview & { added: number }>("/admin/allowlist/bulk", { body: { text: bulkText, dryRun: false } });
    if (status !== 200) return setNote({ text: (data as any)?.error ?? "Import failed", bad: true });
    setNote({ text: `Added ${data.added} ${data.added === 1 ? "person" : "people"}${data.duplicates ? ` · skipped ${data.duplicates} duplicate${data.duplicates === 1 ? "" : "s"}` : ""}.` });
    setBulkText(""); setBulkPreview(null); load();
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
    setNote(data?.error ? { text: data.error, bad: true } : { text: `Imported ${data.imported} new people (${data.alreadyPresent} already on the list).` });
    setPreview(null); setCsvText(null); load();
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
        <div className="stats stats-3">
          <div><b>{stats.total}</b><span>on the list</span></div>
          <div><b>{stats.loggedIn}</b><span>signed in</span></div>
          <div><b>{stats.total - stats.loggedIn}</b><span>not yet</span></div>
        </div>
      )}

      {note && <div className={`note ${note.bad ? "bad" : ""}`} onClick={() => setNote(null)}>{note.text}</div>}

      <section className="card-box">
        <div className="label">Bulk add from the Form</div>
        <p className="small muted">Forms → Responses → Open results in Excel → select the Name and Email columns → copy → paste here. Re-pasting the whole sheet is safe because people already on the list are skipped.</p>
        <textarea
          className="bulk"
          rows={5}
          placeholder={"Jordan Lee\tjordan.lee@optimussbr.com\nSam Patel\tsam.patel@optimussbr.com"}
          value={bulkText}
          onChange={(e) => { setBulkText(e.target.value); setBulkPreview(null); }}
        />
        {!bulkPreview ? (
          <button className="btn gold" disabled={!bulkText.trim()} onClick={previewBulk}>Preview</button>
        ) : (
          <div className="csv-preview">
            <p><b>{bulkPreview.toAdd.length}</b> to add · {bulkPreview.duplicates} duplicate{bulkPreview.duplicates === 1 ? "" : "s"} · {bulkPreview.invalid.length} invalid</p>
            {bulkPreview.toAdd.length > 0 && (
              <ul className="bulk-list">
                {bulkPreview.toAdd.slice(0, 12).map((r) => <li key={r.email}><b>{r.name ?? "–"}</b> <span className="muted">{r.email}</span></li>)}
                {bulkPreview.toAdd.length > 12 && <li className="muted">…and {bulkPreview.toAdd.length - 12} more</li>}
              </ul>
            )}
            {bulkPreview.alreadyOnList.length > 0 && <p className="small muted">Already on the list: {bulkPreview.alreadyOnList.join(", ")}</p>}
            {bulkPreview.invalid.length > 0 && <p className="small msg">Skipped (line {bulkPreview.invalid.map((i) => `${i.line}: "${i.value}"`).join(", line ")})</p>}
            <div className="row-form">
              <button className="btn gold" disabled={!bulkPreview.toAdd.length} onClick={importBulk}>Add {bulkPreview.toAdd.length} {bulkPreview.toAdd.length === 1 ? "person" : "people"}</button>
              <button className="btn ghost" onClick={() => setBulkPreview(null)}>Edit</button>
            </div>
          </div>
        )}
      </section>

      <section className="card-box">
        <div className="label">Add one person</div>
        <form className="row-form" onSubmit={add}>
          <input placeholder="Name" value={newName} onChange={(e) => setNewName(e.target.value)} autoComplete="off" />
          <input type="email" placeholder="email@optimussbr.com" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} required autoComplete="off" />
          <button className="btn gold small-btn">Add</button>
        </form>
      </section>

      <section className="card-box">
        <div className="label">Guest list</div>
        <input placeholder="Search name or email" value={search} onChange={(e) => setSearch(e.target.value)} />
        <div className="table-wrap">
          <table className="allow">
            <thead><tr><th>Name</th><th>Email</th><th>In?</th><th /></tr></thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.email}>
                  <td>
                    {editing === r.email ? (
                      <form className="inline-edit" onSubmit={(e) => { e.preventDefault(); saveName(r.email); }}>
                        <input value={editName} onChange={(e) => setEditName(e.target.value)} autoFocus onBlur={() => saveName(r.email)} />
                      </form>
                    ) : (
                      <button className="link name-btn" onClick={() => { setEditing(r.email); setEditName(r.name ?? ""); }} title="Edit name">{r.name ?? "add name"}</button>
                    )}
                  </td>
                  <td className="em">{r.email}</td>
                  <td>{r.last_login_at ? "✓" : ""}</td>
                  <td><button className="link danger" onClick={() => remove(r)} aria-label={`Remove ${r.email}`}>✕</button></td>
                </tr>
              ))}
              {shown.length === 0 && <tr><td colSpan={4} className="muted">{rows.length ? "No match." : "Nobody yet. Paste the Form responses above."}</td></tr>}
            </tbody>
          </table>
        </div>
        <p className="small muted">Tap a name to edit it. Hosts are always allowed in, even if they're not on this list.</p>
      </section>

      <section className="card-box">
        <button className="link" onClick={() => setShowCsv(!showCsv)}>{showCsv ? "Hide" : "Or import a CSV file"}</button>
        {showCsv && (
          <>
            <input type="file" accept=".csv,text/csv" onChange={(e) => onFile(e.target.files?.[0])} />
            {preview && (
              preview.error ? <p className="msg">{preview.error}</p> : (
                <div className="csv-preview">
                  <p className="small">Columns: email = <b>{preview.columns.email}</b>, name = <b>{preview.columns.name ?? "–"}</b></p>
                  <p><b>{preview.new}</b> new · {preview.alreadyPresent} already on list · {preview.invalid.length} invalid · {preview.duplicatesInFile} duplicate rows</p>
                  <button className="btn gold" disabled={!preview.new} onClick={importCsv}>Import {preview.new} people</button>
                </div>
              )
            )}
          </>
        )}
      </section>
    </div>
  );
}

interface BulkPreview {
  toAdd: { line: number; email: string; name: string | null }[];
  invalid: { line: number; value: string }[];
  duplicates: number;
  alreadyOnList: string[];
}
