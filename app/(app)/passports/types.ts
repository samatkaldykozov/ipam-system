import type {
  FieldDefinition,
  ObjectInstance,
  ObjectInstanceResponsible,
  ObjectType,
  TableFieldRow,
  User,
} from '@prisma/client';

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
