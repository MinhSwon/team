'use client'

import { useState } from 'react'
import Navigation from '@/components/Navigation'
import { FileUp, Sparkles, CheckCircle2, AlertTriangle, FileText, Check, Trash2, Users, User, ArrowRight } from 'lucide-react'

interface Candidate {
  id: string
  extractedName: string
  extractedAddress: string
  extractedArea: string
  extractedPrice: string
  extractedNotes?: string
  suggestedCategory: string
  suggestedTags: string[]
  confidenceScore: number
  matchedPlaceId?: string | null
  matchedPlaceName?: string | null
  status: 'READY' | 'NEEDS_REVIEW' | 'DUPLICATE' | 'INVALID' | 'SKIPPED'
  selected?: boolean
}

export default function ImportPage() {
  const [file, setFile] = useState<File | null>(null)
  const [destination, setDestination] = useState<'PERSONAL' | 'GROUP'>('GROUP')
  const [isProcessing, setIsProcessing] = useState(false)
  const [batchData, setBatchData] = useState<{
    batchId: string
    fileName: string
    totalCount: number
    readyCount: number
    reviewCount: number
    duplicateCount: number
    candidates: Candidate[]
  } | null>(null)

  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [isImporting, setIsImporting] = useState(false)
  const [importSuccessMsg, setImportSuccessMsg] = useState<string | null>(null)

  const handleFileUpload = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!file) return

    setIsProcessing(true)
    const formData = new FormData()
    formData.append('file', file)
    formData.append('destination', destination)

    try {
      const res = await fetch('/api/imports', {
        method: 'POST',
        body: formData,
      })
      const data = await res.json()
      if (data.success) {
        setBatchData(data)
        setCandidates(data.candidates.map((c: Candidate) => ({ ...c, selected: c.status !== 'SKIPPED' })))
      }
    } catch {
      // Handled
    } finally {
      setIsProcessing(false)
    }
  }

  const handleToggleSelect = (id: string) => {
    setCandidates((prev) => prev.map((c) => (c.id === id ? { ...c, selected: !c.selected } : c)))
  }

  const handleRemoveCandidate = (id: string) => {
    setCandidates((prev) => prev.filter((c) => c.id !== id))
  }

  const handleConfirmImport = async () => {
    setIsImporting(true)
    const selectedList = candidates.filter((c) => c.selected)

    try {
      const res = await fetch('/api/imports', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ candidates: selectedList, destination }),
      })
      const data = await res.json()
      if (data.success) {
        setImportSuccessMsg(data.message)
      }
    } catch {
      // Handled
    } finally {
      setIsImporting(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans pb-24 md:pb-12">
      <Navigation />

      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Header */}
        <div className="space-y-2">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-xs font-semibold">
            <FileUp className="w-4 h-4" /> Smart File Import & Auto-Categorization
          </div>
          <h1 className="text-3xl font-extrabold text-white">Nhập danh sách địa điểm từ File</h1>
          <p className="text-sm text-slate-400">
            Upload file CSV, XLSX, TXT, DOCX hoặc PDF có sẵn. Hệ thống tự động trích xuất địa điểm, phân loại danh mục, gán hashtag và kiểm tra trùng lặp.
          </p>
        </div>

        {/* Upload Form */}
        {!batchData && (
          <form onSubmit={handleFileUpload} className="bg-slate-900/90 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-6">
            {/* Destination picker */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Đích đến của dữ liệu nhập vào?</label>
              <div className="grid grid-cols-2 gap-3 max-w-md">
                <button
                  type="button"
                  onClick={() => setDestination('GROUP')}
                  className={`flex items-center justify-center gap-2 p-3 rounded-2xl font-bold text-xs border transition-all ${
                    destination === 'GROUP'
                      ? 'bg-indigo-600 border-indigo-500 text-white shadow-lg shadow-indigo-600/30'
                      : 'bg-slate-800/60 border-slate-700 text-slate-400 hover:text-white'
                  }`}
                >
                  <Users className="w-4 h-4" /> Hội Đại Học (Nhóm)
                </button>
                <button
                  type="button"
                  onClick={() => setDestination('PERSONAL')}
                  className={`flex items-center justify-center gap-2 p-3 rounded-2xl font-bold text-xs border transition-all ${
                    destination === 'PERSONAL'
                      ? 'bg-indigo-600 border-indigo-500 text-white shadow-lg shadow-indigo-600/30'
                      : 'bg-slate-800/60 border-slate-700 text-slate-400 hover:text-white'
                  }`}
                >
                  <User className="w-4 h-4" /> Thư viện cá nhân
                </button>
              </div>
            </div>

            {/* Dropzone */}
            <div className="border-2 border-dashed border-slate-700 hover:border-amber-400/60 rounded-3xl p-8 sm:p-12 text-center transition-all bg-slate-950/40">
              <input
                type="file"
                accept=".csv,.xlsx,.xls,.txt,.docx,.pdf"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
                className="hidden"
                id="file-upload"
              />
              <label htmlFor="file-upload" className="cursor-pointer space-y-3 block">
                <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center mx-auto">
                  <FileText className="w-8 h-8" />
                </div>
                <div>
                  <span className="text-base font-bold text-white block">
                    {file ? file.name : 'Kéo thả file hoặc nhấp để chọn file từ máy tính'}
                  </span>
                  <span className="text-xs text-slate-400">Hỗ trợ các định dạng: CSV, XLSX, TXT, DOCX, PDF (Tối đa 15MB)</span>
                </div>
              </label>
            </div>

            {/* CTA */}
            <button
              type="submit"
              disabled={!file || isProcessing}
              className="w-full py-4 rounded-2xl bg-gradient-to-r from-amber-500 via-rose-500 to-indigo-600 text-white font-bold text-sm shadow-xl shadow-rose-500/20 hover:scale-[1.01] transition-all flex items-center justify-center gap-2"
            >
              <Sparkles className="w-5 h-5 text-amber-200" />
              <span>{isProcessing ? 'Đang trích xuất & tự động phân loại...' : 'BẮT ĐẦU TRÍCH XUẤT ĐỊA ĐIỂM'}</span>
            </button>
          </form>
        )}

        {/* Candidate Review Screen */}
        {batchData && !importSuccessMsg && (
          <div className="space-y-6 animate-fade-in">
            {/* Summary Bar */}
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                  <FileText className="w-5 h-5 text-amber-400" /> {batchData.fileName}
                </h2>
                <p className="text-xs text-slate-400 mt-1">
                  Đã trích xuất {candidates.length} địa điểm • Tự động phân loại danh mục & phát hiện trùng lặp
                </p>
              </div>

              <div className="flex items-center gap-2">
                <span className="px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-400 text-xs font-semibold border border-emerald-500/30">
                  {candidates.filter((c) => c.status === 'READY').length} Sẵn sàng
                </span>
                <span className="px-3 py-1 rounded-full bg-amber-500/10 text-amber-400 text-xs font-semibold border border-amber-500/30">
                  {candidates.filter((c) => c.status === 'NEEDS_REVIEW').length} Cần review
                </span>
                <span className="px-3 py-1 rounded-full bg-rose-500/10 text-rose-400 text-xs font-semibold border border-rose-500/30">
                  {candidates.filter((c) => c.status === 'DUPLICATE').length} Trùng lặp
                </span>
              </div>
            </div>

            {/* Candidate Table */}
            <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-300">
                  <thead className="bg-slate-800/80 uppercase text-[11px] font-bold text-slate-400 tracking-wider">
                    <tr>
                      <th className="p-4 w-10">#</th>
                      <th className="p-4">Tên địa điểm</th>
                      <th className="p-4">Phân loại tự động</th>
                      <th className="p-4">Địa chỉ trích xuất</th>
                      <th className="p-4">Độ tin cậy</th>
                      <th className="p-4">Trạng thái</th>
                      <th className="p-4 text-right">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {candidates.map((cand, idx) => (
                      <tr key={cand.id} className="hover:bg-slate-800/40 transition-colors">
                        <td className="p-4">
                          <input
                            type="checkbox"
                            checked={cand.selected}
                            onChange={() => handleToggleSelect(cand.id)}
                            className="rounded border-slate-700 bg-slate-800 text-amber-500 focus:ring-amber-400"
                          />
                        </td>
                        <td className="p-4 font-bold text-white">
                          {cand.extractedName}
                          {cand.extractedNotes && <span className="block text-[11px] font-normal text-slate-400">{cand.extractedNotes}</span>}
                        </td>
                        <td className="p-4">
                          <span className="px-2.5 py-1 rounded-lg bg-indigo-950 text-indigo-300 font-semibold border border-indigo-800">
                            {cand.suggestedCategory}
                          </span>
                          <div className="flex gap-1 mt-1">
                            {cand.suggestedTags.slice(0, 2).map((t, i) => (
                              <span key={i} className="text-[10px] text-slate-400">
                                #{t}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="p-4 text-slate-300 max-w-xs truncate">{cand.extractedAddress}</td>
                        <td className="p-4">
                          <span className="font-semibold text-emerald-400">{Math.round(cand.confidenceScore * 100)}%</span>
                        </td>
                        <td className="p-4">
                          {cand.status === 'DUPLICATE' ? (
                            <span className="inline-flex items-center gap-1 text-rose-400 font-semibold bg-rose-500/10 px-2.5 py-1 rounded-lg border border-rose-500/20">
                              <AlertTriangle className="w-3.5 h-3.5" /> Trùng lặp
                            </span>
                          ) : cand.status === 'NEEDS_REVIEW' ? (
                            <span className="inline-flex items-center gap-1 text-amber-400 font-semibold bg-amber-500/10 px-2.5 py-1 rounded-lg border border-amber-500/20">
                              <AlertTriangle className="w-3.5 h-3.5" /> Review
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-emerald-400 font-semibold bg-emerald-500/10 px-2.5 py-1 rounded-lg border border-emerald-500/20">
                              <Check className="w-3.5 h-3.5" /> Sẵn sàng
                            </span>
                          )}
                        </td>
                        <td className="p-4 text-right">
                          <button
                            onClick={() => handleRemoveCandidate(cand.id)}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-slate-800"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Table Footer Action */}
              <div className="p-4 bg-slate-950/80 border-t border-slate-800 flex items-center justify-between">
                <span className="text-xs text-slate-400">Đã chọn {candidates.filter((c) => c.selected).length} / {candidates.length} địa điểm</span>
                <button
                  onClick={handleConfirmImport}
                  disabled={isImporting || candidates.filter((c) => c.selected).length === 0}
                  className="flex items-center gap-2 px-6 py-3 rounded-2xl bg-gradient-to-r from-amber-500 to-rose-500 hover:opacity-90 text-white font-bold text-xs shadow-lg shadow-rose-500/20"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>{isImporting ? 'Đang Import vào thư viện...' : 'XÁC NHẬN IMPORT ĐỊA ĐIỂM ĐÃ CHỌN'}</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Success Screen */}
        {importSuccessMsg && (
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 text-center space-y-4 animate-fade-in">
            <div className="w-16 h-16 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto border border-emerald-500/40">
              <CheckCircle2 className="w-10 h-10" />
            </div>
            <h2 className="text-2xl font-bold text-white">Import Thành Công!</h2>
            <p className="text-sm text-slate-300">{importSuccessMsg}</p>
            <div className="pt-4 flex justify-center gap-3">
              <button
                onClick={() => {
                  setBatchData(null)
                  setImportSuccessMsg(null)
                  setFile(null)
                }}
                className="px-5 py-2.5 rounded-xl bg-slate-800 text-slate-200 font-semibold text-xs hover:bg-slate-700"
              >
                Import file khác
              </button>
              <a
                href="/discover"
                className="px-5 py-2.5 rounded-xl bg-indigo-600 text-white font-semibold text-xs hover:bg-indigo-500 flex items-center gap-1.5"
              >
                Xem địa điểm vừa import <ArrowRight className="w-4 h-4" />
              </a>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
