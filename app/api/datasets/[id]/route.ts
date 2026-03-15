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

// DELETE: データセット削除
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const adminDb = getAdminDB();
    const resolvedParams = await params;
    const datasetId = resolvedParams.id;
    
    if (!datasetId) {
      return NextResponse.json({ error: "Dataset ID is required" }, { status: 400 });
    }
    
    await adminDb.collection('datasets').doc(datasetId).delete();
    
    return NextResponse.json({ message: "Dataset deleted successfully" });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("Delete dataset error:", errorMessage);
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}

// GET: 特定のデータセット取得
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const adminDb = getAdminDB();
    const resolvedParams = await params;
    const datasetId = resolvedParams.id;
    
    if (!datasetId) {
      return NextResponse.json({ error: "Dataset ID is required" }, { status: 400 });
    }
    
    const doc = await adminDb.collection('datasets').doc(datasetId).get();
    
    if (!doc.exists) {
      return NextResponse.json({ error: "Dataset not found" }, { status: 404 });
    }
    
    const docData = (doc.data() as Record<string, unknown> | undefined) || {};
    const createdAtSource = docData.createdAt as { toDate?: () => Date } | undefined;
    const updatedAtSource = docData.updatedAt as { toDate?: () => Date } | undefined;

    return NextResponse.json({
      id: doc.id,
      ...docData,
      createdAt: createdAtSource?.toDate?.().toISOString() || new Date().toISOString(),
      updatedAt: updatedAtSource?.toDate?.().toISOString() || new Date().toISOString(),
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("Get dataset error:", errorMessage);
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}

    // PUT: データセット更新
    export async function PUT(
      request: Request,
      { params }: { params: Promise<{ id: string }> }
    ) {
      try {
        const adminDb = getAdminDB();
        const body = await request.json();
        const { prizeCount, prizeLabels, mode } = body;
        const resolvedParams = await params;
        const datasetId = resolvedParams.id;
    
        if (!datasetId) {
          return NextResponse.json({ error: "Dataset ID is required" }, { status: 400 });
        }
    
        if (!Number.isInteger(prizeCount) || prizeCount < 1 || prizeCount > 20) {
          return NextResponse.json({ error: "prizeCount must be an integer between 1 and 20" }, { status: 400 });
        }

        if (typeof mode !== "undefined" && mode !== "inventory" && mode !== "accounting") {
          return NextResponse.json({ error: "mode must be inventory or accounting" }, { status: 400 });
        }
    
        // prizeLabels の空白チェック
        if (Array.isArray(prizeLabels) && prizeLabels.length === prizeCount) {
          const hasEmptyLabel = prizeLabels.some((label: unknown) => String(label ?? "").trim().length === 0);
          if (hasEmptyLabel) {
            return NextResponse.json({ error: "すべての等級名を入力してください" }, { status: 400 });
          }
        }
    
        const docRef = adminDb.collection('datasets').doc(datasetId);
        const doc = await docRef.get();
    
        if (!doc.exists) {
          return NextResponse.json({ error: "Dataset not found" }, { status: 404 });
        }

        const currentData = (doc.data() as Record<string, unknown> | undefined) || {};
        const currentCounts: number[] = Array.isArray(currentData?.counts) ? currentData.counts : [];
        const currentCount = currentCounts.length;
        const resetApplied = currentCount !== prizeCount;
        const safeMode = mode === "accounting"
          ? "accounting"
          : (currentData.mode === "accounting" ? "accounting" : "inventory");
        const currentPrices: number[] = Array.isArray(currentData?.prices) ? currentData.prices : [];
        const safePrices = Array.from({ length: prizeCount }, (_, i) => {
          const value = Number(currentPrices[i]);
          return Number.isFinite(value) && value >= 0 ? value : 0;
        });

        const safePrizeLabels = Array.isArray(prizeLabels) && prizeLabels.length === prizeCount
          ? prizeLabels.map((label: unknown) => String(label ?? "").trim())
          : Array.from({ length: prizeCount }, (_, i) => {
              const current = Array.isArray(currentData?.prizeLabels) ? currentData.prizeLabels[i] : undefined;
              const text = String(current ?? "").trim();
              return text || `${i + 1}等`;
            });

        const updatePayload: Record<string, unknown> = {
          prizeLabels: safePrizeLabels,
          mode: safeMode,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        };

        if (resetApplied) {
          const resetCounts = Array(prizeCount).fill(0);
          updatePayload.counts = resetCounts;
          updatePayload.initialCounts = resetCounts;
          updatePayload.prices = safePrices;
          updatePayload.history = [];
          updatePayload.accountingHistory = [];
        } else if (currentPrices.length !== prizeCount) {
          updatePayload.prices = safePrices;
        }

        await docRef.update(updatePayload);

        const responseCounts = resetApplied ? Array(prizeCount).fill(0) : currentCounts;
    
        return NextResponse.json({ 
          message: "Dataset updated successfully",
          id: datasetId,
          prizeCount,
          mode: safeMode,
          prizeLabels: safePrizeLabels,
          resetApplied,
          prices: resetApplied || currentPrices.length !== prizeCount ? safePrices : currentPrices,
          counts: responseCounts,
        });
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error("Update dataset error:", errorMessage);
        return NextResponse.json({ error: errorMessage }, { status: 500 });
      }
    }
