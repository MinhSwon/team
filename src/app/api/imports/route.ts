import { NextResponse } from 'next/server'
import { CandidateStatus, ImportBatchStatus, ImportDestination } from '@prisma/client'
import type { ImportCandidate } from '@prisma/client'
import { parseFileContent } from '@/lib/import/parser'
import { geocodeAddress } from '@/lib/geocoding'
import { prisma } from '@/lib/db'
import { errorResponse, requireGroupMember, requireUser } from '@/lib/authorization'

export const dynamic = 'force-dynamic'

const MAX_IMPORT_SIZE = 15 * 1024 * 1024
const allowedExtensions = new Set(['csv', 'xlsx', 'xls', 'txt', 'docx', 'pdf'])
const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()
const slugify = (value: string) => normalize(value).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'other'

export async function POST(request: Request) {
  try {
    const user = await requireUser()
    const formData = await request.formData()
    const file = formData.get('file')
    const destination = formData.get('destination') === 'GROUP' ? ImportDestination.GROUP : ImportDestination.PERSONAL
    const groupValue = formData.get('groupId')
    const groupId = destination === ImportDestination.GROUP && typeof groupValue === 'string' && groupValue.trim() ? groupValue.trim() : null
    if (!(file instanceof File)) return NextResponse.json({ success: false, error: 'File is required.' }, { status: 400 })
    if (file.size > MAX_IMPORT_SIZE) return NextResponse.json({ success: false, error: 'File cannot exceed 15MB.' }, { status: 413 })
    const fileType = file.name.split('.').pop()?.toLowerCase() || ''
    if (!allowedExtensions.has(fileType)) return NextResponse.json({ success: false, error: 'Only CSV, XLSX, XLS, TXT, DOCX and PDF are supported.' }, { status: 400 })
    if (destination === ImportDestination.GROUP) {
      if (!groupId) return NextResponse.json({ success: false, error: 'groupId is required for group import.' }, { status: 400 })
      await requireGroupMember(groupId, user.id)
    }

    const rawCandidates = await parseFileContent(Buffer.from(await file.arrayBuffer()), fileType)
    if (!rawCandidates.length) return NextResponse.json({ success: false, error: 'No valid place rows were found in the file.' }, { status: 422 })
    if (rawCandidates.length > 500) return NextResponse.json({ success: false, error: 'A single import can contain at most 500 places.' }, { status: 422 })

    const existingPlaces = await prisma.place.findMany({ select: { id: true, name: true } })
    const batch = await prisma.importBatch.create({ data: { userId: user.id, groupId, fileName: file.name, fileType, totalCount: rawCandidates.length, status: ImportBatchStatus.REVIEW_REQUIRED, destination } })
    const candidates = []
    for (const candidate of rawCandidates) {
      const normalizedName = normalize(candidate.extractedName)
      const match = existingPlaces.find((place) => {
        const existingName = normalize(place.name)
        return existingName === normalizedName || existingName.includes(normalizedName) || normalizedName.includes(existingName)
      })
      const status = match ? CandidateStatus.DUPLICATE : candidate.confidenceScore < 0.8 ? CandidateStatus.NEEDS_REVIEW : CandidateStatus.READY
      candidates.push(await prisma.importCandidate.create({ data: { batchId: batch.id, rawText: candidate.rawText || `${candidate.extractedName} - ${candidate.extractedAddress || ''}`, extractedName: candidate.extractedName, extractedAddress: candidate.extractedAddress, extractedArea: candidate.extractedArea, extractedCategory: candidate.extractedCategory, extractedSubcategory: candidate.extractedSubcategory, extractedPrice: candidate.extractedPrice, extractedNotes: candidate.extractedNotes, extractedTags: candidate.extractedTags, suggestedCategory: candidate.suggestedCategory, suggestedTags: candidate.suggestedTags, confidenceScore: candidate.confidenceScore, matchedPlaceId: match?.id, status, importDestination: destination } }))
    }
    await prisma.importBatch.update({ where: { id: batch.id }, data: { processedCount: candidates.length, readyCount: candidates.filter((candidate) => candidate.status === CandidateStatus.READY).length } })
    return NextResponse.json({ success: true, batchId: batch.id, fileName: file.name, totalCount: candidates.length, readyCount: candidates.filter((candidate) => candidate.status === CandidateStatus.READY).length, reviewCount: candidates.filter((candidate) => candidate.status === CandidateStatus.NEEDS_REVIEW).length, duplicateCount: candidates.filter((candidate) => candidate.status === CandidateStatus.DUPLICATE).length, candidates })
  } catch (error) {
    return errorResponse(error)
  }
}

