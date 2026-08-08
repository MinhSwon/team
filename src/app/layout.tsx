import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";

const plusJakarta = Plus_Jakarta_Sans({
  subsets: ["latin", "vietnamese"],
  weight: ["400", "500", "600", "700", "800"],
});

export const metadata: Metadata = {
  title: "PlaceDecide — Social Place Discovery & Group Decision Platform",
  description: "Nền tảng giúp cá nhân và nhóm bạn khám phá, lưu trữ, chia sẻ và quyết định địa điểm ăn uống, giải trí lý tưởng.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi" className={`${plusJakarta.className} h-full bg-slate-950 text-slate-100 antialiased`}>
      <body className="min-h-full flex flex-col bg-slate-950">{children}</body>
    </html>
  );
}
