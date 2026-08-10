import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { errorResponse, requireGroupMember, requireUser } from '@/lib/authorization'

type Context = { params: Promise<{ collectionId: string }> }

async function getAccessibleCollection(collectionId: string, userId: string) {
  const collection = await prisma.collection.findUnique({ where: { id: collectionId } })
  if (!collection) return null
  if (collection.userId === userId) return collection
  if (collection.groupId) {
    await requireGroupMember(collection.groupId, userId)
    return collection
  }
  return null
}

async function requireCollectionManager(collection: { groupId: string | null }, userId: string) {
  if (collection.groupId) await requireGroupMember(collection.groupId, userId, ['OWNER', 'ADMIN'])
}

export async function PATCH(request: Request, { params }: Context) {
  try {
    const user = await requireUser()
    const { collectionId } = await params
    const collection = await getAccessibleCollection(collectionId, user.id)
    if (!collection) return NextResponse.json({ success: false, error: 'Collection not found.' }, { status: 404 })
    await requireCollectionManager(collection, user.id)
    const body = await request.json()
    const data = {
      ...(typeof body.name === 'string' && body.name.trim() ? { name: body.name.trim() } : {}),
      ...(typeof body.description === 'string' ? { description: body.description.trim() } : {}),
      ...(typeof body.isPublic === 'boolean' ? { isPublic: body.isPublic } : {}),
    }
    const updated = await prisma.collection.update({ where: { id: collectionId }, data })
    return NextResponse.json({ success: true, collection: updated })
  } catch (error) {
    return errorResponse(error)
  }
}

export async function DELETE(_request: Request, { params }: Context) {
  try {
    const user = await requireUser()
    const { collectionId } = await params
    const collection = await getAccessibleCollection(collectionId, user.id)
    if (!collection) return NextResponse.json({ success: false, error: 'Collection not found.' }, { status: 404 })
    await requireCollectionManager(collection, user.id)
    await prisma.collection.delete({ where: { id: collectionId } })
    return NextResponse.json({ success: true })
  } catch (error) {
    return errorResponse(error)
  }
}

export async function POST(request: Request, { params }: Context) {
  try {
    const user = await requireUser()
    const { collectionId } = await params
    const collection = await getAccessibleCollection(collectionId, user.id)
    if (!collection) return NextResponse.json({ success: false, error: 'Collection not found.' }, { status: 404 })
    const body = await request.json()
    const placeId = typeof body.placeId === 'string' ? body.placeId : ''
    if (!placeId) return NextResponse.json({ success: false, error: 'placeId is required.' }, { status: 400 })
    if (!await prisma.place.findUnique({ where: { id: placeId }, select: { id: true } })) return NextResponse.json({ success: false, error: 'Place not found.' }, { status: 404 })
    const item = await prisma.collectionPlace.upsert({ where: { collectionId_placeId: { collectionId, placeId } }, create: { collectionId, placeId }, update: {} })
    return NextResponse.json({ success: true, item })
  } catch (error) {
    return errorResponse(error)
  }
}

export async function PUT(request: Request, { params }: Context) {
  try {
    const user = await requireUser()
    const { collectionId } = await params
    const collection = await getAccessibleCollection(collectionId, user.id)
    if (!collection) return NextResponse.json({ success: false, error: 'Collection not found.' }, { status: 404 })
    const queryPlaceId = new URL(request.url).searchParams.get('placeId')
    const body = queryPlaceId ? null : await request.json()
    const placeId = queryPlaceId || (body && typeof body.placeId === 'string' ? body.placeId : '')
    if (!placeId) return NextResponse.json({ success: false, error: 'placeId is required.' }, { status: 400 })
    await prisma.collectionPlace.deleteMany({ where: { collectionId, placeId } })
    return NextResponse.json({ success: true })
  } catch (error) {
    return errorResponse(error)
  }
}