export async function PUT(request: Request) {
  try {
    const user = await requireUser()
    const body = await request.json()
    const batchId = typeof body.batchId === 'string' ? body.batchId : ''
    const selectedIds = Array.isArray(body.candidates) ? body.candidates.map((item: { id?: unknown }) => typeof item.id === 'string' ? item.id : '').filter(Boolean) : []
    if (!batchId || !selectedIds.length) return NextResponse.json({ success: false, error: 'batchId and candidates are required.' }, { status: 400 })
    const batch = await prisma.importBatch.findFirst({ where: { id: batchId, userId: user.id } })
    if (!batch) return NextResponse.json({ success: false, error: 'Import batch not found.' }, { status: 404 })
    if (batch.groupId) await requireGroupMember(batch.groupId, user.id)

    const storedCandidates = await prisma.importCandidate.findMany({ where: { id: { in: selectedIds }, batchId }, orderBy: { createdAt: 'asc' } })
    const importable = storedCandidates.filter((candidate) => candidate.status === CandidateStatus.READY || candidate.status === CandidateStatus.NEEDS_REVIEW)
    const prepared: Array<{ candidate: ImportCandidate; latitude: number; longitude: number }> = []
    for (const candidate of importable) {
      const address = candidate.extractedAddress && !/^chưa rõ/i.test(candidate.extractedAddress) ? candidate.extractedAddress : `${candidate.extractedArea || ''}, TP. Hồ Chí Minh`
      const coordinates = await geocodeAddress(address)
      prepared.push({ candidate, latitude: coordinates?.latitude ?? 10.7769, longitude: coordinates?.longitude ?? 106.7009 })
    }

    let importedCount = 0
    await prisma.$transaction(async (tx) => {
      for (const { candidate, latitude, longitude } of prepared) {
        const categoryName = candidate.suggestedCategory || candidate.extractedCategory || 'Cafe'
        const category = await tx.placeCategory.upsert({ where: { slug: slugify(categoryName) }, create: { name: categoryName, slug: slugify(categoryName) }, update: { name: categoryName } })
        const place = await tx.place.create({ data: { name: candidate.extractedName.trim(), address: candidate.extractedAddress || 'TP. Hồ Chí Minh', area: candidate.extractedArea || 'TP. Hồ Chí Minh', latitude, longitude, categoryId: category.id, priceRange: candidate.extractedPrice || '100–300k', description: candidate.extractedNotes || null, createdById: user.id, externalSource: 'IMPORT', externalPlaceId: candidate.id } })
        const rawTags = candidate.suggestedTags
        const tags = Array.isArray(rawTags) ? (rawTags as unknown[]).filter((tag): tag is string => typeof tag === 'string' && tag.trim().length > 0) : []
        for (const tagName of tags) {
          const tag = await tx.placeTag.upsert({ where: { slug: slugify(tagName) }, create: { name: tagName, slug: slugify(tagName) }, update: {} })
          await tx.placeTagMapping.create({ data: { placeId: place.id, tagId: tag.id } })
        }
        if (batch.groupId) await tx.groupSavedPlace.create({ data: { groupId: batch.groupId, placeId: place.id, addedById: user.id, status: 'WANT_TO_GO' } })
        else await tx.userSavedPlace.create({ data: { userId: user.id, placeId: place.id, status: 'WANT_TO_GO' } })
        await tx.importCandidate.update({ where: { id: candidate.id }, data: { status: CandidateStatus.IMPORTED, matchedPlaceId: place.id } })
        importedCount++
      }
      await tx.importBatch.update({ where: { id: batchId }, data: { status: ImportBatchStatus.COMPLETED, processedCount: storedCandidates.length, readyCount: 0 } })
    })
    return NextResponse.json({ success: true, message: `Đã import thành công ${importedCount} địa điểm vào thư viện!`, importedCount })
  } catch (error) {
    return errorResponse(error)
  }
}
