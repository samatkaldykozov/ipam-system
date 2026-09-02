// Navigation is split into two branches, switched between in the sidebar
// (see components/sidebar.tsx): IPAM (everything built so far) and
// Passports (the new IT-object passports module). Each branch has its own
// nav list and its own "adminOnly" meaning — IPAM's adminOnly checks
// isAdmin(role), Passports' adminOnly checks isPassportAdmin(passportRole).
// See docs/it-passports-design.md section 4.

export const siteConfig = {
  name: 'IPAM',
  description: 'IP Address Management',
  ipamNav: [
    {
      title: 'Dashboard',
      href: '/',
      icon: 'LayoutDashboard',
      adminOnly: false,
    },
    { title: 'Networks', href: '/networks', icon: 'Network', adminOnly: false },
    {
      title: 'IP Addresses',
      href: '/ip-addresses',
      icon: 'Server',
      adminOnly: false,
    },
    {
      title: 'Locations',
      href: '/locations',
      icon: 'MapPin',
      adminOnly: false,
    },
    {
      title: 'Audit Log',
      href: '/audit-log',
      icon: 'History',
      adminOnly: false,
    },
    { title: 'Users', href: '/users', icon: 'Users', adminOnly: true },
    {
      title: 'Data Integrity',
      href: '/data-integrity',
      icon: 'ClipboardCheck',
      adminOnly: true,
    },
    {
      title: 'Settings',
      href: '/settings',
      icon: 'Settings',
      adminOnly: false,
    },
  ] as const,
  passportNav: [
    {
      title: 'CMDB',
      href: '/passports',
      icon: 'FileStack',
      adminOnly: false,
    },
    {
      title: 'Конструктор форм',
      href: '/object-types',
      icon: 'LayoutTemplate',
      adminOnly: true,
    },
    {
      title: 'Коды оборудования',
      href: '/equipment-type-codes',
      icon: 'Hash',
      adminOnly: true,
    },
    {
      title: 'Audit Log',
      href: '/audit-log',
      icon: 'History',
      adminOnly: false,
    },
    { title: 'Users', href: '/users', icon: 'Users', adminOnly: true },
    {
      title: 'Settings',
      href: '/settings',
      icon: 'Settings',
      adminOnly: false,
    },
  ] as const,
};

export type Branch = 'ipam' | 'passport';
