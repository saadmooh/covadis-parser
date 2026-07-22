import { validateReferentialIntegrity } from './referentialValidator.js'

function fmtCoord(v) {
  return Number(v || 0).toFixed(3)
}

function fmtNum(v, decimals = 4) {
  return Number(v || 0).toFixed(decimals)
}

function fmtLine(parts) {
  return parts.join('\t')
}

export function generateInp(mappedData) {
  const {
    junctions = [],
    reservoirs = [],
    tanks = [],
    pipes = [],
    pumps = [],
    valves = [],
    patterns = [],
    curves = [],
    coordinates = [],
    options = {},
    times = {},
    controls = [],
    status = [],
    title = 'Generated from CSV',
  } = mappedData

  const allNodes = {}
  for (const j of junctions) allNodes[j.id] = true
  for (const r of reservoirs) allNodes[r.id] = true
  for (const t of tanks) allNodes[t.id] = true

  const validation = validateReferentialIntegrity({ junctions, reservoirs, tanks, pipes, pumps, valves })

  const coordMap = {}
  for (const c of coordinates) coordMap[c.id] = { x: Number(c.x), y: Number(c.y) }
  for (const j of junctions) {
    if (!coordMap[j.id] && j.x !== undefined) coordMap[j.id] = { x: Number(j.x), y: Number(j.y) }
  }

  const sections = []

  sections.push('[TITLE]')
  sections.push(title)
  sections.push('')

  sections.push('[OPTIONS]')
  if (Object.keys(options).length > 0) {
    for (const [key, value] of Object.entries(options)) {
      sections.push(`${key}\t\t${value}`)
    }
  } else {
    sections.push('Flow\t\tUnits\t\tLPS')
    sections.push('Headloss\tHazen-Williams')
    sections.push('Hydraul\t\tNone')
    sections.push('Quality\t\tNone')
  }
  sections.push('')

  sections.push('[JUNCTIONS]')
  sections.push(';ID\tElevation\tDemand\tPattern')
  for (const j of junctions) {
    sections.push(fmtLine([
      j.id,
      fmtNum(j.elevation, 3),
      fmtNum(j.demand || 0, 6),
      j.pattern || '',
    ]))
  }
  sections.push('')

  if (reservoirs.length > 0) {
    sections.push('[RESERVOIRS]')
    sections.push(';ID\tHead\tPattern')
    for (const r of reservoirs) {
      sections.push(fmtLine([
        r.id,
        fmtNum(r.head, 3),
        r.pattern || '',
      ]))
    }
    sections.push('')
  }

  if (tanks.length > 0) {
    sections.push('[TANKS]')
    sections.push(';ID\tElevation\tInitLevel\tMinLevel\tMaxLevel\tDiameter\tMinVol\tVolCurve')
    for (const t of tanks) {
      sections.push(fmtLine([
        t.id,
        fmtNum(t.elevation, 3),
        fmtNum(t.initLevel, 3),
        fmtNum(t.minLevel, 3),
        fmtNum(t.maxLevel, 3),
        fmtNum(t.diameter, 3),
        fmtNum(t.minVol || 0, 3),
        t.volCurve || '',
      ]))
    }
    sections.push('')
  }

  sections.push('[PIPES]')
  sections.push(';ID\tNode1\tNode2\tLength\tDiameter\tRoughness\tMinorLoss\tStatus')
  for (const p of pipes) {
    sections.push(fmtLine([
      p.id,
      p.node1,
      p.node2,
      fmtNum(p.length, 4),
      fmtNum(p.diameter, 1),
      fmtNum(p.roughness || 140, 1),
      fmtNum(p.minorLoss || 0, 4),
      p.status || 'Open',
    ]))
  }
  sections.push('')

  if (pumps.length > 0) {
    sections.push('[PUMPS]')
    sections.push(';ID\tNode1\tNode2\tParameters\tCurve/Pattern')
    for (const p of pumps) {
      const params = p.parameters || ''
      const curveRef = p.curve || ''
      const patternRef = p.pattern || ''
      sections.push(fmtLine([
        p.id,
        p.node1,
        p.node2,
        params,
        curveRef || patternRef,
      ]))
    }
    sections.push('')
  }

  if (valves.length > 0) {
    sections.push('[VALVES]')
    sections.push(';ID\tNode1\tNode2\tDiameter\tType\tSetting\tMinorLoss')
    for (const v of valves) {
      sections.push(fmtLine([
        v.id,
        v.node1,
        v.node2,
        fmtNum(v.diameter, 1),
        v.type || 'PRV',
        fmtNum(v.setting || 0, 1),
        fmtNum(v.minorLoss || 0, 4),
      ]))
    }
    sections.push('')
  }

  if (patterns.length > 0) {
    sections.push('[PATTERNS]')
    sections.push(';ID\tFactor1\tFactor2\t...')
    for (const pat of patterns) {
      const factors = pat.factors || []
      sections.push(fmtLine([pat.id, ...factors.map(f => fmtNum(f, 6))]))
    }
    sections.push('')
  }

  if (curves.length > 0) {
    sections.push('[CURVES]')
    sections.push(';ID\tX-Value\tY-Value')
    for (const c of curves) {
      sections.push(fmtLine([c.id, fmtNum(c.x, 4), fmtNum(c.y, 4)]))
    }
    sections.push('')
  }

  if (Object.keys(coordMap).length > 0) {
    sections.push('[COORDINATES]')
    sections.push(';Node\tX\tY')
    for (const [id, { x, y }] of Object.entries(coordMap)) {
      sections.push(fmtLine([id, fmtCoord(x), fmtCoord(y)]))
    }
    sections.push('')
  }

  if (controls.length > 0) {
    sections.push('[CONTROLS]')
    for (const c of controls) {
      sections.push(c)
    }
    sections.push('')
  } else {
    sections.push('[CONTROLS]')
    sections.push('')
  }

  if (status.length > 0) {
    sections.push('[STATUS]')
    sections.push(';ID\tStatus')
    for (const s of status) {
      sections.push(fmtLine([s.id, s.status || '']))
    }
    sections.push('')
  }

  sections.push('[TIMES]')
  if (Object.keys(times).length > 0) {
    for (const [key, value] of Object.entries(times)) {
      sections.push(`${key}\t\t\t${value}`)
    }
  } else {
    sections.push('Duration\t\t\t0')
    sections.push('Hydraulic Timestep\t\t1:00')
    sections.push('Quality Timestep\t\t0:05')
    sections.push('Pattern Timestep\t\t1:00')
    sections.push('Pattern Start\t\t\t0:00')
    sections.push('Report Start\t\t\t0:00')
    sections.push('Statistics\t\t\tNone')
  }
  sections.push('')

  sections.push('[REPORT]')
  sections.push('Status\t\tNone')
  sections.push('Summary\t\tNo')
  sections.push('')

  sections.push('[END]')
  sections.push('')

  return {
    content: sections.join('\n'),
    validation,
    stats: {
      junctions: junctions.length,
      reservoirs: reservoirs.length,
      tanks: tanks.length,
      pipes: pipes.length,
      pumps: pumps.length,
      valves: valves.length,
      patterns: patterns.length,
      curves: curves.length,
    },
  }
}

export function generateSummary(result) {
  const lines = []
  lines.push('=== INP Generation Summary ===')
  lines.push('')
  lines.push('Element counts:')
  lines.push(`  Junctions:  ${result.stats.junctions}`)
  lines.push(`  Reservoirs: ${result.stats.reservoirs}`)
  lines.push(`  Tanks:      ${result.stats.tanks}`)
  lines.push(`  Pipes:      ${result.stats.pipes}`)
  lines.push(`  Pumps:      ${result.stats.pumps}`)
  lines.push(`  Valves:     ${result.stats.valves}`)
  lines.push(`  Patterns:   ${result.stats.patterns}`)
  lines.push(`  Curves:     ${result.stats.curves}`)
  lines.push('')

  if (result.validation.errors.length > 0) {
    lines.push(`Errors (${result.validation.errors.length}):`)
    for (const e of result.validation.errors) {
      lines.push(`  - ${e.message}`)
    }
  } else {
    lines.push('No referential integrity errors found.')
  }

  if (result.validation.warnings.length > 0) {
    lines.push('')
    lines.push(`Warnings (${result.validation.warnings.length}):`)
    for (const w of result.validation.warnings) {
      lines.push(`  - ${w.message}`)
    }
  }

  return lines.join('\n')
}
