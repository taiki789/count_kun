"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { auth } from "../../../lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { getAdminAccounts, getCurrentAdminAccess, updateAdminAccount, type AdminAccountRecord, type AdminGrantRecord } from "../../../lib/adminClient";
import Link from "next/link";

function formatDateTime(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === "") return "-";
  const date = new Date(typeof value === "number" ? value : value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("ja-JP");
}

function formatGrantExpiry(grant: AdminGrantRecord | null) {
  if (!grant) return "一般";
  if (grant.isPermanent) return "永久";
  if (!grant.active) {
    return grant.revokedReason === "expired" ? "失効" : "無効";
  }
  return grant.expiresAt ? formatDateTime(grant.expiresAt) : "-";
}

export default function AdminAccountsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [accessEmail, setAccessEmail] = useState<string | null>(null);
  const [accounts, setAccounts] = useState<AdminAccountRecord[]>([]);
  const [orphanedGrants, setOrphanedGrants] = useState<AdminGrantRecord[]>([]);
  const [grantEmail, setGrantEmail] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const activeAdmins = useMemo(() => accounts.filter((account) => account.admin?.active), [accounts]);

  const loadAccounts = async () => {
    const data = await getAdminAccounts();
    if (!data) {
      throw new Error("管理者情報を取得できませんでした");
    }

    setAccounts(data.accounts ?? []);
    setOrphanedGrants(data.orphanedGrants ?? []);
    setAccessEmail(data.currentUser?.email ?? null);
    setIsAdmin(Boolean(data.currentUser?.isAdmin));
  };

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (!user) {
        router.push("/");
        return;
      }

      void getCurrentAdminAccess()
        .then((access) => {
          if (!access?.isAdmin) {
            setIsAdmin(false);
            router.push("/select-dataset");
            return;
          }

          setAccessEmail(access.email);
          setIsAdmin(true);
          void loadAccounts()
            .catch((loadError) => {
              console.error("Failed to load admin accounts:", loadError);
              setError("アカウント一覧の取得に失敗しました");
            })
            .finally(() => setLoading(false));
        })
        .catch(() => {
          setIsAdmin(false);
          router.push("/select-dataset");
          setLoading(false);
        });
    });

    return () => unsub();
  }, [router]);

  const handleGrant = async (e: React.FormEvent) => {
    e.preventDefault();
    const targetEmail = grantEmail.trim();
    if (!targetEmail) {
      setError("メールアドレスを入力してください");
      return;
    }

    setSaving(true);
    setError(null);
    setMessage(null);

    try {
      const result = await updateAdminAccount("grant", targetEmail);
      if (!result) {
        throw new Error("管理者付与に失敗しました");
      }

      setGrantEmail("");
      setMessage(
        result.action === "already-admin"
          ? "そのアカウントはすでに管理者です"
          : result.revokedEmails && result.revokedEmails.length > 0
            ? `管理者を付与しました。上限調整のため ${result.revokedEmails.join(", ")} を自動失効しました。`
            : "管理者を付与しました"
      );
      await loadAccounts();
    } catch (grantError) {
      const messageText = grantError instanceof Error ? grantError.message : "管理者付与に失敗しました";
      setError(messageText);
    } finally {
      setSaving(false);
    }
  };

  const handleRevoke = async (targetEmail: string) => {
    if (!confirm(`${targetEmail} の管理者権限を取り消しますか？`)) {
      return;
    }

    setSaving(true);
    setError(null);
    setMessage(null);

    try {
      const result = await updateAdminAccount("revoke", targetEmail);
      if (!result) {
        throw new Error("管理者権限の解除に失敗しました");
      }

      setMessage("管理者権限を解除しました");
      await loadAccounts();
    } catch (revokeError) {
      const messageText = revokeError instanceof Error ? revokeError.message : "管理者権限の解除に失敗しました";
      setError(messageText);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-white">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-black border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-xs font-black tracking-widest text-gray-400">LOADING...</p>
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-emerald-50 p-4 md:p-8">
      <div className="mx-auto max-w-7xl">
        <header className="mb-6 md:mb-8 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-3xl md:text-4xl font-black tracking-tight text-gray-900">アカウント管理</h1>
            <p className="mt-1 text-sm text-gray-500">管理者の付与・失効を行います。永久管理者は {"t.taiki1122@gmail.com"} です。</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/admin" className="rounded-full border border-gray-200 bg-white px-4 py-2 text-sm font-black text-gray-700 shadow-sm">
              管理者ページへ戻る
            </Link>
            <Link href="/select-dataset" className="rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-black text-emerald-700 shadow-sm">
              データセットへ
            </Link>
          </div>
        </header>

        <section className="mb-6 rounded-3xl border border-gray-100 bg-white p-5 md:p-6 shadow-lg">
          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-2xl bg-slate-50 p-4">
              <p className="text-xs font-black tracking-widest text-gray-500">現在の管理者数</p>
              <p className="mt-2 text-3xl font-black text-gray-900">{activeAdmins.length}</p>
            </div>
            <div className="rounded-2xl bg-emerald-50 p-4">
              <p className="text-xs font-black tracking-widest text-emerald-700">一時管理者の上限</p>
              <p className="mt-2 text-3xl font-black text-emerald-900">2</p>
            </div>
            <div className="rounded-2xl bg-amber-50 p-4">
              <p className="text-xs font-black tracking-widest text-amber-700">ログイン中の管理者</p>
              <p className="mt-2 break-all text-sm font-bold text-amber-900">{accessEmail ?? "-"}</p>
            </div>
          </div>
        </section>

        <section className="mb-6 rounded-3xl border border-gray-100 bg-white p-5 md:p-6 shadow-lg">
          <h2 className="mb-4 text-xl font-black text-gray-900">管理者を付与</h2>
          <form onSubmit={handleGrant} className="flex flex-col gap-3 md:flex-row">
            <input
              type="email"
              value={grantEmail}
              onChange={(e) => setGrantEmail(e.target.value)}
              placeholder="admin@example.com"
              className="flex-1 rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm font-semibold text-gray-900 outline-none focus:border-emerald-500"
            />
            <button
              type="submit"
              disabled={saving}
              className="rounded-2xl bg-emerald-600 px-5 py-3 text-sm font-black text-white shadow-lg disabled:opacity-60"
            >
              {saving ? "処理中..." : "管理者を付与"}
            </button>
          </form>
          <p className="mt-3 text-xs text-gray-500">各管理者は 1 回だけ他アカウントへ権限を渡せます。期限は 18 か月です。</p>
          {message && <p className="mt-3 rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">{message}</p>}
          {error && <p className="mt-3 rounded-2xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</p>}
        </section>

        <section className="rounded-3xl border border-gray-100 bg-white p-5 md:p-6 shadow-lg">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-xl font-black text-gray-900">アカウント一覧</h2>
            <p className="text-xs font-bold text-gray-500">権限のあるアカウントだけを自動的に失効できます</p>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full border-separate border-spacing-0">
              <thead>
                <tr className="text-left text-xs uppercase tracking-widest text-gray-500">
                  <th className="border-b border-gray-100 px-4 py-3">Email</th>
                  <th className="border-b border-gray-100 px-4 py-3">権限</th>
                  <th className="border-b border-gray-100 px-4 py-3">付与元</th>
                  <th className="border-b border-gray-100 px-4 py-3">期限</th>
                  <th className="border-b border-gray-100 px-4 py-3">最終ログイン</th>
                  <th className="border-b border-gray-100 px-4 py-3">操作</th>
                </tr>
              </thead>
              <tbody>
                {accounts.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-sm text-gray-400">
                      アカウントが見つかりません
                    </td>
                  </tr>
                ) : (
                  accounts.map((account) => {
                    const grant = account.admin;
                    const isPermanent = Boolean(grant?.isPermanent);
                    const isActiveAdmin = Boolean(grant?.active);

                    return (
                      <tr key={account.uid} className="align-top">
                        <td className="border-b border-gray-100 px-4 py-4">
                          <p className="break-all text-sm font-bold text-gray-900">{account.email}</p>
                          {account.displayName && <p className="mt-1 text-xs text-gray-500">{account.displayName}</p>}
                        </td>
                        <td className="border-b border-gray-100 px-4 py-4">
                          <span className={`inline-flex rounded-full px-3 py-1 text-xs font-black ${isPermanent ? "bg-purple-100 text-purple-700" : isActiveAdmin ? "bg-emerald-100 text-emerald-700" : grant ? "bg-gray-100 text-gray-600" : "bg-slate-100 text-slate-600"}`}>
                            {isPermanent ? "永久管理者" : isActiveAdmin ? "一時管理者" : grant ? "失効済み" : "一般"}
                          </span>
                        </td>
                        <td className="border-b border-gray-100 px-4 py-4 text-sm text-gray-600">
                          {grant?.grantedByEmail ?? "-"}
                        </td>
                        <td className="border-b border-gray-100 px-4 py-4 text-sm text-gray-600">
                          {formatGrantExpiry(grant)}
                        </td>
                        <td className="border-b border-gray-100 px-4 py-4 text-sm text-gray-600">
                          {formatDateTime(account.lastSignInTime)}
                        </td>
                        <td className="border-b border-gray-100 px-4 py-4">
                          {grant && isActiveAdmin && !isPermanent ? (
                            <button
                              type="button"
                              onClick={() => void handleRevoke(account.email)}
                              disabled={saving}
                              className="rounded-full border border-red-200 px-4 py-2 text-xs font-black text-red-600 disabled:opacity-60"
                            >
                              失効
                            </button>
                          ) : (
                            <span className="text-xs text-gray-400">-</span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>

        {orphanedGrants.length > 0 && (
          <section className="mt-6 rounded-3xl border border-amber-200 bg-amber-50 p-5 md:p-6 shadow-lg">
            <h2 className="mb-3 text-lg font-black text-amber-900">孤立した管理者記録</h2>
            <div className="space-y-2">
              {orphanedGrants.map((grant) => (
                <div key={grant.email} className="rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-amber-900">
                  {grant.email} / {grant.isPermanent ? "永久" : grant.active ? "有効" : "無効"}
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
