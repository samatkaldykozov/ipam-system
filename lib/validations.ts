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
  // Rack capacity in U — only meaningful for kind RACK, used by the
  // rack-elevation visualization (phase 5, see it-passports-design.md
  // section 8.8). Empty string clears it back to NULL, same convention as
  // latitude/longitude below.
  rackUnits: z
    .union([
      z.literal(''),
      z.coerce
        .number()
        .int()
        .min(1, 'Must be at least 1')
        .max(60, 'Must be 60 or less'),
    ])
    .optional()
    .transform((v) => (v === '' || v === undefined ? undefined : Number(v))),
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

// EquipmentTypeCode (CMDB phase 3, see schema.prisma) — deliberately not
// restricted to lowercase like objectTypeCodeRegex above: the Kazakhtelecom
// standard's own codes mix case (e.g. "Pdu"), so the code has to be able to
// match the standard exactly, not just be a technical slug. No spaces, so
// it still composes cleanly into an identifier string.
const equipmentTypeCodeRegex = /^[A-Za-z0-9]+$/;

export const equipmentTypeCodeSchema = z.object({
  code: z
    .string()
    .min(1, 'Code is required')
    .max(20, 'Code is too long')
    .regex(equipmentTypeCodeRegex, 'Letters and numbers only, no spaces'),
  label: z.string().min(1, 'Label is required').max(120, 'Label is too long'),
});

export type EquipmentTypeCodeValues = z.infer<typeof equipmentTypeCodeSchema>;

// RACK_POSITION field values (CMDB phase 5, see schema.prisma's
// FieldType.RACK_POSITION doc comment) are stored as plain strings
// "{startUnit}:{sizeUnits}", e.g. "12:2" for a 2U device starting at unit
// 12. Exported so passport-form.tsx (building the string from two number
// inputs) and validate-values.ts (checking a submitted value's shape)
// share one definition of the format instead of two regexes drifting
// apart.
export const rackPositionValueRegex = /^[1-9]\d*:[1-9]\d*$/;

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
  // Generalization of IP_REFERENCE to any CMDB object (Location tree node
  // or another passport) — see schema.prisma's FieldType.OBJECT_REFERENCE
  // doc comment and it-passports-design.md section 8 (CMDB phase 2).
  'OBJECT_REFERENCE',
  // Computed composite equipment identifier (CMDB phase 3) — see
  // schema.prisma's FieldType.AUTO_IDENTIFIER doc comment and
  // it-passports-design.md section 8.1 item 3. Deliberately not in
  // TABLE_COLUMN_TYPES below — scoped to regular fields only for now.
  'AUTO_IDENTIFIER',
  // Manually entered rack position, "{startUnit}:{sizeUnits}" (CMDB phase
  // 5) — see schema.prisma's FieldType.RACK_POSITION doc comment and
  // it-passports-design.md section 8.8. Deliberately not in
  // TABLE_COLUMN_TYPES below, same reasoning as AUTO_IDENTIFIER.
  'RACK_POSITION',
] as const;

// Which kind of object an OBJECT_REFERENCE field/column points to — mirrors
// the Prisma ReferenceTargetKind enum.
export const REFERENCE_TARGET_KINDS = ['LOCATION', 'OBJECT_TYPE'] as const;

// The ITIL/CMDB relationship taxonomy (1 September 2026, CMDB phase 6) —
// mirrors the Prisma RelationshipType enum. Only meaningful for
// OBJECT_REFERENCE fields/columns whose referenceTargetKind is OBJECT_TYPE
// — see that enum's doc comment in schema.prisma for why LOCATION-target
// ones never use this.
export const RELATIONSHIP_TYPES = [
  'CONTAINMENT',
  'DEPENDENCY',
  'ASSOCIATION',
  'OWNERSHIP',
  'IMPACT',
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
  // 28 August 2026 — same extension as IP_REFERENCE got on 26 August: a
  // column can hard-link each row to a Location node or another passport,
  // scoped per column the same way a regular OBJECT_REFERENCE field is
  // scoped (see FieldType.OBJECT_REFERENCE in schema.prisma).
  'OBJECT_REFERENCE',
] as const;

const fieldKeyRegex = /^[a-z0-9_]+$/;

