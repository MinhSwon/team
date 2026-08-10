import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { NextResponse } from 'next/server'
import { requireUser, errorResponse } from '@/lib/authorization'

const allowedTypes = new Map([['image/jpeg', 'jpg'], ['image/png', 'png'], ['image/webp', 'webp'], ['image/gif', 'gif']])

export async function POST(request: Request) {
  try {
    await requireUser()
    const formData = await request.formData(); const file = formData.get('file')
    if (!(file instanceof File)) return NextResponse.json({ success: false, error: 'File là bắt buộc.' }, { status: 400 })
    const extension = allowedTypes.get(file.type)
    if (!extension) return NextResponse.json({ success: false, error: 'Chỉ hỗ trợ JPG, PNG, WEBP hoặc GIF.' }, { status: 400 })
    if (file.size > 5 * 1024 * 1024) return NextResponse.json({ success: false, error: 'Ảnh không được vượt quá 5MB.' }, { status: 400 })
    const cloudName = process.env.CLOUDINARY_CLOUD_NAME
    const uploadPreset = process.env.CLOUDINARY_UPLOAD_PRESET
    if (cloudName && uploadPreset) {
      const cloudForm = new FormData(); cloudForm.append('file', file); cloudForm.append('upload_preset', uploadPreset); cloudForm.append('folder', 'placedecide')
      const cloudResponse = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, { method: 'POST', body: cloudForm })
      if (!cloudResponse.ok) return NextResponse.json({ success: false, error: 'Cloud storage từ chối upload.' }, { status: 502 })
      const result = await cloudResponse.json()
      return NextResponse.json({ success: true, url: result.secure_url, provider: 'cloudinary' }, { status: 201 })
    }
    const uploadDir = path.join(process.cwd(), 'public', 'uploads')
    await mkdir(uploadDir, { recursive: true })
    const fileName = `${randomUUID()}.${extension}`
    await writeFile(path.join(uploadDir, fileName), Buffer.from(await file.arrayBuffer()))
    return NextResponse.json({ success: true, url: `/uploads/${fileName}` }, { status: 201 })
  } catch (error) { return errorResponse(error) }
}
