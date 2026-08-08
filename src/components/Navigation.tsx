'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Compass, Sparkles, FolderHeart, Users, FileUp, PlusCircle } from 'lucide-react'

export default function Navigation({ onOpenAddPlace }: { onOpenAddPlace?: () => void }) {
  const pathname = usePathname()

  const navItems = [
    { label: 'Khám phá', href: '/discover', icon: Compass },
    { label: 'Đi đâu bây giờ?', href: '/decide', icon: Sparkles, highlight: true },
    { label: 'Hội nhóm', href: '/groups', icon: Users },
    { label: 'Đã lưu', href: '/saved', icon: FolderHeart },
    { label: 'Import File', href: '/import', icon: FileUp },
  ]

  return (
    <>
      {/* Desktop Header */}
      <header className="sticky top-0 z-40 backdrop-blur-md bg-slate-900/80 border-b border-slate-800 text-white shadow-xl">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <Link href="/discover" className="flex items-center gap-3 group">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-amber-500 via-rose-500 to-indigo-600 flex items-center justify-center shadow-lg group-hover:scale-105 transition-transform">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <div>
              <span className="text-xl font-bold bg-gradient-to-r from-amber-400 via-rose-400 to-indigo-300 bg-clip-text text-transparent">
                PlaceDecide
              </span>
              <span className="block text-[10px] text-slate-400 font-medium tracking-wide">Save • Discover • Decide</span>
            </div>
          </Link>

          {/* Nav items desktop */}
          <nav className="hidden md:flex items-center gap-1">
            {navItems.map((item) => {
              const Icon = item.icon
              const isActive = pathname === item.href
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
                    item.highlight
                      ? 'bg-gradient-to-r from-amber-500 to-rose-500 text-white shadow-md shadow-rose-500/20 hover:opacity-90 hover:scale-105'
                      : isActive
                      ? 'bg-slate-800 text-amber-400 shadow-inner'
                      : 'text-slate-300 hover:bg-slate-800/60 hover:text-white'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {item.label}
                </Link>
              )
            })}
          </nav>

          {/* Quick Add Place CTA */}
          <div className="flex items-center gap-3">
            <button
              onClick={onOpenAddPlace}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold shadow-lg shadow-indigo-600/30 transition-all hover:scale-105"
            >
              <PlusCircle className="w-4 h-4" />
              <span className="hidden sm:inline">Thêm địa điểm</span>
            </button>
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center font-bold text-white text-sm border-2 border-indigo-400/30">
              M
            </div>
          </div>
        </div>
      </header>

      {/* Mobile Bottom Bar */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-slate-900/95 backdrop-blur-lg border-t border-slate-800 px-2 py-2 flex items-center justify-around">
        {navItems.map((item) => {
          const Icon = item.icon
          const isActive = pathname === item.href
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-col items-center gap-1 px-3 py-1.5 rounded-xl text-[11px] font-medium transition-all ${
                item.highlight
                  ? 'text-amber-400 font-bold'
                  : isActive
                  ? 'text-indigo-400 bg-slate-800/80'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <div className={item.highlight ? 'p-2 rounded-full bg-amber-500/20 text-amber-400' : ''}>
                <Icon className="w-5 h-5" />
              </div>
              <span>{item.label}</span>
            </Link>
          )
        })}
      </div>
    </>
  )
}
