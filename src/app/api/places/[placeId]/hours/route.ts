import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { errorResponse, requireUser } from '@/lib/authorization'

type Context = { params: Promise<{ placeId: string }> }
type HourInput = { dayOfWeek: number; openTime?: string; closeTime?: string; isClosed?: boolean }

export async function GET(_request: Request, { params }: Context) {
  try {
    const { placeId } = await params
    const openingHours = await prisma.openingHours.findMany({ where: { placeId }, orderBy: { dayOfWeek: 'asc' } })
    return NextResponse.json({ success: true, openingHours })
  } catch (error) {
    return errorResponse(error)
  }
}

export async function PUT(request: Request, { params }: Context) {
  try {
    await requireUser()
    const { placeId } = await params
    const body = await request.json() as { hours?: unknown }
    const hours = Array.isArray(body.hours) ? body.hours as HourInput[] : []
    const valid = hours.every((hour) => Number.isInteger(hour.dayOfWeek) && hour.dayOfWeek >= 0 && hour.dayOfWeek <= 6 && (hour.isClosed === true || (typeof hour.openTime === 'string' && typeof hour.closeTime === 'string')))
    if (!valid) return NextResponse.json({ success: false, error: 'Dữ liệu giờ mở cửa không hợp lệ.' }, { status: 400 })

    const openingHours = await prisma.$transaction(async (tx) => {
      await tx.openingHours.deleteMany({ where: { placeId } })
      if (hours.length) {
        await tx.openingHours.createMany({ data: hours.map((hour) => ({ placeId, dayOfWeek: hour.dayOfWeek, openTime: hour.openTime || '', closeTime: hour.closeTime || '', isClosed: hour.isClosed === true })) })
      }
      return tx.openingHours.findMany({ where: { placeId }, orderBy: { dayOfWeek: 'asc' } })
    })
    return NextResponse.json({ success: true, openingHours })
  } catch (error) {
    return errorResponse(error)
  }
}
