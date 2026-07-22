import { describe, it, expect } from 'vitest'
import { generateInp, generateSummary } from '../inpGenerator.js'

describe('generateInp', () => {
  it('generates a valid EPANET .inp file with junctions and pipes', () => {
    const data = {
      junctions: [
        { id: 'J1', elevation: 100, demand: 1.5, x: 0, y: 0 },
        { id: 'J2', elevation: 95, demand: 0, x: 100, y: 0 },
      ],
      pipes: [
        { id: 'P1', node1: 'J1', node2: 'J2', length: 100, diameter: 200, roughness: 140 },
      ],
      coordinates: [
        { id: 'J1', x: 0, y: 0 },
        { id: 'J2', x: 100, y: 0 },
      ],
    }
    const result = generateInp(data)
    expect(result.content).toContain('[TITLE]')
    expect(result.content).toContain('[JUNCTIONS]')
    expect(result.content).toContain('[PIPES]')
    expect(result.content).toContain('[COORDINATES]')
    expect(result.content).toContain('[END]')
    expect(result.stats.junctions).toBe(2)
    expect(result.stats.pipes).toBe(1)
  })

  it('includes empty required sections', () => {
    const result = generateInp({ junctions: [], pipes: [] })
    expect(result.content).toContain('[OPTIONS]')
    expect(result.content).toContain('[TIMES]')
    expect(result.content).toContain('[REPORT]')
    expect(result.content).toContain('[CONTROLS]')
  })

  it('generates reservoirs and tanks when provided', () => {
    const data = {
      junctions: [{ id: 'J1', elevation: 100 }],
      reservoirs: [{ id: 'R1', head: 150 }],
      tanks: [{ id: 'T1', elevation: 50, initLevel: 10, minLevel: 2, maxLevel: 20, diameter: 10 }],
      pipes: [],
    }
    const result = generateInp(data)
    expect(result.content).toContain('[RESERVOIRS]')
    expect(result.content).toContain('[TANKS]')
    expect(result.stats.reservoirs).toBe(1)
    expect(result.stats.tanks).toBe(1)
  })

  it('generates pumps and valves when provided', () => {
    const data = {
      junctions: [{ id: 'J1' }, { id: 'J2' }],
      pumps: [{ id: 'PU1', node1: 'J1', node2: 'J2', curve: 'C1' }],
      valves: [{ id: 'V1', node1: 'J1', node2: 'J2', diameter: 200, type: 'PRV', setting: 50 }],
      pipes: [],
    }
    const result = generateInp(data)
    expect(result.content).toContain('[PUMPS]')
    expect(result.content).toContain('[VALVES]')
    expect(result.stats.pumps).toBe(1)
    expect(result.stats.valves).toBe(1)
  })

  it('validates referential integrity', () => {
    const data = {
      junctions: [{ id: 'J1' }],
      pipes: [{ id: 'P1', node1: 'J1', node2: 'J99' }],
    }
    const result = generateInp(data)
    expect(result.validation.errors.length).toBeGreaterThan(0)
    expect(result.validation.errors[0].type).toBe('missing_ref')
  })

  it('formats numbers correctly', () => {
    const data = {
      junctions: [{ id: 'J1', elevation: 100.123456, demand: 1.5 }],
      pipes: [],
    }
    const result = generateInp(data)
    expect(result.content).toContain('100.123')
    expect(result.content).toContain('1.500000')
  })
})

describe('generateSummary', () => {
  it('generates a human-readable summary', () => {
    const result = generateInp({
      junctions: [{ id: 'J1' }, { id: 'J2' }],
      pipes: [{ id: 'P1', node1: 'J1', node2: 'J2', length: 100, diameter: 200 }],
    })
    const summary = generateSummary(result)
    expect(summary).toContain('Junctions:  2')
    expect(summary).toContain('Pipes:      1')
    expect(summary).toContain('No referential integrity errors')
  })
})
