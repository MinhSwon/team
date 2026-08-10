'use client'
/* eslint-disable @next/next/no-img-element -- place images may come from imported URLs. */

import { useState } from 'react'
import Link from 'next/link'
import { Heart, Bookmark, MapPin, Star, MessageSquare, CheckCircle2, User } from 'lucide-react'

export interface PlaceCardProps {
  id: string
  name: string
  address: string
  area: string
  latitude: number
  longitude: number
  categoryName: string
  subcategoryName?: string
  priceRange: string
  rating: number
  description?: string
  images: string[]
  tags: string[]
  isOpenNow: boolean
  groupWantToGoCount: number
  savedByCount: number
  isVisitedByGroup?: boolean
  addedBy?: string
  addedNote?: string
  initialSaved?: boolean
  initialWantToGo?: boolean
}

export default function PlaceCard({ place }: { place: PlaceCardProps }) {
  const [isSaved, setIsSaved] = useState(place.initialSaved ?? false)
  const [isSaving, setIsSaving] = useState(false)
  const [isWantToGo, setIsWantToGo] = useState(place.initialWantToGo ?? false)
  const [wantCount, setWantCount] = useState(place.groupWantToGoCount)
  const [collections, setCollections] = useState<Array<{ id: string; name: string }>>([])
  const [showCollections, setShowCollections] = useState(false)
  const [collectionMessage, setCollectionMessage] = useState('')

  const handleToggleSave = async () => {
    if (isSaving) return
    setIsSaving(true)
    try {
      const response = isSaved
        ? await fetch(`/api/saved?placeId=${encodeURIComponent(place.id)}`, { method: 'DELETE' })
        : await fetch('/api/saved', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ placeId: place.id, status: 'WANT_TO_GO' }) })
      if (response.ok) setIsSaved((value) => !value)
    } finally {
      setIsSaving(false)
    }
  }

  const handleToggleWantToGo = async () => {
    const next = !isWantToGo
    const response = next
      ? await fetch('/api/saved', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ placeId: place.id, status: 'WANT_TO_GO' }) })
      : await fetch(`/api/saved?placeId=${encodeURIComponent(place.id)}`, { method: 'DELETE' })
    if (!response.ok) return
    setIsWantToGo(next)
    setIsSaved(next || isSaved)
    setWantCount((prev) => next ? prev + 1 : Math.max(0, prev - 1))
  }

  const loadCollections = async () => {
    if (collections.length) {
      setShowCollections((value) => !value)
      return
    }
    const response = await fetch('/api/collections')
    if (!response.ok) return
    const data = await response.json()
    if (data.success) {
      setCollections(data.collections.map((item: { id: string; name: string }) => ({ id: item.id, name: item.name })))
      setShowCollections(true)
    }
  }

  const addToCollection = async (collectionId: string) => {
    const response = await fetch(`/api/collections/${collectionId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ placeId: place.id }),
    })
    setCollectionMessage(response.ok ? 'Đã thêm vào bộ sưu tập' : 'Không thể thêm địa điểm')
    setTimeout(() => setCollectionMessage(''), 1800)
  }

  return (
    <div className="group relative flex flex-col justify-between overflow-hidden rounded-2xl border border-slate-800/90 bg-slate-900/90 shadow-xl transition-all duration-300 hover:border-slate-700 hover:shadow-indigo-500/10">
      <div className="relative h-48 w-full overflow-hidden bg-slate-800">
        <img src={place.images[0] || 'https://images.unsplash.com/photo-1554118811-1e0d58224f24?w=800'} alt={place.name} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/20 to-transparent" />
        <div className="absolute left-3 top-3 flex flex-wrap gap-2">
          <span className="flex items-center gap-1 rounded-full border border-amber-500/30 bg-slate-900/80 px-2.5 py-1 text-xs font-semibold text-amber-400"><Star className="h-3 w-3 fill-amber-400" />{place.rating}</span>
          <span className="rounded-full border border-indigo-500/30 bg-indigo-900/80 px-2.5 py-1 text-xs font-semibold text-indigo-300">{place.categoryName}</span>
          {place.isOpenNow && <span className="rounded-full border border-emerald-500/40 bg-emerald-500/20 px-2.5 py-1 text-[11px] font-semibold text-emerald-300">Đang mở cửa</span>}
        </div>
        <button onClick={handleToggleSave} disabled={isSaving} className={`absolute right-3 top-3 rounded-full p-2 backdrop-blur-md transition-all ${isSaved ? 'scale-110 bg-amber-500 text-slate-950 shadow-lg' : 'bg-slate-900/70 text-slate-300 hover:bg-slate-800 hover:text-white'}`}><Bookmark className="h-4 w-4 fill-current" /></button>
        {place.addedBy && <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between rounded-xl border border-slate-800 bg-slate-950/80 px-3 py-1.5 text-xs text-slate-300 backdrop-blur-md"><span className="flex items-center gap-1.5 font-medium text-amber-300"><User className="h-3.5 w-3.5 text-amber-400" />Thêm bởi: <strong className="text-white">{place.addedBy}</strong></span>{place.isVisitedByGroup && <span className="flex items-center gap-1 text-[11px] text-emerald-400"><CheckCircle2 className="h-3.5 w-3.5" />Đã đi</span>}</div>}
      </div>
      <div className="flex flex-1 flex-col justify-between space-y-3 p-4">
        <div>
          <Link href={`/places/${place.id}`} className="line-clamp-1 text-lg font-bold text-white transition-colors group-hover:text-amber-400">{place.name}</Link>
          <p className="mt-1 flex items-center gap-1 text-xs text-slate-400"><MapPin className="h-3.5 w-3.5 shrink-0 text-slate-500" /><span className="line-clamp-1">{place.address}</span></p>
          {place.addedNote && <div className="mt-2.5 flex gap-2 rounded-xl border border-slate-700/60 bg-slate-800/60 p-2.5 text-xs italic text-slate-300"><MessageSquare className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400" /><span>&quot;{place.addedNote}&quot;</span></div>}
          <div className="mt-3 flex flex-wrap gap-1.5">{place.tags.slice(0, 3).map((tag, idx) => <span key={idx} className="rounded-md border border-slate-700/50 bg-slate-800 px-2 py-0.5 text-[11px] font-medium text-slate-300">#{tag}</span>)}<span className="ml-auto self-center text-[11px] font-semibold text-amber-400/90">{place.priceRange}</span></div>
        </div>
        <div className="relative flex items-center justify-between border-t border-slate-800 pt-3">
          <button onClick={handleToggleWantToGo} className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold transition-all ${isWantToGo ? 'border border-rose-500/40 bg-rose-500/20 text-rose-400 shadow-sm' : 'bg-slate-800/80 text-slate-300 hover:bg-slate-800 hover:text-white'}`}><Heart className={`h-3.5 w-3.5 ${isWantToGo ? 'fill-rose-500 text-rose-500' : ''}`} /><span>Muốn đi ({wantCount})</span></button>
          <div className="relative"><button type="button" onClick={loadCollections} className="rounded-xl bg-slate-800/80 px-3 py-1.5 text-xs font-semibold text-slate-300 hover:bg-slate-800 hover:text-white">+ Bộ sưu tập</button>{showCollections && <div className="absolute bottom-10 right-0 z-20 w-52 rounded-xl border border-slate-700 bg-slate-900 p-2 shadow-2xl"><p className="px-2 py-1 text-[11px] font-bold uppercase tracking-wide text-slate-500">Chọn bộ sưu tập</p>{collections.length ? collections.map((collection) => <button key={collection.id} type="button" onClick={() => addToCollection(collection.id)} className="block w-full rounded-lg px-2 py-2 text-left text-xs text-slate-200 hover:bg-slate-800">{collection.name}</button>) : <p className="px-2 py-2 text-xs text-slate-500">Chưa có bộ sưu tập</p>}{collectionMessage && <p className="px-2 py-1 text-[11px] text-emerald-300">{collectionMessage}</p>}</div>}</div>
        </div>
      </div>
    </div>
  )
}
