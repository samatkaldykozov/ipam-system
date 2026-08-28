import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().email('Enter a valid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

export type LoginValues = z.infer<typeof loginSchema>;

export const inviteUserSchema = z.object({
  email: z.string().email('Enter a valid email address'),
  roleId: z.string().min(1, 'Select a role'),
});

export type InviteUserValues = z.infer<typeof inviteUserSchema>;

export const setPasswordSchema = z
  .object({
    password: z.string().min(8, 'Password must be at least 8 characters'),
    confirmPassword: z.string().min(8, 'Please confirm your password'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

export type SetPasswordValues = z.infer<typeof setPasswordSchema>;

export const profileSchema = z.object({
  fullName: z.string().max(120, 'Name is too long').optional(),
});

export type ProfileValues = z.infer<typeof profileSchema>;

const cidrRegex =
  /^((25[0-5]|2[0-4]\d|1\d{2}|[1-9]?\d)\.){3}(25[0-5]|2[0-4]\d|1\d{2}|[1-9]?\d)\/(3[0-2]|[12]?\d)$/;

export const networkSchema = z.object({
  name: z.string().min(1, 'Name is required').max(120, 'Name is too long'),
  cidr: z
    .string()
    .min(1, 'CIDR is required')
    .regex(cidrRegex, 'Enter a valid CIDR, e.g. 10.0.0.0/24'),
  description: z.string().max(500, 'Description is too long').optional(),
  vlanId: z
    .union([
      z.coerce
        .number()
        .int()
        .min(1, 'VLAN must be at least 1')
        .max(4094, 'VLAN must be at most 4094'),
      z.literal(''),
    ])
    .optional()
    .transform((v) => (v === '' || v === undefined ? undefined : Number(v))),
  locationId: z.string().optional().nullable(),
  parentId: z.string().optional().nullable(),
  status: z.enum(['ACTIVE', 'RESERVED', 'ARCHIVED']).default('ACTIVE'),
});

export type NetworkValues = z.infer<typeof networkSchema>;

// z.literal('') must come BEFORE the coerced-number branch: z.union tries
// branches in order, and z.coerce.number() happily turns '' into 0 (a
// value that passes the -90..90 range check), so if the number branch were
// first, an intentionally-empty field would silently coerce to 0 (the
// equator) instead of falling through to the empty-string branch and
// ending up unset via the transform below.
const latitudeSchema = z
  .union([
    z.literal(''),
    z.coerce
      .number()
      .min(-90, 'Must be between -90 and 90')
      .max(90, 'Must be between -90 and 90'),
  ])
  .optional()
  .transform((v) => (v === '' || v === undefined ? undefined : Number(v)));

const longitudeSchema = z
  .union([
    z.literal(''),
    z.coerce
      .number()
      .min(-180, 'Must be between -180 and 180')
      .max(180, 'Must be between -180 and 180'),
  ])
  .optional()
  .transform((v) => (v === '' || v === undefined ? undefined : Number(v)));

export const LOCATION_KINDS = [
  'REGION',
  'CITY',
  'BUILDING',
  'ROOM',
  'ZONE',
  'RACK',
] as const;

export const locationSchema = z.object({
  kind: z.enum(LOCATION_KINDS),
  parentId: z.string().min(1).optional().nullable(),
  name: z.string().min(1, 'Name is required').max(120, 'Name is too long'),
  code: z
    .string()
    .min(1, 'Code is required')
    .max(20, 'Code is too long')
    .regex(/^[A-Za-z0-9-]+$/, 'Use letters, numbers, and hyphens only'),
  // Row letter/number for a RACK, carried on the rack itself rather than as
  // its own tree level — see the LocationKind comment in schema.prisma.
  rowCode: z
    .string()
    .max(10, 'Row code is too long')
    .regex(/^[A-Za-z0-9]*$/, 'Use letters and numbers only')
    .optional(),
  address: z.string().max(255, 'Address is too long').optional(),
  city: z.string().max(120, 'City is too long').optional(),
  country: z.string().max(120, 'Country is too long').optional(),
  latitude: latitudeSchema,
  longitude: longitudeSchema,
  description: z.string().max(500, 'Description is too long').optional(),
});

export type LocationValues = z.infer<typeof locationSchema>;

export const macAddressRegex = /^([0-9A-Fa-f]{2}[:-]){5}[0-9A-Fa-f]{2}$/;

export const ipv4Regex =
  /^((25[0-5]|2[0-4]\d|1\d{2}|[1-9]?\d)\.){3}(25[0-5]|2[0-4]\d|1\d{2}|[1-9]?\d)$/;

// «Филиал» — fixed list, matches the enum values in schema.prisma
// (IpAddress.branch / Branch). Company-specific, given by the user
// 25 August 2026 — extend both this array and the Prisma enum together
// if new branches are added.
export const BRANCH_VALUES = [
  'DIT',
  'DRB',
  'ODS',
  'DKB',
  'SERVICE_FACTORY',
  'CORPORATE_UNIVERSITY',
  'DCB',
  'DPB',
  'DUP',
  'DTK',
  'PROFKOM',
  'KT_CLOUD_LAB',
] as const;

// «Тип устройства» — fixed list, matches DeviceType in schema.prisma.
export const DEVICE_TYPE_VALUES = [
  'COMPUTER',
  'PRINTER_MFU',
  'SERVER',
  'NETWORK_EQUIPMENT',
  'VIRTUAL_SERVER',
  'APPLICATION',
  'MICROSERVICE',
  'CAMERA',
  'UPS',
  'POWER_CLIMATE',
  'OTHER',
] as const;

export const ipAddressSchema = z.object({
  address: z
    .string()
    .min(1, 'Address is required')
    .regex(ipv4Regex, 'Enter a valid IPv4 address, e.g. 10.0.0.5'),
  hostname: z.string().max(255, 'Hostname is too long').optional(),
  macAddress: z
    .string()
    .regex(macAddressRegex, 'Enter a valid MAC address, e.g. 00:1A:2B:3C:4D:5E')
    .optional()
    .or(z.literal(''))
    .transform((v) => (v === '' || v === undefined ? undefined : v)),
  networkId: z.string().min(1, 'Network is required'),
  status: z
    .enum(['AVAILABLE', 'ASSIGNED', 'RESERVED', 'BLOCKED'])
    .default('AVAILABLE'),
  description: z.string().max(500, 'Description is too long').optional(),
  branch: z.enum(BRANCH_VALUES).optional(),
  responsibleParty: z
    .string()
    .max(255, 'Responsible party is too long')
    .optional(),
  purpose: z.string().max(255, 'Purpose is too long').optional(),
  deviceType: z.enum(DEVICE_TYPE_VALUES).optional(),
  basis: z.string().max(500, 'Basis is too long').optional(),
});

export type IpAddressValues = z.infer<typeof ipAddressSchema>;

// ─────────────────────────────────────────────
// IT-object passports — form builder (see docs/it-passports-design.md).
// ─────────────────────────────────────────────

const objectTypeCodeRegex = /^[a-z0-9_]+$/;

export const objectTypeSchema = z.object({
  name: z.string().min(1, 'Name is required').max(120, 'Name is too long'),
  code: z
    .string()
    .min(1, 'Code is required')
    .max(40, 'Code is too long')
    .regex(
      objectTypeCodeRegex,
      'Use lowercase letters, numbers, and underscores only',
    ),
  description: z.string().max(500, 'Description is too long').optional(),
});

export type ObjectTypeValues = z.infer<typeof objectTypeSchema>;

export const FIELD_DEFINITION_TYPES = [
  'TEXT',
  'LONG_TEXT',
  'DATE',
  'BOOLEAN',
  'LINK',
  'SELECT',
  'TABLE',
  // Full relational link to a real IpAddress row — see
  // schema.prisma's FieldType.IP_REFERENCE doc comment and
  // docs/it-passports-design.md section 6.3 ("вариант 1"). Scoped to
  // regular (non-TABLE) fields for now, same as validateAsIp before it.
  'IP_REFERENCE',
] as const;

// Column types allowed inside a TABLE field's own columns — TABLE can't
// nest inside itself. IP_REFERENCE is allowed here too (26 August 2026,
// extending the regular-field feature to table columns — see
// docs/it-passports-design.md section 6.3): a column of this type stores
// a real IpAddress id per row, same as a regular IP_REFERENCE field, just
// scoped to one cell — see TableCellIpAddressValue in schema.prisma.
export const TABLE_COLUMN_TYPES = [
  'TEXT',
  'LONG_TEXT',
  'DATE',
  'BOOLEAN',
  'LINK',
  'IP_REFERENCE',
] as const;

const fieldKeyRegex = /^[a-z0-9_]+$/;

export const tableColumnSchema = z.object({
  key: z
    .string()
    .min(1, 'Column key is required')
    .regex(fieldKeyRegex, 'Lowercase letters, numbers, underscores only'),
  label: z.string().min(1, 'Column label is required'),
  type: z.enum(TABLE_COLUMN_TYPES),
  // Same soft IP-address check as FieldDefinition.validateAsIp, scoped to
  // one column of a TABLE field — only meaningful when type is 'TEXT'.
  validateAsIp: z.boolean().default(false),
});

// Server-side shape for creating/updating one FieldDefinition. The admin
// UI (app/(app)/object-types/[id]/field-form-dialog.tsx) builds its own
// form state (options/tableColumns as react-hook-form field arrays) and
// transforms it into this shape before calling the server action — this
// schema is what actually gets validated and persisted.
export const fieldDefinitionSchema = z
  .object({
    sectionName: z.string().max(120, 'Section name is too long').optional(),
    key: z
      .string()
      .min(1, 'Key is required')
      .max(60, 'Key is too long')
      .regex(fieldKeyRegex, 'Lowercase letters, numbers, underscores only'),
    label: z.string().min(1, 'Label is required').max(200, 'Label is too long'),
    helpText: z.string().max(1000, 'Help text is too long').optional(),
    type: z.enum(FIELD_DEFINITION_TYPES),
    required: z.boolean().default(false),
    visibleToAll: z.boolean().default(true),
    visibleRoleIds: z.array(z.string()).default([]),
    options: z.array(z.string().min(1)).default([]),
    tableColumns: z.array(tableColumnSchema).default([]),
    // Soft IP-address validation flag — only meaningful for TEXT fields; see
    // the FieldDefinition.validateAsIp comment in schema.prisma.
    validateAsIp: z.boolean().default(false),
  })
  .refine((data) => data.type !== 'SELECT' || data.options.length > 0, {
    message: 'Add at least one option',
    path: ['options'],
  })
  .refine((data) => data.type !== 'TABLE' || data.tableColumns.length > 0, {
    message: 'Add at least one column',
    path: ['tableColumns'],
  });

export type FieldDefinitionValues = z.infer<typeof fieldDefinitionSchema>;
