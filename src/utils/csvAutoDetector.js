import { EPANET_SCHEMA, getRequiredFields, getAllFields } from './schemaDictionary.js'
import { normalizeHeader, normalizeValue, getColumnStats } from './csvNormalizer.js'
import { matchColumnToFields } from './fuzzyMatcher.js'

const DETECTABLE_SECTIONS = ['JUNCTIONS', 'RESERVOIRS', 'TANKS', 'PIPES', 'PUMPS', 'VALVES', 'PATTERNS', 'CURVES']

const SECTION_FIELD_MAP = {
  JUNCTIONS: ['id', 'elevation', 'demand', 'pattern'],
  RESERVOIRS: ['id', 'head', 'pattern'],
  TANKS: ['id', 'elevation', 'initLevel', 'minLevel', 'maxLevel', 'diameter', 'minVol', 'volCurve'],
  PIPES: ['id', 'node1', 'node2', 'length', 'diameter', 'roughness', 'minorLoss', 'status'],
  PUMPS: ['id', 'node1', 'node2', 'parameters'],
  VALVES: ['id', 'node1', 'node2', 'diameter', 'type', 'setting', 'minorLoss'],
  PATTERNS: ['id', 'factors'],
  CURVES: ['id', 'x', 'y'],
  COORDINATES: ['id', 'x', 'y'],
  OPTIONS: ['key', 'value'],
  TIMES: ['key', 'value'],
  STATUS: ['id', 'status'],
  CONTROLS: ['text'],
  TAGS: ['id', 'tag'],
  LABELS: ['text'],
  ENERGY: ['key', 'value'],
  REACTIONS: ['key', 'value'],
  REPORT: ['key', 'value'],
  BACKDROP: [],
}

export function parseCsvText(text) {
  const clean = text.replace(/^\uFEFF/, '')
  const lines = clean.split(/\r?\n/).filter(l => l.trim())
  if (lines.length < 2) return null
  const delimiter = detectDelimiter(lines[0])
  const headers = lines[0].split(delimiter).map(h => h.trim())
  const rows = []
  for (let i = 1; i < lines.length; i++) {
    const vals = lines[i].split(delimiter).map(v => v.trim())
    const row = {}
    headers.forEach((h, idx) => { row[h] = vals[idx] || '' })
    rows.push(row)
  }
  return { headers, rows, delimiter }
}

export function isMultiSectionCsv(text) {
  const clean = text.replace(/^\uFEFF/, '')
  const lines = clean.split(/\r?\n/).filter(l => l.trim())
  if (lines.length < 2) return false
  const delimiter = detectDelimiter(lines[0])
  const headers = lines[0].split(delimiter).map(h => h.trim().toLowerCase().replace(/^\uFEFF/, ''))
  const firstHeader = headers[0]
  if (firstHeader !== 'section' && firstHeader !== 'type' && firstHeader !== 'categorie') return false
  const sectionCounts = {}
  const step = Math.max(1, Math.floor(lines.length / 200))
  for (let i = 1; i < lines.length; i += step) {
    const vals = lines[i].split(delimiter)
    const section = (vals[0] || '').trim().toUpperCase()
    sectionCounts[section] = (sectionCounts[section] || 0) + 1
  }
  const ALL_SECTIONS = [...DETECTABLE_SECTIONS, 'COORDINATES', 'OPTIONS', 'TIMES', 'STATUS', 'CONTROLS', 'TAGS', 'LABELS', 'ENERGY', 'REACTIONS', 'REPORT', 'BACKDROP']
  const knownSections = Object.keys(sectionCounts).filter(s => ALL_SECTIONS.includes(s))
  return knownSections.length >= 2
}

