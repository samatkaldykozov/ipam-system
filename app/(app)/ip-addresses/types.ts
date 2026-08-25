import type { Branch, DeviceType, IpAddress, IpStatus, Network } from '@prisma/client';

export type IpAddressWithNetwork = IpAddress & {
  network: Pick<Network, 'id' | 'cidr' | 'name'>;
};

// «Филиал» — fixed list (see lib/validations.ts BRANCH_VALUES for the
// underlying enum keys shared with the Prisma schema).
export const BRANCH_OPTIONS: { value: Branch; label: string }[] = [
  { value: 'DIT', label: 'ДИТ' },
  { value: 'DRB', label: 'ДРБ' },
  { value: 'ODS', label: 'ОДС' },
  { value: 'DKB', label: 'ДКБ' },
  { value: 'SERVICE_FACTORY', label: 'Сервисная фабрика' },
  { value: 'CORPORATE_UNIVERSITY', label: 'Корпоративный университет' },
  { value: 'DCB', label: 'ДЦБ' },
  { value: 'DPB', label: 'ДПБ (Дирекция Производственной Безопасности)' },
  { value: 'DUP', label: 'ДУП (Дирекция Управления Проектами)' },
  { value: 'DTK', label: 'ДТК (Дирекция Телеком Комплект)' },
  { value: 'PROFKOM', label: 'Профком' },
  { value: 'KT_CLOUD_LAB', label: 'ТОО KT Cloud Lab' },
];

export function branchLabel(value: Branch | null | undefined): string | null {
  if (!value) return null;
  return BRANCH_OPTIONS.find((o) => o.value === value)?.label ?? value;
}

// «Тип устройства» — fixed list (see lib/validations.ts DEVICE_TYPE_VALUES).
export const DEVICE_TYPE_OPTIONS: { value: DeviceType; label: string }[] = [
  { value: 'COMPUTER', label: 'Компьютер' },
  { value: 'PRINTER_MFU', label: 'Принтер, МФУ' },
  { value: 'SERVER', label: 'Сервер' },
  { value: 'NETWORK_EQUIPMENT', label: 'Сетевое оборудование' },
  { value: 'VIRTUAL_SERVER', label: 'Виртуальный сервер' },
  { value: 'APPLICATION', label: 'Приложение' },
  { value: 'MICROSERVICE', label: 'Микросервис' },
  { value: 'CAMERA', label: 'Видеокамера' },
  { value: 'UPS', label: 'ИБП' },
  { value: 'POWER_CLIMATE', label: 'Энергетика и климатехника' },
  { value: 'OTHER', label: 'Прочее' },
];

export function deviceTypeLabel(
  value: DeviceType | null | undefined,
): string | null {
  if (!value) return null;
  return DEVICE_TYPE_OPTIONS.find((o) => o.value === value)?.label ?? value;
}

export type NetworkOption = { id: string; name: string; cidr: string };

export const STATUS_OPTIONS: { label: string; value: IpStatus | 'ALL' }[] = [
  { label: 'All statuses', value: 'ALL' },
  { label: 'Available', value: 'AVAILABLE' },
  { label: 'Assigned', value: 'ASSIGNED' },
  { label: 'Reserved', value: 'RESERVED' },
  { label: 'Blocked', value: 'BLOCKED' },
];

export const IP_STATUSES: IpStatus[] = [
  'AVAILABLE',
  'ASSIGNED',
  'RESERVED',
  'BLOCKED',
];

export function statusBadgeVariant(status: IpStatus) {
  switch (status) {
    case 'ASSIGNED':
      return 'default' as const;
    case 'AVAILABLE':
      return 'secondary' as const;
    case 'RESERVED':
      return 'outline' as const;
    case 'BLOCKED':
      return 'destructive' as const;
  }
}

export type SortField = 'address' | 'hostname' | 'createdAt';
export type SortOrder = 'asc' | 'desc';