export const tableColumnSchema = z
  .object({
    key: z
      .string()
      .min(1, 'Column key is required')
      .regex(fieldKeyRegex, 'Lowercase letters, numbers, underscores only'),
    label: z.string().min(1, 'Column label is required'),
    type: z.enum(TABLE_COLUMN_TYPES),
    // Same soft IP-address check as FieldDefinition.validateAsIp, scoped to
    // one column of a TABLE field — only meaningful when type is 'TEXT'.
    validateAsIp: z.boolean().default(false),
    // Only meaningful when type is 'OBJECT_REFERENCE' — same two config
    // fields as fieldDefinitionSchema below, scoped to one column.
    // referenceObjectTypeId left empty (null) when referenceTargetKind is
    // 'OBJECT_TYPE' means "any object type" — see the doc comment on the
    // equivalent field below for why this was relaxed (31 August 2026,
    // CMDB phase 5 — patch-cord columns need to point at any of several
    // equipment types, not one fixed type).
    referenceTargetKind: z.enum(REFERENCE_TARGET_KINDS).optional().nullable(),
    referenceObjectTypeId: z.string().min(1).optional().nullable(),
    // Only meaningful when type is 'OBJECT_REFERENCE' and referenceTargetKind
    // is 'OBJECT_TYPE' (a link to another passport, not a location node) —
    // see RelationshipType's doc comment in schema.prisma. Required in that
    // case (the refine below) so every passport-to-passport link is
    // classified from the start, the same way referenceTargetKind itself is
    // required.
    relationshipType: z.enum(RELATIONSHIP_TYPES).optional().nullable(),
  })
  .refine(
    (data) => data.type !== 'OBJECT_REFERENCE' || !!data.referenceTargetKind,
    {
      message: 'Choose what this column links to',
      path: ['referenceTargetKind'],
    },
  )
  .refine(
    (data) =>
      data.type !== 'OBJECT_REFERENCE' ||
      data.referenceTargetKind !== 'OBJECT_TYPE' ||
      !!data.relationshipType,
    {
      message: 'Choose what kind of relationship this column represents',
      path: ['relationshipType'],
    },
  );

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
    // Only meaningful for OBJECT_REFERENCE fields — see
    // FieldDefinition.referenceTargetKind/referenceObjectTypeId in
    // schema.prisma. referenceObjectTypeId left empty (null) when
    // referenceTargetKind is 'OBJECT_TYPE' means "any object type" — a
    // deliberate relaxation (31 August 2026, CMDB phase 5, see
    // it-passports-design.md section 8.8): a patch-cord field needs to
    // point at whichever equipment type is on the other end of a cable
    // (server, switch, UPS, ...), not one fixed type chosen in advance.
    // validateObjectReferenceValues/validateTableObjectReferenceValues
    // (object-reference-utils.ts) already treated a falsy
    // referenceObjectTypeId as "no restriction" from the start, so this
    // only required loosening the constructor's own validation, not the
    // save-time checks.
    referenceTargetKind: z.enum(REFERENCE_TARGET_KINDS).optional().nullable(),
    referenceObjectTypeId: z.string().min(1).optional().nullable(),
    // Only meaningful when type is 'OBJECT_REFERENCE' and referenceTargetKind
    // is 'OBJECT_TYPE' — see FieldDefinition.relationshipType/
    // RelationshipType in schema.prisma. Required in that case (the refine
    // below), same treatment as referenceTargetKind itself.
    relationshipType: z.enum(RELATIONSHIP_TYPES).optional().nullable(),
    // Only meaningful when type is 'AUTO_IDENTIFIER' — see
    // FieldDefinition.autoIdentifierRackFieldKey/
    // autoIdentifierEquipmentTypeCodeId in schema.prisma.
    autoIdentifierRackFieldKey: z.string().min(1).optional().nullable(),
    autoIdentifierEquipmentTypeCodeId: z.string().min(1).optional().nullable(),
    // Only meaningful when type is 'RACK_POSITION' — see
    // FieldDefinition.rackPositionRackFieldKey in schema.prisma.
    rackPositionRackFieldKey: z.string().min(1).optional().nullable(),
  })
  .refine((data) => data.type !== 'SELECT' || data.options.length > 0, {
    message: 'Add at least one option',
    path: ['options'],
  })
  .refine((data) => data.type !== 'TABLE' || data.tableColumns.length > 0, {
    message: 'Add at least one column',
    path: ['tableColumns'],
  })
  .refine(
    (data) => data.type !== 'OBJECT_REFERENCE' || !!data.referenceTargetKind,
    {
      message: 'Choose what this field links to',
      path: ['referenceTargetKind'],
    },
  )
  .refine(
    (data) =>
      data.type !== 'OBJECT_REFERENCE' ||
      data.referenceTargetKind !== 'OBJECT_TYPE' ||
      !!data.relationshipType,
    {
      message: 'Choose what kind of relationship this field represents',
      path: ['relationshipType'],
    },
  )
  .refine(
    (data) =>
      data.type !== 'AUTO_IDENTIFIER' || !!data.autoIdentifierRackFieldKey,
    {
      message: 'Choose which field on this type supplies the rack',
      path: ['autoIdentifierRackFieldKey'],
    },
  )
  .refine(
    (data) =>
      data.type !== 'AUTO_IDENTIFIER' ||
      !!data.autoIdentifierEquipmentTypeCodeId,
    {
      message: 'Choose an equipment-type code',
      path: ['autoIdentifierEquipmentTypeCodeId'],
    },
  )
  .refine(
    (data) => data.type !== 'RACK_POSITION' || !!data.rackPositionRackFieldKey,
    {
      message: 'Choose which field on this type supplies the rack',
      path: ['rackPositionRackFieldKey'],
    },
  );

export type FieldDefinitionValues = z.infer<typeof fieldDefinitionSchema>;