export function parseMultiSectionCsv(text) {
  const clean = text.replace(/^\uFEFF/, '')
  const lines = clean.split(/\r?\n/).filter(l => l.trim())
  if (lines.length < 2) return null
  const delimiter = detectDelimiter(lines[0])
  const headers = lines[0].split(delimiter).map(h => h.trim())

  const sectionRows = {}
  for (let i = 1; i < lines.length; i++) {
    const vals = lines[i].split(delimiter).map(v => v.trim())
    const section = (vals[0] || '').toUpperCase()
    if (!section) continue
    if (!sectionRows[section]) sectionRows[section] = []
    const row = {}
    headers.forEach((h, idx) => { row[h] = vals[idx] || '' })
    sectionRows[section].push(row)
  }

  const result = {
    junctions: [], reservoirs: [], tanks: [], pipes: [], pumps: [],
    valves: [], patterns: [], curves: [], coordinates: [],
    options: {}, times: {}, status: [], controls: [],
    tags: [], labels: [], reactions: [], report: [],
  }

  const fieldMap = SECTION_FIELD_MAP

  for (const [section, rows] of Object.entries(sectionRows)) {
    const fields = fieldMap[section]
    if (!fields) continue

    if (section === 'OPTIONS' || section === 'TIMES' || section === 'ENERGY' || section === 'REACTIONS' || section === 'REPORT') {
      for (const row of rows) {
        const vals = extractColValues(row, headers)
        if (vals.length >= 2 && vals[0]) {
          if (section === 'OPTIONS') result.options[vals[0]] = vals[1]
          else if (section === 'TIMES') result.times[vals[0]] = vals[1]
        }
      }
      continue
    }

    if (section === 'CONTROLS') {
      for (const row of rows) {
        const vals = extractColValues(row, headers)
        const text = vals.filter(v => v && v !== ';').join(',').trim()
        if (text) result.controls.push(text)
      }
      continue
    }

    for (const row of rows) {
      const vals = extractColValues(row, headers)
      const obj = {}
      fields.forEach((f, i) => {
        if (f === 'factors') {
          obj[f] = vals.slice(1).filter(v => v && v !== ';').map(Number).filter(n => !isNaN(n))
        } else {
          const v = vals[i] || ''
          obj[f] = isNaN(Number(v)) || v === '' ? v : Number(v)
        }
      })

      if (section === 'JUNCTIONS') result.junctions.push(obj)
      else if (section === 'RESERVOIRS') result.reservoirs.push(obj)
      else if (section === 'TANKS') result.tanks.push(obj)
      else if (section === 'PIPES') result.pipes.push(obj)
      else if (section === 'PUMPS') result.pumps.push(obj)
      else if (section === 'VALVES') result.valves.push(obj)
      else if (section === 'PATTERNS') result.patterns.push(obj)
      else if (section === 'CURVES') result.curves.push(obj)
      else if (section === 'COORDINATES') result.coordinates.push(obj)
      else if (section === 'STATUS') result.status.push(obj)
      else if (section === 'TAGS') result.tags.push(obj)
    }
  }

  return result
}

function extractColValues(row, headers) {
  return headers.slice(1).map(h => (row[h] || '').replace(/^;.*$/, '').trim())
}

function detectDelimiter(headerLine) {
  const counts = { ',': 0, '\t': 0, ';': 0, '|': 0 }
  for (const ch of headerLine) {
    if (ch in counts) counts[ch]++
  }
  const max = Math.max(...Object.values(counts))
  if (max === 0) return ','
  return Object.entries(counts).find(([, v]) => v === max)[0]
}

function collectColumnValues(rows, header) {
  return rows.map(r => normalizeValue(r[header]))
}

