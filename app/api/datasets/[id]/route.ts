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
  } catch (error: any) {
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
    
    return NextResponse.json({
      id: doc.id,
      ...doc.data(),
      createdAt: (doc.data() as any).createdAt?.toDate().toISOString() || new Date().toISOString(),
      updatedAt: (doc.data() as any).updatedAt?.toDate().toISOString() || new Date().toISOString(),
    });
  } catch (error: any) {
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
        const { prizeCount, prizeLabels } = body;
        const resolvedParams = await params;
        const datasetId = resolvedParams.id;
    
        if (!datasetId) {
          return NextResponse.json({ error: "Dataset ID is required" }, { status: 400 });
        }
    
        if (!Number.isInteger(prizeCount) || prizeCount < 1 || prizeCount > 20) {
          return NextResponse.json({ error: "prizeCount must be an integer between 1 and 20" }, { status: 400 });
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

        const currentData = doc.data() as any;
        const currentCounts: number[] = Array.isArray(currentData?.counts) ? currentData.counts : [];
        const currentCount = currentCounts.length;
        const resetApplied = currentCount !== prizeCount;

        const safePrizeLabels = Array.isArray(prizeLabels) && prizeLabels.length === prizeCount
          ? prizeLabels.map((label: unknown) => String(label ?? "").trim())
          : Array.from({ length: prizeCount }, (_, i) => {
              const current = Array.isArray(currentData?.prizeLabels) ? currentData.prizeLabels[i] : undefined;
              const text = String(current ?? "").trim();
              return text || `${i + 1}等`;
            });

        const updatePayload: Record<string, unknown> = {
          prizeLabels: safePrizeLabels,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        };

        if (resetApplied) {
          const resetCounts = Array(prizeCount).fill(0);
          updatePayload.counts = resetCounts;
          updatePayload.initialCounts = resetCounts;
          updatePayload.history = [];
        }

        await docRef.update(updatePayload);

        const responseCounts = resetApplied ? Array(prizeCount).fill(0) : currentCounts;
    
        return NextResponse.json({ 
          message: "Dataset updated successfully",
          id: datasetId,
          prizeCount,
          prizeLabels: safePrizeLabels,
          resetApplied,
          counts: responseCounts,
        });
      } catch (error: any) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error("Update dataset error:", errorMessage);
        return NextResponse.json({ error: errorMessage }, { status: 500 });
      }
    }
