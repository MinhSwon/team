import * as XLSX from 'xlsx'
import { parse as parseCsv } from 'csv-parse/sync'
import mammoth from 'mammoth'
import { autoCategorizePlace } from './categorizer'

export interface ExtractedCandidate {
  rawText?: string
  extractedName: string
  extractedAddress?: string
  extractedArea?: string
  extractedCategory?: string
  extractedSubcategory?: string
  extractedPrice?: string
  extractedNotes?: string
  extractedTags: string[]
  suggestedCategory: string
  suggestedTags: string[]
  confidenceScore: number
}

/**
 * Normalizes raw string data extracted from CSV/XLSX/PDF/DOCX/TXT files into candidate structures.
 */
export async function parseFileContent(buffer: Buffer, fileType: string): Promise<ExtractedCandidate[]> {
  const typeLower = fileType.toLowerCase()

  if (typeLower.endsWith('csv') || typeLower === 'csv') {
    return parseCsvBuffer(buffer)
  }
  if (typeLower.endsWith('xlsx') || typeLower.endsWith('xls') || typeLower === 'xlsx') {
    return parseXlsxBuffer(buffer)
  }
  if (typeLower.endsWith('txt') || typeLower === 'txt') {
    return parseTxtBuffer(buffer)
  }
  if (typeLower.endsWith('docx') || typeLower === 'docx') {
    return parseDocxBuffer(buffer)
  }
  if (typeLower.endsWith('pdf') || typeLower === 'pdf') {
    return parsePdfBuffer(buffer)
  }

  // Fallback to text parsing
  return parseTxtBuffer(buffer)
}

function parseCsvBuffer(buffer: Buffer): ExtractedCandidate[] {
  const csvString = buffer.toString('utf-8')
  const records = parseCsv(csvString, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  }) as Record<string, string>[]

  return records.map((row) => extractCandidateFromRecord(row))
}

function parseXlsxBuffer(buffer: Buffer): ExtractedCandidate[] {
  const workbook = XLSX.read(buffer, { type: 'buffer' })
  const firstSheetName = workbook.SheetNames[0]
  const worksheet = workbook.Sheets[firstSheetName]
  const records = XLSX.utils.sheet_to_json<Record<string, string>>(worksheet)

  return records.map((row) => extractCandidateFromRecord(row))
}

async function parseDocxBuffer(buffer: Buffer): Promise<ExtractedCandidate[]> {
  const result = await mammoth.extractRawText({ buffer })
  return parseRawTextLines(result.value)
}

async function parsePdfBuffer(buffer: Buffer): Promise<ExtractedCandidate[]> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const pdfParse = require('pdf-parse')
  const pdfData = await pdfParse(buffer)
  return parseRawTextLines(pdfData.text)
}

function parseTxtBuffer(buffer: Buffer): ExtractedCandidate[] {
  const text = buffer.toString('utf-8')
  return parseRawTextLines(text)
}

function extractCandidateFromRecord(row: Record<string, string>): ExtractedCandidate {
  // Flexible column key matching
  const findValue = (keys: string[]) => {
    for (const key of Object.keys(row)) {
      const lower = key.toLowerCase()
      if (keys.some((k) => lower.includes(k))) {
        return row[key]?.toString().trim()
      }
    }
    return undefined
  }

  const name = findValue(['tên', 'name', 'địa điểm', 'place', 'tiêu đề']) || Object.values(row)[0] || 'Địa điểm chưa tên'
  const address = findValue(['địa chỉ', 'address', 'vị trí', 'location'])
  const area = findValue(['quận', 'khu vực', 'area', 'district', 'thành phố'])
  const price = findValue(['giá', 'price', 'chi phí', 'budget'])
  const category = findValue(['loại', 'danh mục', 'category', 'type'])
  const notes = findValue(['ghi chú', 'mô tả', 'note', 'description', 'review', 'comment'])

  const autoCat = autoCategorizePlace(name, address, notes, category)

  return {
    extractedName: name,
    extractedAddress: address || 'Chưa rõ địa chỉ',
    extractedArea: area || (address ? extractAreaFromAddress(address) : 'TP. Hồ Chí Minh'),
    extractedPrice: price || '100–300k',
    extractedCategory: category,
    extractedNotes: notes,
    extractedTags: autoCat.tags,
    suggestedCategory: autoCat.category,
    suggestedTags: autoCat.tags,
    confidenceScore: autoCat.confidence,
  }
}

function parseRawTextLines(text: string): ExtractedCandidate[] {
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 2)

  const candidates: ExtractedCandidate[] = []

  for (const line of lines) {
    // Basic line extraction heuristic
    const parts = line.split(/[-–|:]/).map((p) => p.trim())
    const name = parts[0]
    const addressOrNote = parts.slice(1).join(' - ')

    if (name && name.length >= 3) {
      const autoCat = autoCategorizePlace(name, addressOrNote, addressOrNote)
      candidates.push({
        rawText: line,
        extractedName: name,
        extractedAddress: addressOrNote.includes('Quận') || addressOrNote.includes('Đường') ? addressOrNote : 'TP. Hồ Chí Minh',
        extractedArea: extractAreaFromAddress(addressOrNote),
        extractedPrice: '100–300k',
        extractedNotes: addressOrNote,
        extractedTags: autoCat.tags,
        suggestedCategory: autoCat.category,
        suggestedTags: autoCat.tags,
        confidenceScore: autoCat.confidence,
      })
    }
  }

  return candidates
}

function extractAreaFromAddress(address: string): string {
  if (!address) return 'TP. Hồ Chí Minh'
  const match = address.match(/(Quận\s*\d+|Quận\s*[\w\s]+|Bình Thạnh|Thủ Đức|Gò Vấp|Tân Bình|Phú Nhuận|Tân Phú)/i)
  return match ? match[0] : 'TP. Hồ Chí Minh'
}
