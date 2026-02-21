"use client";

import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { PrizeProvider } from "./PrizeContext"; 
import Link from "next/link";
import { usePathname } from "next/navigation";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  // 判定をより確実に：pathnameが "/" の時、またはログインページに関連するパスの時
  // pathname が null の場合も考慮
  const isLoginPage = pathname === "/" || pathname === "/login";

  return (
    <html lang="ja">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <PrizeProvider>
          {/* フッターがある分、下の余白を確保するためのクラスを条件付きで追加 */}
          <main className={!isLoginPage ? "pb-20" : ""}>
            {children}
          </main>
        </PrizeProvider>
      
        {/* !isLoginPage の時だけフッターを描画 */}
        {!isLoginPage && (
          <footer className="fixed bottom-0 left-0 right-0 border-t bg-white shadow-lg z-50">
            <nav className="flex justify-around items-center h-16">
              <Link href="/home" className="flex flex-col items-center text-gray-600 hover:text-blue-500 transition-colors">
                <span className="text-xl font-sans">🏠</span>
                <span className="text-xs font-bold">ホーム</span>
              </Link>
              <Link href="/settings" className="flex flex-col items-center text-gray-600 hover:text-blue-500 transition-colors">
                <span className="text-xl font-sans">⚙️</span>
                <span className="text-xs font-bold">設定</span>
              </Link>
            </nav>
            <div className="h-safe-bottom" />
          </footer>
        )}
      </body>
    </html>
  );
}