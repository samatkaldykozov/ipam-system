import { describe, expect, it } from 'vitest';

import { generateCsv, parseCsv } from './csv-utils';

describe('parseCsv', () => {
  it('parses a simple CSV into records keyed by header', () => {
    const csv =
      'cidr,name,vlanId\n10.0.0.0/24,Corporate LAN,100\n10.0.1.0/24,Guest,200';
    const records = parseCsv(csv);
    expect(records).toEqual([
      { cidr: '10.0.0.0/24', name: 'Corporate LAN', vlanId: '100' },
      { cidr: '10.0.1.0/24', name: 'Guest', vlanId: '200' },
    ]);
  });

  it('returns an empty array for empty input', () => {
    expect(parseCsv('')).toEqual([]);
  });

  it('returns an empty array for a header-only file', () => {
    expect(parseCsv('cidr,name')).toEqual([]);
  });

  it('handles quoted fields containing commas', () => {
    const csv = 'name,description\n"Site A","Rack 1, Row 2"';
    expect(parseCsv(csv)).toEqual([
      { name: 'Site A', description: 'Rack 1, Row 2' },
    ]);
  });

  it('handles escaped quotes inside a quoted field', () => {
    const csv = 'name,note\n"HQ","Says ""hello"" to everyone"';
    expect(parseCsv(csv)).toEqual([
      { name: 'HQ', note: 'Says "hello" to everyone' },
    ]);
  });

  it('handles embedded newlines inside a quoted field', () => {
    const csv = 'name,note\n"HQ","line one\nline two"';
    expect(parseCsv(csv)).toEqual([{ name: 'HQ', note: 'line one\nline two' }]);
  });

  it('handles Windows-style CRLF line endings', () => {
    const csv = 'a,b\r\n1,2\r\n3,4';
    expect(parseCsv(csv)).toEqual([
      { a: '1', b: '2' },
      { a: '3', b: '4' },
    ]);
  });

  it('skips blank trailing lines', () => {
    const csv = 'a,b\n1,2\n\n';
    expect(parseCsv(csv)).toEqual([{ a: '1', b: '2' }]);
  });

  it('fills missing trailing columns with empty strings', () => {
    const csv = 'a,b,c\n1,2';
    expect(parseCsv(csv)).toEqual([{ a: '1', b: '2', c: '' }]);
  });
});

describe('generateCsv', () => {
  it('joins headers and rows with commas and CRLF', () => {
    const csv = generateCsv(
      ['a', 'b'],
      [
        ['1', '2'],
        ['3', '4'],
      ],
    );
    expect(csv).toBe('a,b\r\n1,2\r\n3,4');
  });

  it('quotes fields containing a comma', () => {
    const csv = generateCsv(['name'], [['Smith, John']]);
    expect(csv).toBe('name\r\n"Smith, John"');
  });

  it('escapes embedded quotes by doubling them', () => {
    const csv = generateCsv(['note'], [['Say "hi"']]);
    expect(csv).toBe('note\r\n"Say ""hi"""');
  });

  it('quotes fields containing a newline', () => {
    const csv = generateCsv(['note'], [['line one\nline two']]);
    expect(csv).toBe('note\r\n"line one\nline two"');
  });

  it('renders null and undefined as empty fields', () => {
    const csv = generateCsv(['a', 'b'], [[null, undefined]]);
    expect(csv).toBe('a,b\r\n,');
  });
});

describe('generateCsv + parseCsv round-trip', () => {
  it('recovers the original values, including tricky characters', () => {
    const headers = ['cidr', 'name', 'description'];
    const rows: (string | number | null)[][] = [
      ['10.0.0.0/24', 'Corporate, HQ', 'Has "quotes" and a\nnewline'],
      ['10.0.1.0/24', 'Guest', ''],
    ];

    const csv = generateCsv(headers, rows);
    const parsed = parseCsv(csv);

    expect(parsed).toEqual([
      {
        cidr: '10.0.0.0/24',
        name: 'Corporate, HQ',
        description: 'Has "quotes" and a\nnewline',
      },
      { cidr: '10.0.1.0/24', name: 'Guest', description: '' },
    ]);
  });
});
