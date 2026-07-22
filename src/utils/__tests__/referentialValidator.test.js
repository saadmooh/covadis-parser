import { describe, it, expect } from 'vitest'
import { validateReferentialIntegrity, filterRowsWithMissingRefs } from '../referentialValidator.js'

describe('validateReferentialIntegrity', () => {
  it('returns no errors for valid data', () => {
    const data = {
      junctions: [{ id: 'J1' }, { id: 'J2' }],
      pipes: [{ id: 'P1', node1: 'J1', node2: 'J2' }],
    }
    const result = validateReferentialIntegrity(data)
    expect(result.errors.length).toBe(0)
    expect(result.nodeCount).toBe(2)
    expect(result.pipeCount).toBe(1)
  })

  it('detects missing node references in pipes', () => {
    const data = {
      junctions: [{ id: 'J1' }],
      pipes: [{ id: 'P1', node1: 'J1', node2: 'J99' }],
    }
    const result = validateReferentialIntegrity(data)
    expect(result.errors.length).toBe(1)
    expect(result.errors[0].type).toBe('missing_ref')
    expect(result.errors[0].value).toBe('J99')
  })

  it('detects duplicate junction IDs', () => {
    const data = {
      junctions: [{ id: 'J1' }, { id: 'J1' }],
      pipes: [],
    }
    const result = validateReferentialIntegrity(data)
    expect(result.errors.length).toBe(1)
    expect(result.errors[0].type).toBe('duplicate_id')
  })

  it('detects duplicate pipe IDs', () => {
    const data = {
      junctions: [{ id: 'J1' }, { id: 'J2' }],
      pipes: [
        { id: 'P1', node1: 'J1', node2: 'J2' },
        { id: 'P1', node1: 'J1', node2: 'J2' },
      ],
    }
    const result = validateReferentialIntegrity(data)
    expect(result.errors.some(e => e.type === 'duplicate_id')).toBe(true)
  })

  it('validates valve references', () => {
    const data = {
      junctions: [{ id: 'J1' }, { id: 'J2' }],
      valves: [{ id: 'V1', node1: 'J1', node2: 'J2' }],
    }
    const result = validateReferentialIntegrity(data)
    expect(result.errors.length).toBe(0)
    expect(result.valveCount).toBe(1)
  })

  it('detects missing valve references', () => {
    const data = {
      junctions: [{ id: 'J1' }],
      valves: [{ id: 'V1', node1: 'J1', node2: 'MISSING' }],
    }
    const result = validateReferentialIntegrity(data)
    expect(result.errors.length).toBe(1)
    expect(result.errors[0].field).toBe('Node2')
  })

  it('warns when no nodes exist but pipes reference them', () => {
    const data = {
      pipes: [{ id: 'P1', node1: 'J1', node2: 'J2' }],
    }
    const result = validateReferentialIntegrity(data)
    expect(result.warnings.length).toBeGreaterThan(0)
  })
})

describe('filterRowsWithMissingRefs', () => {
  it('separates valid and invalid rows', () => {
    const nodeIds = new Set(['J1', 'J2'])
    const rows = [
      { node1: 'J1', node2: 'J2' },
      { node1: 'J1', node2: 'J99' },
      { node1: 'J2', node2: 'J1' },
    ]
    const { valid, invalid } = filterRowsWithMissingRefs(rows, nodeIds)
    expect(valid.length).toBe(2)
    expect(invalid.length).toBe(1)
    expect(invalid[0].row.node2).toBe('J99')
  })
})
