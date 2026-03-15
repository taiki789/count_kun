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

// GET: 全デザセット一覧取得
export async function GET() {
  try {
    const adminDb = getAdminDB();
    const datasetsRef = adminDb.collection('datasets');
    const snapshot = await datasetsRef.orderBy('createdAt', 'desc').get();
    
    const datasets = snapshot.docs.map(doc => {
      const data = doc.data() as Record<string, unknown>;
      return {
        id: doc.id,
        ...data,
        createdAt: (data.createdAt as { toDate: () => Date } | undefined)?.toDate().toISOString() || new Date().toISOString(),
      };
    });
    
    return NextResponse.json({ datasets });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("Get datasets error:", errorMessage);
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}

// POST: 新しいデータセット作成
export async function POST(request: Request) {
  try {
    const adminDb = getAdminDB();
    const body = await request.json() as Record<string, unknown>;
    const name = body.name as string;
    const initialCounts = (body.initialCounts as number[]) || [50, 30, 20, 10, 5];
    const mode = body.mode;
    const prices = body.prices;
    const prizeLabels = body.prizeLabels as unknown[];
    
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
    const safeMode = mode === "accounting" ? "accounting" : "inventory";
    const safePrices = Array.from({ length: initialCounts.length }, (_, i) => {
      const value = Array.isArray(prices) ? Number(prices[i]) : 0;
      return Number.isFinite(value) && value >= 0 ? value : 0;
    });

    // 新しいデータセット作成
    const newDataset = {
      name: name.trim(),
      counts: initialCounts,
      initialCounts: initialCounts,
      mode: safeMode,
      prices: safePrices,
      prizeLabels: safePrizeLabels,
      history: [],
      accountingHistory: [],
      measuring: false,
      startTimestamp: null,
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
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("Create dataset error:", errorMessage);
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
