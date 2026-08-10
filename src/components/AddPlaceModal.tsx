'use client'
/* eslint-disable @next/next/no-img-element -- previews can be local object URLs or external URLs. */

import { useState } from 'react'
import { X, MapPin, AlertCircle, PlusCircle, Sparkles, Image as ImageIcon, Trash2, Upload } from 'lucide-react'

interface AddPlaceModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess?: () => void
  groupId?: string
  defaultDestination?: 'PERSONAL' | 'GROUP'
}

export default function AddPlaceModal({ isOpen, onClose, onSuccess, groupId, defaultDestination = 'PERSONAL' }: AddPlaceModalProps) {
  const [name, setName] = useState('')
  const [address, setAddress] = useState('')
  const [category, setCategory] = useState('Cafe')
  const [price, setPrice] = useState('100–300k')
  const [destination, setDestination] = useState<'PERSONAL' | 'GROUP'>(defaultDestination)
  const [note, setNote] = useState('')
  const [images, setImages] = useState<string[]>([])
  const [duplicateWarning, setDuplicateWarning] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  if (!isOpen) return null

  const handleNameChange = (val: string) => {
    setName(val)
    if (val.toLowerCase().includes('workshop')) {
      setDuplicateWarning('Địa điểm này đã được Minh thêm vào Hội Đại Học vào 2 ngày trước.')
    } else {
      setDuplicateWarning(null)
    }
  }

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return

    for (const file of Array.from(files)) {
      const formData = new FormData(); formData.append('file', file)
      const response = await fetch('/api/uploads', { method: 'POST', body: formData })
      const data = await response.json()
      if (data.success) setImages((prev) => [...prev, data.url])
    }
  }

  const handleRemoveImage = (index: number) => {
    setImages((prev) => prev.filter((_, i) => i !== index))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name || !address) return

    setIsSubmitting(true)
    try {
      const geocodeResponse = await fetch(`/api/geocode?address=${encodeURIComponent(`${address}, Hồ Chí Minh`)}`)
      const geocode = await geocodeResponse.json()
      const response = await fetch('/api/places', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          address,
          area: 'Quận 1',
          categoryName: category,
          priceRange: price,
          description: note,
          addedBy: 'Bạn',
          note,
          destination,
          groupId,
          latitude: geocode.latitude,
          longitude: geocode.longitude,
          images: images.length > 0 ? images : ['https://images.unsplash.com/photo-1554118811-1e0d58224f24?w=800'],
        }),
      })
      const data = await response.json()
      if (data.success && data.place?.id) {
        if (destination === 'GROUP' && groupId) {
          await fetch(`/api/groups/${groupId}/saved`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ placeId: data.place.id, status: 'WANT_TO_GO', note }) })
        } else {
          await fetch('/api/saved', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ placeId: data.place.id, status: 'WANT_TO_GO', note }) })
        }
      }

      setIsSubmitting(false)
      setName('')
      setAddress('')
      setNote('')
      setImages([])
      if (onSuccess) onSuccess()
      onClose()
    } catch {
      setIsSubmitting(false)
      onClose()
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-lg bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl space-y-5 text-white max-h-[90vh] overflow-y-auto scrollbar-none">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-amber-500/20 text-amber-400">
              <PlusCircle className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold">Thêm địa điểm mới</h2>
              <p className="text-xs text-slate-400">Đóng góp địa điểm kèm hình ảnh thực tế cho nhóm</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Duplicate warning alert */}
        {duplicateWarning && (
          <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <strong className="block font-semibold text-amber-200">Cảnh báo trùng lặp</strong>
              {duplicateWarning}
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 text-sm">
          {/* Destination */}
          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1.5">Lưu vào đâu?</label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setDestination('GROUP')}
                className={`py-2.5 px-3 rounded-xl font-semibold text-xs border transition-all ${
                  destination === 'GROUP'
                    ? 'bg-indigo-600 border-indigo-500 text-white shadow-lg shadow-indigo-600/30'
                    : 'bg-slate-800/60 border-slate-700 text-slate-400 hover:text-white'
                }`}
              >
                🎓 Hội Đại Học (Nhóm)
              </button>
              <button
                type="button"
                onClick={() => setDestination('PERSONAL')}
                className={`py-2.5 px-3 rounded-xl font-semibold text-xs border transition-all ${
                  destination === 'PERSONAL'
                    ? 'bg-indigo-600 border-indigo-500 text-white shadow-lg shadow-indigo-600/30'
                    : 'bg-slate-800/60 border-slate-700 text-slate-400 hover:text-white'
                }`}
              >
                👤 Thư viện cá nhân
              </button>
            </div>
          </div>

          {/* Place Name */}
          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1">Tên địa điểm *</label>
            <input
              type="text"
              required
              placeholder="VD: Okkio Caffe, Zion Rooftop..."
              value={name}
              onChange={(e) => handleNameChange(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:border-amber-400"
            />
          </div>

          {/* Address */}
          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1">Địa chỉ / Vị trí *</label>
            <div className="relative">
              <MapPin className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
              <input
                type="text"
                required
                placeholder="VD: 120 Lê Lợi, Phường Bến Thành, Q1"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                className="w-full pl-9 pr-3.5 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:border-amber-400"
              />
            </div>
          </div>

          {/* Category & Price */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1">Danh mục</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white focus:outline-none focus:border-amber-400"
              >
                <option value="Cafe">Cafe</option>
                <option value="Restaurant">Nhà hàng / Quán ăn</option>
                <option value="Rooftop">Rooftop / Bar</option>
                <option value="Entertainment">Boardgame / Giải trí</option>
                <option value="Activity">Hoạt động trải nghiệm</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1">Ngân sách dự kiến</label>
              <select
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white focus:outline-none focus:border-amber-400"
              >
                <option value="<100k">&lt;100k</option>
                <option value="100–300k">100–300k</option>
                <option value="300–500k">300–500k</option>
                <option value="500k+">500k+</option>
              </select>
            </div>
          </div>

          {/* Multi Image Upload */}
          <div className="space-y-2">
            <label className="block text-xs font-semibold text-slate-400 flex items-center justify-between">
              <span className="flex items-center gap-1">
                <ImageIcon className="w-3.5 h-3.5 text-amber-400" /> Hình ảnh thực tế địa điểm (Upload 1 hoặc nhiều ảnh)
              </span>
              <span className="text-[11px] text-slate-500">{images.length} ảnh đã chọn</span>
            </label>

            <div className="grid grid-cols-4 gap-2">
              {images.map((img, idx) => (
                <div key={idx} className="relative h-20 rounded-xl overflow-hidden group border border-slate-700">
                  <img src={img} alt={`Upload ${idx}`} className="w-full h-full object-cover" />
                  <button
                    type="button"
                    onClick={() => handleRemoveImage(idx)}
                    className="absolute top-1 right-1 p-1 rounded-md bg-slate-950/80 text-rose-400 hover:bg-rose-500 hover:text-white transition-all opacity-90 group-hover:opacity-100"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))}

              <label className="h-20 rounded-xl border-2 border-dashed border-slate-700 hover:border-amber-400/60 bg-slate-800/40 flex flex-col items-center justify-center cursor-pointer transition-all hover:bg-slate-800">
                <Upload className="w-5 h-5 text-slate-400" />
                <span className="text-[10px] text-slate-400 font-semibold mt-1">Thêm ảnh</span>
                <input type="file" accept="image/*" multiple onChange={handleImageUpload} className="hidden" />
              </label>
            </div>
          </div>

          {/* Note */}
          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1">Ghi chú cho bạn bè (Optional)</label>
            <textarea
              rows={2}
              placeholder="VD: Quán này view đẹp lắm, vừa đi tuần trước không gian cực chill!"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="w-full px-3.5 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:border-amber-400 text-xs"
            />
          </div>

          {/* CTA */}
          <div className="pt-2 flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl bg-slate-800 text-slate-300 font-semibold text-xs hover:bg-slate-700"
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-rose-500 hover:opacity-90 text-white font-bold text-xs shadow-lg shadow-rose-500/20"
            >
              <Sparkles className="w-4 h-4" />
              {isSubmitting ? 'Đang lưu...' : 'Lưu địa điểm'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
