'use client'
/* eslint-disable @next/next/no-img-element -- group avatars may come from user/imported URLs. */

import { useState, useEffect, useCallback } from 'react'
import Navigation from '@/components/Navigation'
import PlaceCard, { PlaceCardProps } from '@/components/PlaceCard'
import AddPlaceModal from '@/components/AddPlaceModal'
import { Users, Plus, UserPlus, FolderHeart, Sparkles } from 'lucide-react'

interface Group {
  id: string
  name: string
  description: string
  avatar: string
  code: string
  memberCount: number
  placeCount: number
  members: Array<{ id: string; name: string; avatar: string; role: string }>
}

interface GroupPlaceItem {
  status: string
  groupNote?: string | null
  addedBy?: { name?: string | null } | null
  place: {
    id: string; name: string; address: string; area?: string | null; latitude: number; longitude: number
    category?: { name?: string | null } | null; priceRange?: string | null; rating: number; description?: string | null
    images?: Array<{ url: string }>
  }
}

export default function GroupsPage() {
  const [groups, setGroups] = useState<Group[]>([])
  const [selectedGroup, setSelectedGroup] = useState<Group | null>(null)
  const [groupPlaces, setGroupPlaces] = useState<PlaceCardProps[]>([])
  const [isAddPlaceOpen, setIsAddPlaceOpen] = useState(false)
  const [activeTab, setActiveTab] = useState<'PLACES' | 'MEMBERS' | 'ACTIVITY'>('PLACES')
  const [joinCode, setJoinCode] = useState('')

  const fetchGroups = useCallback(async () => {
    try {
      const res = await fetch('/api/groups')
      const data = await res.json()
      if (data.success) {
        setGroups(data.groups)
        if (!selectedGroup && data.groups.length > 0) {
          setSelectedGroup(data.groups[0])
        }
      }
    } catch {
      // Handled
    }
  }, [selectedGroup])

  const fetchGroupPlaces = useCallback(async () => {
    if (!selectedGroup) return
    try {
      const res = await fetch(`/api/groups/${selectedGroup.id}`)
      const data = await res.json()
      if (data.success) {
        setGroupPlaces((data.group.savedPlaces as GroupPlaceItem[]).map((item) => ({
          id: item.place.id, name: item.place.name, address: item.place.address, area: item.place.area || '', latitude: item.place.latitude, longitude: item.place.longitude,
          categoryName: item.place.category?.name || 'Cafe', subcategoryName: undefined, priceRange: item.place.priceRange || '100–300k', rating: item.place.rating,
          description: item.place.description || '', images: item.place.images?.map((image) => image.url) || [], tags: [], isOpenNow: true,
          groupWantToGoCount: 1, savedByCount: 1, isVisitedByGroup: item.status === 'VISITED', addedBy: item.addedBy?.name || undefined, addedNote: item.groupNote || undefined,
        })))
      }
    } catch {
      // Handled
    }
  }, [selectedGroup])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- network response updates the view state.
    void fetchGroups()
  }, [fetchGroups])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- network response updates the view state.
    void fetchGroupPlaces()
  }, [fetchGroupPlaces])

  const handleCreateGroup = async () => {
    const name = window.prompt('Tên nhóm mới')
    if (!name) return
    const response = await fetch('/api/groups', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) })
    if (response.ok) await fetchGroups()
  }

  const handleJoinGroup = async () => {
    const code = joinCode.trim()
    if (!code) return
    const response = await fetch('/api/groups/join', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code }) })
    if (response.ok) {
      setJoinCode('')
      await fetchGroups()
    }
  }

  const handleLeaveGroup = async () => {
    if (!selectedGroup || !window.confirm('Bạn chắc chắn muốn rời nhóm này?')) return
    const response = await fetch(`/api/groups/${selectedGroup.id}/members/leave`, { method: 'POST' })
    if (response.ok) { setSelectedGroup(null); await fetchGroups() }
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans pb-24 md:pb-12">
      <Navigation onOpenAddPlace={() => setIsAddPlaceOpen(true)} />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-extrabold text-white flex items-center gap-2">
              <Users className="w-8 h-8 text-amber-400" /> Quản Lý Hội Nhóm
            </h1>
            <p className="text-sm text-slate-400 mt-1">Xây dựng kho địa điểm chung, cùng lưu, vote và quyết định điểm hẹn hôm nay.</p>
          </div>

          <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
            <div className="flex items-center gap-2 rounded-2xl border border-slate-700 bg-slate-900 px-2 py-1.5">
              <input value={joinCode} onChange={(event) => setJoinCode(event.target.value.toUpperCase())} placeholder="Mã mời" className="w-24 bg-transparent px-2 text-xs text-white outline-none" maxLength={12} />
              <button onClick={handleJoinGroup} className="flex items-center gap-1 rounded-xl bg-slate-700 px-3 py-2 text-xs font-bold text-white hover:bg-slate-600"><UserPlus className="h-4 w-4" /> Tham gia</button>
            </div>
          <button onClick={handleCreateGroup} className="flex items-center gap-2 px-5 py-3 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-lg shadow-indigo-600/30 transition-all hover:scale-105 self-start sm:self-auto">
            <Plus className="w-4 h-4" /> Tạo nhóm mới
          </button>
          </div>
        </div>

        {/* Group Selector Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {groups.map((group) => {
            const isSelected = selectedGroup?.id === group.id
            return (
              <div
                key={group.id}
                onClick={() => setSelectedGroup(group)}
                className={`cursor-pointer p-5 rounded-3xl border transition-all flex items-start gap-4 ${
                  isSelected
                    ? 'bg-slate-900 border-amber-400 shadow-xl shadow-amber-500/10'
                    : 'bg-slate-900/60 border-slate-800 hover:border-slate-700'
                }`}
              >
                <img src={group.avatar} alt={group.name} className="w-14 h-14 rounded-2xl object-cover shrink-0" />
                <div className="flex-1 min-w-0">
                  <h3 className="text-base font-bold text-white truncate">{group.name}</h3>
                  <p className="text-xs text-slate-400 line-clamp-1 mt-0.5">{group.description}</p>
                  <div className="flex items-center gap-3 mt-3 text-xs text-slate-400">
                    <span>👥 {group.memberCount} thành viên</span>
                    <span>📍 {group.placeCount} địa điểm</span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        {/* Selected Group Workspace */}
        {selectedGroup && (
          <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-6 sm:p-8 space-y-6 shadow-2xl">
            {/* Group Header Info */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-slate-800">
              <div className="flex items-center gap-4">
                <img src={selectedGroup.avatar} alt={selectedGroup.name} className="w-16 h-16 rounded-2xl object-cover border border-amber-400/40" />
                <div>
                  <h2 className="text-2xl font-bold text-white">{selectedGroup.name}</h2>
                  <p className="text-xs text-slate-400">{selectedGroup.description}</p>
                  <span className="inline-block text-[11px] font-mono text-amber-400 bg-amber-500/10 px-2.5 py-0.5 rounded-md border border-amber-500/20 mt-1">
                    Mã mời: {selectedGroup.code}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setIsAddPlaceOpen(true)}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shadow-lg shadow-amber-500/20"
                >
                  <Plus className="w-4 h-4" /> Thêm địa điểm vào nhóm
                </button>
                <a
                  href="/decide"
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-rose-500 text-white font-bold text-xs shadow-lg shadow-rose-500/20"
                >
                  <Sparkles className="w-4 h-4" /> Đi đâu hôm nay?
                </a>
              </div>
            </div>

            {/* Navigation Tabs */}
            <div className="flex items-center gap-3 border-b border-slate-800 pb-2">
              {[
                { key: 'PLACES', label: `Kho địa điểm nhóm (${groupPlaces.length})` },
                { key: 'MEMBERS', label: `Thành viên (${selectedGroup.members.length})` },
                { key: 'ACTIVITY', label: 'Hoạt động gần đây' },
              ].map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key as 'PLACES' | 'MEMBERS' | 'ACTIVITY')}
                  className={`pb-2 px-2 text-xs font-bold transition-all border-b-2 ${
                    activeTab === tab.key ? 'border-amber-400 text-amber-400' : 'border-transparent text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Tab Contents */}
            {activeTab === 'PLACES' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {groupPlaces.map((place) => (
                  <PlaceCard key={place.id} place={place} />
                ))}
              </div>
            )}

            {activeTab === 'MEMBERS' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {selectedGroup.members.map((m) => (
                  <div key={m.id} className="p-4 rounded-2xl bg-slate-800/60 border border-slate-700/60 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <img src={m.avatar} alt={m.name} className="w-10 h-10 rounded-full border border-slate-600" />
                      <div>
                        <span className="font-bold text-white text-sm block">{m.name}</span>
                        <span className="text-[11px] text-amber-400 font-semibold">{m.role}</span>
                      </div>
                    </div>
                    {m.role !== 'OWNER' && <button onClick={async () => { const role = m.role === 'ADMIN' ? 'MEMBER' : 'ADMIN'; await fetch(`/api/groups/${selectedGroup.id}/members`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId: m.id, role }) }); await fetchGroups() }} className="text-[10px] font-bold text-indigo-300 hover:text-indigo-200">{m.role === 'ADMIN' ? 'Hạ quyền' : 'Cấp admin'}</button>}
                  </div>
                ))}
                <button onClick={handleLeaveGroup} className="rounded-2xl border border-rose-500/30 p-4 text-xs font-bold text-rose-300 hover:bg-rose-500/10">Rời nhóm</button>
                <button className="p-4 rounded-2xl border border-dashed border-slate-700 text-slate-400 hover:text-white hover:border-amber-400 flex items-center justify-center gap-2 text-xs font-bold">
                  <UserPlus className="w-4 h-4 text-amber-400" /> Mời thành viên mới
                </button>
              </div>
            )}

            {activeTab === 'ACTIVITY' && (
              <div className="space-y-3">
                {[
                  { text: 'Minh đã thêm địa điểm The Workshop Coffee vào nhóm', time: '2 giờ trước' },
                  { text: 'Lan đánh dấu Muốn Đi tới Zion Sky Lounge & Dining', time: '4 giờ trước' },
                  { text: 'Linh đã import 23 địa điểm từ file Excel danh sách cafe.xlsx', time: '1 ngày trước' },
                ].map((act, i) => (
                  <div key={i} className="p-3.5 rounded-2xl bg-slate-800/40 border border-slate-800 text-xs text-slate-300 flex items-center justify-between">
                    <span className="flex items-center gap-2">
                      <FolderHeart className="w-4 h-4 text-amber-400 shrink-0" />
                      {act.text}
                    </span>
                    <span className="text-[11px] text-slate-500">{act.time}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>

      <AddPlaceModal isOpen={isAddPlaceOpen} onClose={() => setIsAddPlaceOpen(false)} onSuccess={fetchGroupPlaces} groupId={selectedGroup?.id} defaultDestination="GROUP" />
    </div>
  )
}
