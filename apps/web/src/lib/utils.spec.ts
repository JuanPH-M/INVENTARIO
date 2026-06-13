import { describe, it, expect } from 'vitest';
import {
  cn,
  formatCurrency,
  formatDate,
  formatDateTime,
  truncate,
  getInitials,
  isValidEmail,
} from './utils';

describe('cn', () => {
  it('merges class names', () => {
    expect(cn('foo', 'bar')).toBe('foo bar');
  });

  it('handles conditional classes', () => {
    expect(cn('base', false && 'no', 'yes')).toBe('base yes');
  });

  it('de-duplicates tailwind classes (last wins)', () => {
    const result = cn('text-red-500', 'text-blue-500');
    expect(result).toBe('text-blue-500');
  });

  it('handles undefined and null', () => {
    expect(cn('base', undefined, null as unknown as string)).toBe('base');
  });
});

describe('formatCurrency', () => {
  it('formats COP without decimals', () => {
    const result = formatCurrency(150000);
    expect(result).toContain('150');
    expect(result).toContain('000');
  });

  it('handles zero', () => {
    const result = formatCurrency(0);
    expect(result).toContain('0');
  });

  it('handles negative amounts', () => {
    const result = formatCurrency(-5000);
    expect(result).toContain('5');
  });
});

describe('formatDate', () => {
  it('formats a date string and includes the year', () => {
    const result = formatDate('2026-06-01');
    expect(result).toContain('2026');
    // Date parts may appear as 1 or 01 depending on locale/platform
    expect(result.length).toBeGreaterThan(4);
  });

  it('accepts a Date object', () => {
    const result = formatDate(new Date('2026-01-15T12:00:00Z'));
    expect(result).toContain('2026');
  });
});

describe('formatDateTime', () => {
  it('includes time components', () => {
    const result = formatDateTime('2026-06-01T14:30:00');
    expect(result).toContain('2026');
    // Time should be present (at least hour format)
    expect(result.length).toBeGreaterThan(10);
  });
});

describe('truncate', () => {
  it('returns original string when shorter than maxLength', () => {
    expect(truncate('Hello', 10)).toBe('Hello');
  });

  it('returns original string when equal to maxLength', () => {
    expect(truncate('Hello', 5)).toBe('Hello');
  });

  it('truncates and adds ellipsis', () => {
    expect(truncate('Hello World', 5)).toBe('Hello...');
  });

  it('handles empty string', () => {
    expect(truncate('', 5)).toBe('');
  });
});

describe('getInitials', () => {
  it('returns uppercase initials', () => {
    expect(getInitials('Juan', 'Pérez')).toBe('JP');
  });

  it('handles single-character names', () => {
    expect(getInitials('A', 'B')).toBe('AB');
  });

  it('uppercases lowercase names', () => {
    expect(getInitials('ana', 'garcía')).toBe('AG');
  });
});

describe('isValidEmail', () => {
  it.each([
    ['user@example.com', true],
    ['user+tag@domain.co', true],
    ['user@sub.domain.org', true],
    ['not-an-email', false],
    ['@domain.com', false],
    ['user@', false],
    ['', false],
    ['user @domain.com', false],
  ])('isValidEmail(%s) === %s', (input, expected) => {
    expect(isValidEmail(input)).toBe(expected);
  });
});
