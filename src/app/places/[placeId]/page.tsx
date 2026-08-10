/* eslint-disable @next/next/no-img-element -- place images may come from external providers. */
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, MapPin, Star, Phone, Globe, Bookmark, CheckCircle2 } from 'lucide-react'
import { prisma } from '@/lib/db'
import Navigation from '@/components/Navigation'
import VisitForm from '@/components/VisitForm'

export default async function PlaceDetailPage({ params }: { params: Promise<{ placeId: string }> }) {
  const { placeId } = await params
  const place = await prisma.place.findUnique({ where: { id: placeId }, include: { category: true, subcategory: true, tags: { include: { tag: true } }, images: true, openingHours: true, visits: { orderBy: { visitedAt: 'desc' }, take: 5, include: { user: { select: { name: true } } } } } })
  if (!place) notFound()
  const image = place.images[0]?.url || 'https://images.unsplash.com/photo-1554118811-1e0d58224f24?w=1200'
  return <div className="min-h-screen bg-slate-950 text-slate-100 pb-16"><Navigation /><main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
    <Link href="/discover" className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-white"><ArrowLeft className="w-4 h-4" /> Quay lại khám phá</Link>
    <div className="overflow-hidden rounded-3xl border border-slate-800 bg-slate-900 shadow-2xl">
      <div className="relative h-72 sm:h-96"><img src={image} alt={place.name} className="h-full w-full object-cover" /><div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-transparent to-transparent" /><div className="absolute bottom-6 left-6 right-6"><span className="rounded-full bg-indigo-500/80 px-3 py-1 text-xs font-bold">{place.category?.name || 'Địa điểm'}</span><h1 className="mt-3 text-3xl font-extrabold text-white sm:text-4xl">{place.name}</h1></div></div>
      <div className="grid gap-8 p-6 sm:p-8 md:grid-cols-[1fr_280px]"><section className="space-y-5"><div className="flex flex-wrap items-center gap-3"><span className="flex items-center gap-1 text-amber-400"><Star className="h-4 w-4 fill-current" /> {place.rating.toFixed(1)}</span><span className="text-slate-400">{place.priceRange || 'Chưa cập nhật giá'}</span>{place.subcategory && <span className="text-slate-400">{place.subcategory.name}</span>}</div><p className="leading-7 text-slate-300">{place.description || 'Chưa có mô tả cho địa điểm này.'}</p><div className="flex flex-wrap gap-2">{place.tags.map(({ tag }) => <span key={tag.id} className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1 text-xs text-slate-300">#{tag.name}</span>)}</div><div className="space-y-3 border-t border-slate-800 pt-5"><h2 className="font-bold text-white">Thông tin địa điểm</h2><p className="flex items-start gap-2 text-sm text-slate-300"><MapPin className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" /> {place.address}{place.area ? ` · ${place.area}` : ''}</p>{place.phone && <p className="flex items-center gap-2 text-sm text-slate-300"><Phone className="h-4 w-4 text-amber-400" /> {place.phone}</p>}{place.website && <a href={place.website} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-sm text-indigo-300 hover:text-indigo-200"><Globe className="h-4 w-4" /> Website</a>}</div></section><aside className="space-y-3"><Link href="/saved" className="flex items-center justify-center gap-2 rounded-xl bg-amber-500 px-4 py-3 text-sm font-bold text-slate-950 hover:bg-amber-400"><Bookmark className="h-4 w-4" /> Quản lý đã lưu</Link><VisitForm placeId={place.id} /><Link href="/decide" className="flex items-center justify-center gap-2 rounded-xl border border-slate-700 px-4 py-3 text-sm font-bold text-slate-200 hover:bg-slate-800"><CheckCircle2 className="h-4 w-4" /> Điểm tương tự</Link></aside></div>
    </div>
  </main></div>
}
