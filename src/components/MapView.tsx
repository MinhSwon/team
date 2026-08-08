'use client'

import { useEffect, useRef } from 'react'

interface MapViewProps {
  places: Array<{
    id: string
    name: string
    address: string
    latitude: number
    longitude: number
    categoryName: string
    priceRange: string
  }>
  center?: [number, number]
  zoom?: number
}

export default function MapView({ places, center = [10.7769, 106.7009], zoom = 13 }: MapViewProps) {
  const mapRef = useRef<HTMLDivElement>(null)
  const mapInstanceRef = useRef<any>(null)

  useEffect(() => {
    if (typeof window === 'undefined' || !mapRef.current) return

    const containerElement = mapRef.current

    // Dynamically load Leaflet JS & CSS
    const loadLeaflet = async () => {
      const L = (await import('leaflet')).default

      // Fix default marker icon issue
      delete (L.Icon.Default.prototype as any)._getIconUrl
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
        iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
        shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
      })

      if (!mapInstanceRef.current && containerElement) {
        mapInstanceRef.current = L.map(containerElement).setView(center, zoom)

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '&copy; OpenStreetMap contributors',
        }).addTo(mapInstanceRef.current)
      } else if (mapInstanceRef.current) {
        mapInstanceRef.current.setView(center, zoom)
      }

      // Clear existing markers
      if (mapInstanceRef.current) {
        mapInstanceRef.current.eachLayer((layer: any) => {
          if (layer instanceof L.Marker) {
            mapInstanceRef.current.removeLayer(layer)
          }
        })

        // Add pins for places
        places.forEach((place) => {
          const marker = L.marker([place.latitude, place.longitude]).addTo(mapInstanceRef.current)
          marker.bindPopup(`
            <div style="color: #0f172a; font-family: sans-serif; padding: 4px;">
              <strong style="font-size: 14px; font-weight: 700;">${place.name}</strong><br/>
              <span style="font-size: 12px; color: #475569;">${place.categoryName} • ${place.priceRange}</span><br/>
              <span style="font-size: 11px; color: #64748b;">${place.address}</span>
            </div>
          `)
        })
      }
    }

    loadLeaflet()

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove()
        mapInstanceRef.current = null
      }
    }
  }, [places, center, zoom])

  return (
    <div className="relative w-full h-full min-h-[350px] rounded-2xl overflow-hidden shadow-xl border border-slate-800">
      <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
      <div ref={mapRef} className="w-full h-full z-0 min-h-[350px]" />
    </div>
  )
}
