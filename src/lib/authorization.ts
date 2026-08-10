import { prisma } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'
import { GroupRole } from '@prisma/client'

export class AuthorizationError extends Error {
  status: number
  constructor(message: string, status = 403) { super(message); this.status = status }
}

export async function requireUser() {
  const user = await getCurrentUser()
  if (!user) throw new AuthorizationError('Bạn cần đăng nhập để thực hiện thao tác này.', 401)
  return user
}

export async function requireGroupMember(groupId: string, userId: string, roles?: GroupRole[]) {
  const membership = await prisma.groupMembership.findUnique({ where: { groupId_userId: { groupId, userId } } })
  if (!membership) throw new AuthorizationError('Bạn không phải thành viên của nhóm này.')
  if (roles && !roles.includes(membership.role)) throw new AuthorizationError('Bạn không có quyền thực hiện thao tác này.')
  return membership
}

export function errorResponse(error: unknown) {
  if (error instanceof AuthorizationError) return Response.json({ success: false, error: error.message }, { status: error.status })
  console.error(error)
  return Response.json({ success: false, error: 'Đã xảy ra lỗi máy chủ.' }, { status: 500 })
}
