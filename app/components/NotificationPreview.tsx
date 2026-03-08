"use client";

import React from "react";

interface NotificationPreviewProps {
  title: string;
  message: string;
  onClose: () => void;
}

export default function NotificationPreview({ title, message, onClose }: NotificationPreviewProps) {
  const now = new Date();
  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");

  const previewTitle = title || "コメントが追加されました";
  const previewMessage = message || "メッセージを入力してください";

  return (
    <div className="fixed inset-0 z-50 bg-black/55 flex items-center justify-center p-4" onClick={onClose}>
      <div className="relative w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
        <div className="relative aspect-[9/19] overflow-hidden rounded-[2.6rem] shadow-2xl bg-[#111] border border-white/20">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_15%,rgba(255,204,227,0.45),transparent_40%),radial-gradient(circle_at_80%_20%,rgba(188,198,255,0.4),transparent_42%),linear-gradient(160deg,#5f4f68_0%,#9a86a3_45%,#dac0c8_100%)]" />

          <div className="absolute inset-x-0 top-0 h-8 bg-black/15 backdrop-blur-sm" />
          <div className="absolute top-2 left-1/2 -translate-x-1/2 h-5 w-28 rounded-full bg-black/70" />

          <div className="absolute top-10 left-0 right-0 text-center text-white/95">
            <p className="text-sm tracking-wide">通知センター</p>
            <p className="text-[11px] text-white/75 mt-1">{hh}:{mm}</p>
          </div>

          <div className="absolute inset-x-4 top-[18%]">
            <div className="mb-2 h-20 rounded-2xl bg-white/25 backdrop-blur-xl" />
            <div className="mb-2 h-20 rounded-2xl bg-white/30 backdrop-blur-xl" />

            <div className="rounded-2xl bg-white/55 backdrop-blur-2xl border border-white/50 shadow-xl px-3 py-3">
              <div className="flex items-center justify-between mb-1 text-[11px] text-gray-700">
                <div className="flex items-center gap-2">
                  <div className="h-6 w-6 rounded-md bg-white flex items-center justify-center shadow-sm">
                    <span className="text-[10px] font-bold text-gray-900">C</span>
                  </div>
                  <span className="font-semibold">Count kun</span>
                </div>
                <span>今</span>
              </div>

              <p className="text-[14px] font-semibold text-gray-900 leading-snug mb-1">{previewTitle}</p>

              <p className="text-[13px] text-gray-800 leading-snug break-words">
                {previewMessage.split("\n").map((line, i) => (
                  <React.Fragment key={`${line}-${i}`}>
                    {line}
                    {i < previewMessage.split("\n").length - 1 && <br />}
                  </React.Fragment>
                ))}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="absolute bottom-8 left-1/2 -translate-x-1/2 rounded-full bg-white/90 px-7 py-2.5 text-sm font-semibold text-gray-900 shadow-lg"
          >
            プレビューを閉じる
          </button>
        </div>
      </div>
    </div>
  );
}