function fingerprintColumn(colValues, header) {
  const stats = getColumnStats(colValues)
  const norm = normalizeHeader(header)
  let fingerprintHints = []

  if (stats.uniqueness > 0.95 && stats.numericRatio < 0.5) {
    fingerprintHints.push({ field: 'id', reason: 'unique_non_numeric', strength: 0.8 })
  }

  if (stats.numericRatio > 0.7) {
    if (stats.min !== null && stats.min >= 0 && stats.max <= 1 && stats.mean < 0.5) {
      fingerprintHints.push({ field: 'demand', reason: 'small_non_negative_0_1', strength: 0.5 })
      fingerprintHints.push({ field: 'pattern_multiplier', reason: 'multiplier_range', strength: 0.4 })
    }
    if (stats.min !== null && stats.min >= -100 && stats.max <= 200 && stats.mean > 20) {
      fingerprintHints.push({ field: 'roughness', reason: 'roughness_range', strength: 0.4 })
      fingerprintHints.push({ field: 'elevation', reason: 'elevation_range', strength: 0.3 })
    }
    if (stats.min !== null && stats.min >= 10 && stats.max <= 3000 && stats.mean > 50) {
      fingerprintHints.push({ field: 'diameter', reason: 'pipe_diameter_range', strength: 0.5 })
    }
    if (stats.min !== null && stats.min > 100 && stats.max < 100000) {
      fingerprintHints.push({ field: 'length', reason: 'large_positive_distance', strength: 0.5 })
    }
    if (stats.min !== null && stats.min >= 0 && stats.mean > 500) {
      fingerprintHints.push({ field: 'elevation', reason: 'high_elevation_values', strength: 0.5 })
    }
  }

  if (stats.categorical) {
    fingerprintHints.push({ field: 'status', reason: 'categorical_known_values', strength: 0.6 })
    fingerprintHints.push({ field: 'type', reason: 'categorical_known_values', strength: 0.5 })
  }

  if (/^(x|longitude|lon|x_coord|long|الاحداثي_x|xcoord)$/i.test(norm)) {
    fingerprintHints.push({ field: 'x', reason: 'header_explicit', strength: 0.9 })
    fingerprintHints.push({ field: 'x1', reason: 'header_explicit', strength: 0.6 })
  }
  if (/^(y|latitude|lat|y_coord|lati|الاحداثي_y|ycoord)$/i.test(norm)) {
    fingerprintHints.push({ field: 'y', reason: 'header_explicit', strength: 0.9 })
    fingerprintHints.push({ field: 'y1', reason: 'header_explicit', strength: 0.6 })
  }
  if (/^(x1|x2)$/i.test(norm)) {
    fingerprintHints.push({ field: norm.toLowerCase(), reason: 'header_explicit', strength: 0.8 })
  }
  if (/^(y1|y2)$/i.test(norm)) {
    fingerprintHints.push({ field: norm.toLowerCase(), reason: 'header_explicit', strength: 0.8 })
  }
  if (/^(from|start|node1|upstream|depart|debut|源头|من)$/i.test(norm)) {
    fingerprintHints.push({ field: 'node1', reason: 'header_explicit', strength: 0.8 })
  }
  if (/^(to|end|node2|downstream|arrivee|fin|到|الى)$/i.test(norm)) {
    fingerprintHints.push({ field: 'node2', reason: 'header_explicit', strength: 0.8 })
  }

  return { stats, fingerprintHints }
}

function buildColumnMappings(headers, rows) {
  const mappings = []

  for (const header of headers) {
    const colValues = collectColumnValues(rows, header)
    const sampleValues = colValues.slice(0, 50)
    const fp = fingerprintColumn(sampleValues, header)

    const matchResults = []
    for (const sectionKey of DETECTABLE_SECTIONS) {
      const schema = EPANET_SCHEMA[sectionKey]
      if (!schema?.synonyms) continue

      for (const [field, synonyms] of Object.entries(schema.synonyms)) {
        const match = matchColumnToFields(header, { [field]: synonyms }, 0.3)
        if (match.length > 0 && match[0].score > 0.3) {
          const fpHint = fp.fingerprintHints.find(h => h.field === field)
          const fpBoost = fpHint ? fpHint.strength * 0.3 : 0
          matchResults.push({
            section: sectionKey,
            field,
            nameScore: match[0].score,
            fpBoost,
            combinedScore: match[0].score * 0.6 + fpBoost * 0.4,
            matchedSynonym: match[0].synonym,
            fpHint: fpHint?.reason || null,
          })
        }
      }
    }

    matchResults.sort((a, b) => b.combinedScore - a.combinedScore)
    mappings.push({
      header,
      normalizedName: normalizeHeader(header),
      stats: fp.stats,
      fingerprintHints: fp.fingerprintHints,
      matchResults,
      bestMatch: matchResults[0] || null,
    })
  }

  return mappings
}

