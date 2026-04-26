"use client";

import React, { useContext, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { auth } from "../../lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { PrizeContext } from "../PrizeContext";
import Link from "next/link";
import { getCurrentAdminAccess } from "../../lib/adminClient";

export default function SelectDataset() {
  const router = useRouter();
  const { datasets, selectDataset, fetchDatasets, loading } = useContext(PrizeContext);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (!user) {
        router.push("/");
        setIsAdmin(false);
      } else {
        void getCurrentAdminAccess()
          .then((access) => setIsAdmin(Boolean(access?.isAdmin)))
          .catch(() => setIsAdmin(false));
      }
    });
    return () => unsub();
  }, [router]);

  useEffect(() => {
    fetchDatasets();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSelectDataset = async (datasetId: string) => {
    try {
      await selectDataset(datasetId);
      router.push("/settings");
    } catch (error) {
      console.error("Select dataset error:", error);
      alert("データセットの選択に失敗しました");
    }
  };

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-white">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-black border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-xs font-black tracking-widest text-gray-400">
            LOADING...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50 p-6">
      <div className="max-w-4xl mx-auto">
        {/* ヘッダー */}
        <div className="text-center mb-12">
          <h1 className="text-4xl md:text-5xl font-black text-gray-900 tracking-tighter mb-2">
            データセット選択
          </h1>
          <p className="text-gray-600 text-sm">
            使用するイベント・大会を選択してください
          </p>
        </div>

        {/* データセット一覧 */}
        {datasets.length === 0 ? (
          <div className="bg-white rounded-3xl p-12 shadow-lg text-center">
            <p className="text-gray-500 text-lg mb-6">データセットがまだ作成されていません</p>
            <Link
              href="/admin"
              className="inline-block bg-indigo-600 hover:bg-indigo-700 text-white font-black px-8 py-3 rounded-full transition-all"
            >
              景品管理へ
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
            {datasets.map((dataset) => (
              <button
                key={dataset.id}
                onClick={() => handleSelectDataset(dataset.id)}
                className="group bg-white rounded-2xl p-8 shadow-md hover:shadow-xl hover:scale-105 transition-all border-2 border-transparent hover:border-indigo-500"
              >
                <div className="text-left">
                  <h2 className="text-2xl font-black text-gray-900 mb-2 group-hover:text-indigo-600 transition-colors">
                    {dataset.name}
                  </h2>
                  <p className="text-sm text-gray-500 mb-4">
                    作成: {new Date(dataset.createdAt).toLocaleDateString("ja-JP")}
                  </p>
                  <div className="flex gap-2">
                    {dataset.counts.map((count, i) => (
                      <div key={i} className="flex-1 bg-gray-100 rounded-lg p-2 text-center">
                        <p className="text-xs text-gray-500">{(Array.isArray(dataset.prizeLabels) && dataset.prizeLabels[i]) || `${i + 1}等`}</p>
                        <p className="text-lg font-black text-gray-900">{count}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}

        {/* 管理者リンク */}
        {isAdmin && (
          <div className="text-center mt-8">
            <Link
              href="/admin"
              className="text-indigo-600 hover:text-indigo-700 font-black text-sm underline"
            >
              🔐 データセットを管理 →
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
