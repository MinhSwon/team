import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";

import "./globals.css";

const plusJakarta = Plus_Jakarta_Sans({
  subsets: ["latin", "vietnamese"],
  weight: ["400", "500", "600", "700", "800"],
});

export const metadata: Metadata = {
  title: "PlaceDecide | Private Social Place Network",
  description:
    "Save places and share them privately with accepted friends.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${plusJakarta.className} h-full bg-slate-950 text-slate-100 antialiased`}
    >
      <body className="flex min-h-full flex-col bg-slate-950">{children}</body>
    </html>
  );
}
