'use client'

import { useEffect, useRef, useState } from 'react'
import type { Map as LeafletMap, Marker, DivIcon } from 'leaflet'

interface MapViewProps {
  places: Array<{ id: string; name: string; address: string; latitude: number; longitude: number; categoryName: string; priceRange: string }>
  center?: [number, number]
  zoom?: number
}

type LeafletApi = {
  map: (element: HTMLElement, options?: object) => LeafletMap
  tileLayer: (url: string, options?: object) => { addTo: (map: LeafletMap) => unknown }
  marker: (position: [number, number], options?: object) => Marker
  divIcon: (options: object) => DivIcon
}

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character] || character))
}

function categoryStyle(categoryName: string) {
  const category = categoryName.toLowerCase()
  if (category.includes('cafe') || category.includes('coffee')) return { emoji: '☕', color: '#f59e0b', label: 'Cafe Chill' }
  if (category.includes('rooftop') || category.includes('bar')) return { emoji: '🍸', color: '#a855f7', label: 'Rooftop & Bar' }
  if (category.includes('restaurant') || category.includes('nhà hàng') || category.includes('nha hang')) return { emoji: '🥩', color: '#f43f5e', label: 'Nhà Hàng BBQ' }
  if (category.includes('entertainment') || category.includes('boardgame')) return { emoji: '🎲', color: '#6366f1', label: 'Boardgame & Chơi' }
  if (category.includes('activity') || category.includes('hoạt động') || category.includes('hoat dong')) return { emoji: '🏃', color: '#06b6d4', label: 'Hoạt Động' }
  return { emoji: '✨', color: '#f97316', label: 'Địa điểm' }
}

function markerHtml(categoryName: string) {
  const style = categoryStyle(categoryName)
  return `<div class="pd-map-marker" style="--marker-color:${style.color}" title="${escapeHtml(style.label)}"><span>${style.emoji}</span></div>`
}

export default function MapView({ places, center = [10.7769, 106.7009], zoom = 13 }: MapViewProps) {
  const mapRef = useRef<HTMLDivElement>(null)
  const mapInstanceRef = useRef<LeafletMap | null>(null)
  const leafletRef = useRef<LeafletApi | null>(null)
  const markersRef = useRef<Marker[]>([])
  const initialCenterRef = useRef(center)
  const initialZoomRef = useRef(zoom)
  const [mapReady, setMapReady] = useState(false)
  const [centerLat, centerLng] = center

  useEffect(() => {
    let disposed = false
    async function initializeMap() {
      const L = (await import('leaflet')).default as LeafletApi
      if (disposed || !mapRef.current) return
      leafletRef.current = L
      mapInstanceRef.current = L.map(mapRef.current, { zoomControl: true }).setView(initialCenterRef.current, initialZoomRef.current)
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; OpenStreetMap contributors' }).addTo(mapInstanceRef.current)
      setMapReady(true)
    }
    void initializeMap()
    return () => {
      disposed = true
      setMapReady(false)
      markersRef.current = []
      mapInstanceRef.current?.remove()
      mapInstanceRef.current = null
      leafletRef.current = null
    }
  }, [])

  useEffect(() => {
    const L = leafletRef.current
    const map = mapInstanceRef.current
    if (!mapReady || !L || !map) return
    map.setView([centerLat, centerLng], zoom)
    markersRef.current.forEach((marker) => marker.remove())
    markersRef.current = []
    places.forEach((place) => {
      if (!Number.isFinite(place.latitude) || !Number.isFinite(place.longitude)) return
      const style = categoryStyle(place.categoryName)
      const marker = L.marker([place.latitude, place.longitude], {
        icon: L.divIcon({ className: 'pd-map-marker-wrapper', html: markerHtml(place.categoryName), iconSize: [44, 50], iconAnchor: [22, 48], popupAnchor: [0, -44] }),
        title: place.name,
      }).addTo(map)
      marker.bindPopup(`<div class="pd-map-popup"><strong>${escapeHtml(place.name)}</strong><span>${escapeHtml(style.label)} · ${escapeHtml(place.priceRange || '')}</span><small>${escapeHtml(place.address)}</small></div>`)
      markersRef.current.push(marker)
    })
  }, [places, centerLat, centerLng, zoom, mapReady])

  return (
    <div className="relative h-full min-h-[350px] w-full overflow-hidden rounded-2xl border border-slate-800 shadow-xl">
      <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
      <style>{`.pd-map-marker-wrapper{background:transparent;border:0}.pd-map-marker{width:38px;height:38px;display:grid;place-items:center;position:relative;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:var(--marker-color);border:3px solid rgba(255,255,255,.95);box-shadow:0 5px 12px rgba(15,23,42,.4)}.pd-map-marker::after{content:'';position:absolute;inset:5px;border-radius:50%;border:1px solid rgba(255,255,255,.35)}.pd-map-marker span{transform:rotate(45deg);position:relative;z-index:1;font-size:18px;line-height:1;filter:drop-shadow(0 1px 1px rgba(15,23,42,.35))}.pd-map-popup{min-width:180px;color:#0f172a;font-family:ui-sans-serif,system-ui,sans-serif;display:grid;gap:4px}.pd-map-popup strong{font-size:14px;font-weight:800}.pd-map-popup span{font-size:12px;color:#475569}.pd-map-popup small{font-size:11px;color:#64748b;line-height:1.35}`}</style>
      <div ref={mapRef} className="z-0 h-full min-h-[350px] w-full" />
    </div>
  )
}
