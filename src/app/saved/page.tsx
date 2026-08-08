'use client'

import { useState, useEffect } from 'react'
import Navigation from '@/components/Navigation'
import PlaceCard, { PlaceCardProps } from '@/components/PlaceCard'
import { FolderHeart, Heart, CheckCircle2, Bookmark, FolderPlus } from 'lucide-react'

export default function SavedPage() {
  const [places, setPlaces] = useState<PlaceCardProps[]>([])
  const [activeTab, setActiveTab] = useState<'SAVED' | 'WANT_TO_GO' | 'VISITED' | 'COLLECTIONS'>('SAVED')

  useEffect(() => {
    fetch('/api/places')
      .then((res) => res.json())
      .then((data) => {
        if (data.success) setPlaces(data.places)
      })
  }, [])

  const filteredPlaces = places.filter((p) => {
    if (activeTab === 'WANT_TO_GO') return p.groupWantToGoCount > 0
    if (activeTab === 'VISITED') return p.isVisitedByGroup
    return true
  })

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans pb-24 md:pb-12">
      <Navigation />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-extrabold text-white flex items-center gap-2">
              <FolderHeart className="w-8 h-8 text-amber-400" /> Thư Viện Cá Nhân
            </h1>
            <p className="text-sm text-slate-400 mt-1">Quản lý toàn bộ địa điểm bạn đã lưu, danh sách Muốn Đi và Nhật ký Visited.</p>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none border-b border-slate-800">
          {[
            { key: 'SAVED', label: 'Tất cả đã lưu', icon: Bookmark },
            { key: 'WANT_TO_GO', label: 'Muốn Đi (Want to Go)', icon: Heart },
            { key: 'VISITED', label: 'Đã ghé thăm (Visited)', icon: CheckCircle2 },
            { key: 'COLLECTIONS', label: 'Bộ sưu tập (Collections)', icon: FolderPlus },
          ].map((tab) => {
            const Icon = tab.icon
            const isActive = activeTab === tab.key
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key as any)}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-bold shrink-0 transition-all ${
                  isActive
                    ? 'bg-amber-500 text-slate-950 shadow-lg shadow-amber-500/20 scale-105'
                    : 'bg-slate-900 border border-slate-800 text-slate-300 hover:bg-slate-800'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{tab.label}</span>
              </button>
            )
          })}
        </div>

        {/* Content */}
        {activeTab !== 'COLLECTIONS' ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredPlaces.map((place) => (
              <PlaceCard key={place.id} place={place} />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              { name: 'Cafe Chill Cuối Tuần', count: 8, cover: 'https://images.unsplash.com/photo-1554118811-1e0d58224f24?w=800' },
              { name: 'Rooftop Hẹn Hò', count: 4, cover: 'https://images.unsplash.com/photo-1572116469696-31de0f17cc34?w=800' },
              { name: 'Quán Nướng Đi Nhóm Đông', count: 6, cover: 'https://images.unsplash.com/photo-1544025162-d76694265947?w=800' },
            ].map((col, idx) => (
              <div key={idx} className="group relative h-48 rounded-3xl overflow-hidden border border-slate-800 shadow-xl cursor-pointer">
                <img src={col.cover} alt={col.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/40 to-transparent p-5 flex flex-col justify-end">
                  <h3 className="text-lg font-bold text-white group-hover:text-amber-400 transition-colors">{col.name}</h3>
                  <span className="text-xs text-amber-300 font-semibold">{col.count} địa điểm</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
