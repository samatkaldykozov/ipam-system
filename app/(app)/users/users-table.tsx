'use client';

import * as React from 'react';
import { format } from 'date-fns';
import { Loader2, Users as UsersIcon } from 'lucide-react';
import { toast } from 'sonner';
import type { Role, User } from '@prisma/client';

import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { EmptyState } from '@/components/empty-state';
import { updateUserRole } from '@/app/(app)/users/actions';

type UserWithRole = User & { role: Role | null };

interface UsersTableProps {
  users: UserWithRole[];
  roles: Role[];
  currentUserId: string;
}

function roleBadgeVariant(roleName: string | undefined) {
  if (roleName === 'Admin') return 'default' as const;
  if (roleName === 'Network Engineer') return 'secondary' as const;
  return 'outline' as const;
}

export function UsersTable({ users, roles, currentUserId }: UsersTableProps) {
  const [pendingId, setPendingId] = React.useState<string | null>(null);

  async function handleRoleChange(userId: string, roleId: string) {
    setPendingId(userId);
    const result = await updateUserRole(userId, roleId);
    setPendingId(null);

    if (!result.ok) {
      toast.error(result.message ?? 'Failed to update role');
      return;
    }
    toast.success(result.message ?? 'Role updated');
  }

  if (users.length === 0) {
    return (
      <EmptyState
        icon={<UsersIcon className="h-6 w-6" />}
        title="No users found"
        description="Users appear here once they sign in for the first time."
      />
    );
  }

  return (
    <div className="rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Email</TableHead>
            <TableHead>Name</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Role</TableHead>
            <TableHead>Joined</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {users.map((user) => {
            const isSelf = user.id === currentUserId;
            const isPending = pendingId === user.id;
            return (
              <TableRow key={user.id}>
                <TableCell className="font-medium">{user.email}</TableCell>
                <TableCell>
                  {user.fullName || (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell>
                  <Badge variant={user.isActive ? 'secondary' : 'outline'}>
                    {user.isActive ? 'Active' : 'Inactive'}
                  </Badge>
                </TableCell>
                <TableCell>
                  {isSelf ? (
                    <Badge variant={roleBadgeVariant(user.role?.name)}>
                      {user.role?.name ?? 'Viewer'}
                    </Badge>
                  ) : (
                    <Select
                      value={user.roleId ?? undefined}
                      onValueChange={(value) =>
                        handleRoleChange(user.id, value)
                      }
                      disabled={isPending}
                    >
                      <SelectTrigger className="w-[180px]">
                        {isPending ? (
                          <span className="flex items-center gap-2 text-muted-foreground">
                            <Loader2 className="h-3 w-3 animate-spin" />
                            Updating…
                          </span>
                        ) : (
                          <SelectValue placeholder="No role" />
                        )}
                      </SelectTrigger>
                      <SelectContent>
                        {roles.map((role) => (
                          <SelectItem key={role.id} value={role.id}>
                            {role.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                  {isSelf ? (
                    <p className="mt-1 text-xs text-muted-foreground">(you)</p>
                  ) : null}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {format(user.createdAt, 'MMM d, yyyy')}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
