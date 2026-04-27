"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { auth } from "../../lib/firebase";
import { getCurrentAdminAccess } from "../../lib/adminClient";
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  User,
} from "firebase/auth";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isRegister, setIsRegister] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      if (!u) {
        setIsAdmin(false);
        return;
      }

      void getCurrentAdminAccess()
        .then((access) => setIsAdmin(Boolean(access?.isAdmin)))
        .catch(() => setIsAdmin(false));
    });
    return () => unsub();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      if (isRegister) {
        await createUserWithEmailAndPassword(auth, email, password);
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
      setEmail("");
      setPassword("");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "認証に失敗しました";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const handleSignOut = async () => {
    await signOut(auth);
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-100 via-zinc-50 to-white px-4 py-8 md:px-8 md:py-12">
      <div className="mx-auto w-full max-w-xl rounded-3xl border border-white/80 bg-white p-5 shadow-xl md:p-8">
        <div className="mb-5 rounded-2xl bg-slate-900 px-4 py-4 text-white md:px-5">
          <p className="text-[11px] font-black tracking-[0.2em]">COUNT KUN</p>
          <h1 className="mt-2 text-2xl font-black md:text-3xl">
            {user ? "メニュー" : isRegister ? "アカウント作成" : "ログイン"}
          </h1>
          <p className="mt-1 text-xs text-slate-200 md:text-sm">
            {user
              ? "ログイン状態を確認して操作メニューを選択してください"
              : "まずはログインして管理メニューへ進みます"}
          </p>
        </div>

        {user ? (
          <div className="space-y-4">
            <div className="rounded-2xl border border-gray-100 bg-gray-50 px-4 py-3">
              <p className="text-[11px] font-black tracking-[0.15em] text-gray-500">SIGNED IN</p>
              <p className="mt-1 break-all text-sm font-bold text-gray-900">{user.email}</p>
            </div>

            {isAdmin ? (
              <div className="space-y-3">
                <div className="rounded-2xl border border-indigo-100 bg-indigo-50 px-4 py-3">
                  <p className="text-xs font-black text-indigo-700">管理者メニュー</p>
                  <p className="mt-1 text-[11px] font-semibold text-indigo-700">スマホでも使いやすいように主要操作を上から並べています</p>
                </div>
                <Link href="/select-dataset" className="block w-full rounded-2xl bg-indigo-600 px-4 py-4 text-center text-sm font-black text-white shadow-lg shadow-indigo-200 transition hover:bg-indigo-700">
                  データセットを選ぶ
                </Link>
                <Link href="/admin" className="block w-full rounded-2xl bg-slate-800 px-4 py-4 text-center text-sm font-black text-white shadow-lg shadow-slate-200 transition hover:bg-slate-900">
                  景品管理を開く
                </Link>
                <Link href="/admin/accounts" className="block w-full rounded-2xl bg-emerald-600 px-4 py-4 text-center text-sm font-black text-white shadow-lg shadow-emerald-200 transition hover:bg-emerald-700">
                  アカウント管理を開く
                </Link>
              </div>
            ) : (
              <div className="space-y-3">
                <Link href="/select-dataset" className="block w-full rounded-2xl bg-indigo-600 px-4 py-4 text-center text-sm font-black text-white shadow-lg shadow-indigo-200 transition hover:bg-indigo-700">
                  データセットを選ぶ
                </Link>
                <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
                  <p className="text-xs font-black text-amber-700">一般アカウント</p>
                  <p className="mt-1 text-xs font-semibold text-amber-800">このアカウントでは管理メニューは利用できません</p>
                </div>
              </div>
            )}

            <button
              className="w-full rounded-2xl border border-gray-300 bg-white px-4 py-3 text-sm font-black text-gray-700 transition hover:bg-gray-50"
              onClick={handleSignOut}
            >
              サインアウト
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3">
            <label htmlFor="email-input" className="block text-sm font-bold text-gray-700">
              Email
              <input
                id="email-input"
                name="email"
                className="mt-1 w-full rounded-xl border border-gray-300 bg-white px-3 py-3 text-sm text-gray-900 outline-none focus:border-indigo-500"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </label>

            <label htmlFor="password-input" className="block text-sm font-bold text-gray-700">
              Password
              <input
                id="password-input"
                name="password"
                className="mt-1 w-full rounded-xl border border-gray-300 bg-white px-3 py-3 text-sm text-gray-900 outline-none focus:border-indigo-500"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </label>

            {error && (
              <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{error}</div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="mt-2 w-full rounded-2xl bg-slate-900 px-4 py-3 text-sm font-black text-white transition hover:bg-black disabled:opacity-60"
            >
              {loading ? "処理中..." : isRegister ? "アカウント作成" : "ログイン"}
            </button>

            <button
              type="button"
              className="w-full rounded-2xl border border-gray-300 px-4 py-3 text-sm font-bold text-gray-700 transition hover:bg-gray-50"
              onClick={() => setIsRegister((s) => !s)}
            >
              {isRegister ? "既にアカウントを持っている" : "アカウント作成へ切り替え"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
