import { NextResponse } from 'next/server'
import { parseFileContent } from '@/lib/import/parser'
import { INITIAL_MOCK_PLACES } from '@/lib/mockData'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const destination = (formData.get('destination') as string) || 'PERSONAL'
    const groupId = formData.get('groupId') as string | null

    if (!file) {
      return NextResponse.json({ success: false, error: 'No file uploaded' }, { status: 400 })
    }

    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)
    const fileName = file.name
    const fileType = fileName.split('.').pop() || 'txt'

    // Parse file and auto-categorize candidates
    const rawCandidates = await parseFileContent(buffer, fileType)

    // Run duplicate check against current places
    const processedCandidates = rawCandidates.map((cand, idx) => {
      const match = INITIAL_MOCK_PLACES.find(
        (p) => p.name.toLowerCase() === cand.extractedName.toLowerCase() || p.name.toLowerCase().includes(cand.extractedName.toLowerCase())
      )

      let status = 'READY'
      if (match) {
        status = 'DUPLICATE'
      } else if (cand.confidenceScore < 0.8) {
        status = 'NEEDS_REVIEW'
      }

      return {
        id: `cand_${idx}_${Date.now()}`,
        batchId: `batch_${Date.now()}`,
        rawText: cand.rawText || `${cand.extractedName} - ${cand.extractedAddress}`,
        extractedName: cand.extractedName,
        extractedAddress: cand.extractedAddress || 'TP. Hồ Chí Minh',
        extractedArea: cand.extractedArea || 'TP. Hồ Chí Minh',
        extractedCategory: cand.suggestedCategory,
        extractedPrice: cand.extractedPrice || '100–300k',
        extractedNotes: cand.extractedNotes || '',
        extractedTags: cand.extractedTags,
        suggestedCategory: cand.suggestedCategory,
        suggestedTags: cand.suggestedTags,
        confidenceScore: cand.confidenceScore,
        matchedPlaceId: match ? match.id : null,
        matchedPlaceName: match ? match.name : null,
        status: status,
        importDestination: destination,
        groupId: groupId,
      }
    })

    return NextResponse.json({
      success: true,
      batchId: `batch_${Date.now()}`,
      fileName,
      totalCount: processedCandidates.length,
      readyCount: processedCandidates.filter((c) => c.status === 'READY').length,
      reviewCount: processedCandidates.filter((c) => c.status === 'NEEDS_REVIEW').length,
      duplicateCount: processedCandidates.filter((c) => c.status === 'DUPLICATE').length,
      candidates: processedCandidates,
    })
  } catch (error: unknown) {
    return NextResponse.json({ success: false, error: (error as Error).message }, { status: 500 })
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json()
    const { candidates, destination, groupId } = body

    if (!candidates || !Array.isArray(candidates)) {
      return NextResponse.json({ success: false, error: 'Invalid candidate payload' }, { status: 400 })
    }

    let importedCount = 0
    candidates.forEach((cand) => {
      if (cand.status === 'SKIPPED' || cand.status === 'INVALID') return

      const newPlace = {
        id: 'p_imp_' + Math.random().toString(36).substr(2, 9),
        name: cand.extractedName,
        address: cand.extractedAddress || 'TP. Hồ Chí Minh',
        area: cand.extractedArea || 'TP. Hồ Chí Minh',
        latitude: 10.7769 + (Math.random() - 0.5) * 0.04,
        longitude: 106.7009 + (Math.random() - 0.5) * 0.04,
        categoryName: cand.suggestedCategory || 'Cafe',
        subcategoryName: undefined,
        priceRange: cand.extractedPrice || '100–300k',
        rating: 4.5,
        description: cand.extractedNotes || 'Địa điểm được nhập từ file ' + destination,
        phone: '',
        website: '',
        images: ['https://images.unsplash.com/photo-1554118811-1e0d58224f24?w=800'],
        tags: cand.suggestedTags || ['Imported'],
        isOpenNow: true,
        groupWantToGoCount: 1,
        savedByCount: 1,
        isVisitedByGroup: false,
        addedBy: destination === 'GROUP' ? 'Nhóm' : 'Bạn',
        addedNote: cand.extractedNotes || 'Nhập từ file',
      }
      INITIAL_MOCK_PLACES.unshift(newPlace)
      importedCount++
    })

    return NextResponse.json({
      success: true,
      message: `Đã import thành công ${importedCount} địa điểm vào thư viện!`,
      importedCount,
    })
  } catch (error: unknown) {
    return NextResponse.json({ success: false, error: (error as Error).message }, { status: 500 })
  }
}
