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

export function cidrsOverlap(a: string, b: string): boolean {
  const parsedA = parseCidr(a);
  const parsedB = parseCidr(b);
  if (!parsedA || !parsedB) return false;

  if (containsCidr(a, b) || containsCidr(b, a)) return true;

  const instanceA = new IPCIDR(a);
  const instanceB = new IPCIDR(b);
  return instanceA.contains(parsedB.start) || instanceB.contains(parsedA.start);
}

export function isMoreSpecificOrEqual(
  cidr: string,
  maxLength: number,
): boolean {
  const prefixLength = getPrefixLength(cidr);
  if (prefixLength === null) return false;
  return prefixLength >= maxLength;
}

export function requiresAncestor24(cidr: string): boolean {
  const prefixLength = getPrefixLength(cidr);
  if (prefixLength === null) return false;
  return prefixLength >= 25;
}
