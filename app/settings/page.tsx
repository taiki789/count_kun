"use client";

import React, { useState, useContext } from "react";
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

  // PC版とスマホ版で共通の入力パーツを、レイアウトに合わせて出し分け
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
      {/* 入力エリアの切り替え */}
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
          {loading ? "SAVING..." : "在庫を確定して開始"}
        </button>
      </div>
    </form>
  );
}

export default function SettingsPage() {
  return (
    <div className="min-h-screen bg-white">
      {/* --- PC版 UI --- */}
      <div className="hidden md:block max-w-6xl mx-auto p-10">
        <header className="mb-10 flex justify-between items-center">
          <div>
            <h1 className="text-4xl font-black text-gray-900">Inventory Setup</h1>
            <p className="text-gray-400 font-medium">景品の初期在庫を設定してください</p>
          </div>
          <Link href="/home" className="px-6 py-2 border rounded-full text-sm font-bold hover:bg-gray-50">
            HOME画面へ
          </Link>
        </header>
        <div className="bg-white rounded-[3rem] shadow-2xl border border-gray-100 overflow-hidden">
          <CounterForm isMobile={false} />
        </div>
      </div>

      {/* --- 携帯版 UI --- */}
      <div className="md:hidden p-6 pb-24">
        <header className="mb-8">
          <h1 className="text-2xl font-black text-gray-900">在庫設定</h1>
          <p className="text-sm text-gray-400">各等の数を入力してください</p>
        </header>
        <CounterForm isMobile={true} />
        <div className="mt-10 flex justify-center">
          <Link href="/home" className="text-blue-500 font-bold text-sm underline">
            保存せずに戻る
          </Link>
        </div>
      </div>
    </div>
  );
}