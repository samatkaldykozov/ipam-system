import type {
  FieldDefinition,
  FieldVisibility,
  ObjectType,
  Role,
} from '@prisma/client';

import {
  FIELD_DEFINITION_TYPES,
  REFERENCE_TARGET_KINDS,
  TABLE_COLUMN_TYPES,
} from '@/lib/validations';

export const FIELD_TYPES = FIELD_DEFINITION_TYPES;
export type FieldTypeValue = (typeof FIELD_TYPES)[number];

export const FIELD_TYPE_LABELS: Record<string, string> = {
  TEXT: 'Текст',
  LONG_TEXT: 'Многострочный текст',
  DATE: 'Дата',
  BOOLEAN: 'Да/Нет',
  LINK: 'Ссылка (URL)',
  SELECT: 'Список вариантов',
  TABLE: 'Таблица',
  IP_REFERENCE: 'Ссылка на IP-адрес (IPAM)',
  OBJECT_REFERENCE: 'Ссылка на объект CMDB',
};

export { REFERENCE_TARGET_KINDS, TABLE_COLUMN_TYPES };
export type ReferenceTargetKindValue = (typeof REFERENCE_TARGET_KINDS)[number];
export type TableColumnType = (typeof TABLE_COLUMN_TYPES)[number];

export const REFERENCE_TARGET_KIND_LABELS: Record<
  ReferenceTargetKindValue,
  string
> = {
  LOCATION: 'Узел дерева локаций',
  OBJECT_TYPE: 'Паспорт определённого типа',
};

export type TableColumnDef = {
  key: string;
  label: string;
  type: TableColumnType;
  // Soft IP-address check for this column, same idea as
  // FieldDefinition.validateAsIp — only meaningful when type is 'TEXT'.
  // Optional so older stored tableColumns JSON without this key still
  // types fine (treated as false/absent).
  validateAsIp?: boolean;
  // Only meaningful when type is 'OBJECT_REFERENCE' — same two config
  // fields as FieldDefinition.referenceTargetKind/referenceObjectTypeId,
  // scoped to one column. Optional for the same reason as validateAsIp
  // above (older stored JSON predates this feature).
  referenceTargetKind?: ReferenceTargetKindValue | null;
  referenceObjectTypeId?: string | null;
};

export type ObjectTypeWithCounts = ObjectType & {
  _count: { fields: number; instances: number };
};

// Lightweight shape for the "reference target type" picker on an
// OBJECT_REFERENCE field's config — same idea as LocationParentOption in
// locations/types.ts.
export type ObjectTypeOption = Pick<ObjectType, 'id' | 'name' | 'code'>;

export type FieldDefinitionWithVisibility = FieldDefinition & {
  visibleRoles: (FieldVisibility & { role: Role })[];
};

export type ObjectTypeWithFields = ObjectType & {
  fields: FieldDefinitionWithVisibility[];
  _count: { instances: number };
};

// Best-effort Cyrillic -> Latin transliteration, used only to prefill a
// suggested `code`/`key` from a Russian label (the admin can always edit
// it by hand afterward). Not meant to be a complete/correct transliteration
// standard — just good enough that "Наименование ИС" suggests something
// readable like "naimenovanie_is" instead of coming back empty.
const CYRILLIC_TO_LATIN: Record<string, string> = {
  а: 'a',
  б: 'b',
  в: 'v',
  г: 'g',
  д: 'd',
  е: 'e',
  ё: 'e',
  ж: 'zh',
  з: 'z',
  и: 'i',
  й: 'y',
  к: 'k',
  л: 'l',
  м: 'm',
  н: 'n',
  о: 'o',
  п: 'p',
  р: 'r',
  с: 's',
  т: 't',
  у: 'u',
  ф: 'f',
  х: 'h',
  ц: 'ts',
  ч: 'ch',
  ш: 'sh',
  щ: 'sch',
  ъ: '',
  ы: 'y',
  ь: '',
  э: 'e',
  ю: 'yu',
  я: 'ya',
};

function transliterate(value: string): string {
  return value
    .toLowerCase()
    .split('')
    .map((ch) => CYRILLIC_TO_LATIN[ch] ?? ch)
    .join('');
}

export function slugify(value: string): string {
  return transliterate(value)
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}
