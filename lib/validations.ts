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

const macAddressRegex = /^([0-9A-Fa-f]{2}[:-]){5}[0-9A-Fa-f]{2}$/;

const ipv4Regex =
  /^((25[0-5]|2[0-4]\d|1\d{2}|[1-9]?\d)\.){3}(25[0-5]|2[0-4]\d|1\d{2}|[1-9]?\d)$/;

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
});

export type IpAddressValues = z.infer<typeof ipAddressSchema>;
