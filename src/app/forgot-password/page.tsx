'use client'
import { FormEvent, useState } from 'react'
import Link from 'next/link'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState(''); const [message, setMessage] = useState(''); const [error, setError] = useState('')
  async function submit(event: FormEvent) { event.preventDefault(); setError(''); const res = await fetch('/api/auth/forgot-password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) }); const data = await res.json(); if (res.ok) setMessage(data.message); else setError(data.error) }
  return <main className="flex min-h-screen items-center justify-center bg-slate-950 px-4 text-white"><form onSubmit={submit} className="w-full max-w-md space-y-5 rounded-3xl border border-slate-800 bg-slate-900 p-8"><h1 className="text-2xl font-extrabold">Quên mật khẩu</h1><p className="text-sm text-slate-400">Nhập email để nhận liên kết đặt lại mật khẩu.</p><input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} className="w-full rounded-xl border border-slate-700 bg-slate-950 p-3" placeholder="ban@example.com" />{message && <p className="rounded-xl bg-emerald-500/10 p-3 text-sm text-emerald-300">{message}</p>}{error && <p className="rounded-xl bg-rose-500/10 p-3 text-sm text-rose-300">{error}</p>}<button className="w-full rounded-xl bg-indigo-600 py-3 font-bold hover:bg-indigo-500">Gửi hướng dẫn</button><Link href="/login" className="block text-center text-sm text-indigo-300">Quay lại đăng nhập</Link></form></main>
}
