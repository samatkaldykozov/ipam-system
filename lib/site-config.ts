export const siteConfig = {
  name: 'IPAM',
  description: 'IP Address Management',
  nav: [
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
      title: 'Settings',
      href: '/settings',
      icon: 'Settings',
      adminOnly: false,
    },
  ] as const,
};
