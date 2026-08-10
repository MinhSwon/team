'use client'
/* eslint-disable @next/next/no-img-element -- recommendation images may come from user/imported URLs. */

import { useState } from 'react'
import Navigation from '@/components/Navigation'
import { Sparkles, Users, Clock, DollarSign, Navigation as DistIcon, CheckCircle2, Heart, ArrowRight, MapPin, LocateFixed, Loader2 } from 'lucide-react'

interface RecResult {
  id: string
  name: string
  address: string
  area: string
  category: string
  priceRange: string
  rating: number
  distanceKm: number
  matchScore: number
  reasons: string[]
  images: string[]
  isOpenNow: boolean
  groupWantToGoCount: number
}

type Activity = 'EAT' | 'CAFE' | 'CHILL' | 'ENTERTAINMENT' | 'ACTIVITY' | 'DATE'
type Time = 'NOW' | 'TONIGHT' | 'TOMORROW' | 'WEEKEND'
type Budget = 'UNDER_100K' | '100_300K' | '300_500K' | '500K_PLUS'
type Distance = '1KM' | '3KM' | '5KM' | '10KM'

export default function DecidePage() {
  const [who, setWho] = useState<'JUST_ME' | 'GROUP'>('GROUP')
  const [activity, setActivity] = useState<Activity>('CAFE')
  const [time, setTime] = useState<Time>('NOW')
  const [budget, setBudget] = useState<Budget>('100_300K')
  const [distance, setDistance] = useState<Distance>('3KM')

  const [results, setResults] = useState<RecResult[]>([])
  const [isCalculated, setIsCalculated] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [locationText, setLocationText] = useState('')
  const [locationCoords, setLocationCoords] = useState<{ latitude: number; longitude: number } | null>(null)
  const [locationLoading, setLocationLoading] = useState(false)
  const [locationMessage, setLocationMessage] = useState('')

  const resolveAddress = async (address = locationText) => {
    const query = address.trim()
    if (query.length < 3) {
      setLocationMessage('Hãy nhập địa chỉ cụ thể hơn.')
      return null
    }
    setLocationLoading(true)
    setLocationMessage('Đang tìm tọa độ địa chỉ...')
    try {
      const response = await fetch(`/api/geocode?address=${encodeURIComponent(query)}`)
      const data = await response.json()
      if (!response.ok || !data.success) throw new Error(data.error || 'Không tìm thấy địa chỉ.')
      const coords = { latitude: Number(data.latitude), longitude: Number(data.longitude) }
      setLocationCoords(coords)
      setLocationMessage(data.displayName ? `Đã xác định: ${data.displayName}` : 'Đã xác định vị trí, khoảng cách sẽ tính từ đây.')
      return coords
    } catch (error) {
      setLocationCoords(null)
      setLocationMessage(error instanceof Error ? error.message : 'Không thể xác định địa chỉ.')
      return null
    } finally {
      setLocationLoading(false)
    }
  }

  const useCurrentGps = () => {
    if (!navigator.geolocation) {
      setLocationMessage('Trình duyệt không hỗ trợ GPS. Bạn hãy nhập địa chỉ thủ công.')
      return
    }
    setLocationLoading(true)
    setLocationMessage('Đang xin quyền truy cập vị trí...')
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const coords = { latitude: position.coords.latitude, longitude: position.coords.longitude }
        setLocationCoords(coords)
        setLocationText('Vị trí hiện tại (GPS)')
        setLocationMessage('Đã lấy vị trí GPS hiện tại.')
        setLocationLoading(false)
      },
      () => {
        setLocationMessage('Không lấy được GPS. Bạn hãy nhập địa chỉ để tiếp tục.')
        setLocationLoading(false)
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 300000 },
    )
  }

  const handleRunRecommendation = async () => {
    setIsLoading(true)
    try {
      let coords = locationCoords
      if (locationText.trim() && !coords) coords = await resolveAddress()
      if (locationText.trim() && !coords) return
      const res = await fetch('/api/decide', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ who, activity, time, budget, distance, userLat: coords?.latitude, userLng: coords?.longitude }),
      })
      const data = await res.json()
      if (data.success) {
        setResults(data.results)
        setIsCalculated(true)
      }
    } catch {
      // Handled
    } finally {
        setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans pb-24 md:pb-12">
      <Navigation />

      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Header */}
        <div className="text-center space-y-3 max-w-2xl mx-auto">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-gradient-to-r from-amber-500/20 to-rose-500/20 border border-amber-500/30 text-amber-300 text-xs font-bold">
            <Sparkles className="w-4 h-4 text-amber-400" /> Thuật toán Gợi Ý Quyết Định Nhóm V1
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold text-white">ĐI ĐÂU BÂY GIỜ?</h1>
          <p className="text-sm text-slate-400">
            Không còn tranh cãi &quot;Tối nay đi đâu?&quot;. Cung cấp ngữ cảnh hiện tại, hệ thống sẽ tính toán sở thích cá nhân, sở thích nhóm,
            khoảng cách và mở cửa để đưa ra các lựa chọn tốt nhất.
          </p>
        </div>

        {/* Wizard Context Form */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-6">
          {/* Current location */}
          <div className="space-y-2 rounded-2xl border border-indigo-500/30 bg-indigo-950/20 p-4">
            <label className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-300">
              <MapPin className="h-4 w-4 text-indigo-300" /> Bạn đang ở đâu?
            </label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                value={locationText}
                onChange={(event) => { setLocationText(event.target.value); setLocationCoords(null); setLocationMessage('') }}
                placeholder="Nhập địa chỉ hiện tại, ví dụ: 27 Nguyễn Đức Kế, Quận 1"
                className="min-w-0 flex-1 rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 text-sm text-white outline-none transition focus:border-indigo-400"
              />
              <button type="button" onClick={() => void resolveAddress()} disabled={locationLoading || !locationText.trim()} className="inline-flex items-center justify-center gap-2 rounded-xl border border-indigo-400/50 bg-indigo-500/15 px-4 py-3 text-xs font-bold text-indigo-200 hover:bg-indigo-500/25 disabled:cursor-not-allowed disabled:opacity-50">
                {locationLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <MapPin className="h-4 w-4" />} Xác định địa chỉ
              </button>
              <button type="button" onClick={useCurrentGps} disabled={locationLoading} className="inline-flex items-center justify-center gap-2 rounded-xl border border-emerald-400/50 bg-emerald-500/15 px-4 py-3 text-xs font-bold text-emerald-200 hover:bg-emerald-500/25 disabled:cursor-not-allowed disabled:opacity-50">
                <LocateFixed className="h-4 w-4" /> Dùng GPS
              </button>
            </div>
            <p className={`text-xs ${locationCoords ? 'text-emerald-300' : 'text-slate-500'}`}>{locationMessage || 'Không bắt buộc: nếu bỏ trống, hệ thống dùng trung tâm TP. Hồ Chí Minh để ước tính khoảng cách.'}</p>
          </div>

          {/* Who */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              <Users className="w-4 h-4 text-amber-400" /> 1. Bạn đang đi cùng ai?
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setWho('JUST_ME')}
                className={`p-3.5 rounded-2xl font-bold text-xs sm:text-sm border transition-all text-center ${
                  who === 'JUST_ME'
                    ? 'bg-amber-500 border-amber-400 text-slate-950 shadow-lg shadow-amber-500/20'
                    : 'bg-slate-800/60 border-slate-700 text-slate-300 hover:bg-slate-800'
                }`}
              >
                👤 Một mình tôi (Solo)
              </button>
              <button
                onClick={() => setWho('GROUP')}
                className={`p-3.5 rounded-2xl font-bold text-xs sm:text-sm border transition-all text-center ${
                  who === 'GROUP'
                    ? 'bg-amber-500 border-amber-400 text-slate-950 shadow-lg shadow-amber-500/20'
                    : 'bg-slate-800/60 border-slate-700 text-slate-300 hover:bg-slate-800'
                }`}
              >
                🎓 Hội Đại Học (Nhóm 5 người)
              </button>
            </div>
          </div>

          {/* Activity */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-amber-400" /> 2. Muốn làm gì?
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {[
                { key: 'CAFE', label: '☕ Cà phê chill' },
                { key: 'EAT', label: '🥩 Ăn uống ngon' },
                { key: 'CHILL', label: '🍸 Rooftop & Bar' },
                { key: 'ENTERTAINMENT', label: '🎲 Boardgame & Bida' },
                { key: 'ACTIVITY', label: '🏄 Trải nghiệm ngoài trời' },
                { key: 'DATE', label: '🌹 Hẹn hò lãng mạn' },
              ].map((act) => (
                <button
                  key={act.key}
                  onClick={() => setActivity(act.key as Activity)}
                  className={`p-3 rounded-2xl font-semibold text-xs border transition-all text-left ${
                    activity === act.key
                      ? 'bg-indigo-600 border-indigo-500 text-white shadow-lg shadow-indigo-600/30'
                      : 'bg-slate-800/60 border-slate-700 text-slate-300 hover:bg-slate-800'
                  }`}
                >
                  {act.label}
                </button>
              ))}
            </div>
          </div>

          {/* Time & Budget */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {/* Time */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <Clock className="w-4 h-4 text-amber-400" /> 3. Thời gian khi nào?
              </label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { key: 'NOW', label: 'Bây giờ (Mở ngay)' },
                  { key: 'TONIGHT', label: 'Tối nay' },
                  { key: 'TOMORROW', label: 'Ngày mai' },
                  { key: 'WEEKEND', label: 'Cuối tuần' },
                ].map((t) => (
                  <button
                    key={t.key}
                    onClick={() => setTime(t.key as Time)}
                    className={`p-2.5 rounded-xl font-semibold text-xs border transition-all ${
                      time === t.key
                        ? 'bg-slate-800 border-amber-400 text-amber-300'
                        : 'bg-slate-800/40 border-slate-700 text-slate-400 hover:text-white'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Budget */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <DollarSign className="w-4 h-4 text-amber-400" /> 4. Ngân sách mỗi người?
              </label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { key: 'UNDER_100K', label: '<100k' },
                  { key: '100_300K', label: '100k–300k' },
                  { key: '300_500K', label: '300k–500k' },
                  { key: '500K_PLUS', label: '500k+' },
                ].map((b) => (
                  <button
                    key={b.key}
                    onClick={() => setBudget(b.key as Budget)}
                    className={`p-2.5 rounded-xl font-semibold text-xs border transition-all ${
                      budget === b.key
                        ? 'bg-slate-800 border-amber-400 text-amber-300'
                        : 'bg-slate-800/40 border-slate-700 text-slate-400 hover:text-white'
                    }`}
                  >
                    {b.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Distance */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              <DistIcon className="w-4 h-4 text-amber-400" /> 5. Bán kính khoảng cách tối đa?
            </label>
            <div className="grid grid-cols-4 gap-2">
              {[{ key: '1KM', label: '1KM' }, { key: '3KM', label: '3KM' }, { key: '5KM', label: '5KM' }, { key: '10KM', label: '>10KM' }].map((option) => (
                <button
                  key={option.key}
                  onClick={() => setDistance(option.key as Distance)}
                  className={`p-2.5 rounded-xl font-semibold text-xs border transition-all text-center ${
                    distance === option.key
                      ? 'bg-slate-800 border-amber-400 text-amber-300'
                      : 'bg-slate-800/40 border-slate-700 text-slate-400 hover:text-white'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          {/* CTA Action Button */}
          <button
            onClick={handleRunRecommendation}
            disabled={isLoading}
            className="w-full py-4 rounded-2xl bg-gradient-to-r from-amber-500 via-rose-500 to-indigo-600 text-white font-black text-base shadow-xl shadow-rose-500/20 hover:scale-[1.01] transition-all flex items-center justify-center gap-3"
          >
            <Sparkles className="w-5 h-5 text-amber-200" />
            <span>{isLoading ? 'Đang tính toán địa điểm phù hợp nhất...' : 'TÌM ĐỊA ĐIỂM PHÙ HỢP NHẤT'}</span>
          </button>
        </div>

        {/* Results Section */}
        {isCalculated && (
          <div className="space-y-6 animate-fade-in">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold text-white flex items-center gap-2">
                  <Sparkles className="w-6 h-6 text-amber-400" /> Top Địa Điểm Khuyên Đi
                </h2>
                <p className="text-xs text-slate-400">Đã lọc cứng theo thời gian mở cửa, bán kính & tính toán điểm hài lòng nhóm</p>
              </div>
              <span className="px-3 py-1 rounded-full bg-slate-800 text-amber-400 text-xs font-semibold">
                {results.length} Gợi ý hoàn hảo
              </span>
            </div>

            <div className="space-y-4">
              {results.map((res, index) => (
                <div
                  key={res.id}
                  className="bg-slate-900/90 border border-slate-800 rounded-3xl p-5 sm:p-6 shadow-xl flex flex-col md:flex-row gap-6 items-start hover:border-slate-700 transition-all"
                >
                  {/* Rank & Image */}
                  <div className="relative w-full md:w-64 h-48 rounded-2xl overflow-hidden shrink-0 bg-slate-800">
                    <img src={res.images[0]} alt={res.name} className="w-full h-full object-cover" />
                    <div className="absolute top-3 left-3 px-3 py-1 rounded-xl bg-slate-950/90 text-amber-400 font-extrabold text-sm border border-amber-500/30">
                      #{index + 1}
                    </div>
                    <div className="absolute bottom-3 right-3 px-3 py-1 rounded-full bg-gradient-to-r from-amber-500 to-rose-500 text-slate-950 font-black text-xs shadow-lg">
                      {res.matchScore}% Match
                    </div>
                  </div>

                  {/* Details & Explainable Reasons */}
                  <div className="flex-1 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <h3 className="text-xl font-bold text-white">{res.name}</h3>
                        <p className="text-xs text-slate-400">{res.address}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-cyan-300 px-3 py-1 rounded-xl bg-cyan-500/10 border border-cyan-500/30">
                          <DistIcon className="h-3.5 w-3.5" /> {res.distanceKm} km
                        </span>
                        <span className="text-xs font-semibold text-slate-300 px-3 py-1 rounded-xl bg-slate-800 border border-slate-700">
                          {res.priceRange}
                        </span>
                      </div>
                    </div>

                    {/* Explainable Recommendation Reasons */}
                    <div className="p-3.5 rounded-2xl bg-indigo-950/40 border border-indigo-900/60 space-y-2">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-indigo-300 block">
                        💡 Tại sao gợi ý địa điểm này?
                      </span>
                      <ul className="space-y-1 text-xs text-slate-300">
                        {res.reasons.map((reason, rIdx) => (
                          <li key={rIdx} className="flex items-center gap-2">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                            <span>{reason}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    {/* Action buttons */}
                    <div className="flex items-center justify-between pt-2">
                      <button className="flex items-center gap-2 px-4 py-2 rounded-xl bg-rose-500/20 text-rose-300 hover:bg-rose-500/30 font-semibold text-xs border border-rose-500/40">
                        <Heart className="w-4 h-4 fill-rose-500 text-rose-500" /> Chốt đi địa điểm này
                      </button>
                      <button className="flex items-center gap-1 text-xs font-bold text-amber-400 hover:text-amber-300">
                        Xem chi tiết <ArrowRight className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
