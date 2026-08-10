'use client'

import { FormEvent, useState } from 'react'

export default function VisitForm({ placeId }: { placeId: string }) {
  const [open, setOpen] = useState(false); const [feedback, setFeedback] = useState('LOVED_IT'); const [note, setNote] = useState(''); const [message, setMessage] = useState('')
  async function submit(event: FormEvent) { event.preventDefault(); const response = await fetch('/api/visits', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ placeId, feedback, note }) }); const data = await response.json(); if (response.ok) { setMessage('Đã ghi nhận chuyến đi.'); setOpen(false) } else setMessage(data.error || 'Không thể lưu.') }
  return <div className="space-y-3"><button onClick={() => setOpen((value) => !value)} className="w-full rounded-xl border border-slate-700 px-4 py-3 text-sm font-bold text-slate-200 hover:bg-slate-800">{open ? 'Đóng form' : 'Ghi nhận đã ghé'}</button>{open && <form onSubmit={submit} className="space-y-3 rounded-xl border border-slate-800 bg-slate-950 p-4"><select value={feedback} onChange={(event) => setFeedback(event.target.value)} className="w-full rounded-lg border border-slate-700 bg-slate-900 p-2 text-sm"><option value="LOVED_IT">Rất thích</option><option value="OKAY">Ổn</option><option value="DIDNT_LIKE">Không thích</option></select><textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="Ghi chú chuyến đi" className="min-h-20 w-full rounded-lg border border-slate-700 bg-slate-900 p-2 text-sm" /><button className="w-full rounded-lg bg-emerald-600 py-2 text-sm font-bold hover:bg-emerald-500">Lưu chuyến đi</button></form>}{message && <p className="text-xs text-emerald-300">{message}</p>}</div>
}
