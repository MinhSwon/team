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

const removeDiacritics = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()
const cleanText = (value: unknown) => typeof value === 'string' ? value.trim() : value == null ? '' : String(value).trim()

export async function parseFileContent(buffer: Buffer, fileType: string): Promise<ExtractedCandidate[]> {
  const type = fileType.toLowerCase().replace(/^\./, '')
  if (type === 'csv') return parseCsvBuffer(buffer)
  if (type === 'xlsx' || type === 'xls') return parseXlsxBuffer(buffer)
  if (type === 'docx') return parseDocxBuffer(buffer)
  if (type === 'pdf') return parsePdfBuffer(buffer)
  return parseTxtBuffer(buffer)
}

function parseCsvBuffer(buffer: Buffer) {
  const records = parseCsv(buffer.toString('utf8'), { columns: true, skip_empty_lines: true, trim: true, bom: true }) as Record<string, unknown>[]
  return records.map((row) => extractCandidateFromRecord(row)).filter((candidate) => candidate.extractedName.length >= 2)
}

function parseXlsxBuffer(buffer: Buffer) {
  const workbook = XLSX.read(buffer, { type: 'buffer' })
  const sheet = workbook.Sheets[workbook.SheetNames[0]]
  if (!sheet) return []
  const records = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' })
  return records.map((row) => extractCandidateFromRecord(row)).filter((candidate) => candidate.extractedName.length >= 2)
}

async function parseDocxBuffer(buffer: Buffer) {
  const result = await mammoth.extractRawText({ buffer })
  return parseRawTextLines(result.value)
}

async function parsePdfBuffer(buffer: Buffer) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const pdfParse = require('pdf-parse')
  const pdfData = await pdfParse(buffer)
  return parseRawTextLines(pdfData.text)
}

function parseTxtBuffer(buffer: Buffer) {
  return parseRawTextLines(buffer.toString('utf8'))
}

function extractCandidateFromRecord(row: Record<string, unknown>): ExtractedCandidate {
  const normalizedEntries = Object.entries(row).map(([key, value]) => [removeDiacritics(key), cleanText(value)] as const)
  const findValue = (aliases: string[]) => {
    const normalizedAliases = aliases.map(removeDiacritics)
    return normalizedEntries.find(([key, value]) => value && normalizedAliases.some((alias) => key === alias || key.includes(alias)))?.[1] || ''
  }

  const values = normalizedEntries.map(([, value]) => value).filter(Boolean)
  const name = findValue(['ten', 'name', 'dia diem', 'place', 'title']) || values[0] || 'Địa điểm chưa tên'
  const address = findValue(['dia chi', 'address', 'vi tri', 'location'])
  const area = findValue(['quan', 'khu vuc', 'area', 'district', 'thanh pho'])
  const price = findValue(['gia', 'price', 'chi phi', 'budget'])
  const category = findValue(['loai', 'danh muc', 'category', 'type'])
  const notes = findValue(['ghi chu', 'mo ta', 'note', 'description', 'review', 'comment'])
  const autoCat = autoCategorizePlace(name, address, notes, category)

  return {
    extractedName: name,
    extractedAddress: address || 'Chưa rõ địa chỉ',
    extractedArea: area || extractAreaFromAddress(address),
    extractedPrice: price || '100–300k',
    extractedCategory: category || undefined,
    extractedNotes: notes || undefined,
    extractedTags: autoCat.tags,
    suggestedCategory: autoCat.category,
    suggestedTags: autoCat.tags,
    confidenceScore: autoCat.confidence,
  }
}

function parseRawTextLines(text: string): ExtractedCandidate[] {
  return text.split(/\r?\n/).map((line) => line.trim()).filter((line) => line.length > 2).map((line) => {
    const parts = line.split(/\s*(?:\||;|—|–|:)\s*/).map((part) => part.trim()).filter(Boolean)
    const name = parts[0]
    const addressOrNote = parts.slice(1).join(' - ')
    const autoCat = autoCategorizePlace(name, addressOrNote, addressOrNote)
    return {
      rawText: line,
      extractedName: name,
      extractedAddress: looksLikeAddress(addressOrNote) ? addressOrNote : 'TP. Hồ Chí Minh',
      extractedArea: extractAreaFromAddress(addressOrNote),
      extractedPrice: '100–300k',
      extractedNotes: addressOrNote || undefined,
      extractedTags: autoCat.tags,
      suggestedCategory: autoCat.category,
      suggestedTags: autoCat.tags,
      confidenceScore: autoCat.confidence,
    }
  }).filter((candidate) => candidate.extractedName.length >= 3)
}

function looksLikeAddress(value: string) {
  const normalized = removeDiacritics(value)
  return /\d/.test(value) || /(quan|q\.?|phuong|p\.?|duong|tp\.?|thanh pho|hcm|ho chi minh|thu duc|binh thanh)/i.test(normalized)
}

function extractAreaFromAddress(address: string) {
  if (!address) return 'TP. Hồ Chí Minh'
  const normalized = removeDiacritics(address)
  const match = normalized.match(/(quan\s*\d+|quan\s*[a-z\s]+|binh thanh|thu duc|go vap|tan binh|phu nhuan|tan phu)/i)
  if (!match) return 'TP. Hồ Chí Minh'
  const originalMatch = address.match(/(Quận\s*\d+|Quận\s*[\p{L}\s]+|Bình Thạnh|Thủ Đức|Gò Vấp|Tân Bình|Phú Nhuận|Tân Phú)/iu)
  return originalMatch?.[0] || match[0]
}
