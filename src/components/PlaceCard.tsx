'use client'

import { useState } from 'react'
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
}

export default function PlaceCard({ place }: { place: PlaceCardProps }) {
  const [isSaved, setIsSaved] = useState(false)
  const [isWantToGo, setIsWantToGo] = useState(false)
  const [wantCount, setWantCount] = useState(place.groupWantToGoCount)

  const handleToggleWantToGo = () => {
    if (isWantToGo) {
      setIsWantToGo(false)
      setWantCount((prev) => Math.max(0, prev - 1))
    } else {
      setIsWantToGo(true)
      setWantCount((prev) => prev + 1)
    }
  }

  return (
    <div className="group relative bg-slate-900/90 border border-slate-800/90 rounded-2xl overflow-hidden shadow-xl hover:shadow-indigo-500/10 hover:border-slate-700 transition-all duration-300 flex flex-col justify-between">
      {/* Hero Image & Badges */}
      <div className="relative h-48 w-full overflow-hidden bg-slate-800">
        <img
          src={place.images[0] || 'https://images.unsplash.com/photo-1554118811-1e0d58224f24?w=800'}
          alt={place.name}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/20 to-transparent" />

        {/* Status Badges */}
        <div className="absolute top-3 left-3 flex flex-wrap gap-2">
          <span className="px-2.5 py-1 rounded-full text-xs font-semibold backdrop-blur-md bg-slate-900/80 text-amber-400 border border-amber-500/30 flex items-center gap-1">
            <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
            {place.rating}
          </span>
          <span className="px-2.5 py-1 rounded-full text-xs font-semibold backdrop-blur-md bg-indigo-900/80 text-indigo-300 border border-indigo-500/30">
            {place.categoryName}
          </span>
          {place.isOpenNow && (
            <span className="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
              Đang mở cửa
            </span>
          )}
        </div>

        {/* Save Toggle */}
        <button
          onClick={() => setIsSaved(!isSaved)}
          className={`absolute top-3 right-3 p-2 rounded-full backdrop-blur-md transition-all ${
            isSaved ? 'bg-amber-500 text-slate-950 scale-110 shadow-lg' : 'bg-slate-900/70 text-slate-300 hover:text-white hover:bg-slate-800'
          }`}
        >
          <Bookmark className="w-4 h-4 fill-current" />
        </button>

        {/* Added By attribution tag */}
        {place.addedBy && (
          <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between text-xs text-slate-300 backdrop-blur-md bg-slate-950/80 px-3 py-1.5 rounded-xl border border-slate-800">
            <span className="flex items-center gap-1.5 font-medium text-amber-300">
              <User className="w-3.5 h-3.5 text-amber-400" />
              Thêm bởi: <strong className="text-white">{place.addedBy}</strong>
            </span>
            {place.isVisitedByGroup && (
              <span className="flex items-center gap-1 text-emerald-400 text-[11px]">
                <CheckCircle2 className="w-3.5 h-3.5" /> Đã đi
              </span>
            )}
          </div>
        )}
      </div>

      {/* Body Content */}
      <div className="p-4 flex-1 flex flex-col justify-between space-y-3">
        <div>
          <h3 className="text-lg font-bold text-white group-hover:text-amber-400 transition-colors line-clamp-1">{place.name}</h3>
          <p className="text-xs text-slate-400 mt-1 flex items-center gap-1">
            <MapPin className="w-3.5 h-3.5 text-slate-500 shrink-0" />
            <span className="line-clamp-1">{place.address}</span>
          </p>

          {/* Social Note */}
          {place.addedNote && (
            <div className="mt-2.5 p-2.5 rounded-xl bg-slate-800/60 border border-slate-700/60 text-xs italic text-slate-300 flex gap-2">
              <MessageSquare className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
              <span>&quot;{place.addedNote}&quot;</span>
            </div>
          )}

          {/* Tags */}
          <div className="flex flex-wrap gap-1.5 mt-3">
            {place.tags.slice(0, 3).map((tag, idx) => (
              <span key={idx} className="px-2 py-0.5 rounded-md bg-slate-800 text-slate-300 text-[11px] font-medium border border-slate-700/50">
                #{tag}
              </span>
            ))}
            <span className="text-[11px] font-semibold text-amber-400/90 ml-auto self-center">{place.priceRange}</span>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="pt-3 border-t border-slate-800 flex items-center justify-between">
          <button
            onClick={handleToggleWantToGo}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
              isWantToGo
                ? 'bg-rose-500/20 text-rose-400 border border-rose-500/40 shadow-sm'
                : 'bg-slate-800/80 text-slate-300 hover:bg-slate-800 hover:text-white'
            }`}
          >
            <Heart className={`w-3.5 h-3.5 ${isWantToGo ? 'fill-rose-500 text-rose-500' : ''}`} />
            <span>Muốn đi ({wantCount})</span>
          </button>

          <span className="text-[11px] text-slate-500 font-medium">{place.savedByCount} lượt lưu</span>
        </div>
      </div>
    </div>
  )
}
