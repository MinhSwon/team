'use client'

import { useState, useEffect, useCallback } from 'react'
import Navigation from '@/components/Navigation'
import PlaceCard, { PlaceCardProps } from '@/components/PlaceCard'
import MapView from '@/components/MapView'
import AddPlaceModal from '@/components/AddPlaceModal'
import Link from 'next/link'
import { Sparkles, Search, Grid, Map as MapIcon, SlidersHorizontal } from 'lucide-react'

export default function DiscoverPage() {
  const [places, setPlaces] = useState<PlaceCardProps[]>([])
  const [activeCategory, setActiveCategory] = useState('ALL')
  const [searchQuery, setSearchQuery] = useState('')
  const [viewMode, setViewMode] = useState<'GRID' | 'MAP'>('GRID')
  const [isAddModalOpen, setIsAddModalOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(true)

  const categories = [
    { label: 'Tất cả', value: 'ALL', icon: '✨' },
    { label: 'Cafe Chill', value: 'Cafe', icon: '☕' },
    { label: 'Rooftop & Bar', value: 'Rooftop', icon: '🍸' },
    { label: 'Nhà Hàng BBQ', value: 'Restaurant', icon: '🥩' },
    { label: 'Boardgame & Chơi', value: 'Entertainment', icon: '🎲' },
    { label: 'Hoạt Động', value: 'Activity', icon: '🏄' },
  ]

  const intentShortcuts = [
    { label: 'Ăn gì?', cat: 'Restaurant' },
    { label: 'Cafe Chill', cat: 'Cafe' },
    { label: 'Đi chơi nhóm', cat: 'Entertainment' },
    { label: 'Rooftop ngắm đêm', cat: 'Rooftop' },
    { label: 'Gần tôi (1km)', cat: 'ALL' },
    { label: 'Surprise Me', cat: 'ALL' },
  ]

  const fetchPlaces = useCallback(async () => {
    setIsLoading(true)
    try {
      const res = await fetch(`/api/places?category=${activeCategory}&query=${encodeURIComponent(searchQuery)}`)
      const data = await res.json()
      if (data.success) {
        setPlaces(data.places)
      }
    } catch {
      // Fallback handled in API
    } finally {
      setIsLoading(false)
    }
  }, [activeCategory, searchQuery])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- network response updates the view state.
    void fetchPlaces()
  }, [fetchPlaces])

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans pb-24 md:pb-12">
      <Navigation onOpenAddPlace={() => setIsAddModalOpen(true)} />

      {/* Hero Section */}
      <div className="relative overflow-hidden border-b border-slate-800/80 bg-gradient-to-b from-indigo-950/40 via-slate-950 to-slate-950 py-10 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto space-y-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="space-y-2">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs font-semibold">
                <Sparkles className="w-3.5 h-3.5" /> Nền tảng Lưu & Đưa ra Quyết Định Địa Điểm Nhóm
              </div>
              <h1 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
                Save together. Discover together.{' '}
                <span className="bg-gradient-to-r from-amber-400 to-rose-400 bg-clip-text text-transparent">Decide together.</span>
              </h1>
              <p className="text-sm text-slate-400 max-w-2xl">
                Khám phá kho địa điểm ăn uống, giải trí được đóng góp bởi bạn bè và nhận gợi ý thông minh nhất cho cuộc hẹn hôm nay.
              </p>
            </div>

            {/* Primary CTA - "ĐI ĐÂU BÂY GIỜ?" */}
            <Link
              href="/decide"
              className="group relative inline-flex items-center justify-center gap-3 px-6 py-4 rounded-2xl bg-gradient-to-r from-amber-500 via-rose-500 to-indigo-600 text-white font-bold text-base shadow-xl shadow-rose-500/20 hover:scale-105 transition-all duration-300 shrink-0"
            >
              <div className="p-2 rounded-xl bg-white/10 group-hover:rotate-12 transition-transform">
                <Sparkles className="w-6 h-6 text-amber-300" />
              </div>
              <div className="text-left">
                <span className="block text-xs uppercase tracking-wider text-amber-200 font-semibold">Cần quyết định gấp?</span>
                <span className="block text-lg font-black tracking-wide">ĐI ĐÂU BÂY GIỜ?</span>
              </div>
            </Link>
          </div>

          {/* Search Bar & View Toggle */}
          <div className="flex flex-col sm:flex-row items-center gap-3 pt-2">
            <div className="relative flex-1 w-full">
              <Search className="w-5 h-5 text-slate-400 absolute left-4 top-3.5" />
              <input
                type="text"
                placeholder="Tìm địa điểm, quán cafe, quận, rooftop hay hashtag..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-12 pr-4 py-3 rounded-2xl bg-slate-900 border border-slate-800 text-white placeholder-slate-500 focus:outline-none focus:border-amber-400 shadow-inner text-sm"
              />
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              <button
                onClick={() => setViewMode('GRID')}
                className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-3 rounded-2xl text-xs font-semibold border transition-all ${
                  viewMode === 'GRID' ? 'bg-slate-800 border-amber-400 text-amber-400' : 'bg-slate-900 border-slate-800 text-slate-400'
                }`}
              >
                <Grid className="w-4 h-4" /> Danh sách
              </button>
              <button
                onClick={() => setViewMode('MAP')}
                className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-3 rounded-2xl text-xs font-semibold border transition-all ${
                  viewMode === 'MAP' ? 'bg-slate-800 border-amber-400 text-amber-400' : 'bg-slate-900 border-slate-800 text-slate-400'
                }`}
              >
                <MapIcon className="w-4 h-4" /> Bản đồ
              </button>
            </div>
          </div>

          {/* Intent Shortcuts */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
            <span className="text-xs font-semibold text-slate-400 shrink-0 flex items-center gap-1">
              <SlidersHorizontal className="w-3.5 h-3.5 text-amber-400" /> Nhu cầu nhanh:
            </span>
            {intentShortcuts.map((sc, i) => (
              <button
                key={i}
                onClick={() => setActiveCategory(sc.cat)}
                className="px-3 py-1.5 rounded-xl bg-slate-900/90 border border-slate-800 hover:border-slate-700 text-xs font-semibold text-slate-300 hover:text-white shrink-0 transition-all hover:scale-105"
              >
                {sc.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {/* Category Tabs */}
        <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none">
          {categories.map((cat) => (
            <button
              key={cat.value}
              onClick={() => setActiveCategory(cat.value)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-bold shrink-0 transition-all ${
                activeCategory === cat.value
                  ? 'bg-amber-500 text-slate-950 shadow-lg shadow-amber-500/20 scale-105'
                  : 'bg-slate-900 border border-slate-800 text-slate-300 hover:bg-slate-800'
              }`}
            >
              <span>{cat.icon}</span>
              <span>{cat.label}</span>
            </button>
          ))}
        </div>

        {/* Dynamic Display: Grid or Map */}
        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3].map((n) => (
              <div key={n} className="h-80 rounded-2xl bg-slate-900/60 animate-pulse border border-slate-800" />
            ))}
          </div>
        ) : viewMode === 'GRID' ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {places.map((place) => (
              <PlaceCard key={place.id} place={place} />
            ))}
          </div>
        ) : (
          <div className="h-[550px] w-full">
            <MapView
              places={places.map((p) => ({
                id: p.id,
                name: p.name,
                address: p.address,
                latitude: p.latitude || 10.7769,
                longitude: p.longitude || 106.7009,
                categoryName: p.categoryName,
                priceRange: p.priceRange,
              }))}
            />
          </div>
        )}
      </main>

      <AddPlaceModal isOpen={isAddModalOpen} onClose={() => setIsAddModalOpen(false)} onSuccess={fetchPlaces} />
    </div>
  )
}
