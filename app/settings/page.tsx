"use client";

import React, { useState, useContext, useEffect } from "react"; // useEffectを追加
import { useRouter } from "next/navigation"; // useRouterを追加
import { auth } from "../../lib/firebase"; // authをインポート
import { onAuthStateChanged, signOut } from "firebase/auth"; // signOutを追加（ログアウト用）
import { PrizeContext } from "../PrizeContext";
import Link from "next/link";

function CounterForm() {
  const router = useRouter();
  const { counts, prices, prizeLabels, resetContext, currentDatasetId, startMeasurement, datasets } = useContext(PrizeContext);
  const [numbers, setNumbers] = useState<string[]>([]);
  const [priceNumbers, setPriceNumbers] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [initializedDatasetId, setInitializedDatasetId] = useState<string | null>(null);

  const currentDataset = datasets.find(d => d.id === currentDatasetId);

  // 初回表示時、またはデータセット切替時のみ入力欄を初期化
  useEffect(() => {
    if (counts.length > 0 && initializedDatasetId !== currentDatasetId) {
      setNumbers(counts.map(c => String(c)));
      setPriceNumbers(counts.map((_, i) => String(prices[i] ?? 0)));
      setInitializedDatasetId(currentDatasetId);
    }
  }, [counts, prices, currentDatasetId, initializedDatasetId]);

  const total = numbers.reduce((sum, n) => sum + (Number(n) || 0), 0);
  const totalRevenue = numbers.reduce((sum, n, i) => {
    const countValue = Number(n) || 0;
    const priceValue = Number(priceNumbers[i]) || 0;
    return sum + countValue * priceValue;
  }, 0);

  const handleChange = (index: number, value: string) => {
    const updated = [...numbers];
    updated[index] = value;
    setNumbers(updated);
  };

  const handlePriceChange = (index: number, value: string) => {
    const updated = [...priceNumbers];
    updated[index] = value;
    setPriceNumbers(updated);
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    try {
      const numValues = numbers.map((n) => Number(n) || 0);
      const priceValues = priceNumbers.map((n) => Number(n) || 0);
      await resetContext(numValues, priceValues);
      await startMeasurement(); // 計測開始
      router.push("/home");
    } catch (error) {
      console.error("在庫確定エラー:", error);
      alert("在庫確定に失敗しました。");
    } finally {
      setLoading(false);
    }
  };

  const inputFields = numbers.map((value, i) => (
    <div key={i} className="flex flex-col w-full">
      <label htmlFor={`input-${i}`} className="text-xs font-bold text-gray-500 mb-1">{prizeLabels[i] || `${i + 1}等`}</label>
      <input
        id={`input-${i}`}
        name={`inventory-${i}`}
        type="number"
        min="0"
        value={value}
        placeholder="0"
        className="w-full rounded-xl border-2 border-gray-100 p-3 text-lg font-bold focus:border-blue-500 focus:outline-none text-black"
        onChange={(e) => handleChange(i, e.target.value)}
      />
      <label htmlFor={`price-${i}`} className="text-[10px] font-bold text-gray-500 mt-2 mb-1">金額 (円)</label>
      <input
        id={`price-${i}`}
        name={`price-${i}`}
        type="number"
        min="0"
        value={priceNumbers[i] ?? ""}
        placeholder="0"
        className="w-full rounded-xl border-2 border-gray-100 p-3 text-base font-bold focus:border-emerald-500 focus:outline-none text-black"
        onChange={(e) => handlePriceChange(i, e.target.value)}
      />
    </div>
  ));

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {currentDataset && (
        <div className="rounded-xl border-2 border-indigo-200 bg-indigo-50 p-4">
          <p className="text-xs font-bold text-indigo-600 mb-1">選択中のデータセット</p>
          <p className="text-lg font-black text-indigo-900">{currentDataset.name}</p>
        </div>
      )}
      {numbers.length === 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-700">
          <p className="mb-3">データセットを選択してから設定してください。</p>
          <Link 
            href="/select-dataset"
            className="inline-block bg-amber-600 hover:bg-amber-700 text-white font-bold px-4 py-2 rounded-lg text-xs transition-colors"
          >
            データセットを選択
          </Link>
        </div>
      )}
      <div className={`bg-gray-50 p-4 md:p-6 rounded-3xl grid gap-4 ${numbers.length <= 5 ? "grid-cols-1 sm:grid-cols-2 lg:grid-cols-5" : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 xl:grid-cols-6"}`}>
        {inputFields}
      </div>

      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-white p-2 md:p-6 md:border-t">
        <div className="text-center md:text-left">
          <p className="text-sm text-gray-400">Total Items</p>
          <p className="text-3xl font-black text-blue-600">{total}</p>
          <p className="text-xs text-emerald-600 mt-1">想定売上: ¥{totalRevenue.toLocaleString("ja-JP")}</p>
        </div>

        
        <button
        type="submit"
        disabled={loading || numbers.length === 0}
        className="w-full md:w-auto md:px-12 h-14 rounded-2xl bg-gray-900 text-white font-bold shadow-xl active:scale-95 transition-all disabled:opacity-50 text-sm md:text-base"
        >
          {loading ? "処理中..." : "在庫を確定して計測開始"}
        </button>
      </div>
      <div className="text-center text-sm text-gray-400">
       <p>確定後、自動で計測が開始されホーム画面へ移動します</p>
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

  const handleGoHome = () => {
    router.push("/home");
  };

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-6xl mx-auto px-4 py-6 pb-24 md:p-10 md:pb-10">
        <header className="mb-8 md:mb-10 flex flex-col md:flex-row md:justify-between md:items-end gap-4">
          <div>
            <h1 className="text-3xl md:text-4xl font-black text-gray-900">在庫設定</h1>
            <p className="text-sm md:text-base text-gray-400 font-medium border-l-4 border-blue-500 pl-4 mt-2">
              景品の初期在庫を設定して計測を開始してください
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 md:flex md:gap-4 w-full md:w-auto">
            <button
              onClick={handleGoHome}
              className="px-4 md:px-6 py-2 border-2 rounded-full text-sm font-bold hover:bg-gray-50 transition-colors"
            >
              HOME画面へ
            </button>
            <button
              onClick={handleLogout}
              className="px-4 md:px-6 py-2 border-2 border-red-100 text-red-500 rounded-full text-sm font-bold hover:bg-red-50 transition-colors"
            >
              ログアウト
            </button>
          </div>
        </header>

        <div className="bg-white rounded-[2rem] md:rounded-[3rem] shadow-2xl border border-gray-100 overflow-hidden">
          <div className="p-5 md:p-0">
            <CounterForm />
          </div>
        </div>

        <div className="mt-6 md:hidden text-center">
          <Link href="/home" className="text-blue-500 font-bold text-sm underline decoration-2 underline-offset-4">
            HOMEへ戻る
          </Link>
        </div>
      </div>
    </div>
  );
}