function scoreElementForTable(columnMappings, sectionKey) {
  const schema = EPANET_SCHEMA[sectionKey]
  if (!schema) return { score: 0, matchedFields: [], missingRequired: [] }

  const required = getRequiredFields(sectionKey)
  const allFields = getAllFields(sectionKey)
  const matchedFields = []
  const scores = []

  for (const col of columnMappings) {
    const match = col.matchResults.find(m => m.section === sectionKey)
    if (match && match.combinedScore >= 0.4) {
      matchedFields.push({ field: match.field, header: col.header, score: match.combinedScore })
      scores.push(match.combinedScore)
    }
  }

  const requiredMatched = required.filter(f => matchedFields.some(m => m.field === f))
  const requiredRatio = required.length > 0 ? requiredMatched.length / required.length : 0
  const avgScore = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0
  const coverage = allFields.length > 0 ? matchedFields.length / allFields.length : 0

  const requiredCountPenalty = required.length <= 1 ? 0.3 : 0
  const minMatchedPenalty = matchedFields.length < 2 ? 0.2 : 0
  const rawScore = requiredRatio * 0.45 + avgScore * 0.35 + coverage * 0.2
  const score = Math.max(0, rawScore - requiredCountPenalty - minMatchedPenalty)
  const missingRequired = required.filter(f => !matchedFields.some(m => m.field === f))

  return { score, matchedFields, missingRequired, requiredRatio, avgScore, coverage }
}

export function detectTableType(headers, rows) {
  const columnMappings = buildColumnMappings(headers, rows)

  const scored = []
  for (const sectionKey of DETECTABLE_SECTIONS) {
    const result = scoreElementForTable(columnMappings, sectionKey)
    if (result.score > 0.1) {
      scored.push({ section: sectionKey, ...result })
    }
  }

  scored.sort((a, b) => b.score - a.score)

  let ambiguous = false
  if (scored.length >= 2) {
    const diff = scored[0].score - scored[1].score
    if (diff < 0.15) ambiguous = true
  }

  const bestType = scored.length > 0 ? scored[0] : null
  const confidence = bestType ? bestType.score : 0

  const fieldMappings = []
  for (const col of columnMappings) {
    const bestMatch = col.bestMatch
    const sectionMatch = bestType ? col.matchResults.find(m => m.section === bestType.section) : null
    fieldMappings.push({
      header: col.header,
      suggestedField: sectionMatch?.field || bestMatch?.field || null,
      suggestedSection: sectionMatch?.section || bestMatch?.section || null,
      score: sectionMatch?.combinedScore || bestMatch?.combinedScore || 0,
      matchedSynonym: sectionMatch?.matchedSynonym || bestMatch?.matchedSynonym || null,
      fpHint: sectionMatch?.fpHint || bestMatch?.fpHint || null,
      isUnique: col.stats?.uniqueness > 0.95,
      isCategorical: col.stats?.categorical,
      isNumeric: col.stats?.numericRatio > 0.7,
    })
  }

  return {
    detectedType: bestType?.section || null,
    confidence,
    ambiguous,
    alternatives: scored,
    fieldMappings,
    columnMappings,
    scores: scored,
  }
}

export function detectAllTables(files) {
  const results = []
  for (const file of files) {
    const parsed = parseCsvText(file.content)
    if (!parsed) {
      results.push({ file: file.name, error: 'File too short or empty' })
      continue
    }
    const detection = detectTableType(parsed.headers, parsed.rows)
    results.push({
      file: file.name,
      ...detection,
      parsed,
      rowCount: parsed.rows.length,
      colCount: parsed.headers.length,
    })
  }
  return results
}
