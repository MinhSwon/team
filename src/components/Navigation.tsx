"use client";

import {
  Bell,
  Bookmark,
  CircleUser,
  House,
  LogOut,
  Plus,
  Users,
} from "lucide-react";
import Link from "next/link";
import { redirect, usePathname, useRouter } from "next/navigation";

import { authClient } from "@/lib/auth-client";

const navItems = [
  { label: "Feed", href: "/feed", icon: House },
  { label: "Add", href: "/add", icon: Plus },
  { label: "Saved", href: "/saved", icon: Bookmark },
  { label: "Friends", href: "/friends", icon: Users },
  { label: "Notifications", href: "/notifications", icon: Bell },
  { label: "Profile", href: "/profile", icon: CircleUser },
];

export default function Navigation({
  onOpenAddPlace,
}: {
  onOpenAddPlace?: () => void;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { data: session, isPending } = authClient.useSession();

  if (!isPending && !session) redirect("/login");

  async function signOut() {
    await authClient.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-slate-800 bg-slate-900/95 text-white backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <Link href="/feed" className="text-lg font-bold text-amber-400">
            PlaceDecide
          </Link>

          <nav
            aria-label="Primary navigation"
            className="hidden items-center gap-1 md:flex"
          >
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = pathname === item.href;

              if (item.href === "/add" && onOpenAddPlace) {
                return (
                  <button
                    key={item.href}
                    className="flex items-center gap-2 rounded-md px-3 py-2 text-sm font-semibold text-slate-300 hover:bg-slate-800 hover:text-white"
                    onClick={onOpenAddPlace}
                    type="button"
                  >
                    <Icon className="h-4 w-4" />
                    {item.label}
                  </button>
                );
              }

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm font-semibold ${
                    active
                      ? "bg-slate-800 text-amber-400"
                      : "text-slate-300 hover:bg-slate-800 hover:text-white"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <button
            aria-label="Sign out"
            className="rounded-md p-2 text-slate-300 hover:bg-slate-800 hover:text-white"
            onClick={signOut}
            title="Sign out"
            type="button"
          >
            <LogOut className="h-5 w-5" />
          </button>
        </div>
      </header>

      <nav
        aria-label="Mobile navigation"
        className="fixed inset-x-0 bottom-0 z-50 grid grid-cols-6 border-t border-slate-800 bg-slate-900/95 px-1 py-2 backdrop-blur md:hidden"
      >
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = pathname === item.href;
          const className = `flex min-w-0 flex-col items-center gap-1 px-1 py-1 text-[10px] font-medium ${
            active ? "text-amber-400" : "text-slate-400"
          }`;

          if (item.href === "/add" && onOpenAddPlace) {
            return (
              <button
                key={item.href}
                className={className}
                onClick={onOpenAddPlace}
                type="button"
              >
                <Icon className="h-5 w-5" />
                <span className="truncate">{item.label}</span>
              </button>
            );
          }

          return (
            <Link key={item.href} href={item.href} className={className}>
              <Icon className="h-5 w-5" />
              <span className="truncate">{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </>
  );
}
