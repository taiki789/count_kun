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
      } catch (parseError) {
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

// PATCH: データセット操作（addHistory, resetData, setCounts）
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const adminDb = getAdminDB();
    const body = await request.json();
    const { action, counts, entry } = body;
    
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

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });

  } catch (error: any) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;
    console.error("Dataset operation error:", errorMessage);
    if (errorStack) console.error("Stack:", errorStack);
    
    return NextResponse.json({ 
      error: errorMessage,
      type: error?.constructor?.name || 'Unknown',
      timestamp: new Date().toISOString(),
      details: error?.details || null
    }, { status: 500 });
  }
}
