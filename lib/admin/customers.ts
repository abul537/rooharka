import { db } from '@/lib/db'
import type { Prisma } from '@/lib/generated/prisma/client'
import type { StoreAdmin } from '@/lib/auth/guard'
import { AdminError } from './orders'

export const CUSTOMER_PAGE = 25

export async function listCustomers(storeId: string, q: string, page: number) {
  const where: Prisma.CustomerWhereInput = { storeId }
  if (q) {
    const digits = q.replace(/[^\d]/g, '')
    where.OR = [
      { firstName: { contains: q, mode: 'insensitive' } }, { lastName: { contains: q, mode: 'insensitive' } },
      ...(digits.length >= 4 ? [{ phone: { contains: digits.replace(/^0/, '') } }] : []),
    ]
  }
  const [total, rows] = await Promise.all([
    db.customer.count({ where }),
    db.customer.findMany({ where, orderBy: [{ lastOrderAt: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }], skip: (page - 1) * CUSTOMER_PAGE, take: CUSTOMER_PAGE,
      select: { id: true, firstName: true, lastName: true, phone: true, ordersCount: true, totalSpent: true, lastOrderAt: true } }),
  ])
  return { total, rows }
}

export async function getCustomer(storeId: string, id: string) {
  const c = await db.customer.findFirst({
    where: { id, storeId },
    include: {
      addresses: { include: { province: true, city: true, locality: true }, orderBy: { id: 'desc' } },
      orders: { orderBy: { placedAt: 'desc' }, take: 50, select: { id: true, number: true, total: true, status: true, placedAt: true } },
    },
  })
  if (!c) return null
  const blocked = await db.blocklistEntry.findUnique({ where: { storeId_type_value: { storeId, type: 'PHONE', value: c.phone } }, select: { reason: true } })
  return { ...c, blocked }
}

/** Blocked numbers cannot place new orders (checked in createOrder). */
export async function setBlocked(admin: StoreAdmin, customerId: string, block: boolean, reason: string) {
  const c = await db.customer.findFirst({ where: { id: customerId, storeId: admin.storeId }, select: { phone: true } })
  if (!c) throw new AdminError('Customer not found.')
  const key = { storeId: admin.storeId, type: 'PHONE' as const, value: c.phone }
  if (block) {
    await db.blocklistEntry.upsert({
      where: { storeId_type_value: key },
      create: { ...key, reason: reason.trim().slice(0, 200) || null, createdBy: admin.id },
      update: { reason: reason.trim().slice(0, 200) || null },
    })
  } else {
    await db.blocklistEntry.deleteMany({ where: key })
  }
}

export async function saveNotes(admin: StoreAdmin, customerId: string, notes: string) {
  const res = await db.customer.updateMany({ where: { id: customerId, storeId: admin.storeId }, data: { notes: notes.trim().slice(0, 1000) || null } })
  if (res.count === 0) throw new AdminError('Customer not found.')
}
