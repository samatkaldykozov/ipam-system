import type {
  FieldDefinition,
  ObjectInstance,
  ObjectInstanceResponsible,
  ObjectInstanceStatus,
  ObjectType,
  TableFieldRow,
  User,
} from '@prisma/client';

import type { FieldDefinitionWithVisibility } from '@/app/(app)/object-types/types';

// CI lifecycle status (2 September 2026, CMDB phase 7 — see
// it-passports-design.md section 8.11). Deliberately three fixed states,
// not a per-type configurable workflow — see the enum's doc comment in
// schema.prisma for why.
export const OBJECT_INSTANCE_STATUSES = [
  'IN_USE',
  'UNDER_MAINTENANCE',
  'DECOMMISSIONED',
] as const;
export type ObjectInstanceStatusValue =
  (typeof OBJECT_INSTANCE_STATUSES)[number];

export const OBJECT_INSTANCE_STATUS_LABELS: Record<
  ObjectInstanceStatusValue,
  string
> = {
  IN_USE: 'В эксплуатации',
  UNDER_MAINTENANCE: 'На обслуживании',
  DECOMMISSIONED: 'Выведен из эксплуатации',
};

// Deliberately not "destructive" (red) for DECOMMISSIONED — a retired CI is
// a normal, expected end state, not an error condition.
export const OBJECT_INSTANCE_STATUS_BADGE_VARIANT: Record<
  ObjectInstanceStatusValue,
  'default' | 'secondary' | 'outline'
> = {
  IN_USE: 'default',
  UNDER_MAINTENANCE: 'secondary',
  DECOMMISSIONED: 'outline',
};

export type PassportUserOption = Pick<User, 'id' | 'email' | 'fullName'>;

export type ObjectTypePickerOption = Pick<
  ObjectType,
  'id' | 'name' | 'code' | 'description'
> & {
  _count: { fields: number };
};

export type ObjectTypeForFill = ObjectType & { fields: FieldDefinition[] };

export type PassportResponsibleEntry = ObjectInstanceResponsible & {
  user: PassportUserOption;
};

export type PassportListItem = ObjectInstance & {
  objectType: Pick<ObjectType, 'id' | 'name' | 'code'>;
  responsible: PassportResponsibleEntry[];
};

export type PassportWithFields = ObjectInstance & {
  objectType: ObjectTypeForFill;
  responsible: PassportResponsibleEntry[];
  tableRows: TableFieldRow[];
};

// Server-side masked shape returned by getPassportView() (plan step 5):
// `fields` and `values`/`tableRows` are already filtered down to what the
// viewing role is allowed to see — a hidden field's definition AND its
// value never reach this type at all, let alone the browser.
export type PassportView = {
  id: string;
  name: string;
  status: ObjectInstanceStatus;
  objectType: Pick<ObjectType, 'id' | 'name' | 'code'>;
  fields: FieldDefinitionWithVisibility[];
  values: Record<string, unknown>;
  tableRows: TableFieldRow[];
  responsible: PassportResponsibleEntry[];
  createdAt: Date;
  updatedAt: Date;
  // Whether the viewer is a Passport Admin/Manager — if true, the "Edit"
  // link is shown and no field masking was applied above.
  canEdit: boolean;
};

// One entry in a passport's change history (2 September 2026, CMDB phase
// 7) — see getPassportHistory() in actions.ts and change-log-utils.ts.
export type PassportHistoryEntry = {
  id: string;
  action: 'CREATE' | 'UPDATE';
  actorEmail: string | null;
  createdAt: Date;
  changes: { key: string; label: string; from: string; to: string }[];
};
