import { describe, it, expect } from 'vitest'
import { parseCsvText, detectTableType, isMultiSectionCsv, parseMultiSectionCsv, isJunkColumn, parseLabelsField, detectDiscriminatorColumn, suggestFieldForColumn, suggestMappingsForType } from '../csvAutoDetector.js'

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

describe('isMultiSectionCsv', () => {
  it('detects multi-section CSV format', () => {
    const csv = `Section,col1,col2,col3
JUNCTIONS,J1,100,1.5
JUNCTIONS,J2,200,2.3
PIPES,P1,J1,J2,100,200,140`
    expect(isMultiSectionCsv(csv)).toBe(true)
  })

  it('returns false for single-section CSV', () => {
    const csv = `id,elevation,demand
J1,100,1.5
J2,200,2.3`
    expect(isMultiSectionCsv(csv)).toBe(false)
  })
})

describe('parseMultiSectionCsv', () => {
  it('parses junctions and pipes from multi-section CSV', () => {
    const csv = `Section,col1,col2,col3,col4,col5,col6,col7
JUNCTIONS,J1,100,1.5,DMA1_pat
JUNCTIONS,J2,200,0,DMA1_pat
PIPES,P1,J1,J2,100,200,140,Open
COORDINATES,J1,500000,4500000
COORDINATES,J2,500100,4500000`
    const result = parseMultiSectionCsv(csv)
    expect(result.junctions.length).toBe(2)
    expect(result.junctions[0].id).toBe('J1')
    expect(result.junctions[0].elevation).toBe(100)
    expect(result.pipes.length).toBe(1)
    expect(result.pipes[0].node1).toBe('J1')
    expect(result.coordinates.length).toBe(2)
  })

  it('parses valves and pumps', () => {
    const csv = `Section,col1,col2,col3,col4,col5,col6,col7,col8
JUNCTIONS,J1,50,0
JUNCTIONS,J2,60,0
PIPES,P1,J1,J2,100,200,140,Open
PUMPS,PU1,J1,J2,HEAD 8
VALVES,V1,J1,J2,200,PRV,40,0`
    const result = parseMultiSectionCsv(csv)
    expect(result.pumps.length).toBe(1)
    expect(result.pumps[0].id).toBe('PU1')
    expect(result.valves.length).toBe(1)
    expect(result.valves[0].type).toBe('PRV')
  })

  it('parses patterns and curves', () => {
    const csv = `Section,col1,col2,col3,col4,col5
PATTERNS,DMA1_pat,0.5,0.6,0.7
PATTERNS,DMA1_pat,0.8,0.9,1.0
CURVES,C1,10,100
CURVES,C1,20,200`
    const result = parseMultiSectionCsv(csv)
    expect(result.patterns.length).toBe(2)
    expect(result.patterns[0].id).toBe('DMA1_pat')
    expect(result.curves.length).toBe(2)
  })
})

describe('isJunkColumn', () => {
  it('detects columns with only semicolons', () => {
    const rows = [{ ';': ';' }, { ';': ';' }, { ';': ';' }, { ';': ';' }]
    expect(isJunkColumn(rows, ';')).toBe(true)
  })

  it('does not flag normal data columns', () => {
    const rows = [{ id: 'J1' }, { id: 'J2' }, { id: 'J3' }]
    expect(isJunkColumn(rows, 'id')).toBe(false)
  })

  it('detects mostly empty columns', () => {
    const rows = [{ x: '' }, { x: '' }, { x: '' }, { x: 'value' }]
    expect(isJunkColumn(rows, 'x')).toBe(false)
  })
})

describe('parseLabelsField', () => {
  it('parses standard LABELS format with anchor', () => {
    const result = parseLabelsField('-245964.09  147727.31  "Source" R1')
    expect(result).toEqual({ x: -245964.09, y: 147727.31, text: 'Source', anchorId: 'R1' })
  })

  it('parses LABELS without anchor', () => {
    const result = parseLabelsField('100 200 "Hello World"')
    expect(result).toEqual({ x: 100, y: 200, text: 'Hello World', anchorId: null })
  })

  it('parses LABELS with single quotes', () => {
    const result = parseLabelsField('100 200 Label')
    expect(result).toEqual({ x: 100, y: 200, text: 'Label', anchorId: null })
  })

  it('returns null for unparseable strings', () => {
    expect(parseLabelsField('not a label')).toBeNull()
    expect(parseLabelsField('')).toBeNull()
    expect(parseLabelsField(null)).toBeNull()
  })
})

