import type { AuditAction } from '@prisma/client';

export const ACTION_OPTIONS: { label: string; value: AuditAction | 'ALL' }[] = [
  { label: 'All actions', value: 'ALL' },
  { label: 'Create', value: 'CREATE' },
  { label: 'Update', value: 'UPDATE' },
  { label: 'Delete', value: 'DELETE' },
  { label: 'Login', value: 'LOGIN' },
  { label: 'Logout', value: 'LOGOUT' },
];

export function actionBadgeVariant(action: AuditAction) {
  switch (action) {
    case 'CREATE':
      return 'default' as const;
    case 'UPDATE':
      return 'secondary' as const;
    case 'DELETE':
      return 'destructive' as const;
    case 'LOGIN':
    case 'LOGOUT':
      return 'outline' as const;
  }
}

export type AuditLogUser = { id: string; email: string };
