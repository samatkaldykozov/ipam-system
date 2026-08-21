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

// Enumerates every usable host address in a CIDR block, in order (network
// and broadcast addresses excluded for /0 through /30, matching
// getNetworkCapacity's definition of "usable"). This materializes the full
// address list in memory, so callers MUST check getNetworkCapacity() against
// a sane cap before calling this — it is only meant for small blocks (the
// subnet visualizer caps at 1024 addresses, i.e. /22 or smaller).
export function getUsableAddresses(cidr: string): string[] | null {
  const parsed = parseCidr(cidr);
  if (parsed === null) return null;

  const instance = new IPCIDR(cidr);
  const all = instance.toArray();
  return parsed.prefixLength >= 31 ? all : all.slice(1, -1);
}

// IPv4 dotted-quad <-> unsigned 32-bit integer. `>>> 0` forces the bitwise
// result back to an unsigned value (plain `<<`/`|` in JS operate on signed
// 32-bit ints, so e.g. 192.x.x.x addresses would otherwise come out negative).
function ipToInt(ip: string): number {
  const parts = ip.split('.').map(Number);
  return (
    ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0
  );
}

function intToIp(int: number): string {
  return [
    (int >>> 24) & 255,
    (int >>> 16) & 255,
    (int >>> 8) & 255,
    int & 255,
  ].join('.');
}

// Finds the first usable address in a CIDR block that isn't in
// `usedAddresses`, walking the range in order via integer arithmetic rather
// than materializing the full address list (unlike getUsableAddresses, this
// is safe to call on much larger blocks — the caller is expected to still
// apply a sane cap before scanning, since even integer arithmetic isn't free
// over e.g. a /8). Network/broadcast addresses are skipped for /0 through
// /30, matching getNetworkCapacity's and getUsableAddresses' definition of
// "usable". Returns null for an invalid CIDR or when the block is full.
export function findFirstFreeAddress(
  cidr: string,
  usedAddresses: Set<string>,
): string | null {
  const parsed = parseCidr(cidr);
  if (parsed === null) return null;

  const startInt = ipToInt(parsed.start);
  const endInt = ipToInt(parsed.end);
  const firstUsable = parsed.prefixLength >= 31 ? startInt : startInt + 1;
  const lastUsable = parsed.prefixLength >= 31 ? endInt : endInt - 1;

  for (let i = firstUsable; i <= lastUsable; i++) {
    const candidate = intToIp(i);
    if (!usedAddresses.has(candidate)) return candidate;
  }
  return null;
}