describe('detectDiscriminatorColumn', () => {
  it('finds Section column with EPANET section names', () => {
    const headers = ['Section', 'col1', 'col2']
    const rows = [
      { Section: 'JUNCTIONS', col1: 'J1', col2: '100' },
      { Section: 'PIPES', col1: 'P1', col2: 'J1' },
      { Section: 'JUNCTIONS', col1: 'J2', col2: '200' },
      { Section: 'PIPES', col1: 'P2', col2: 'J2' },
    ]
    const result = detectDiscriminatorColumn(headers, rows)
    expect(result).not.toBeNull()
    expect(result.header).toBe('Section')
  })

  it('returns null for non-discriminator columns', () => {
    const headers = ['id', 'name', 'value']
    const rows = [
      { id: '1', name: 'foo', value: '100' },
      { id: '2', name: 'bar', value: '200' },
    ]
    expect(detectDiscriminatorColumn(headers, rows)).toBeNull()
  })
})

describe('multi-section with junk columns', () => {
  it('identifies junk columns and excludes them', () => {
    const csv = `Section,col1,col2,col3,col4
JUNCTIONS,J1,100,1.5,;
JUNCTIONS,J2,200,0,;
PIPES,P1,J1,J2,;
COORDINATES,J1,500000,4500000,;`
    const result = parseMultiSectionCsv(csv)
    expect(result.junctions.length).toBe(2)
    expect(result.pipes.length).toBe(1)
    expect(result.junkColumns).toContain('col4')
  })
})

describe('multi-section with LABELS', () => {
  it('parses LABELS section', () => {
    const csv = `Section,col1,col2,col3,col4
LABELS,100,200,"Source" R1,
LABELS,300,400,"Tank" T1,`
    const result = parseMultiSectionCsv(csv)
    expect(result.labels.length).toBe(2)
    expect(result.labels[0].text).toBe('Source')
    expect(result.labels[0].anchorId).toBe('R1')
  })
})

describe('suggestFieldForColumn', () => {
  it('suggests correct field for pipe data', () => {
    const rows = [
      { id: 'P1', from: 'J1', to: 'J2', len: '100', diam: '200', roughn: '140' },
      { id: 'P2', from: 'J2', to: 'J3', len: '200', diam: '150', roughn: '130' },
    ]
    const r1 = suggestFieldForColumn('diam', rows, 'PIPES')
    expect(r1.field).toBe('diameter')
    const r2 = suggestFieldForColumn('from', rows, 'PIPES')
    expect(r2.field).toBe('node1')
    const r3 = suggestFieldForColumn('roughn', rows, 'PIPES')
    expect(r3.field).toBe('roughness')
  })

  it('suggests correct field for junction data', () => {
    const rows = [
      { id: 'J1', elev: '100', dem: '1.5', pat: 'DMA1' },
      { id: 'J2', elev: '200', dem: '0', pat: 'DMA1' },
    ]
    const r = suggestFieldForColumn('elev', rows, 'JUNCTIONS')
    expect(r.field).toBe('elevation')
  })

  it('returns null for unrecognized columns', () => {
    const rows = [{ xyzabc: 'bar' }]
    const r = suggestFieldForColumn('xyzabc', rows, 'PIPES')
    expect(r.field).toBeNull()
  })
})

describe('suggestMappingsForType', () => {
  it('returns suggestions for all headers', () => {
    const headers = ['id', 'from', 'to', 'len', 'diam']
    const rows = [
      { id: 'P1', from: 'J1', to: 'J2', len: '100', diam: '200' },
    ]
    const result = suggestMappingsForType(headers, rows, 'PIPES')
    expect(result.length).toBe(5)
    const idSuggestion = result.find(r => r.header === 'id')
    expect(idSuggestion.field).toBe('id')
    const diamSuggestion = result.find(r => r.header === 'diam')
    expect(diamSuggestion.field).toBe('diameter')
  })

  it('handles type switch correctly', () => {
    const headers = ['id', 'from', 'to', 'pipe_length', 'diam']
    const rows = [
      { id: 'P1', from: 'J1', to: 'J2', pipe_length: '100', diam: '200' },
    ]
    const pipes = suggestMappingsForType(headers, rows, 'PIPES')
    const valves = suggestMappingsForType(headers, rows, 'VALVES')
    expect(pipes.find(r => r.header === 'pipe_length')?.field).toBe('length')
    expect(valves.find(r => r.header === 'pipe_length')?.field).toBeNull()
  })
})
