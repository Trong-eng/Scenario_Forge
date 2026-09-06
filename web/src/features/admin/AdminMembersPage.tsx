'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiClient, type MemberBudgetView } from '@/shared/api/client';

type BudgetDraft = Pick<MemberBudgetView, 'model_call_limit' | 'delivered_question_limit' | 'answer_storage_limit' | 'backend_active_limit_seconds' | 'human_response_limit_seconds'> & { reason: string };

export function AdminMembersPage({ projectId }: { projectId: string }) {
  const [members, setMembers] = useState<MemberBudgetView[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, BudgetDraft>>({});
  const load = useCallback(() => apiClient.listAdminMembers(projectId).then((next) => { setMembers(next); setDrafts(Object.fromEntries(next.map((member) => [member.subject_user_id, { model_call_limit: member.model_call_limit, delivered_question_limit: member.delivered_question_limit, answer_storage_limit: member.answer_storage_limit, backend_active_limit_seconds: member.backend_active_limit_seconds, human_response_limit_seconds: member.human_response_limit_seconds, reason: '' }]))); }).catch((e) => setError(e instanceof Error ? e.message : 'Không thể tải thành viên.')), [projectId]);
  useEffect(() => { void load(); }, [load]);
  function updateDraft(subjectUserId: string, patch: Partial<BudgetDraft>) {
    setDrafts((all) => all[subjectUserId] ? ({ ...all, [subjectUserId]: { ...all[subjectUserId], ...patch } }) : all);
  }
  async function extend(member: MemberBudgetView) {
    const draft = drafts[member.subject_user_id];
    if (!draft?.reason.trim() || draft.model_call_limit < 1) return;
    setBusy(member.subject_user_id);
    try { await apiClient.createBudgetExtension(projectId, member.subject_user_id, { additional_model_calls: draft.model_call_limit, additional_question_limit: 0, additional_answer_storage_limit: 0, extension_seconds: 3600, reason: draft.reason }); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Không thể gia hạn quota.'); }
    finally { setBusy(null); }
  }
  async function revoke(member: MemberBudgetView, extensionId: string) {
    setBusy(extensionId);
    try { await apiClient.revokeBudgetExtension(projectId, member.subject_user_id, extensionId); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Không thể thu hồi quota.'); }
    finally { setBusy(null); }
  }
  async function savePolicy(member: MemberBudgetView) {
    const draft = drafts[member.subject_user_id];
    if (!draft) return;
    setBusy(`policy:${member.subject_user_id}`);
    try { await apiClient.updateBudgetPolicy(projectId, member.subject_user_id, { ...draft, reason: draft.reason || 'Admin policy update' }); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Không thể lưu budget policy.'); }
    finally { setBusy(null); }
  }
  return <main className="min-h-dvh bg-background px-6 py-10"><div className="mx-auto max-w-5xl space-y-8">
    <header><p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Admin / Budget</p><h1 className="mt-2 text-3xl font-semibold">Quản lý quota thành viên</h1><p className="mt-2 text-sm text-muted-foreground">Quota hữu hạn, mở rộng cộng dồn và có thể thu hồi.</p></header>
    {error && <p role="alert" className="rounded-lg border border-destructive/30 p-3 text-sm text-destructive">{error}</p>}
    <section className="space-y-3">{members.map((member) => { const draft = drafts[member.subject_user_id]; return <article key={member.subject_user_id} className="rounded-xl border border-border bg-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-4"><div><h2 className="font-medium">{member.name || member.email}</h2><p className="text-sm text-muted-foreground">{member.email} · {member.role}</p></div><div className="text-right text-sm"><p>{member.remaining} / {member.effective_limit} calls còn lại</p><p className="text-muted-foreground">{member.status}</p></div></div>
      <div className="mt-4 grid gap-3 sm:grid-cols-5"><label className="text-sm">Calls<input aria-label={`Số model calls ${member.subject_user_id}`} type="number" min={1} max={10000} value={draft?.model_call_limit ?? ''} onChange={(e) => updateDraft(member.subject_user_id, { model_call_limit: Number(e.target.value) })} className="mt-1 block w-full rounded border px-2 py-1" /></label><label className="text-sm">Questions<input aria-label={`Số câu hỏi ${member.subject_user_id}`} type="number" min={0} max={1000} value={draft?.delivered_question_limit ?? ''} onChange={(e) => updateDraft(member.subject_user_id, { delivered_question_limit: Number(e.target.value) })} className="mt-1 block w-full rounded border px-2 py-1" /></label><label className="text-sm">Answers<input aria-label={`Số answer ${member.subject_user_id}`} type="number" min={0} max={10000} value={draft?.answer_storage_limit ?? ''} onChange={(e) => updateDraft(member.subject_user_id, { answer_storage_limit: Number(e.target.value) })} className="mt-1 block w-full rounded border px-2 py-1" /></label><label className="text-sm">Backend sec<input aria-label={`Backend active seconds ${member.subject_user_id}`} type="number" min={1} max={86400} value={draft?.backend_active_limit_seconds ?? ''} onChange={(e) => updateDraft(member.subject_user_id, { backend_active_limit_seconds: Number(e.target.value) })} className="mt-1 block w-full rounded border px-2 py-1" /></label><label className="text-sm">Human sec<input aria-label={`Human response seconds ${member.subject_user_id}`} type="number" min={1} max={86400} value={draft?.human_response_limit_seconds ?? ''} onChange={(e) => updateDraft(member.subject_user_id, { human_response_limit_seconds: Number(e.target.value) })} className="mt-1 block w-full rounded border px-2 py-1" /></label></div><div className="mt-3 flex flex-wrap items-end gap-3"><label className="min-w-64 flex-1 text-sm">Lý do<input aria-label={`Lý do quota ${member.subject_user_id}`} value={draft?.reason ?? ''} onChange={(e) => updateDraft(member.subject_user_id, { reason: e.target.value })} className="mt-1 block w-full rounded border px-2 py-1" /></label><button type="button" disabled={busy === `policy:${member.subject_user_id}`} onClick={() => void savePolicy(member)} className="rounded border px-4 py-2 text-sm disabled:opacity-50">Lưu policy</button><button type="button" disabled={busy === member.subject_user_id || !draft?.reason.trim()} onClick={() => void extend(member)} className="rounded bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50">{busy === member.subject_user_id ? 'Đang lưu…' : 'Gia hạn thêm'}</button></div>
      {member.extensions.length > 0 && <ul className="mt-4 space-y-2 text-sm">{member.extensions.map((extension) => <li key={extension.extension_id} className="flex items-center justify-between rounded border px-3 py-2"><span>+{extension.additional_model_calls} calls · {extension.reason} · {extension.status}</span>{extension.status === 'active' && <button type="button" disabled={busy === extension.extension_id} onClick={() => void revoke(member, extension.extension_id)} className="text-destructive">Thu hồi</button>}</li>)}</ul>}
    </article>; })}</section>
  </div></main>;
}
