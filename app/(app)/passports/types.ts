import type {
  FieldDefinition,
  ObjectInstance,
  ObjectInstanceResponsible,
  ObjectType,
  TableFieldRow,
  User,
} from '@prisma/client';

import type { FieldDefinitionWithVisibility } from '@/app/(app)/object-types/types';

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
