"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { auth } from "../../lib/firebase";
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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => setUser(u));
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
    } catch (err: any) {
      setError(err.message || "認証に失敗しました");
    } finally {
      setLoading(false);
    }
  };

  const handleSignOut = async () => {
    await signOut(auth);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 p-8">
      <div className="w-full max-w-md rounded-lg bg-white p-6 shadow">
        <h1 className="mb-4 text-2xl font-semibold">
          {user ? "ようこそ" : isRegister ? "アカウント作成" : "ログイン"}
        </h1>

        {user ? (
          <div>
            <p className="mb-2">{user.email}</p>
            <div className="flex gap-2">
              <Link href="/home" className="rounded bg-blue-600 px-4 py-2 text-white">
                home
              </Link>
              <button
                className="rounded border px-4 py-2"
                onClick={handleSignOut}
              >
                サインアウト
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <label className="flex flex-col text-sm">
              Email
              <input
                className="mt-1 rounded border px-2 py-1"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </label>

            <label className="flex flex-col text-sm">
              Password
              <input
                className="mt-1 rounded border px-2 py-1"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </label>

            {error && (
              <div className="text-sm text-red-600">{error}</div>
            )}

            <div className="flex items-center gap-3">
              <button
                type="submit"
                disabled={loading}
                className="rounded bg-foreground px-4 py-2 text-background disabled:opacity-60"
              >
                {isRegister ? "アカウント作成" : "ログイン"}
              </button>

              <button
                type="button"
                className="text-sm underline"
                onClick={() => setIsRegister((s) => !s)}
              >
                {isRegister ? "既にアカウントを持っている" : "アカウント作成"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
