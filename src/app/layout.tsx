import type { Metadata } from "next";
import { Noto_Sans_Tamil } from "next/font/google";
import { getLocale } from "@/lib/i18n";
import "./globals.css";

const tamil = Noto_Sans_Tamil({ subsets: ["tamil", "latin"], variable: "--font-tamil", display: "swap" });

export const metadata: Metadata = {
  title: "சேவை மேசை · Seva Mesai",
  description: "Tamil-first desk for government officers: prioritised queue, AI-assisted review, officer decides.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  return (
    <html lang={locale}>
      <body className={`${tamil.variable} font-sans antialiased`}>{children}</body>
    </html>
  );
}
