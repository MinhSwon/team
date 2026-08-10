'use client'
/* eslint-disable @next/next/no-img-element -- collection cover images may come from imported URLs. */

import { useEffect, useState } from 'react'
import Navigation from '@/components/Navigation'
import PlaceCard, { PlaceCardProps } from '@/components/PlaceCard'
import { Bookmark, CheckCircle2, FolderHeart, FolderPlus, Heart, Pencil, Trash2 } from 'lucide-react'

type Tab = 'SAVED' | 'WANT_TO_GO' | 'VISITED' | 'COLLECTIONS'
type PlaceEntry = { status: string; place: { id: string; name: string; address: string; area?: string | null; latitude: number; longitude: number; category?: { name?: string | null } | null; subcategory?: { name?: string | null } | null; priceRange?: string | null; rating: number; description?: string | null; images?: Array<{ url: string }>; tags?: Array<{ tag: { name: string } }> } }
type Collection = { id: string; name: string; places?: Array<{ place?: { images?: Array<{ url: string }> } }> }

function toPlace(entry: PlaceEntry): PlaceCardProps {
  const place = entry.place
  return {
    id: place.id,
    name: place.name,
    address: place.address,
    area: place.area || 'TP. Hồ Chí Minh',
    latitude: place.latitude,
    longitude: place.longitude,
    categoryName: place.category?.name || 'Địa điểm',
    subcategoryName: place.subcategory?.name || undefined,
    priceRange: place.priceRange || '100–300k',
    rating: place.rating,
    description: place.description || '',
    images: place.images?.map((image) => image.url) || [],
    tags: place.tags?.map((mapping) => mapping.tag.name) || [],
    isOpenNow: true,
    groupWantToGoCount: 0,
    savedByCount: 1,
    isVisitedByGroup: entry.status === 'VISITED',
    initialSaved: true,
    initialWantToGo: entry.status === 'WANT_TO_GO',
  }
}

export default function SavedPage() {
  const [activeTab, setActiveTab] = useState<Tab>('SAVED')
  const [places, setPlaces] = useState<PlaceCardProps[]>([])
  const [collections, setCollections] = useState<Collection[]>([])
  const [error, setError] = useState('')

  const loadCollections = async () => {
    const response = await fetch('/api/collections')
    const data = await response.json()
    if (data.success) setCollections(data.collections)
    else setError(data.error || 'Không thể tải bộ sưu tập.')
  }

  useEffect(() => {
    if (activeTab === 'COLLECTIONS') {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- network response updates the view state.
      void loadCollections()
      return
    }
    const query = activeTab === 'WANT_TO_GO' ? '?status=WANT_TO_GO' : activeTab === 'VISITED' ? '?status=VISITED' : ''
    fetch(`/api/saved${query}`).then((response) => response.json()).then((data) => data.success ? setPlaces(data.saved.map(toPlace)) : setError(data.error || 'Vui lòng đăng nhập để xem thư viện.')).catch(() => setError('Vui lòng đăng nhập để xem thư viện.'))
  }, [activeTab])

  async function createCollection() {
    const name = window.prompt('Tên bộ sưu tập')?.trim()
    if (!name) return
    const response = await fetch('/api/collections', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) })
    const data = await response.json()
    if (data.success) setCollections((current) => [data.collection, ...current])
    else setError(data.error || 'Không thể tạo bộ sưu tập.')
  }

  async function renameCollection(collection: Collection) {
    const name = window.prompt('Tên mới', collection.name)?.trim()
    if (!name || name === collection.name) return
    const response = await fetch(`/api/collections/${collection.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) })
    if (response.ok) setCollections((current) => current.map((item) => item.id === collection.id ? { ...item, name } : item))
  }

  async function deleteCollection(collectionId: string) {
    if (!window.confirm('Xóa bộ sưu tập này?')) return
    const response = await fetch(`/api/collections/${collectionId}`, { method: 'DELETE' })
    if (response.ok) setCollections((current) => current.filter((item) => item.id !== collectionId))
  }

  const tabs = [
    { key: 'SAVED', label: 'Tất cả đã lưu', icon: Bookmark },
    { key: 'WANT_TO_GO', label: 'Muốn đi', icon: Heart },
    { key: 'VISITED', label: 'Đã ghé thăm', icon: CheckCircle2 },
    { key: 'COLLECTIONS', label: 'Bộ sưu tập', icon: FolderPlus },
  ]

  return <div className="min-h-screen bg-slate-950 pb-24 text-slate-100 md:pb-12"><Navigation /><main className="mx-auto max-w-7xl space-y-8 px-4 py-8 sm:px-6 lg:px-8"><div><h1 className="flex items-center gap-2 text-3xl font-extrabold text-white"><FolderHeart className="h-8 w-8 text-amber-400" /> Thư viện cá nhân</h1><p className="mt-1 text-sm text-slate-400">Quản lý địa điểm đã lưu, muốn đi và đã ghé thăm.</p></div><div className="flex gap-2 overflow-x-auto border-b border-slate-800 pb-2">{tabs.map((tab) => { const Icon = tab.icon; return <button key={tab.key} onClick={() => setActiveTab(tab.key as Tab)} className={`flex shrink-0 items-center gap-2 rounded-2xl px-4 py-2.5 text-xs font-bold ${activeTab === tab.key ? 'bg-amber-500 text-slate-950' : 'border border-slate-800 bg-slate-900 text-slate-300'}`}><Icon className="h-4 w-4" />{tab.label}</button> })}</div>{error && <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-300">{error}</div>}{activeTab === 'COLLECTIONS' ? <section className="space-y-4"><button onClick={createCollection} className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-bold hover:bg-indigo-500">+ Tạo bộ sưu tập</button><div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">{collections.map((collection) => <div key={collection.id} className="overflow-hidden rounded-3xl border border-slate-800 bg-slate-900"><div className="h-40 bg-slate-800"><img src={collection.places?.[0]?.place?.images?.[0]?.url || 'https://images.unsplash.com/photo-1554118811-1e0d58224f24?w=800'} alt={collection.name} className="h-full w-full object-cover" /></div><div className="p-4"><div className="flex items-center justify-between gap-2"><h2 className="font-bold text-white">{collection.name}</h2><div className="flex gap-1"><button title="Đổi tên" onClick={() => renameCollection(collection)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-white"><Pencil className="h-4 w-4" /></button><button title="Xóa" onClick={() => deleteCollection(collection.id)} className="rounded-lg p-2 text-slate-400 hover:bg-rose-500/20 hover:text-rose-300"><Trash2 className="h-4 w-4" /></button></div></div><p className="mt-1 text-xs text-slate-400">{collection.places?.length || 0} địa điểm</p></div></div>)}</div></section> : <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">{places.map((place) => <PlaceCard key={place.id} place={place} />)}</div>}</main></div>
}
