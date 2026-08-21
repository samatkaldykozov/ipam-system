'use server';

import { Prisma, type AuditAction } from '@prisma/client';

import { prisma } from '@/lib/prisma';

export async function getAuditLogs(params: {
  action?: AuditAction | 'ALL';
  entity?: string;
  userId?: string;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  pageSize?: number;
}) {
  const {
    action = 'ALL',
    entity = 'ALL',
    userId = 'ALL',
    dateFrom,
    dateTo,
    page = 1,
    pageSize = 20,
  } = params;

  const where: Prisma.AuditLogWhereInput = {};
  if (action !== 'ALL') where.action = action;
  if (entity !== 'ALL') where.entity = entity;
  if (userId !== 'ALL') where.userId = userId;

  if (dateFrom || dateTo) {
    const createdAt: Prisma.DateTimeFilter = {};
    if (dateFrom) {
      const from = new Date(dateFrom);
      if (!Number.isNaN(from.getTime())) createdAt.gte = from;
    }
    if (dateTo) {
      // Treat the "to" date as inclusive of the whole day, not just
      // midnight — otherwise picking today as the end date would hide
      // everything that happened today.
      const to = new Date(dateTo);
      if (!Number.isNaN(to.getTime())) {
        to.setHours(23, 59, 59, 999);
        createdAt.lte = to;
      }
    }
    if (Object.keys(createdAt).length > 0) where.createdAt = createdAt;
  }

  const [items, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      include: { user: { select: { email: true } } },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.auditLog.count({ where }),
  ]);

  return {
    items,
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

// Distinct entity types actually present in the log, rather than a
// hardcoded list — stays correct automatically if a new entity type starts
// getting audited later.
export async function getAuditLogEntities(): Promise<string[]> {
  const rows = await prisma.auditLog.findMany({
    distinct: ['entity'],
    select: { entity: true },
    orderBy: { entity: 'asc' },
  });
  return rows.map((r: { entity: string }) => r.entity);
}

// Full user list for the actor filter dropdown. Read-only, no permission
// gate — the audit log page itself is open to every signed-in role (Admin,
// Network Engineer, Viewer), and every entry already shows the actor's
// email, so this adds no new exposure.
export async function getAuditLogUsers() {
  return prisma.user.findMany({
    orderBy: { email: 'asc' },
    select: { id: true, email: true },
  });
}
