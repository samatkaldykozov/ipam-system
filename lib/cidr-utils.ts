import IPCIDR from 'ip-cidr';

export type ParsedCidr = {
  cidr: string;
  prefixLength: number;
  start: string;
  end: string;
};

function parseCidr(cidr: string): ParsedCidr | null {
  try {
    const instance = new IPCIDR(cidr);
    if (!instance.address) return null;
    const start = instance.start<IPCIDR.Address>({ type: 'addressObject' });
    const end = instance.end<IPCIDR.Address>({ type: 'addressObject' });
    const startStr = start.address;
    const endStr = end.address;
    const prefixLength = parseInt(cidr.split('/')[1] ?? '', 10);
    if (Number.isNaN(prefixLength)) return null;
    return { cidr, prefixLength, start: startStr, end: endStr };
  } catch {
    return null;
  }
}

export function isValidCidr(cidr: string): boolean {
  return parseCidr(cidr) !== null;
}

export function getPrefixLength(cidr: string): number | null {
  const parsed = parseCidr(cidr);
  return parsed ? parsed.prefixLength : null;
}

// True when `childCidr` is fully contained within `parentCidr` (and is at
// least as specific). Used to enforce that a network's parent must actually
// be a bigger block it fits inside.
export function containsCidr(parentCidr: string, childCidr: string): boolean {
  const parent = parseCidr(parentCidr);
  const child = parseCidr(childCidr);
  if (!parent || !child) return false;
  if (parent.prefixLength > child.prefixLength) return false;

  const parentInstance = new IPCIDR(parentCidr);
  return (
    parentInstance.contains(child.start) && parentInstance.contains(child.end)
  );
}

// True when two CIDR ranges share any address space. Used to stop sibling
// networks under the same parent (or two top-level networks) from overlapping.
export function cidrsOverlap(a: string, b: string): boolean {
  const parsedA = parseCidr(a);
  const parsedB = parseCidr(b);
  if (!parsedA || !parsedB) return false;

  if (containsCidr(a, b) || containsCidr(b, a)) return true;

  const instanceA = new IPCIDR(a);
  const instanceB = new IPCIDR(b);
  return instanceA.contains(parsedB.start) || instanceB.contains(parsedA.start);
}

// Number of usable host addresses in a CIDR block (IPv4). A standard
// network (/0 through /30) reserves the network and broadcast address, so
// usable = total - 2. Point-to-point /31s and single-host /32s don't
// reserve either address (RFC 3021), so usable equals the raw count there.
export function getNetworkCapacity(cidr: string): number | null {
  const prefixLength = getPrefixLength(cidr);
  if (prefixLength === null) return null;

  const total = Math.pow(2, 32 - prefixLength);
  return prefixLength >= 31 ? total : total - 2;
}
