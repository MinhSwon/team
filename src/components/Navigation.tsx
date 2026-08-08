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
import { usePathname, useRouter } from "next/navigation";

import { authClient } from "@/lib/auth-client";

const navItems = [
  { label: "Feed", href: "/feed", icon: House },
  { label: "Add", href: "/add", icon: Plus },
  { label: "Saved", href: "/saved", icon: Bookmark },
  { label: "Friends", href: "/friends", icon: Users },
  { label: "Notifications", href: "/notifications", icon: Bell },
  { label: "Profile", href: "/profile", icon: CircleUser },
];
const mobileNavItems = navItems.slice(0, 5);

export default function Navigation() {
  const pathname = usePathname();
  const router = useRouter();

  async function signOut() {
    await authClient.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-slate-800 bg-slate-900/95 text-white backdrop-blur">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <Link href="/feed" className="text-lg font-bold text-amber-400">
            PlaceDecide
          </Link>

          <nav
            aria-label="Primary navigation"
            className="hidden items-center gap-1 md:flex"
          >
            {navItems.map((item) => {
              const Icon = item.icon;
              const active =
                pathname === item.href ||
                pathname.startsWith(`${item.href}/`);

              return (
                <Link
                  aria-current={active ? "page" : undefined}
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

          <div className="flex items-center gap-1">
            <Link
              aria-label="Profile"
              className="grid h-11 w-11 place-items-center rounded-md text-slate-300 hover:bg-slate-800 hover:text-white md:hidden"
              href="/profile"
              title="Profile"
            >
              <CircleUser className="h-5 w-5" />
            </Link>
            <button
              aria-label="Sign out"
              className="grid h-11 w-11 place-items-center rounded-md text-slate-300 hover:bg-slate-800 hover:text-white"
              onClick={signOut}
              title="Sign out"
              type="button"
            >
              <LogOut className="h-5 w-5" />
            </button>
          </div>
        </div>
      </header>

      <nav
        aria-label="Mobile navigation"
        className="fixed inset-x-0 bottom-0 z-50 border-t border-slate-800 bg-slate-900/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
      >
        <div className="grid h-16 grid-cols-5 px-1">
          {mobileNavItems.map((item) => {
            const Icon = item.icon;
            const active =
              pathname === item.href ||
              pathname.startsWith(`${item.href}/`);
            const className = `flex h-16 min-w-0 flex-col items-center justify-center gap-1 px-0.5 text-center text-[10px] leading-3 font-medium ${
              active ? "text-amber-400" : "text-slate-400"
            }`;

            return (
              <Link
                aria-current={active ? "page" : undefined}
                key={item.href}
                href={item.href}
                className={className}
              >
                <Icon className="h-5 w-5 shrink-0" />
                <span className="max-w-full break-words">{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
