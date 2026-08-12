export const siteConfig = {
  name: 'IPAM',
  description: 'IP Address Management',
  nav: [
    { title: 'Dashboard', href: '/', icon: 'LayoutDashboard' },
    { title: 'Networks', href: '/networks', icon: 'Network' },
    { title: 'IP Addresses', href: '/ip-addresses', icon: 'Server' },
    { title: 'Settings', href: '/settings', icon: 'Settings' },
  ] as const,
};
