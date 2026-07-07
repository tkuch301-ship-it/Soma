import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Soma - サークルタスク管理",
  description: "サークル部員のタスク進捗管理・共有アプリ",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body className="antialiased">{children}</body>
    </html>
  );
}
