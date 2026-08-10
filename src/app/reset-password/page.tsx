'use client'
import { FormEvent, useState } from 'react'
import { useRouter } from 'next/navigation'

export default function ResetPasswordPage() {
  const router = useRouter(); const [token] = useState(() => typeof window === 'undefined' ? '' : new URLSearchParams(window.location.search).get('token') || ''); const [password, setPassword] = useState(''); const [message, setMessage] = useState(''); const [error, setError] = useState('')
  async function submit(event: FormEvent) { event.preventDefault(); const res = await fetch('/api/auth/reset-password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, password }) }); const data = await res.json(); if (res.ok) { setMessage('Đã đổi mật khẩu.'); setTimeout(() => router.push('/login'), 800) } else setError(data.error) }
  return <main className="flex min-h-screen items-center justify-center bg-slate-950 px-4 text-white"><form onSubmit={submit} className="w-full max-w-md space-y-5 rounded-3xl border border-slate-800 bg-slate-900 p-8"><h1 className="text-2xl font-extrabold">Đặt lại mật khẩu</h1><input type="password" required minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} className="w-full rounded-xl border border-slate-700 bg-slate-950 p-3" placeholder="Mật khẩu mới" />{message && <p className="text-sm text-emerald-300">{message}</p>}{error && <p className="text-sm text-rose-300">{error}</p>}<button disabled={!token} className="w-full rounded-xl bg-indigo-600 py-3 font-bold disabled:opacity-50">Đặt lại mật khẩu</button></form></main>
}
