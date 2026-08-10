import { NextResponse } from 'next/server'
import { geocodeAddress } from '@/lib/geocoding'

export async function GET(request: Request) {
  const address = new URL(request.url).searchParams.get('address') || ''
  if (address.length < 3) return NextResponse.json({ success: false, error: 'Địa chỉ quá ngắn.' }, { status: 400 })
  const result = await geocodeAddress(address)
  if (!result) return NextResponse.json({ success: false, error: 'Không tìm thấy tọa độ.' }, { status: 404 })
  return NextResponse.json({ success: true, ...result })
}
