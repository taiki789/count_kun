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
        throw new Error("FIREBASE_ADMIN_SDK_KEY env variable is not set. Please create .env.local file with your Firebase service account JSON.");
      }
      let parsedKey;
      try {
        parsedKey = JSON.parse(key);
      } catch (parseError) {
        throw new Error(`FIREBASE_ADMIN_SDK_KEY is not valid JSON. Check .env.local file. Error: ${parseError instanceof Error ? parseError.message : 'Unknown parse error'}`);
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

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  // GETリクエスト（ブラウザで直接開いた時）の確認用
  return NextResponse.json({ message: "API Path is correct!" });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // 実行時に初期化とDB取得を行う
    const adminDb = getAdminDB();
    
    const body = await request.json();
    const { action, counts, entry } = body;
    
    const resolvedParams = await params;
    const docId = resolvedParams.id;
    
    const docRef = adminDb.collection('prizes').doc(docId);

    if (action === 'resetData' || action === 'init') {
      await docRef.set({
        counts: [50, 30, 20, 10, 5],
        history: [],
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      return NextResponse.json({ message: "Reset Success" });
    }

    if (action === 'addHistory') {
      await docRef.update({
        counts: counts,
        history: admin.firestore.FieldValue.arrayUnion(entry),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      return NextResponse.json({ message: "Update Success" });
    }

    if (action === 'setCounts') {
      await docRef.set({
        counts: counts,
        history: [],
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      return NextResponse.json({ message: "Counts Set Success" });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });

  } catch (error: any) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;
    console.error("Admin SDK Runtime Error:", errorMessage);
    if (errorStack) console.error("Stack:", errorStack);
    return NextResponse.json({ 
      error: errorMessage,
      type: error?.constructor?.name || 'Unknown',
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
}