"use client";

import React, { useContext, useEffect, useState, useRef, useMemo } from "react";
import { useRouter, useParams } from "next/navigation";
import { auth } from "../../../lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { PrizeContext, Dataset } from "../../PrizeContext";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from "recharts";

export default function PrizeTransitionGraph() {
  const router = useRouter();
  const params = useParams();
  const datasetId = params?.datasetId as string | undefined;
  const chartRef = useRef<HTMLDivElement>(null);
  const graphOnlyRef = useRef<HTMLDivElement>(null);

  const { counts, history, prizeLabels, loading, datasets } = useContext(PrizeContext);
  const [currentDataset, setCurrentDataset] = useState<Dataset | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isDataReady, setIsDataReady] = useState(false);
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());

  const baseColors = ["#ef4444", "#f97316", "#eab308", "#22c55e", "#3b82f6", "#8b5cf6", "#ec4899", "#f43f5e", "#06b6d4", "#10b981", "#6366f1", "#a855f7", "#14b8a6", "#f59e0b", "#84cc16", "#64748b", "#dc2626", "#7c3aed", "#db2777", "#0ea5e9"];

  // 結果グラフ用データの生成
  const resultHistory = useMemo(() => {
    if (Array.isArray(currentDataset?.history) && currentDataset.history.length > 0) {
      return currentDataset.history;
    }
    return history;
  }, [currentDataset, history]);

  const colors = (currentDataset?.counts || counts).map((_, i) => baseColors[i % baseColors.length]);
  const displayLabels = currentDataset?.prizeLabels || prizeLabels;

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (!user) {
        router.push("/");
      }
    });
    return () => unsub();
  }, [router]);

  // データセット情報を取得
  useEffect(() => {
    if (!datasetId) {
      setIsDataReady(true);
      return;
    }

    const fetchDataset = async () => {
      try {
        // Context から datasets を探す
        if (datasets.length > 0) {
          const found = datasets.find(d => d.id === datasetId);
          if (found) {
            setCurrentDataset(found);
            setIsDataReady(true);
            return;
          }
        }

        // Context に無い場合、API から取得
        const response = await fetch(`/api/datasets/${datasetId}`);
        if (response.ok) {
          const data: Dataset = await response.json();
          setCurrentDataset(data);
        }
      } catch (error) {
        console.error("データセット取得エラー:", error);
      } finally {
        setIsDataReady(true);
      }
    };

    if (loading) {
      // loading 中の場合は待機
      setIsDataReady(false);
    } else {
      void fetchDataset();
    }
  }, [datasetId, datasets, loading]);

  // データセット取得時に selectedIndices を初期化
  useEffect(() => {
    if (currentDataset) {
      const numPrizes = currentDataset.counts?.length || counts.length;
      setSelectedIndices(new Set(Array.from({ length: numPrizes }, (_, i) => i)));
    }
  }, [currentDataset, counts.length]);

  const handleDownloadGraph = async () => {
    if (!graphOnlyRef.current) {
      alert("グラフが見つかりません");
      return;
    }

    setIsDownloading(true);
    try {
      // graphOnlyRef 内のSVGをすべて調べ、表示領域が最大のSVGを選択して切り抜く
      const svgs = Array.from(graphOnlyRef.current.querySelectorAll('svg')) as SVGSVGElement[];
      if (svgs.length === 0) throw new Error('SVG要素が見つかりません');

      // 表示サイズ（bounding rect）を基準に最大のSVGを選択
      let svgElement: SVGSVGElement | null = null;
      let maxArea = 0;
      svgs.forEach((s) => {
        const r = s.getBoundingClientRect();
        const area = r.width * r.height;
        if (area > maxArea) {
          maxArea = area;
          svgElement = s;
        }
      });
      if (!svgElement) throw new Error('SVG要素が選択できませんでした');

      // SVGを静的なHTML要素として構築（より確実な変換）
      const clonedSvg = svgElement.cloneNode(true) as SVGSVGElement;
      clonedSvg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');

      // 表示サイズをboundingClientRectから取得して明示的に設定
      const bbox = svgElement.getBoundingClientRect();
      const originalWidth = Math.round(bbox.width) || 800;
      const originalHeight = Math.round(bbox.height) || 400;
      clonedSvg.setAttribute('width', String(originalWidth));
      clonedSvg.setAttribute('height', String(originalHeight));
      
      // 背景を白色で追加
      const bgRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      bgRect.setAttribute('width', String(originalWidth));
      bgRect.setAttribute('height', String(originalHeight));
      bgRect.setAttribute('fill', 'white');
      clonedSvg.insertBefore(bgRect, clonedSvg.firstChild);

      // 切り抜き領域を拡張（凡例や系列を含める余白）
      const padLeft = Math.round(originalWidth * 0.03) || 20;
      // 右側を広めに確保して凡例が入るようにする。さらに明示的に右30pxを追加。
      const padRight = (Math.round(originalWidth * 0.12) || 80) + 30;
      // 上下の余白を少し増やしてラベルや目盛りが切れないようにする
      const padTop = 20;
      const padBottom = 80; // 凡例や系列ラベルを確保するため下部を広めに取る

      const outerWidth = originalWidth + padLeft + padRight;
      const outerHeight = originalHeight + padTop + padBottom;

      // outerSvg を作成し、クローンしたSVGの中身を平行移動して配置する
      const outerSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      outerSvg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
      outerSvg.setAttribute('width', String(outerWidth));
      outerSvg.setAttribute('height', String(outerHeight));
      outerSvg.setAttribute('viewBox', `0 0 ${outerWidth} ${outerHeight}`);

      // 背景白を追加
      const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      bg.setAttribute('width', String(outerWidth));
      bg.setAttribute('height', String(outerHeight));
      bg.setAttribute('fill', 'white');
      outerSvg.appendChild(bg);

      // グループにクローンSVGの子を移してオフセット
      const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      g.setAttribute('transform', `translate(${padLeft}, ${padTop})`);
      // clonedSvg が自身で svg 要素の場合、その children を移す
      while (clonedSvg.childNodes.length > 0) {
        g.appendChild(clonedSvg.childNodes[0]);
      }
      outerSvg.appendChild(g);

      // 凡例が DOM 上で別要素（HTML）として存在する場合、画像内に埋め込む
      let legendEmbedded = false;
      try {
        const legendEl = graphOnlyRef.current.querySelector('.recharts-legend-wrapper') || graphOnlyRef.current.querySelector('g.recharts-legend-wrapper');
        if (legendEl) {
          const legendRect = legendEl.getBoundingClientRect();
          // legend の幅を outerWidth に合わせて中央寄せで描画
          const legendWidth = Math.round(legendRect.width);
          const legendHeight = Math.round(legendRect.height);
          const legendX = Math.max(0, Math.round((outerWidth - legendWidth) / 2));
          const legendY = originalHeight + padTop + Math.round((padBottom - legendHeight) / 2);

          const foreign = document.createElementNS('http://www.w3.org/2000/svg', 'foreignObject');
          foreign.setAttribute('x', String(legendX));
          foreign.setAttribute('y', String(legendY));
          foreign.setAttribute('width', String(legendWidth));
          foreign.setAttribute('height', String(legendHeight));

          // legend の innerHTML を XHTML コンテナに入れる
          const div = document.createElement('div');
          div.setAttribute('xmlns', 'http://www.w3.org/1999/xhtml');
          // コピーした legend の HTML をそのまま埋め込む（スタイルが引き継がれます）
          div.innerHTML = (legendEl as HTMLElement).innerHTML;
          foreign.appendChild(div);
          outerSvg.appendChild(foreign);
          legendEmbedded = true;
        }
      } catch (e) {
        // 失敗しても処理を続行
        console.warn('legend embedding failed', e);
      }

      // foreignObject 埋め込みが使えない場合やブラウザによってはスタイルが反映されないことがあるため
      // フォールバックでネイティブSVG凡例を生成する
      if (!legendEmbedded) {
        try {
          const visibleIndices = (currentDataset?.counts || counts).map((_, i) => i).filter(i => selectedIndices.has(i));
          if (visibleIndices.length > 0) {
            const markerSize = 12;
            const itemGap = 120; // 各凡例アイテムの想定幅
            const totalWidth = visibleIndices.length * itemGap;
            const startX = Math.max(0, Math.round((outerWidth - totalWidth) / 2));
            const legendY = originalHeight + padTop + Math.round((padBottom - markerSize) / 2);

            const legendG = document.createElementNS('http://www.w3.org/2000/svg', 'g');
            legendG.setAttribute('font-family', 'sans-serif');
            legendG.setAttribute('font-size', '12');
            let curX = startX;
            visibleIndices.forEach((i) => {
              const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
              rect.setAttribute('x', String(curX));
              rect.setAttribute('y', String(legendY));
              rect.setAttribute('width', String(markerSize));
              rect.setAttribute('height', String(markerSize));
              rect.setAttribute('fill', colors[i] || '#000');
              rect.setAttribute('rx', '2');
              rect.setAttribute('ry', '2');

              const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
              text.setAttribute('x', String(curX + markerSize + 8));
              text.setAttribute('y', String(legendY + markerSize - 2));
              text.setAttribute('fill', '#374151');
              text.textContent = displayLabels[i] || `景品${i + 1}`;

              legendG.appendChild(rect);
              legendG.appendChild(text);

              curX += itemGap;
            });

            outerSvg.appendChild(legendG);
          }
        } catch (e) {
          console.warn('SVG legend fallback failed', e);
        }
      }

      const svgString = new XMLSerializer().serializeToString(outerSvg);
      const svgDataUrl = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgString);

      // キャンバスを作成してSVGをレンダリング
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('キャンバスコンテキストが取得できません');

      // 高解像度でレンダリング（2倍スケール）
      const scale = 2;
      // outerWidth/outerHeight をキャンバスサイズに反映（元の SVG 全体を描画するため）
      canvas.width = outerWidth * scale;
      canvas.height = outerHeight * scale;

      // 白背景で塗りつぶし（outer 全体）
      ctx.fillStyle = 'white';
      ctx.fillRect(0, 0, outerWidth * scale, outerHeight * scale);

      // SVGをImageで読み込んでCanvasに描画
      const renderPromise = new Promise<void>((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';

        const onLoadHandler = () => {
          try {
            // スケールを適用して高解像度描画
            ctx.scale(scale, scale);
            // outerSvg 全体をキャンバスに描画する（canvas サイズが outer に合わせてあるので座標は0,0）
            ctx.drawImage(img, 0, 0);

            // Canvasからブロブを取得してダウンロード
            canvas.toBlob(
              (blob) => {
                if (!blob) throw new Error('Blobの作成に失敗しました');

                const downloadUrl = URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = downloadUrl;
                link.download = `prize-transition-graph-${currentDataset?.name || datasetId}-${new Date().toISOString().split('T')[0]}.png`;

                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);

                // クリーンアップ
                URL.revokeObjectURL(downloadUrl);

                resolve();
              },
              'image/png',
              1.0
            );
          } catch (error) {
            reject(error);
          }
        };

        const onErrorHandler = () => {
          reject(new Error('SVG画像の読み込みに失敗しました'));
        };

        img.addEventListener('load', onLoadHandler, { once: true });
        img.addEventListener('error', onErrorHandler, { once: true });
        img.src = svgDataUrl;

        // タイムアウト（5秒）
        setTimeout(() => {
          img.removeEventListener('load', onLoadHandler);
          img.removeEventListener('error', onErrorHandler);
          reject(new Error('SVG読み込みタイムアウト'));
        }, 5000);
      });

      await renderPromise;

      alert("グラフをダウンロードしました");
      setIsDownloading(false);

    } catch (error) {
      console.error("グラフのダウンロードに失敗しました:", error);
      alert("グラフのダウンロードに失敗しました: " + (error instanceof Error ? error.message : "不明なエラー"));
      setIsDownloading(false);
    }
  };

  if (loading || !isDataReady) {
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

  if (!currentDataset || !datasetId) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-100 via-zinc-50 to-white p-6">
        <div className="max-w-4xl mx-auto text-center">
          <h1 className="text-2xl font-black text-gray-900 mb-4">
            データセットが見つかりません
          </h1>
          <button
            onClick={() => router.push("/select-dataset?mode=graph")}
            className="bg-indigo-600 hover:bg-indigo-700 text-white font-black px-6 py-3 rounded-xl transition"
          >
            データセット選択に戻る
          </button>
        </div>
      </div>
    );
  }

  const formatDate = (dateString: string | undefined) => {
    if (!dateString) return "N/A";
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) return "N/A";
      return date.toLocaleDateString("ja-JP");
    } catch {
      return "N/A";
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-100 via-zinc-50 to-white p-6">
      <div className="max-w-6xl mx-auto">
        {/* ヘッダー */}
        <div className="mb-8">
          <button
            onClick={() => router.push("/select-dataset")}
            className="text-sm text-indigo-600 hover:text-indigo-700 font-semibold mb-4"
          >
            ← データセット選択に戻る
          </button>
          <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-md">
            <h1 className="text-3xl font-black text-gray-900 mb-2">
              景品遷移グラフ
            </h1>
            <p className="text-gray-600">
              {currentDataset.name}
            </p>
            <p className="text-sm text-gray-500 mt-2">
              計測期間: {formatDate(currentDataset.createdAt)} ～ {formatDate(currentDataset.updatedAt)}
            </p>
          </div>
        </div>

        {/* グラフ表示エリア */}
        <div
          ref={chartRef}
          className="bg-white rounded-2xl border border-gray-100 p-8 shadow-md mb-6"
        >
          <div className="mb-6">
            <h2 className="text-lg font-black text-gray-900 mb-4">景品在庫推移</h2>
            
            {/* フィルターコントロール */}
            <details className="mb-4 p-4 bg-gray-50 rounded-lg border border-gray-200">
              <summary className="cursor-pointer font-black text-gray-900">
                📊 表示する景品を選択 ({selectedIndices.size} / {(currentDataset.counts || counts).length})
              </summary>
              <div className="mt-4 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                {(currentDataset.counts || counts).map((_, index) => (
                  <label key={index} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedIndices.has(index)}
                      onChange={(e) => {
                        const newSet = new Set(selectedIndices);
                        if (e.target.checked) {
                          newSet.add(index);
                        } else {
                          newSet.delete(index);
                        }
                        setSelectedIndices(newSet);
                      }}
                      className="w-4 h-4 cursor-pointer"
                    />
                    <span className="text-sm font-semibold text-gray-700">
                      {displayLabels[index] || `景品${index + 1}`}
                    </span>
                  </label>
                ))}
              </div>
            </details>
          </div>

          {/* ダウンロード対象のグラフ要素 */}
          <div ref={graphOnlyRef} className="bg-white rounded-lg p-6">
            {resultHistory.length > 0 ? (
              <ResponsiveContainer width="100%" height={400}>
                <LineChart data={resultHistory}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis
                    dataKey="time"
                    stroke="#6b7280"
                    style={{ fontSize: "12px" }}
                  />
                  <YAxis
                    stroke="#6b7280"
                    style={{ fontSize: "12px" }}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#ffffff",
                      border: "1px solid #e5e7eb",
                      borderRadius: "8px",
                    }}
                  />
                  <Legend
                    wrapperStyle={{
                      paddingTop: "20px",
                    }}
                  />
                  {(currentDataset.counts || counts).map((_, index) => 
                    selectedIndices.has(index) ? (
                      <Line
                        key={index}
                        type="monotone"
                        dataKey={`p${index + 1}`}
                        stroke={colors[index]}
                        strokeWidth={2}
                        dot={false}
                        name={displayLabels[index] || `景品${index + 1}`}
                        isAnimationActive={false}
                      />
                    ) : null
                  )}
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-96 flex items-center justify-center text-gray-500">
                <p>計測データがありません</p>
              </div>
            )}
          </div>
        </div>

        {/* ダウンロードボタンと統計情報 */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* ダウンロードボタン */}
          <div className="md:col-span-1 bg-white rounded-2xl border border-gray-100 p-6 shadow-md">
            <h3 className="text-sm font-black text-gray-900 mb-4">
              グラフをダウンロード
            </h3>
            <button
              onClick={handleDownloadGraph}
              disabled={isDownloading}
              className={`w-full font-black py-3 px-4 rounded-xl transition ${
                isDownloading
                  ? "bg-gray-300 text-gray-600 cursor-not-allowed"
                  : "bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg shadow-indigo-200"
              }`}
            >
              {isDownloading ? "ダウンロード中..." : "PNG形式でダウンロード"}
            </button>
            <p className="text-xs text-gray-500 mt-3">
              グラフを PNG 形式の画像ファイルとしてダウンロードします
            </p>
          </div>

          {/* 統計情報 */}
          <div className="md:col-span-2 bg-white rounded-2xl border border-gray-100 p-6 shadow-md">
            <h3 className="text-sm font-black text-gray-900 mb-4">
              最終集計
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {(currentDataset.counts || counts).map((finalCount, index) => (
                <div key={index} className="bg-gray-50 rounded-lg p-3 border border-gray-100">
                  <p className="text-xs text-gray-600 font-semibold mb-1">
                    {displayLabels[index] || `景品${index + 1}`}
                  </p>
                  <p className="text-2xl font-black text-gray-900">
                    {finalCount}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    初期: {(currentDataset.initialCounts || [])[index] || 0}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* 詳細情報 */}
        <div className="mt-6 bg-white rounded-2xl border border-gray-100 p-6 shadow-md">
          <h3 className="text-sm font-black text-gray-900 mb-4">
            計測情報
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <p className="text-gray-600 font-semibold">総計測回数</p>
              <p className="text-xl font-black text-gray-900 mt-1">
                {resultHistory.length}
              </p>
            </div>
            <div>
              <p className="text-gray-600 font-semibold">開始時刻</p>
              <p className="text-sm font-semibold text-gray-900 mt-1">
                {resultHistory.length > 0
                  ? resultHistory[0]?.time || "N/A"
                  : "N/A"}
              </p>
            </div>
            <div>
              <p className="text-gray-600 font-semibold">終了時刻</p>
              <p className="text-sm font-semibold text-gray-900 mt-1">
                {resultHistory.length > 0
                  ? resultHistory[resultHistory.length - 1]?.time || "N/A"
                  : "N/A"}
              </p>
            </div>
            <div>
              <p className="text-gray-600 font-semibold">最終更新</p>
              <p className="text-sm font-semibold text-gray-900 mt-1">
                {(() => {
                  try {
                    const date = new Date(currentDataset.updatedAt);
                    return isNaN(date.getTime())
                      ? "N/A"
                      : date.toLocaleTimeString("ja-JP");
                  } catch {
                    return "N/A";
                  }
                })()}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
