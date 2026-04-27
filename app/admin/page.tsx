"use client";

import React, { useContext, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { auth } from "../../lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { PrizeContext, Dataset, OperationMode } from "../PrizeContext";
import Link from "next/link";
import { getCurrentAdminAccess } from "../../lib/adminClient";

export default function Admin() {
  const router = useRouter();
  const { datasets, fetchDatasets, loading, selectDataset, startMeasurement } = useContext(PrizeContext);
  const [prizeCount, setPrizeCount] = useState(5);
  const [formData, setFormData] = useState({
    name: "",
    counts: ["50", "30", "20", "10", "5"],
    prizeLabels: ["1等", "2等", "3等", "4等", "5等"],
    mode: "inventory" as OperationMode,
  });
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [authChecking, setAuthChecking] = useState(true);
  const [editingDataset, setEditingDataset] = useState<Dataset | null>(null);
  const [editPrizeCount, setEditPrizeCount] = useState(5);
  const [editPrizeLabels, setEditPrizeLabels] = useState<string[]>([]);
  const [editMode, setEditMode] = useState<OperationMode>("inventory");

  const buildDefaultLabels = (length: number) => Array.from({ length }, (_, i) => `${i + 1}等`);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (!user) {
        router.push("/");
        setAuthChecking(false);
        return;
      } else {
        void getCurrentAdminAccess()
          .then((access) => {
            const allowed = Boolean(access?.isAdmin);
            setIsAdmin(allowed);
            if (!allowed) {
              alert("管理者のみこのページにアクセスできます");
              router.push("/select-dataset");
            }
          })
          .catch(() => {
            setIsAdmin(false);
            router.push("/select-dataset");
          })
          .finally(() => {
            setAuthChecking(false);
          });
      }
    });
    return () => unsub();
  }, [router]);

  useEffect(() => {
    void fetchDatasets();
  }, [fetchDatasets]);

  const handleCreateDataset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      alert("データセット名を入力してください");
      return;
    }

    // 空白のラベルをチェック
    const emptyLabelIndices = formData.prizeLabels
      .map((label, i) => String(label || "").trim().length === 0 ? i : -1)
      .filter(i => i !== -1);
    
    if (emptyLabelIndices.length > 0) {
      const emptyPositions = emptyLabelIndices.map(i => `${i + 1}枠`).join("、");
      alert(`${emptyPositions}のラベルが空白です。すべての等級名を入力してください。`);
      return;
    }

    setSubmitting(true);
    try {
      const numCounts = formData.counts.map((c) => Number(c) || 0);
      const safePrizeLabels = formData.prizeLabels.map((label) => String(label || "").trim());
      const res = await fetch("/api/datasets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formData.name,
          initialCounts: numCounts,
          prizeLabels: safePrizeLabels,
          mode: formData.mode,
        }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Failed to create dataset");
      }

      const createdDataset = await res.json();
      alert("データセットを作成しました！");
      setPrizeCount(5);
      setFormData({
        name: "",
        counts: ["50", "30", "20", "10", "5"],
        prizeLabels: ["1等", "2等", "3等", "4等", "5等"],
        mode: "inventory",
      });
      await fetchDatasets();
      // 作成したデータセットを選択して計測開始
      if (createdDataset.id) {
        await selectDataset(createdDataset.id);
        startMeasurement();
      }
    } catch (error) {
      console.error("Create dataset error:", error);
      const message = error instanceof Error ? error.message : "データセットの作成に失敗しました";
      alert(message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteDataset = async (datasetId: string) => {
    if (!confirm("このデータセットを削除しますか？")) return;

    setDeleting(datasetId);
    try {
      const res = await fetch(`/api/datasets/${datasetId}`, {
        method: "DELETE",
      });

      if (!res.ok) throw new Error("Failed to delete dataset");

      alert("データセットを削除しました");
      await fetchDatasets();
    } catch (error) {
      console.error("Delete dataset error:", error);
      alert("データセットの削除に失敗しました");
    } finally {
      setDeleting(null);
    }
  };

  const handleEditDataset = (dataset: Dataset) => {
    setEditingDataset(dataset);
    const count = dataset.counts.length || 5;
    setEditPrizeCount(count);
    setEditMode(dataset.mode === "accounting" ? "accounting" : "inventory");
    const sourceLabels = Array.isArray(dataset.prizeLabels) && dataset.prizeLabels.length === count
      ? dataset.prizeLabels
      : buildDefaultLabels(count);
    setEditPrizeLabels(sourceLabels);
  };

  const handleEditPrizeCountChange = (count: number) => {
    setEditPrizeCount(count);
    setEditPrizeLabels(prev => Array.from({ length: count }, (_, i) => prev[i] || `${i + 1}等`));
  };

  const handleEditLabelChange = (index: number, value: string) => {
    const next = [...editPrizeLabels];
    next[index] = value;
    setEditPrizeLabels(next);
  };

  const handleUpdateDataset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingDataset) return;

    // 空白のラベルをチェック
    const emptyLabelIndices = editPrizeLabels
      .map((label, i) => String(label || "").trim().length === 0 ? i : -1)
      .filter(i => i !== -1);
    
    if (emptyLabelIndices.length > 0) {
      const emptyPositions = emptyLabelIndices.map(i => `${i + 1}枠`).join("、");
      alert(`${emptyPositions}のラベルが空白です。すべての等級名を入力してください。`);
      return;
    }

    const willReset = editPrizeCount !== editingDataset.counts.length;
    const confirmMessage = willReset
      ? "データ数を変更すると、現在のカウントと履歴はすべて0にリセットされます。続行しますか？"
      : "等級名を更新します。よろしいですか？";

    if (!confirm(confirmMessage)) {
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`/api/datasets/${editingDataset.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prizeCount: editPrizeCount,
          prizeLabels: editPrizeLabels,
          mode: editMode,
        }),
      });

      const result = await res.json();
      if (!res.ok) throw new Error(result?.error || "Failed to update dataset");

      alert(result.resetApplied ? "データ数を更新し、すべて0にリセットしました" : "等級名を更新しました");
      setEditingDataset(null);
      setEditPrizeCount(5);
      setEditPrizeLabels([]);
      setEditMode("inventory");
      await fetchDatasets();
      startMeasurement(); // 計測開始
    } catch (error) {
      console.error("Update dataset error:", error);
      const message = error instanceof Error ? error.message : "データセットの更新に失敗しました";
      alert(message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancelEdit = () => {
    setEditingDataset(null);
    setEditPrizeCount(5);
    setEditPrizeLabels([]);
    setEditMode("inventory");
  };

  const handleCountChange = (index: number, value: string) => {
    const newCounts = [...formData.counts];
    newCounts[index] = value;
    setFormData({ ...formData, counts: newCounts });
  };

  const handleCreateLabelChange = (index: number, value: string) => {
    const nextLabels = [...formData.prizeLabels];
    nextLabels[index] = value;
    setFormData({ ...formData, prizeLabels: nextLabels });
  };

  const handlePrizeCountChange = (count: number) => {
    setPrizeCount(count);
    // 新しい賞品数に合わせて counts 配列を調整
    const newCounts = Array(count).fill("").map((_, i) => formData.counts[i] ?? "0");
    const newLabels = Array(count).fill("").map((_, i) => formData.prizeLabels[i] || `${i + 1}等`);
    setFormData({ ...formData, counts: newCounts, prizeLabels: newLabels });
  };

  if (authChecking || loading) {
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

  if (!isAdmin) {
    return (
      <div className="flex h-screen items-center justify-center bg-white">
        <div className="text-center">
          <h1 className="text-2xl font-black text-red-600 mb-4">アクセス拒否</h1>
          <p className="text-gray-600 mb-6">管理者のみこのページにアクセスできます</p>
          <Link
            href="/select-dataset"
            className="inline-block bg-indigo-600 hover:bg-indigo-700 text-white font-black px-6 py-2 rounded-full"
          >
            戻る
          </Link>
        </div>
      </div>
    );
  }
  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-blue-50 p-6">
      <div className="max-w-6xl mx-auto">
        {/* ヘッダー */}
        <div className="flex items-center justify-between mb-10">
          <div>
            <h1 className="text-4xl font-black text-gray-900 tracking-tighter mb-1">
              景品管理
            </h1>
            <p className="text-gray-600 text-sm">
              データセットを作成・管理します
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/admin/accounts"
              className="text-purple-600 hover:text-purple-700 font-black text-sm underline"
            >
              アカウント管理 →
            </Link>
            <Link
              href="/select-dataset"
              className="text-indigo-600 hover:text-indigo-700 font-black text-sm underline"
            >
              戻る →
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 md:gap-8">
          {/* 新規作成フォーム */}
          <div className="bg-white rounded-3xl p-5 md:p-8 shadow-lg">
            <h2 className="text-2xl font-black text-gray-900 mb-6">
              新しいデータセットを作成
            </h2>
            <form onSubmit={handleCreateDataset} className="space-y-6">
              {/* 名前 */}
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">
                  データセット名
                </label>
                <input
                  id="dataset-name"
                  name="dataset-name"
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="例：春の大会"
                  className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 font-black text-gray-900 placeholder-gray-400 focus:border-indigo-500 focus:outline-none"
                />
              </div>

              {/* 賞品数選択 */}
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">
                  モード
                </label>
                <select
                  id="dataset-mode"
                  name="dataset-mode"
                  value={formData.mode}
                  onChange={(e) => setFormData({ ...formData, mode: e.target.value === "accounting" ? "accounting" : "inventory" })}
                  className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 font-bold text-gray-900 focus:border-indigo-500 focus:outline-none mb-4"
                >
                  <option value="inventory">在庫管理モード（通常）</option>
                  <option value="accounting">会計モード（おつり計算）</option>
                </select>
                <label className="block text-sm font-bold text-gray-700 mb-2">
                  賞品数
                </label>
                <select
                  id="prize-count"
                  name="prize-count"
                  value={prizeCount}
                  onChange={(e) => handlePrizeCountChange(Number(e.target.value))}
                  className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 font-bold text-gray-900 focus:border-indigo-500 focus:outline-none"
                >
                  {Array.from({ length: 20 }, (_, i) => i + 1).map((num) => (
                    <option key={num} value={num}>{num}個</option>
                  ))}
                </select>
              </div>

              {/* 初期カウント */}
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-3">
                  各等級名
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6 gap-2">
                  {Array.from({ length: prizeCount }).map((_, i) => (
                    <div key={i}>
                      <p className="text-xs text-gray-500 mb-1 text-center">{i + 1}枠</p>
                      <input
                        id={`prizeLabel-${i}`}
                        name={`prizeLabel-${i}`}
                        type="text"
                        value={formData.prizeLabels[i] || ""}
                        onChange={(e) => handleCreateLabelChange(i, e.target.value)}
                        placeholder={`${i + 1}等`}
                        className="w-full border-2 border-gray-200 rounded-lg px-2 py-2 text-sm font-black text-gray-900 text-center focus:border-indigo-500 focus:outline-none"
                      />
                    </div>
                  ))}
                </div>
              </div>

              {/* 初期カウント */}
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-3">
                  初期カウント値
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
                  {Array.from({ length: prizeCount }).map((_, i) => (
                    <div key={i}>
                      <p className="text-xs text-gray-500 mb-1 text-center">
                        {formData.prizeLabels[i] && formData.prizeLabels[i].trim() ? formData.prizeLabels[i] : `${i + 1}等`}
                      </p>
                      <input
                        id={`count-${i}`}
                        name={`count-${i}`}
                        type="number"
                        min="0"
                        value={formData.counts[i] ?? ""}
                        onChange={(e) => handleCountChange(i, e.target.value)}
                        className="w-full border-2 border-gray-200 rounded-lg px-2 py-2 text-lg font-black text-gray-900 text-center focus:border-indigo-500 focus:outline-none"
                      />
                    </div>
                  ))}
                </div>
              </div>

              {/* 合計 */}
              <div className="bg-gray-100 rounded-xl p-4">
                <p className="text-sm text-gray-600 mb-1">合計</p>
                <p className="text-2xl font-black text-gray-900">
                  {formData.counts.reduce((sum, c) => sum + (Number(c) || 0), 0)}
                </p>
              </div>

              {/* ボタン */}
              <button
                type="submit"
                disabled={submitting}
                className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-400 text-white font-black py-3 rounded-xl transition-all"
              >
                {submitting ? "作成中..." : "データセットを作成"}
              </button>
            </form>
          </div>

          {/* データセット一覧 */}
          <div className="bg-white rounded-3xl p-5 md:p-8 shadow-lg">
            <h2 className="text-2xl font-black text-gray-900 mb-6">
              既存のデータセット
            </h2>
            {datasets.length === 0 ? (
              <p className="text-gray-500 text-center py-8">
                データセットはまだ作成されていません
              </p>
            ) : (
              <div className="space-y-3">
                {datasets.map((dataset) => (
                  <div
                    key={dataset.id}
                    className="border-2 border-gray-200 rounded-xl p-4 hover:border-indigo-500 transition-all"
                  >
                    <div className="flex items-start justify-between gap-4 mb-3">
                      <div>
                        <h3 className="font-black text-gray-900">{dataset.name}</h3>
                        <p className="text-xs text-gray-500 mt-1">
                          {new Date(dataset.createdAt).toLocaleDateString("ja-JP")}{" "}
                          {new Date(dataset.createdAt).toLocaleTimeString("ja-JP")}
                        </p>
                        <p className="text-xs text-indigo-600 font-bold mt-1">
                          賞品数: {dataset.counts.length}個
                        </p>
                        <p className="text-xs font-bold mt-1 text-emerald-600">
                          モード: {dataset.mode === "accounting" ? "会計" : "在庫管理"}
                        </p>
                      </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleEditDataset(dataset)}
                            className="text-indigo-600 hover:text-indigo-700 font-black text-xs px-3 py-1 hover:bg-indigo-50 rounded transition-all"
                          >
                            編集
                          </button>
                          <button
                            onClick={() => handleDeleteDataset(dataset.id)}
                            disabled={deleting === dataset.id}
                            className="text-red-500 hover:text-red-700 disabled:text-gray-400 font-black text-xs px-3 py-1 hover:bg-red-50 rounded transition-all"
                          >
                            {deleting === dataset.id ? "削除中..." : "削除"}
                          </button>
                        </div>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6 gap-1">
                      {dataset.counts.map((count, i) => (
                        <div key={i} className="bg-gray-100 rounded p-2 text-center">
                          <p className="text-xs text-gray-500">{(Array.isArray(dataset.prizeLabels) && dataset.prizeLabels[i]) || `${i + 1}等`}</p>
                          <p className="font-black text-gray-900">{count}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

        {/* 編集モーダル */}
        {editingDataset && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-3xl p-5 md:p-8 max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl">
              <h2 className="text-2xl font-black text-gray-900 mb-6">
                データセットを編集
              </h2>
              <form onSubmit={handleUpdateDataset} className="space-y-6">
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-3">
                    モード
                  </label>
                  <select
                    id="edit-mode"
                    name="edit-mode"
                    value={editMode}
                    onChange={(e) => setEditMode(e.target.value === "accounting" ? "accounting" : "inventory")}
                    className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 font-bold text-gray-900 focus:border-indigo-500 focus:outline-none"
                  >
                    <option value="inventory">在庫管理モード（通常）</option>
                    <option value="accounting">会計モード（おつり計算）</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-3">
                    データ数
                  </label>
                  <select
                    id="edit-prize-count"
                    name="edit-prize-count"
                    value={editPrizeCount}
                    onChange={(e) => handleEditPrizeCountChange(Number(e.target.value))}
                    className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 font-bold text-gray-900 focus:border-indigo-500 focus:outline-none"
                  >
                    {Array.from({ length: 20 }, (_, i) => i + 1).map((num) => (
                      <option key={num} value={num}>{num}個</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-3">
                    各等級名
                  </label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6 gap-2">
                    {Array.from({ length: editPrizeCount }).map((_, i) => (
                      <div key={i}>
                        <p className="text-xs text-gray-500 mb-1 text-center">{i + 1}枠</p>
                        <input
                          id={`editPrizeLabel-${i}`}
                          name={`editPrizeLabel-${i}`}
                          type="text"
                          value={editPrizeLabels[i] || ""}
                          onChange={(e) => handleEditLabelChange(i, e.target.value)}
                          placeholder={`${i + 1}等`}
                          className="w-full border-2 border-gray-200 rounded-lg px-2 py-2 text-sm font-black text-gray-900 text-center focus:border-indigo-500 focus:outline-none"
                        />
                      </div>
                    ))}
                  </div>
                </div>

                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                  <p className="text-sm font-bold text-amber-700">注意</p>
                  <p className="text-sm text-amber-800 mt-1">
                    データ数を変更すると、このデータセットのカウントと履歴はすべて0にリセットされます。
                  </p>
                </div>

                {/* ボタン */}
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={handleCancelEdit}
                    className="flex-1 bg-gray-300 hover:bg-gray-400 text-gray-900 font-black py-3 rounded-xl transition-all"
                  >
                    キャンセル
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="flex-1 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-400 text-white font-black py-3 rounded-xl transition-all"
                  >
                    {submitting ? "更新中..." : "更新"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
    </div>
  );
}
