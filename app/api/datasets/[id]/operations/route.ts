import { NextResponse } from 'next/server';
import * as admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import { initializeApp, cert, getApps } from 'firebase-admin/app';

// 初期化関数を定義
function getAdminDB() {
  if (!getApps().length) {
    try {
      const key = process.env.FIREBASE_ADMIN_SDK_KEY;
      if (!key) {
        throw new Error("FIREBASE_ADMIN_SDK_KEY env variable is not set");
      }
      let parsedKey;
      try {
        parsedKey = JSON.parse(key);
      } catch {
        throw new Error(`FIREBASE_ADMIN_SDK_KEY is not valid JSON`);
      }
      initializeApp({
        credential: cert(parsedKey),
      });
    } catch (error) {
      console.error("Firebase Admin Init Error:", error);
      throw error;
    }
  }
  return getFirestore();
}

// PATCH: データセット操作（addHistory, addMemoPoint, resetData, setCounts, addMemo）
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const adminDb = getAdminDB();
    const body = await request.json();
    const { action, counts, entry, timestamp, memo } = body;
    
    const resolvedParams = await params;
    const datasetId = resolvedParams.id;
    
    const docRef = adminDb.collection('datasets').doc(datasetId);

    if (action === 'resetData') {
      // 現在のデータ数に合わせて0配列を作成
      const snapshot = await docRef.get();
      const currentCounts = (snapshot.data()?.counts as number[] | undefined) || [0, 0, 0, 0, 0];
      const zeroCounts = Array(currentCounts.length).fill(0);

      // ヒストリをクリアしてカウントを0にリセット
      await docRef.update({
        counts: zeroCounts,
        history: [],
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      return NextResponse.json({ message: "Reset Success" });
    }

    if (action === 'addHistory') {
      const snapshot = await docRef.get();
      const currentCounts = (snapshot.data()?.counts as number[] | undefined) || [];
      const nextCounts = Array.isArray(counts) ? counts : [];
      const isSameAsPrevious =
        currentCounts.length === nextCounts.length &&
        currentCounts.every((value, index) => value === nextCounts[index]);

      if (isSameAsPrevious) {
        return NextResponse.json({ message: "No Change", skipped: true });
      }

      // 履歴に新しいエントリを追加、カウント更新
      await docRef.update({
        counts: nextCounts,
        history: admin.firestore.FieldValue.arrayUnion(entry),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      return NextResponse.json({ message: "Update Success" });
    }

    if (action === 'addMemoPoint') {
      const nextCounts = Array.isArray(counts) ? counts : [];
      const historyEntry = entry as Record<string, unknown> | undefined;
      if (!historyEntry || typeof historyEntry !== 'object') {
        return NextResponse.json({ error: "Invalid entry" }, { status: 400 });
      }

      await docRef.update({
        counts: nextCounts,
        history: admin.firestore.FieldValue.arrayUnion(historyEntry),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      return NextResponse.json({ message: "Memo Point Added Success", updated: true });
    }

    if (action === 'setCounts') {
      // カウント値を設定、ヒストリをクリア
      await docRef.update({
        counts: counts,
        initialCounts: counts,
        history: [],
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      return NextResponse.json({ message: "Counts Set Success" });
    }

    if (action === 'addMemo') {
      // timestamp指定の履歴エントリにメモを保存
      const targetTimestamp = Number(timestamp);
      if (!Number.isFinite(targetTimestamp)) {
        return NextResponse.json({ error: "Invalid timestamp" }, { status: 400 });
      }

      const memoText = typeof memo === 'string' ? memo : '';
      const snapshot = await docRef.get();
      const currentHistory = (snapshot.data()?.history as Record<string, unknown>[] | undefined) || [];

      let updated = false;
      const updatedHistory = currentHistory.map((entry: Record<string, unknown>) => {
        const entryTimestamp = Number(entry?.timestamp);
        if (Number.isFinite(entryTimestamp) && entryTimestamp === targetTimestamp) {
          updated = true;
          return { ...entry, memo: memoText };
        }
        return entry;
      });

      if (!updated) {
        return NextResponse.json({ error: "History entry not found" }, { status: 404 });
      }

      await docRef.update({
        history: updatedHistory,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      return NextResponse.json({ message: "Memo Added Success", updated: true });
    }

    if (action === 'startMeasurement') {
      await docRef.update({
        measuring: true,
        startTimestamp: Date.now(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      return NextResponse.json({ message: "Measurement Started", updated: true });
    }

    if (action === 'endMeasurement') {
      await docRef.update({
        measuring: false,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      return NextResponse.json({ message: "Measurement Ended", updated: true });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });

  } catch (error: unknown) {
    const err = error instanceof Error ? error : new Error(String(error));
    const errorMessage = err.message;
    const errorStack = err.stack;
    console.error("Dataset operation error:", errorMessage);
    if (errorStack) console.error("Stack:", errorStack);
    
    return NextResponse.json({ 
      error: errorMessage,
      type: error?.constructor?.name || 'Unknown',
      timestamp: new Date().toISOString(),
      details: null
    }, { status: 500 });
  }
}
