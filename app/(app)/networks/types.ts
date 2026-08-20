import type { Network, Location, NetworkStatus } from '@prisma/client';

export type NetworkWithRelations = Network & {
  location: Location | null;
  parent: Pick<Network, 'id' | 'cidr' | 'name'> | null;
  _count: { children: number; ipAddresses: number };
};

export type LocationOption = { id: string; name: string; code: string };

export type ParentOption = { id: string; cidr: string; name: string };

export const STATUS_OPTIONS: { label: string; value: NetworkStatus | 'ALL' }[] =
  [
    { label: 'All statuses', value: 'ALL' },
    { label: 'Active', value: 'ACTIVE' },
    { label: 'Reserved', value: 'RESERVED' },
    { label: 'Archived', value: 'ARCHIVED' },
  ];

export const NETWORK_STATUSES: NetworkStatus[] = [
  'ACTIVE',
  'RESERVED',
  'ARCHIVED',
];

export function statusBadgeVariant(status: NetworkStatus) {
  switch (status) {
    case 'ACTIVE':
      return 'default' as const;
    case 'RESERVED':
      return 'secondary' as const;
    case 'ARCHIVED':
      return 'outline' as const;
  }
}

export type SortField = 'cidr' | 'name' | 'vlanId' | 'createdAt';
export type SortOrder = 'asc' | 'desc';

export type NetworkTreeNode = NetworkWithRelations & {
  children: NetworkTreeNode[];
};

// Turns the flat list returned by getNetworkTree() into an actual tree:
// each node's children are the networks whose parentId points at it, and
// anything whose parent isn't present in the set (no parent, or the parent
// got filtered out by the status filter) becomes a root. Defensive against
// a node somehow listing itself as its own parent, which would otherwise
// make it vanish from both the root list and its own children array.
export function buildNetworkTree(
  items: NetworkWithRelations[],
): NetworkTreeNode[] {
  const nodeById = new Map<string, NetworkTreeNode>();
  for (const item of items) {
    nodeById.set(item.id, { ...item, children: [] });
  }

  const roots: NetworkTreeNode[] = [];
  for (const item of items) {
    const node = nodeById.get(item.id)!;
    const parent = item.parentId ? nodeById.get(item.parentId) : undefined;
    if (parent && parent.id !== node.id) {
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  }

  const sortByCidr = (a: NetworkTreeNode, b: NetworkTreeNode) =>
    a.cidr.localeCompare(b.cidr, undefined, { numeric: true });
  const sortRecursive = (nodes: NetworkTreeNode[]) => {
    nodes.sort(sortByCidr);
    for (const n of nodes) sortRecursive(n.children);
  };
  sortRecursive(roots);

  return roots;
}

// Depth-first flatten of a tree into rows, only descending into a node's
// children when that node's id is in `expanded`. Guards against a cyclical
// parent chain (shouldn't be possible given the create/update validation,
// but rendering must not hang if the data is ever wrong) by tracking which
// ids are already on the current path and refusing to re-descend into them.
export function flattenNetworkTree(
  nodes: NetworkTreeNode[],
  expanded: Set<string>,
  depth = 0,
  ancestors: Set<string> = new Set(),
  out: { node: NetworkTreeNode; depth: number }[] = [],
) {
  for (const node of nodes) {
    out.push({ node, depth });
    if (
      node.children.length > 0 &&
      expanded.has(node.id) &&
      !ancestors.has(node.id)
    ) {
      flattenNetworkTree(
        node.children,
        expanded,
        depth + 1,
        new Set(ancestors).add(node.id),
        out,
      );
    }
  }
  return out;
}
