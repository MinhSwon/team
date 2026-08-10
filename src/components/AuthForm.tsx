'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { FormEvent, useState } from 'react'
import { ArrowRight, LoaderCircle, LockKeyhole, Mail, Sparkles, User } from 'lucide-react'

export default function AuthForm({ mode }: { mode: 'login' | 'register' }) {
  const router = useRouter()
  const isRegister = mode === 'register'
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setLoading(true)
    setError('')

    const form = new FormData(event.currentTarget)
    const payload = {
      name: form.get('name'),
      email: form.get('email'),
      password: form.get('password'),
    }

    try {
      const response = await fetch(`/api/auth/${mode}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Có lỗi xảy ra.')
      router.push('/discover')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Có lỗi xảy ra.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="min-h-screen bg-slate-950 text-white flex items-center justify-center px-4 py-12 relative overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(99,102,241,0.18),transparent_38%),radial-gradient(circle_at_bottom_right,rgba(244,63,94,0.15),transparent_38%)]" />
      <section className="relative w-full max-w-md">
        <Link href="/discover" className="mb-8 flex items-center justify-center gap-3">
          <span className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-amber-500 via-rose-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-rose-500/20">
            <Sparkles className="w-5 h-5" />
          </span>
          <span className="text-2xl font-extrabold">PlaceDecide</span>
        </Link>

        <div className="rounded-3xl border border-slate-800 bg-slate-900/85 backdrop-blur-xl p-7 sm:p-9 shadow-2xl">
          <div className="mb-7">
            <h1 className="text-2xl font-extrabold">{isRegister ? 'Tạo tài khoản' : 'Chào mừng trở lại'}</h1>
            <p className="mt-2 text-sm text-slate-400">
              {isRegister ? 'Lưu và khám phá địa điểm cùng bạn bè.' : 'Đăng nhập để tiếp tục hành trình khám phá.'}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {isRegister && (
              <label className="block">
                <span className="mb-1.5 block text-sm font-semibold text-slate-300">Họ và tên</span>
                <span className="relative block">
                  <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <input name="name" required minLength={2} autoComplete="name" placeholder="Nguyễn Minh Anh" className="w-full rounded-xl border border-slate-700 bg-slate-950/70 py-3 pl-10 pr-4 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20" />
                </span>
              </label>
            )}

            <label className="block">
              <span className="mb-1.5 block text-sm font-semibold text-slate-300">Email</span>
              <span className="relative block">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <input name="email" type="email" required autoComplete="email" placeholder="ban@example.com" className="w-full rounded-xl border border-slate-700 bg-slate-950/70 py-3 pl-10 pr-4 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20" />
              </span>
            </label>

            <label className="block">
              <span className="mb-1.5 block text-sm font-semibold text-slate-300">Mật khẩu</span>
              <span className="relative block">
                <LockKeyhole className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <input name="password" type="password" required minLength={8} autoComplete={isRegister ? 'new-password' : 'current-password'} placeholder="Tối thiểu 8 ký tự" className="w-full rounded-xl border border-slate-700 bg-slate-950/70 py-3 pl-10 pr-4 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20" />
              </span>
            </label>

            {error && <p role="alert" className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">{error}</p>}

            <button disabled={loading} className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-rose-500 py-3 font-bold shadow-lg shadow-indigo-600/20 transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60">
              {loading ? <LoaderCircle className="w-5 h-5 animate-spin" /> : <>{isRegister ? 'Đăng ký' : 'Đăng nhập'} <ArrowRight className="w-4 h-4" /></>}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-slate-400">
            {isRegister ? 'Đã có tài khoản?' : 'Chưa có tài khoản?'}{' '}
            <Link href={isRegister ? '/login' : '/register'} className="font-bold text-indigo-400 hover:text-indigo-300">
              {isRegister ? 'Đăng nhập' : 'Đăng ký ngay'}
            </Link>
          </p>
          {!isRegister && <Link href="/forgot-password" className="mt-3 block text-center text-xs text-indigo-400 hover:text-indigo-300">Quên mật khẩu?</Link>}
        </div>
      </section>
    </main>
  )
}
