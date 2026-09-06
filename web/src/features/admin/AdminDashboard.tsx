'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiClient } from '@/shared/api/client';
import { RuntimeSettingsPanel } from './RuntimeSettingsPanel';

const API = process.env.NEXT_PUBLIC_API_BASE_URL ?? '';

export function AdminDashboard() {
  type Account = { id: string; email: string; name: string; role: string };
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [budgetProject, setBudgetProject] = useState<string | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountMessage, setAccountMessage] = useState('');
  const loadAccounts = useCallback(async () => {
    const response = await fetch(`${API}/api/v1/admin/accounts`, { credentials: 'include' });
    if (response.ok) setAccounts(await response.json() as Account[]);
  }, []);
  useEffect(() => {
    void apiClient.listAdminBudgetProjects().then((projects) => setBudgetProject(projects[0] ?? null)).catch(() => setBudgetProject(null));
    void loadAccounts();
  }, [loadAccounts]);
  function errorMessage(payload: unknown, fallback: string) {
    if (payload && typeof payload === 'object' && 'detail' in payload) {
      const detail = (payload as { detail?: unknown }).detail;
      if (detail && typeof detail === 'object' && 'message' in detail) return String((detail as { message: unknown }).message);
      if (typeof detail === 'string') return detail;
    }
    return fallback;
  }
  async function createAccount() {
    const response = await fetch(`${API}/api/v1/admin/accounts`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, name, password, role: 'author' }) });
    const payload = await response.json().catch(() => null);
    setMessage(response.ok ? 'Đã tạo tài khoản.' : errorMessage(payload, 'Không thể tạo tài khoản.'));
    if (response.ok) { setEmail(''); setName(''); setPassword(''); await loadAccounts(); }
  }
  async function resetPassword(account: Account) {
    const nextPassword = window.prompt(`Mật khẩu mới cho ${account.email} (ít nhất 8 ký tự):`);
    if (!nextPassword) return;
    const response = await fetch(`${API}/api/v1/admin/accounts/${encodeURIComponent(account.id)}/password-reset`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: nextPassword }) });
    const payload = await response.json().catch(() => null);
    setAccountMessage(response.ok ? `Đã reset mật khẩu cho ${account.email}.` : errorMessage(payload, 'Không thể reset mật khẩu.'));
  }
  async function deleteAccount(account: Account) {
    if (!window.confirm(`Xóa vĩnh viễn tài khoản ${account.email}? Dữ liệu xác thực sẽ không thể khôi phục.`)) return;
    const response = await fetch(`${API}/api/v1/admin/accounts/${encodeURIComponent(account.id)}`, { method: 'DELETE', credentials: 'include' });
    const payload = await response.json().catch(() => null);
    if (response.ok) { setAccounts((current) => current.filter((item) => item.id !== account.id)); setAccountMessage(`Đã xóa ${account.email}.`); }
    else setAccountMessage(errorMessage(payload, 'Không thể xóa tài khoản.'));
  }
  return <main className="min-h-dvh bg-background px-6 py-10"><div className="mx-auto max-w-5xl space-y-8">
    <header><p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Scenario Forge / Admin</p><h1 className="mt-2 text-3xl font-semibold">Control plane</h1><p className="mt-2 text-sm text-muted-foreground">Quản lý account, budget LLM và runtime settings.</p></header>
    <nav className="grid gap-4 sm:grid-cols-3"><a className={`rounded-xl border p-5 hover:bg-muted ${!budgetProject ? 'pointer-events-none opacity-50' : ''}`} href={budgetProject ? `/admin/projects/${encodeURIComponent(budgetProject)}/members` : '#'}><h2 className="font-semibold">Budgets</h2><p className="mt-2 text-sm text-muted-foreground">Quota theo project runtime</p></a><a className="rounded-xl border p-5 hover:bg-muted" href="#accounts"><h2 className="font-semibold">Accounts</h2><p className="mt-2 text-sm text-muted-foreground">Tạo account và reset password</p></a><a className="rounded-xl border p-5 hover:bg-muted" href="#settings"><h2 className="font-semibold">Settings</h2><p className="mt-2 text-sm text-muted-foreground">Provider, model, runtime và secret status</p></a></nav>
    <section id="accounts" className="space-y-6 rounded-xl border bg-card p-6"><div><h2 className="text-lg font-semibold">Tài khoản</h2><p className="mt-1 text-sm text-muted-foreground">Tạo, reset mật khẩu hoặc xóa vĩnh viễn tài khoản.</p></div><div className="grid max-w-xl gap-3"><input aria-label="Email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} className="rounded border px-3 py-2" /><input aria-label="Tên" placeholder="Tên hiển thị" value={name} onChange={(e) => setName(e.target.value)} className="rounded border px-3 py-2" /><input aria-label="Mật khẩu" placeholder="Mật khẩu tạm thời (tối thiểu 8 ký tự)" type="password" minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} className="rounded border px-3 py-2" /><button type="button" onClick={() => void createAccount()} disabled={!email || !name || password.length < 8} className="rounded bg-primary px-4 py-2 text-primary-foreground disabled:opacity-50">Tạo tài khoản</button>{message && <p role="status" className="text-sm text-muted-foreground">{message}</p>}</div><div className="overflow-x-auto rounded border"><table className="w-full text-left text-sm"><thead className="border-b bg-muted/40"><tr><th className="px-3 py-2">Email</th><th className="px-3 py-2">Tên</th><th className="px-3 py-2">Role</th><th className="px-3 py-2">Thao tác</th></tr></thead><tbody>{accounts.map((account) => <tr key={account.id} className="border-b last:border-0"><td className="px-3 py-2">{account.email}</td><td className="px-3 py-2">{account.name}</td><td className="px-3 py-2">{account.role}</td><td className="flex gap-2 px-3 py-2"><button type="button" onClick={() => void resetPassword(account)} className="rounded border px-2 py-1">Reset mật khẩu</button><button type="button" onClick={() => void deleteAccount(account)} className="rounded border border-destructive px-2 py-1 text-destructive">Xóa vĩnh viễn</button></td></tr>)}</tbody></table></div>{accountMessage && <p role="status" className="text-sm text-muted-foreground">{accountMessage}</p>}</section>
    <section id="settings" className="rounded-xl border bg-card p-6"><h2 className="text-lg font-semibold">Server settings</h2><p className="mt-2 text-sm text-muted-foreground">Provider, model và giới hạn runtime của agent. API key không bao giờ hiển thị plaintext.</p><RuntimeSettingsPanel /></section>
  </div></main>;
}
