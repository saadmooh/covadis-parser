const ARABIC_DIACRITICS = /[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06DC\u06DF-\u06E4\u06E7\u06E8\u06EA-\u06ED]/g

const ARABIC_NORMALIZE_MAP = {
  '\u0623': '\u0627',
  '\u0625': '\u0627',
  '\u0622': '\u0627',
  '\u0629': '\u0647',
  '\u0649': '\u064A',
  '\u064A': '\u064A',
  '\u0621': '\u0647',
}

const UNIT_PATTERN = /[_\s]*(mm|m|cm|ft|inch|in|pi|metres?|meters?|pieds?|pouce|بوصة|قدم|متر|ملم)$/i

export function normalizeText(text) {
  if (!text) return ''
  let t = String(text).trim().toLowerCase()
  t = t.replace(ARABIC_DIACRITICS, '')
  for (const [from, to] of Object.entries(ARABIC_NORMALIZE_MAP)) {
    t = t.split(from).join(to)
  }
  t = t.replace(/[_\-\s]+/g, '')
  t = t.replace(/[.,;:!?'"()/\\@#$%^&*+=<>~`|{}[\]]/g, '')
  return t
}

export function normalizeHeader(header) {
  if (!header) return ''
  let t = normalizeText(header)
  t = t.replace(UNIT_PATTERN, '')
  return t
}

export function normalizeValue(val) {
  if (val === null || val === undefined || val === '') return null
  const s = String(val).trim()
  if (/^(null|none|nan|n\/a|n\/|\/|-+)$/i.test(s)) return null
  const cleaned = s.replace(/[,\s]/g, '').replace(/["']/g, '')
  const num = Number(cleaned)
  if (!isNaN(num) && cleaned !== '') return num
  return s
}

export function isNumericColumn(values) {
  let numericCount = 0
  let total = 0
  for (const v of values) {
    if (v === null || v === undefined || v === '') continue
    total++
    const n = Number(String(v).replace(/[,\s]/g, ''))
    if (!isNaN(n)) numericCount++
  }
  return total > 0 && (numericCount / total) > 0.7
}

export function getColumnStats(values) {
  const nonNull = values.filter(v => v !== null && v !== undefined && v !== '')
  const numeric = nonNull.map(v => Number(String(v).replace(/[,\s]/g, ''))).filter(n => !isNaN(n))
  const uniqueVals = new Set(nonNull.map(String))
  const categorical = nonNull.every(v => {
    const s = String(v).toLowerCase()
    return /^(open|closed|cv|fsv|gpv|pbv|tcv|prv|psv|fcv|pump|Yes|No|oui|non)$/i.test(s)
  })

  return {
    total: nonNull.length,
    unique: uniqueVals.size,
    numericCount: numeric.length,
    numericRatio: nonNull.length > 0 ? numeric.length / nonNull.length : 0,
    min: numeric.length > 0 ? Math.min(...numeric) : null,
    max: numeric.length > 0 ? Math.max(...numeric) : null,
    mean: numeric.length > 0 ? numeric.reduce((a, b) => a + b, 0) / numeric.length : null,
    uniqueness: nonNull.length > 0 ? uniqueVals.size / nonNull.length : 0,
    categorical,
    categoricalValues: categorical ? [...new Set(nonNull.map(v => String(v).toLowerCase()))] : [],
  }
}
