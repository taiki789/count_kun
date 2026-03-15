"use client";

import React, { useContext, useEffect } from "react";
import { useRouter } from "next/navigation";
import { auth } from "../../../lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { PrizeContext } from "../../PrizeContext";

export default function AccountingHistoryPage() {
  const router = useRouter();
  const { accountingHistory, mode, loading } = useContext(PrizeContext);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (!user) {
        router.push("/");
      }
    });
    return () => unsub();
  }, [router]);

  useEffect(() => {
    if (!loading && mode !== "accounting") {
      router.replace("/home");
    }
  }, [loading, mode, router]);

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

  if (mode !== "accounting") {
    return null;
  }

  const sortedHistory = [...accountingHistory].sort((a, b) => b.timestamp - a.timestamp);

  return (
    <div className="min-h-screen bg-[#F8F9FA] p-4 md:p-8">
      <div className="max-w-5xl mx-auto">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
          <div>
            <h1 className="text-2xl md:text-4xl font-black text-gray-900 tracking-tighter">会計履歴</h1>
            <p className="text-sm text-gray-500 mt-1">会計確定した記録を確認できます</p>
          </div>
          <button
            onClick={() => router.push("/home")}
            className="rounded-full border border-emerald-200 px-5 py-2 text-sm font-black text-emerald-700"
          >
            ← 会計画面へ戻る
          </button>
        </div>

        {sortedHistory.length === 0 ? (
          <div className="bg-white rounded-3xl border border-gray-100 shadow p-10 text-center text-gray-400">
            会計履歴はまだありません
          </div>
        ) : (
          <div className="space-y-4">
            {sortedHistory.map((record) => (
              <div key={record.id} className="bg-white rounded-3xl border border-gray-100 shadow p-5 md:p-6">
                <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
                  <div>
                    <p className="text-xs font-black text-emerald-600 tracking-widest">{record.time}</p>
                    <p className="text-sm text-gray-500 mt-1">{new Date(record.timestamp).toLocaleString("ja-JP")}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-gray-500">合計</p>
                    <p className="text-2xl font-black text-gray-900">¥{record.totalAmount.toLocaleString("ja-JP")}</p>
                    <p className="text-sm font-bold text-emerald-700 mt-1">おつり ¥{record.change.toLocaleString("ja-JP")}</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
                  {record.items.map((item) => (
                    <div key={`${record.id}-${item.prizeIndex}`} className="rounded-2xl bg-gray-50 border border-gray-100 p-4">
                      <p className="font-black text-gray-900">{item.label}</p>
                      <p className="text-sm text-gray-500 mt-1">単価 ¥{item.unitPrice.toLocaleString("ja-JP")} / 数量 {item.quantity}</p>
                      <p className="text-lg font-black text-emerald-700 mt-2">小計 ¥{item.subtotal.toLocaleString("ja-JP")}</p>
                    </div>
                  ))}
                </div>

                <div className="rounded-2xl bg-emerald-50 border border-emerald-200 p-4 flex flex-wrap items-center justify-between gap-3">
                  <p className="text-sm font-bold text-emerald-800">受取金額 ¥{record.receivedAmount.toLocaleString("ja-JP")}</p>
                  <p className="text-sm font-bold text-emerald-800">おつり ¥{record.change.toLocaleString("ja-JP")}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
