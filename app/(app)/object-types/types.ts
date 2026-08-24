import type { FieldDefinition, FieldVisibility, ObjectType, Role } from '@prisma/client';

import {
  FIELD_DEFINITION_TYPES,
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
};

export { TABLE_COLUMN_TYPES };
export type TableColumnType = (typeof TABLE_COLUMN_TYPES)[number];

export type TableColumnDef = {
  key: string;
  label: string;
  type: TableColumnType;
};

export type ObjectTypeWithCounts = ObjectType & {
  _count: { fields: number; instances: number };
};

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
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z',
  и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r',
  с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sch',
  ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
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
