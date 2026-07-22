import { describe, it, expect } from 'vitest'
import { validateColumnAssignment, isDisguisedNull, normalizeForValidation, FIELD_VALIDATION_RULES } from '../fieldValidator.js'

describe('isDisguisedNull', () => {
  it('recognizes common null patterns', () => {
    expect(isDisguisedNull('')).toBe(true)
    expect(isDisguisedNull('NULL')).toBe(true)
    expect(isDisguisedNull('N/A')).toBe(true)
    expect(isDisguisedNull('-')).toBe(true)
    expect(isDisguisedNull('--')).toBe(true)
    expect(isDisguisedNull('غير معروف')).toBe(true)
    expect(isDisguisedNull('?')).toBe(true)
    expect(isDisguisedNull(null)).toBe(true)
    expect(isDisguisedNull(undefined)).toBe(true)
  })

  it('does not flag real values', () => {
    expect(isDisguisedNull('100')).toBe(false)
    expect(isDisguisedNull('Open')).toBe(false)
    expect(isDisguisedNull('hello')).toBe(false)
    expect(isDisguisedNull('0')).toBe(false)
  })
})

describe('normalizeForValidation', () => {
  it('returns null for disguised nulls', () => {
    expect(normalizeForValidation('N/A')).toBeNull()
    expect(normalizeForValidation('-')).toBeNull()
    expect(normalizeForValidation('')).toBeNull()
  })

  it('parses numbers', () => {
    expect(normalizeForValidation('100')).toBe(100)
    expect(normalizeForValidation('1,234')).toBe(1234)
    expect(normalizeForValidation('100.5')).toBe(100.5)
  })

  it('returns string for non-numeric', () => {
    expect(normalizeForValidation('Open')).toBe('Open')
    expect(normalizeForValidation('PRV')).toBe('PRV')
  })
})

describe('validateColumnAssignment - numeric fields', () => {
  it('passes for valid numeric data', () => {
    const values = ['100', '200', '300', '150.5']
    const result = validateColumnAssignment(values, 'elevation')
    expect(result.severity).toBe('ok')
    expect(result.errors.length).toBe(0)
  })

  it('returns blocking error for non-numeric data in numeric field', () => {
    const values = ['شمال', 'جنوب', 'text']
    const result = validateColumnAssignment(values, 'elevation')
    expect(result.severity).toBe('blocking')
    expect(result.errors.length).toBe(1)
    expect(result.errors[0].type).toBe('type_mismatch')
  })

  it('returns warning for out-of-range values', () => {
    const values = ['100', '200', '9500']
    const result = validateColumnAssignment(values, 'elevation')
    expect(result.severity).toBe('warning')
    expect(result.warnings.length).toBe(1)
    expect(result.warnings[0].type).toBe('out_of_range')
  })

  it('returns warning for negative values when not allowed', () => {
    const values = ['100', '-50', '200']
    const result = validateColumnAssignment(values, 'diameter')
    expect(result.severity).toBe('warning')
    expect(result.warnings.some(w => w.type === 'negative')).toBe(true)
  })

  it('allows negative values when allowNegative is true', () => {
    const values = ['-10', '100', '200']
    const result = validateColumnAssignment(values, 'elevation')
    expect(result.warnings.some(w => w.type === 'negative')).toBe(false)
  })

  it('handles partial failures (mixed numeric and text)', () => {
    const values = ['100', '200', 'N/A', '400', '-', '600']
    const result = validateColumnAssignment(values, 'elevation')
    expect(result.severity).toBe('blocking')
    expect(result.errors[0].failedRows).toContain(2)
    expect(result.errors[0].failedRows).toContain(4)
  })
})

