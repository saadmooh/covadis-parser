import { describe, it, expect } from 'vitest'
import { parseCsvText, detectTableType } from '../csvAutoDetector.js'

describe('parseCsvText', () => {
  it('parses a standard CSV', () => {
    const csv = 'id,elevation,demand\nJ1,100,1.5\nJ2,200,2.3'
    const result = parseCsvText(csv)
    expect(result).not.toBeNull()
    expect(result.headers).toEqual(['id', 'elevation', 'demand'])
    expect(result.rows.length).toBe(2)
  })

  it('detects tab delimiter', () => {
    const csv = 'id\televation\tdemand\nJ1\t100\t1.5'
    const result = parseCsvText(csv)
    expect(result).not.toBeNull()
    expect(result.delimiter).toBe('\t')
  })

  it('returns null for single-line CSV', () => {
    const csv = 'id,elevation,demand'
    expect(parseCsvText(csv)).toBeNull()
  })

  it('handles empty lines gracefully', () => {
    const csv = 'id,elevation\nJ1,100\n\nJ2,200\n'
    const result = parseCsvText(csv)
    expect(result.rows.length).toBe(2)
  })
})

describe('detectTableType - Junctions', () => {
  it('detects junctions from standard column names', () => {
    const csv = 'id,elevation,demand\nJ1,73.2,0.16\nJ2,68.3,0.19\nJ3,65.5,0.23'
    const parsed = parseCsvText(csv)
    const result = detectTableType(parsed.headers, parsed.rows)
    expect(result.detectedType).toBe('JUNCTIONS')
    expect(result.confidence).toBeGreaterThan(0.5)
  })

  it('detects junctions with fuzzy column names', () => {
    const csv = 'noeud,alt,consommation\nN1,73.2,0.16\nN2,68.3,0.19'
    const parsed = parseCsvText(csv)
    const result = detectTableType(parsed.headers, parsed.rows)
    expect(result.detectedType).toBe('JUNCTIONS')
    expect(result.confidence).toBeGreaterThan(0.3)
  })
})

describe('detectTableType - Pipes', () => {
  it('detects pipes from standard column names', () => {
    const csv = 'id,node1,node2,length,diameter,roughness\nP1,J1,J2,100,200,140\nP2,J2,J3,150,150,130'
    const parsed = parseCsvText(csv)
    const result = detectTableType(parsed.headers, parsed.rows)
    expect(result.detectedType).toBe('PIPES')
    expect(result.confidence).toBeGreaterThan(0.5)
  })

  it('detects pipes with from/to column names', () => {
    const csv = 'id,from,to,length_m,diam\nP1,1,2,100,200\nP2,2,3,150,150'
    const parsed = parseCsvText(csv)
    const result = detectTableType(parsed.headers, parsed.rows)
    expect(result.detectedType).toBe('PIPES')
  })
})

describe('detectTableType - Valves', () => {
  it('detects valves with type and setting columns', () => {
    const csv = 'id,node1,node2,diameter,type,setting\nV1,J1,J2,200,PRV,50\nV2,J3,J4,150,FCV,30'
    const parsed = parseCsvText(csv)
    const result = detectTableType(parsed.headers, parsed.rows)
    expect(result.detectedType).toBe('VALVES')
  })
})

describe('detectTableType - malformed data', () => {
  it('handles columns with no clear match', () => {
    const csv = 'foo,bar,baz\n1,hello,world\n2,foo,bar'
    const parsed = parseCsvText(csv)
    const result = detectTableType(parsed.headers, parsed.rows)
    expect(result.confidence).toBeLessThan(0.4)
  })

  it('handles ambiguous data between pipes and valves', () => {
    const csv = 'id,node1,node2\nP1,J1,J2\nP2,J2,J3'
    const parsed = parseCsvText(csv)
    const result = detectTableType(parsed.headers, parsed.rows)
    expect(result.detectedType).not.toBeNull()
    expect(result.confidence).toBeGreaterThan(0)
  })
})

describe('detectTableType - data fingerprinting', () => {
  it('detects ID column from uniqueness', () => {
    const csv = 'code,elev,dem\nJ1,100,1\nJ2,200,2\nJ3,300,3'
    const parsed = parseCsvText(csv)
    const result = detectTableType(parsed.headers, parsed.rows)
    const codeMapping = result.fieldMappings.find(f => f.header === 'code')
    expect(codeMapping?.suggestedField).toBe('id')
  })

  it('detects diameter from numeric range and synonym', () => {
    const csv = 'id,n1,n2,len,diam\nP1,J1,J2,100,200\nP2,J2,J3,200,150\nP3,J3,J4,300,300'
    const parsed = parseCsvText(csv)
    const result = detectTableType(parsed.headers, parsed.rows)
    const dMapping = result.fieldMappings.find(f => f.header === 'diam')
    expect(dMapping?.suggestedField).toBe('diameter')
  })
})

describe('detectTableType - ambiguous cases', () => {
  it('marks as ambiguous when top two scores are close', () => {
    const csv = 'id,n1,n2\nP1,J1,J2\nP2,J2,J3'
    const parsed = parseCsvText(csv)
    const result = detectTableType(parsed.headers, parsed.rows)
    if (result.scores.length >= 2) {
      const diff = result.scores[0].score - result.scores[1].score
      if (diff < 0.15) {
        expect(result.ambiguous).toBe(true)
      }
    }
  })
})
