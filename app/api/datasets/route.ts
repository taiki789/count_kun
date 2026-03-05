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

// GET: 全デザセット一覧取得
export async function GET(request: Request) {
  try {
    const adminDb = getAdminDB();
    const datasetsRef = adminDb.collection('datasets');
    const snapshot = await datasetsRef.orderBy('createdAt', 'desc').get();
    
    const datasets = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      createdAt: (doc.data() as any).createdAt?.toDate().toISOString() || new Date().toISOString(),
    }));
    
    return NextResponse.json({ datasets });
  } catch (error: any) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("Get datasets error:", errorMessage);
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}

// POST: 新しいデータセット作成
export async function POST(request: Request) {
  try {
    const adminDb = getAdminDB();
    const body = await request.json();
    const { name, initialCounts = [50, 30, 20, 10, 5], prizeLabels } = body;
    
    if (!name || name.trim() === '') {
      return NextResponse.json({ error: "Dataset name is required" }, { status: 400 });
    }
    
    // prizeLabels の空白チェック
    if (Array.isArray(prizeLabels) && prizeLabels.length === initialCounts.length) {
      const hasEmptyLabel = prizeLabels.some((label: unknown) => String(label ?? "").trim().length === 0);
      if (hasEmptyLabel) {
        return NextResponse.json({ error: "すべての等級名を入力してください" }, { status: 400 });
      }
    }
    
    const safePrizeLabels = Array.isArray(prizeLabels) && prizeLabels.length === initialCounts.length
      ? prizeLabels.map((label: unknown) => String(label ?? "").trim())
      : Array.from({ length: initialCounts.length }, (_, i) => `${i + 1}等`);

    // 新しいデータセット作成
    const newDataset = {
      name: name.trim(),
      counts: initialCounts,
      initialCounts: initialCounts,
      prizeLabels: safePrizeLabels,
      history: [],
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    
    const docRef = await adminDb.collection('datasets').add(newDataset);
    
    return NextResponse.json({ 
      id: docRef.id,
      ...newDataset,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }, { status: 201 });
  } catch (error: any) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("Create dataset error:", errorMessage);
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