describe('validateColumnAssignment - nullable fields', () => {
  it('returns error for empty values in non-nullable field', () => {
    const values = ['100', '', '300']
    const result = validateColumnAssignment(values, 'elevation')
    expect(result.severity).toBe('blocking')
    expect(result.errors.some(e => e.type === 'nullable')).toBe(true)
  })

  it('allows empty values in nullable field', () => {
    const values = ['100', '', '300']
    const result = validateColumnAssignment(values, 'demand')
    expect(result.errors.some(e => e.type === 'nullable')).toBe(false)
  })

  it('shows info for nullable field with default value', () => {
    const values = ['100', '', '300']
    const result = validateColumnAssignment(values, 'demand')
    expect(result.infos.some(i => i.type === 'default')).toBe(true)
  })
})

describe('validateColumnAssignment - categorical fields', () => {
  it('passes for valid categorical values', () => {
    const values = ['Open', 'Closed', 'Open']
    const result = validateColumnAssignment(values, 'status')
    expect(result.severity).toBe('ok')
  })

  it('returns warning for invalid categorical values', () => {
    const values = ['Open', 'متضرر', 'Closed']
    const result = validateColumnAssignment(values, 'status')
    expect(result.severity).toBe('warning')
    expect(result.warnings[0].type).toBe('invalid_categorical')
  })

  it('is case insensitive for categoricals', () => {
    const values = ['open', 'CLOSED', 'Open']
    const result = validateColumnAssignment(values, 'status')
    expect(result.severity).toBe('ok')
  })
})

describe('validateColumnAssignment - id_reference fields', () => {
  it('passes when referenced IDs exist', () => {
    const existingIds = new Set(['J1', 'J2', 'J3'])
    const values = ['J1', 'J2', 'J3']
    const result = validateColumnAssignment(values, 'node1', existingIds)
    expect(result.severity).toBe('ok')
  })

  it('returns error for missing referenced IDs', () => {
    const existingIds = new Set(['J1', 'J2'])
    const values = ['J1', 'J2', 'J99']
    const result = validateColumnAssignment(values, 'node1', existingIds)
    expect(result.severity).toBe('blocking')
    expect(result.errors.some(e => e.type === 'missing_ref')).toBe(true)
  })
})

describe('validateColumnAssignment - text fields', () => {
  it('passes for valid text', () => {
    const values = ['J1', 'J2', 'J3']
    const result = validateColumnAssignment(values, 'id')
    expect(result.severity).toBe('ok')
  })

  it('returns error for duplicate IDs', () => {
    const values = ['J1', 'J2', 'J1']
    const result = validateColumnAssignment(values, 'id')
    expect(result.severity).toBe('blocking')
    expect(result.errors.some(e => e.type === 'duplicate_id')).toBe(true)
  })

  it('returns warning for IDs exceeding max length', () => {
    const values = ['A'.repeat(32), 'B'.repeat(32)]
    const result = validateColumnAssignment(values, 'id')
    expect(result.severity).toBe('warning')
    expect(result.warnings.some(w => w.type === 'too_long')).toBe(true)
  })
})

describe('validateColumnAssignment - compound fields', () => {
  it('passes for valid pump parameters', () => {
    const values = ['HEAD 8', 'POWER 5', 'HEAD 10']
    const result = validateColumnAssignment(values, 'parameters')
    expect(result.severity).toBe('ok')
  })

  it('returns warning for invalid compound format', () => {
    const values = ['HEAD 8', 'invalid', 'HEAD 10']
    const result = validateColumnAssignment(values, 'parameters')
    expect(result.severity).toBe('warning')
    expect(result.warnings[0].type).toBe('compound_format')
  })
})

describe('validateColumnAssignment - disguised nulls', () => {
  it('treats N/A as null, not as type mismatch', () => {
    const values = ['100', 'N/A', '300']
    const result = validateColumnAssignment(values, 'elevation')
    expect(result.severity).toBe('blocking')
    expect(result.errors[0].type).toBe('nullable')
    expect(result.errors[0].message).toContain('1')
  })

  it('treats dashes as null in nullable field', () => {
    const values = ['100', '-', '300']
    const result = validateColumnAssignment(values, 'demand')
    expect(result.severity).toBe('ok')
    expect(result.infos.some(i => i.type === 'default')).toBe(true)
  })
})
