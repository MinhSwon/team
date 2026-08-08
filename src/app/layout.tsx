import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/current-user";

import "./globals.css";

const plusJakarta = Plus_Jakarta_Sans({
  subsets: ["latin", "vietnamese"],
  weight: ["400", "500", "600", "700", "800"],
});

export const metadata: Metadata = {
  title: "PlaceDecide — Social Place Discovery & Group Decision Platform",
  description:
    "Nền tảng giúp cá nhân và nhóm bạn khám phá, lưu trữ, chia sẻ và quyết định địa điểm ăn uống, giải trí lý tưởng.",
};

export async function AuthenticatedAppShell({
  children,
}: {
  children: React.ReactNode;
}) {
  if (!(await getCurrentUser())) redirect("/login");

  return children;
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="vi"
      className={`${plusJakarta.className} h-full bg-slate-950 text-slate-100 antialiased`}
    >
      <body className="flex min-h-full flex-col bg-slate-950">{children}</body>
    </html>
  );
}
