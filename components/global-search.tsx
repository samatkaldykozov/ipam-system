'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import {
  Loader2,
  MapPin,
  Network as NetworkIcon,
  Search,
  Server,
  Users as UsersIcon,
} from 'lucide-react';

import {
  globalSearch,
  type GlobalSearchItem,
} from '@/app/(app)/global-search-actions';

const TYPE_META: Record<
  GlobalSearchItem['type'],
  { label: string; icon: React.ComponentType<{ className?: string }> }
> = {
  network: { label: 'Networks', icon: NetworkIcon },
  ipAddress: { label: 'IP Addresses', icon: Server },
  location: { label: 'Locations', icon: MapPin },
  user: { label: 'Users', icon: UsersIcon },
};

const TYPE_ORDER: GlobalSearchItem['type'][] = [
  'network',
  'ipAddress',
  'location',
  'user',
];

export function GlobalSearch() {
  const router = useRouter();
  const [query, setQuery] = React.useState('');
  const [items, setItems] = React.useState<GlobalSearchItem[]>([]);
  const [open, setOpen] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [searched, setSearched] = React.useState(false);

  const debounceRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const blurTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const requestIdRef = React.useRef(0);

  function runSearch(value: string) {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    const trimmed = value.trim();
    if (trimmed.length < 2) {
      setItems([]);
      setSearched(false);
      setLoading(false);
      return;
    }

    setLoading(true);
    debounceRef.current = setTimeout(async () => {
      const requestId = ++requestIdRef.current;
      const results = await globalSearch(trimmed);
      if (requestId !== requestIdRef.current) return; // a newer keystroke superseded this one
      setItems(results);
      setSearched(true);
      setLoading(false);
    }, 250);
  }

  function handleChange(value: string) {
    setQuery(value);
    setOpen(true);
    runSearch(value);
  }

  function handleSelect(href: string) {
    setOpen(false);
    setQuery('');
    setItems([]);
    setSearched(false);
    router.push(href);
  }

  function handleBlur() {
    // Delayed so a click on a result (via onMouseDown preventDefault below,
    // this normally won't even fire from a result click) still has time to
    // register before the dropdown disappears.
    blurTimeoutRef.current = setTimeout(() => setOpen(false), 150);
  }

  function handleFocus() {
    if (blurTimeoutRef.current) clearTimeout(blurTimeoutRef.current);
    if (query.trim().length >= 2) setOpen(true);
  }

  const grouped = React.useMemo(() => {
    const map = new Map<GlobalSearchItem['type'], GlobalSearchItem[]>();
    for (const item of items) {
      const list = map.get(item.type) ?? [];
      list.push(item);
      map.set(item.type, list);
    }
    return map;
  }, [items]);

  const showDropdown = open && query.trim().length >= 2;

  return (
    <div className="relative w-full max-w-sm">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <input
        value={query}
        onChange={(e) => handleChange(e.target.value)}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            setOpen(false);
            e.currentTarget.blur();
          }
        }}
        placeholder="Search networks, IPs, locations…"
        className="h-9 w-full rounded-md border border-input bg-background pl-9 pr-8 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      />
      {loading ? (
        <Loader2 className="absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
      ) : null}

      {showDropdown ? (
        <div className="absolute left-0 top-full z-50 mt-1 max-h-96 w-full overflow-y-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-md">
          {items.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">
              {searched ? 'No results found' : 'Searching…'}
            </p>
          ) : (
            TYPE_ORDER.filter((type) => grouped.has(type)).map((type) => {
              const meta = TYPE_META[type];
              const Icon = meta.icon;
              const groupItems = grouped.get(type)!;
              return (
                <div key={type} className="py-1">
                  <p className="px-2 py-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {meta.label}
                  </p>
                  {groupItems.map((item) => (
                    <button
                      key={`${item.type}-${item.id}`}
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => handleSelect(item.href)}
                      className="flex w-full flex-col items-start gap-0.5 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent hover:text-accent-foreground"
                    >
                      <span className="flex items-center gap-2">
                        <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        <span className="truncate">{item.title}</span>
                      </span>
                      {item.subtitle ? (
                        <span className="truncate pl-5 text-xs text-muted-foreground">
                          {item.subtitle}
                        </span>
                      ) : null}
                    </button>
                  ))}
                </div>
              );
            })
          )}
        </div>
      ) : null}
    </div>
  );
}
