'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { LogOut } from 'lucide-react'

type User = { id: string; name: string; email: string; avatar: string | null }

export default function AuthControls() {
  const router = useRouter()
  const [user, setUser] = useState<User | null | undefined>(undefined)

  useEffect(() => {
    fetch('/api/auth/me').then((res) => res.json()).then((data) => setUser(data.user)).catch(() => setUser(null))
  }, [])

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' })
    setUser(null)
    router.push('/login')
    router.refresh()
  }

  if (user === undefined) return <div className="w-9 h-9 rounded-full bg-slate-800 animate-pulse" />
  if (!user) return <Link href="/login" className="px-4 py-2 rounded-xl border border-slate-700 text-sm font-semibold text-slate-200 hover:bg-slate-800">Đăng nhập</Link>

  return (
    <div className="flex items-center gap-2">
      <Link href="/profile" title={user.email} className="w-9 h-9 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center font-bold text-white text-sm border-2 border-indigo-400/30">
        {user.name.charAt(0).toUpperCase()}
      </Link>
      <button onClick={logout} title="Đăng xuất" aria-label="Đăng xuất" className="p-2 rounded-lg text-slate-400 hover:bg-slate-800 hover:text-white">
        <LogOut className="w-4 h-4" />
      </button>
    </div>
  )
}
