export interface User { id: number; email: string; display_name: string | null }
export interface Me { user: User; isAdmin: boolean }

export async function api<T = any>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<{ status: number; data: T }> {
  const res = await fetch(`/api${path}`, {
    method: opts.method ?? (opts.body ? "POST" : "GET"),
    headers: opts.body ? { "Content-Type": "application/json" } : undefined,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
    credentials: "same-origin",
  });
  let data: any = null;
  try { data = await res.json(); } catch { /* empty */ }
  return { status: res.status, data };
}

export const storage = {
  get(key: string) { try { return localStorage.getItem(key); } catch { return null; } },
  set(key: string, v: string) { try { localStorage.setItem(key, v); } catch { /* ignore */ } },
};
