import type { Location, LocationKind } from '@prisma/client';

export type LocationWithCount = Location & {
  _count: { networks: number; children: number };
  parent?: Pick<Location, 'id' | 'name' | 'code'> | null;
};

export type LocationParentOption = {
  id: string;
  name: string;
  code: string;
  kind: LocationKind;
};

export type SortField = 'name' | 'code' | 'city' | 'createdAt';
export type SortOrder = 'asc' | 'desc';

export const LOCATION_KIND_OPTIONS: { value: LocationKind; label: string }[] = [
  { value: 'REGION', label: 'Region' },
  { value: 'CITY', label: 'City' },
  { value: 'BUILDING', label: 'Building' },
  { value: 'ROOM', label: 'Room' },
  { value: 'ZONE', label: 'Zone (secure area)' },
  { value: 'RACK', label: 'Rack' },
];

export function locationKindLabel(kind: LocationKind): string {
  return LOCATION_KIND_OPTIONS.find((o) => o.value === kind)?.label ?? kind;
}

export type LocationTreeNode = LocationWithCount & {
  children: LocationTreeNode[];
};

// Turns the flat list returned by getLocationTree() into an actual tree —
// same approach as buildNetworkTree in networks/types.ts, since Location
// nests the same way Network does (self-referencing parentId).
export function buildLocationTree(
  items: LocationWithCount[],
): LocationTreeNode[] {
  const nodeById = new Map<string, LocationTreeNode>();
  for (const item of items) {
    nodeById.set(item.id, { ...item, children: [] });
  }

  const roots: LocationTreeNode[] = [];
  for (const item of items) {
    const node = nodeById.get(item.id)!;
    const parent = item.parentId ? nodeById.get(item.parentId) : undefined;
    if (parent && parent.id !== node.id) {
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  }

  const sortByName = (a: LocationTreeNode, b: LocationTreeNode) =>
    a.name.localeCompare(b.name, undefined, { numeric: true });
  const sortRecursive = (nodes: LocationTreeNode[]) => {
    nodes.sort(sortByName);
    for (const n of nodes) sortRecursive(n.children);
  };
  sortRecursive(roots);

  return roots;
}

// Depth-first flatten, only descending into a node's children when it's in
// `expanded` — same shape as flattenNetworkTree, including the same guard
// against a cyclical parent chain so rendering can't hang on bad data.
export function flattenLocationTree(
  nodes: LocationTreeNode[],
  expanded: Set<string>,
  depth = 0,
  ancestors: Set<string> = new Set(),
  out: { node: LocationTreeNode; depth: number }[] = [],
) {
  for (const node of nodes) {
    out.push({ node, depth });
    if (
      node.children.length > 0 &&
      expanded.has(node.id) &&
      !ancestors.has(node.id)
    ) {
      flattenLocationTree(
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
