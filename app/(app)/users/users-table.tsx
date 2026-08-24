'use client';

import * as React from 'react';
import { format } from 'date-fns';
import { Loader2, UserPlus, Users as UsersIcon } from 'lucide-react';
import { toast } from 'sonner';
import type { Role, User } from '@prisma/client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
import { updateUserRole, updateUserPassportRole } from '@/app/(app)/users/actions';
import { InviteUserDialog } from '@/app/(app)/users/invite-user-dialog';

type UserWithRoles = User & { role: Role | null; passportRole: Role | null };

interface UsersTableProps {
  users: UserWithRoles[];
  ipamRoles: Role[];
  passportRoles: Role[];
  currentUserId: string;
  canManageIpamRoles: boolean;
  canManagePassportRoles: boolean;
}

// Radix Select doesn't allow an empty-string item value, so "no Passport
// role assigned" needs its own sentinel that the handler below translates
// back to null before calling the server action.
const NO_PASSPORT_ROLE = '__none__';

function roleBadgeVariant(roleName: string | undefined) {
  if (roleName === 'Admin' || roleName === 'Passport Admin') return 'default' as const;
  if (roleName === 'Network Engineer' || roleName === 'Passport Manager')
    return 'secondary' as const;
  return 'outline' as const;
}

export function UsersTable({
  users,
  ipamRoles,
  passportRoles,
  currentUserId,
  canManageIpamRoles,
  canManagePassportRoles,
}: UsersTableProps) {
  const [pendingRoleId, setPendingRoleId] = React.useState<string | null>(null);
  const [pendingPassportRoleId, setPendingPassportRoleId] = React.useState<
    string | null
  >(null);
  const [inviteOpen, setInviteOpen] = React.useState(false);

  async function handleRoleChange(userId: string, roleId: string) {
    setPendingRoleId(userId);
    const result = await updateUserRole(userId, roleId);
    setPendingRoleId(null);

    if (!result.ok) {
      toast.error(result.message ?? 'Failed to update role');
      return;
    }
    toast.success(result.message ?? 'Role updated');
  }

  async function handlePassportRoleChange(userId: string, value: string) {
    setPendingPassportRoleId(userId);
    const result = await updateUserPassportRole(
      userId,
      value === NO_PASSPORT_ROLE ? null : value,
    );
    setPendingPassportRoleId(null);

    if (!result.ok) {
      toast.error(result.message ?? 'Failed to update Passport role');
      return;
    }
    toast.success(result.message ?? 'Passport role updated');
  }

  const inviteButton = (
    <Button onClick={() => setInviteOpen(true)}>
      <UserPlus className="mr-2 h-4 w-4" />
      Invite user
    </Button>
  );

  if (users.length === 0) {
    return (
      <div className="space-y-4">
        <div className="flex justify-end">{inviteButton}</div>
        <EmptyState
          icon={<UsersIcon className="h-6 w-6" />}
          title="No users found"
          description="Invite a teammate to get started."
          action={inviteButton}
        />
        <InviteUserDialog
          open={inviteOpen}
          onOpenChange={setInviteOpen}
          roles={ipamRoles}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">{inviteButton}</div>
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Email</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Role (IPAM)</TableHead>
              <TableHead>Role (Паспорта)</TableHead>
              <TableHead>Joined</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((user) => {
              const isSelf = user.id === currentUserId;
              const isRolePending = pendingRoleId === user.id;
              const isPassportRolePending = pendingPassportRoleId === user.id;
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
                    {isSelf || !canManageIpamRoles ? (
                      <Badge variant={roleBadgeVariant(user.role?.name)}>
                        {user.role?.name ?? 'Viewer'}
                      </Badge>
                    ) : (
                      <Select
                        value={user.roleId ?? undefined}
                        onValueChange={(value) =>
                          handleRoleChange(user.id, value)
                        }
                        disabled={isRolePending}
                      >
                        <SelectTrigger className="w-[180px]">
                          {isRolePending ? (
                            <span className="flex items-center gap-2 text-muted-foreground">
                              <Loader2 className="h-3 w-3 animate-spin" />
                              Updating…
                            </span>
                          ) : (
                            <SelectValue placeholder="No role" />
                          )}
                        </SelectTrigger>
                        <SelectContent>
                          {ipamRoles.map((role) => (
                            <SelectItem key={role.id} value={role.id}>
                              {role.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                    {isSelf ? (
                      <p className="mt-1 text-xs text-muted-foreground">
                        (you)
                      </p>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    {isSelf || !canManagePassportRoles ? (
                      user.passportRole ? (
                        <Badge variant={roleBadgeVariant(user.passportRole.name)}>
                          {user.passportRole.name}
                        </Badge>
                      ) : (
                        <span className="text-sm text-muted-foreground">
                          No access
                        </span>
                      )
                    ) : (
                      <Select
                        value={user.passportRoleId ?? NO_PASSPORT_ROLE}
                        onValueChange={(value) =>
                          handlePassportRoleChange(user.id, value)
                        }
                        disabled={isPassportRolePending}
                      >
                        <SelectTrigger className="w-[180px]">
                          {isPassportRolePending ? (
                            <span className="flex items-center gap-2 text-muted-foreground">
                              <Loader2 className="h-3 w-3 animate-spin" />
                              Updating…
                            </span>
                          ) : (
                            <SelectValue />
                          )}
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={NO_PASSPORT_ROLE}>
                            No access
                          </SelectItem>
                          {passportRoles.map((role) => (
                            <SelectItem key={role.id} value={role.id}>
                              {role.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                    {isSelf ? (
                      <p className="mt-1 text-xs text-muted-foreground">
                        (you)
                      </p>
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
      <InviteUserDialog
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        roles={ipamRoles}
      />
    </div>
  );
}
