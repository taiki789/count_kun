"use client";

import React, { useState, useContext, useEffect } from "react"; // useEffectを追加
import { useRouter } from "next/navigation"; // useRouterを追加
import { auth } from "../../lib/firebase"; // authをインポート
import { onAuthStateChanged, signOut } from "firebase/auth"; // signOutを追加（ログアウト用）
import { PrizeContext } from "../PrizeContext";
import Link from "next/link";

function CounterForm({ isMobile }: { isMobile: boolean }) {
  const [numbers, setNumbers] = useState<string[]>(["", "", "", "", ""]);
  const [loading, setLoading] = useState(false);
  const { resetContext } = useContext(PrizeContext);

  const total = numbers.reduce((sum, n) => sum + (Number(n) || 0), 0);

  const handleChange = (index: number, value: string) => {
    const updated = [...numbers];
    updated[index] = value;
    setNumbers(updated);
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    try {
      const numValues = numbers.map((n) => Number(n) || 0);
      resetContext(numValues);
      alert("設定を保存しました！");
    } finally {
      setLoading(false);
    }
  };

  const inputFields = [1, 2, 3, 4, 5].map((rank, i) => (
    <div key={i} className={`flex flex-col ${isMobile ? "w-full" : "flex-1"}`}>
      <label className="text-xs font-bold text-gray-500 mb-1">{rank}等</label>
      <input
        type="number"
        min="0"
        value={numbers[i]}
        placeholder="0"
        className="w-full rounded-xl border-2 border-gray-100 p-3 text-lg font-bold focus:border-blue-500 focus:outline-none text-black"
        onChange={(e) => handleChange(i, e.target.value)}
      />
    </div>
  ));

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className={isMobile ? "space-y-4" : "flex gap-4 bg-gray-50 p-6 rounded-3xl"}>
        {inputFields}
      </div>

      <div className={`flex items-center justify-between ${isMobile ? "flex-col gap-4" : "bg-white p-6 border-t"}`}>
        <div className="text-center md:text-left">
          <p className="text-sm text-gray-400">Total Items</p>
          <p className="text-3xl font-black text-blue-600">{total}</p>
        </div>

        
        <button
        type="submit"
        disabled={loading}
        className={`${isMobile ? "w-full" : "px-12"} h-14 rounded-2xl bg-gray-900 text-white font-bold shadow-xl active:scale-95 transition-all disabled:opacity-50`}
        >
          {loading ? "SAVING..." : "在庫を確定"}
        </button>
      </div>
      <div className="text-center text-sm text-gray-400">
       <p>確定を完了しましたらホームへ戻るを押してください</p>
      </div>
    </form>
  );
}

export default function SettingsPage() {
  const router = useRouter();

  // ▼ 追加: 認証チェック
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (!user) {
        router.push("/");
      }
    });
    return () => unsub();
  }, [router]);

  // ▼ 追加: ログアウト処理
  const handleLogout = async () => {
    if (confirm("ログアウトしますか？")) {
      await signOut(auth);
      router.push("/");
    }
  };

  return (
    <div className="min-h-screen bg-white">
      {/* --- PC版 UI --- */}
      <div className="hidden md:block max-w-6xl mx-auto p-10">
        <header className="mb-10 flex justify-between items-end">
          <div>
            <h1 className="text-4xl font-black text-gray-900">Inventory Setup</h1>
            <p className="text-gray-400 font-medium border-l-4 border-blue-500 pl-4 mt-2">
              景品の初期在庫を設定してください
            </p>
          </div>
          <div className="flex gap-4">
            <Link href="/home" className="px-6 py-2 border-2 rounded-full text-sm font-bold hover:bg-gray-50 transition-colors">
              HOME画面へ
            </Link>
            <button 
              onClick={handleLogout}
              className="px-6 py-2 border-2 border-red-100 text-red-500 rounded-full text-sm font-bold hover:bg-red-50 transition-colors"
            >
            ログアウト
            </button>
          </div>
        </header>
        <div className="bg-white rounded-[3rem] shadow-2xl border border-gray-100 overflow-hidden">
          <CounterForm isMobile={false} />
        </div>
      </div>

      {/* --- 携帯版 UI --- */}
      <div className="md:hidden p-6 pb-24">
        <header className="mb-8 flex justify-between items-start">
          <div>
            <h1 className="text-2xl font-black text-gray-900">在庫設定</h1>
            <p className="text-sm text-gray-400">各等の数を入力してください</p>
          </div>
          <button 
            onClick={handleLogout}
            className="text-xs font-bold text-red-400 bg-red-50 px-3 py-1 rounded-full"
          >
            ログアウト
          </button>
        </header>
        <CounterForm isMobile={true} />
        <div className="mt-10 flex flex-col items-center gap-6">
          <Link href="/home" className="text-blue-500 font-bold text-sm underline decoration-2 underline-offset-4">
            保存せずにHOMEへ
          </Link>
        </div>
      </div>
    </div>
  );
}