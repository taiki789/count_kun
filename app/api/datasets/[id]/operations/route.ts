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
    const { action, counts, entry, timestamp, memo, prices, accountingRecord } = body;
    
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
        accountingHistory: [],
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
      const nextCounts = Array.isArray(counts) ? counts : [];
      const safePrices = Array.from({ length: nextCounts.length }, (_, i) => {
        const value = Array.isArray(prices) ? Number(prices[i]) : 0;
        return Number.isFinite(value) && value >= 0 ? value : 0;
      });

      // カウント値を設定、ヒストリをクリア
      await docRef.update({
        counts: nextCounts,
        initialCounts: nextCounts,
        prices: safePrices,
        history: [],
        accountingHistory: [],
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      return NextResponse.json({ message: "Counts Set Success" });
    }

    if (action === 'completeAccounting') {
      const nextCounts = Array.isArray(counts) ? counts : [];
      const historyEntry = entry as Record<string, unknown> | undefined;
      const transaction = accountingRecord as Record<string, unknown> | undefined;

      if (!historyEntry || typeof historyEntry !== 'object') {
        return NextResponse.json({ error: "Invalid history entry" }, { status: 400 });
      }
      if (!transaction || typeof transaction !== 'object') {
        return NextResponse.json({ error: "Invalid accounting record" }, { status: 400 });
      }

      await docRef.update({
        counts: nextCounts,
        history: admin.firestore.FieldValue.arrayUnion(historyEntry),
        accountingHistory: admin.firestore.FieldValue.arrayUnion(transaction),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      return NextResponse.json({ message: "Accounting Completed", updated: true });
    }

    if (action === 'undoLastAction') {
      const snapshot = await docRef.get();
      const currentData = snapshot.data() as Record<string, unknown> | undefined;
      const currentHistory = (currentData?.history as Record<string, unknown>[] | undefined) || [];
      const currentAccountingHistory = (currentData?.accountingHistory as Record<string, unknown>[] | undefined) || [];
      const currentCounts = (currentData?.counts as number[] | undefined) || [];
      const currentInitialCounts = (currentData?.initialCounts as number[] | undefined) || [];

      if (currentHistory.length === 0) {
        return NextResponse.json({ message: "Nothing to undo", skipped: true });
      }

      const nextHistory = currentHistory.slice(0, -1);
      const fallbackLength = Math.max(currentCounts.length, currentInitialCounts.length, 1);

      const toSafeCount = (value: unknown) => {
        const num = Number(value);
        return Number.isFinite(num) && num >= 0 ? num : 0;
      };

      const extractCountsFromEntry = (historyEntry: Record<string, unknown>) => {
        const keyLengths = Object.keys(historyEntry)
          .map((key) => {
            const match = key.match(/^p(\d+)$/);
            return match ? Number(match[1]) : 0;
          })
          .filter((len) => Number.isInteger(len) && len > 0);

        const seriesLength = keyLengths.length > 0 ? Math.max(...keyLengths) : fallbackLength;
        return Array.from({ length: seriesLength }, (_, index) => toSafeCount(historyEntry[`p${index + 1}`]));
      };

      const nextCounts = nextHistory.length > 0
        ? extractCountsFromEntry(nextHistory[nextHistory.length - 1])
        : Array.from({ length: fallbackLength }, (_, index) => toSafeCount(currentInitialCounts[index] ?? 0));

      const removedHistoryEntry = currentHistory[currentHistory.length - 1];
      const removedHistoryTimestamp = Number(removedHistoryEntry?.timestamp);
      const nextAccountingHistory = Number.isFinite(removedHistoryTimestamp)
        ? currentAccountingHistory.filter((record) => Number(record?.historyTimestamp) !== removedHistoryTimestamp)
        : currentAccountingHistory;

      await docRef.update({
        counts: nextCounts,
        history: nextHistory,
        accountingHistory: nextAccountingHistory,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      return NextResponse.json({
        message: "Undo Success",
        updated: true,
        counts: nextCounts,
        history: nextHistory,
        accountingHistory: nextAccountingHistory,
      });
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
