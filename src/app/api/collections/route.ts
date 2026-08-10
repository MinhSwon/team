import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { errorResponse, requireGroupMember, requireUser } from '@/lib/authorization'

export async function GET(request: Request) {
  try {
    const user = await requireUser(); const groupId = new URL(request.url).searchParams.get('groupId')
    if (groupId) await requireGroupMember(groupId, user.id)
    const collections = await prisma.collection.findMany({ where: groupId ? { groupId } : { userId: user.id }, include: { places: { include: { place: { include: { images: true, category: true } } } } }, orderBy: { updatedAt: 'desc' } })
    return NextResponse.json({ success: true, collections })
  } catch (error) { return errorResponse(error) }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser(); const body = await request.json(); const name = typeof body.name === 'string' ? body.name.trim() : ''
    const groupId = typeof body.groupId === 'string' ? body.groupId : null
    if (name.length < 2) return NextResponse.json({ success: false, error: 'Tên collection phải có ít nhất 2 ký tự.' }, { status: 400 })
    if (groupId) await requireGroupMember(groupId, user.id)
    const collection = await prisma.collection.create({ data: { name, description: typeof body.description === 'string' ? body.description.trim() : undefined, isPublic: body.isPublic === true, userId: groupId ? null : user.id, groupId } })
    return NextResponse.json({ success: true, collection }, { status: 201 })
  } catch (error) { return errorResponse(error) }
}
