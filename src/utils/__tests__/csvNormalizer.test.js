import { describe, it, expect } from 'vitest'
import { normalizeText, normalizeHeader, normalizeValue, isNumericColumn, getColumnStats } from '../csvNormalizer.js'

describe('normalizeText', () => {
  it('lowercases and removes spaces/underscores/hyphens', () => {
    expect(normalizeText('  Hello_World  ')).toBe('helloworld')
    expect(normalizeText('node-id')).toBe('nodeid')
    expect(normalizeText('Node ID')).toBe('nodeid')
  })

  it('removes Arabic diacritics', () => {
    expect(normalizeText('ارتفاع')).toContain('ارتفاع')
  })

  it('normalizes Arabic alef variants', () => {
    expect(normalizeText('أ')).toBe(normalizeText('ا'))
  })

  it('removes punctuation', () => {
    expect(normalizeText('diameter(mm)')).toBe('diametermm')
  })
})

describe('normalizeHeader', () => {
  it('removes units from headers', () => {
    expect(normalizeHeader('Diameter_mm')).toBe('diameter')
    expect(normalizeHeader('Length_m')).toBe('length')
    expect(normalizeHeader('Elevation_ft')).toBe('elevation')
  })

  it('normalizes common header patterns', () => {
    expect(normalizeHeader('Node1')).toBe('node1')
    expect(normalizeHeader('FROM_NODE')).toBe('fromnode')
  })
})

describe('normalizeValue', () => {
  it('returns null for empty/null/NaN values', () => {
    expect(normalizeValue(null)).toBe(null)
    expect(normalizeValue('')).toBe(null)
    expect(normalizeValue('null')).toBe(null)
    expect(normalizeValue('N/A')).toBe(null)
    expect(normalizeValue('none')).toBe(null)
  })

  it('parses numbers', () => {
    expect(normalizeValue('123')).toBe(123)
    expect(normalizeValue('123.45')).toBe(123.45)
    expect(normalizeValue('1,234')).toBe(1234)
  })

  it('returns string for non-numeric', () => {
    expect(normalizeValue('hello')).toBe('hello')
    expect(normalizeValue('Open')).toBe('Open')
  })
})

describe('isNumericColumn', () => {
  it('returns true for mostly numeric values', () => {
    expect(isNumericColumn([1, 2, 3, 4, 5])).toBe(true)
    expect(isNumericColumn(['1', '2', '3', null, '5'])).toBe(true)
  })

  it('returns false for mostly text values', () => {
    expect(isNumericColumn(['hello', 'world', 'foo', 'bar'])).toBe(false)
  })
})

describe('getColumnStats', () => {
  it('computes stats for numeric columns', () => {
    const stats = getColumnStats([10, 20, 30, 40, 50])
    expect(stats.min).toBe(10)
    expect(stats.max).toBe(50)
    expect(stats.mean).toBe(30)
    expect(stats.unique).toBe(5)
    expect(stats.numericRatio).toBe(1)
  })

  it('detects categorical columns', () => {
    const stats = getColumnStats(['Open', 'Closed', 'Open', 'Closed'])
    expect(stats.categorical).toBe(true)
    expect(stats.categoricalValues).toContain('open')
    expect(stats.categoricalValues).toContain('closed')
  })

  it('detects high uniqueness columns (ID)', () => {
    const stats = getColumnStats(['J1', 'J2', 'J3', 'J4', 'J5'])
    expect(stats.uniqueness).toBe(1)
  })
})
