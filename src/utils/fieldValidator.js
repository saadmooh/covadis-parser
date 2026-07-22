export const FIELD_VALIDATION_RULES = {
  id: {
    dataType: 'text',
    mustBeUnique: true,
    nullable: false,
    maxLength: 31,
  },
  elevation: {
    dataType: 'numeric',
    range: { min: -500, max: 9000 },
    allowNegative: true,
    nullable: false,
  },
  demand: {
    dataType: 'numeric',
    range: { min: -1000, max: 100000 },
    allowNegative: true,
    nullable: true,
    defaultValue: 0,
  },
  head: {
    dataType: 'numeric',
    range: { min: 0, max: 10000 },
    allowNegative: false,
    nullable: false,
  },
  initLevel: {
    dataType: 'numeric',
    range: { min: 0, max: 1000 },
    allowNegative: false,
    nullable: false,
  },
  minLevel: {
    dataType: 'numeric',
    range: { min: 0, max: 1000 },
    allowNegative: false,
    nullable: false,
  },
  maxLevel: {
    dataType: 'numeric',
    range: { min: 0, max: 1000 },
    allowNegative: false,
    nullable: false,
  },
  diameter: {
    dataType: 'numeric',
    range: { min: 1, max: 5000 },
    allowNegative: false,
    nullable: false,
  },
  length: {
    dataType: 'numeric',
    range: { min: 0, max: 100000 },
    allowNegative: false,
    nullable: false,
  },
  roughness: {
    dataType: 'numeric',
    range: { min: 0, max: 200 },
    allowNegative: false,
    nullable: false,
    defaultValue: 140,
  },
  minorLoss: {
    dataType: 'numeric',
    range: { min: 0, max: 100 },
    allowNegative: false,
    nullable: true,
    defaultValue: 0,
  },
  setting: {
    dataType: 'numeric',
    range: { min: 0, max: 100000 },
    allowNegative: false,
    nullable: false,
  },
  x: {
    dataType: 'numeric',
    range: { min: -10000000, max: 10000000 },
    allowNegative: true,
    nullable: false,
  },
  y: {
    dataType: 'numeric',
    range: { min: -10000000, max: 10000000 },
    allowNegative: true,
    nullable: false,
  },
  node1: {
    dataType: 'id_reference',
    mustExistIn: ['JUNCTIONS', 'RESERVOIRS', 'TANKS'],
    nullable: false,
  },
  node2: {
    dataType: 'id_reference',
    mustExistIn: ['JUNCTIONS', 'RESERVOIRS', 'TANKS'],
    nullable: false,
  },
  pattern: {
    dataType: 'id_reference',
    mustExistIn: ['PATTERNS'],
    nullable: true,
  },
  curve: {
    dataType: 'id_reference',
    mustExistIn: ['CURVES'],
    nullable: true,
  },
  volCurve: {
    dataType: 'id_reference',
    mustExistIn: ['CURVES'],
    nullable: true,
  },
  status: {
    dataType: 'categorical',
    allowedValues: ['OPEN', 'CLOSED', 'CV'],
    caseInsensitive: true,
    nullable: true,
    defaultValue: 'OPEN',
  },
  type: {
    dataType: 'categorical',
    allowedValues: ['PRV', 'PSV', 'PBV', 'FCV', 'TCV', 'GPV'],
    caseInsensitive: true,
    nullable: false,
  },
  objectType: {
    dataType: 'categorical',
    allowedValues: ['NODE', 'LINK'],
    caseInsensitive: true,
    nullable: false,
  },
  tag: {
    dataType: 'text',
    nullable: true,
  },
  parameters: {
    dataType: 'compound',
    compoundPattern: /^(HEAD|POWER|SPEED)\s+/i,
    nullable: true,
  },
  factors: {
    dataType: 'array',
    numeric: true,
    range: { min: 0, max: 10 },
    nullable: false,
  },
}

const DISGUISED_NULLS = new Set([
  '', ' ', 'null', 'n/a', 'na', '-', '--', '---', 'n/a', 'n/a.',
  'non disponible', 'non renseigné', 'inconnu', 'inconnue',
  'غير متوفر', 'غير معروف', 'غير محدد', 'غير معرف', '؟', '?',
  'missing', 'unknown', 'undefined', 'none', 'nil', 'void',
])

export function isDisguisedNull(value) {
  if (value === null || value === undefined) return true
  const s = String(value).trim().toLowerCase()
  return DISGUISED_NULLS.has(s)
}

export function normalizeForValidation(value) {
  if (isDisguisedNull(value)) return null
  const s = String(value).trim()
  const cleaned = s.replace(/[, ]/g, '')
  const num = Number(cleaned)
  if (!isNaN(num) && cleaned !== '') return num
  return s
}

export function validateColumnAssignment(values, field, existingIds) {
  const rule = FIELD_VALIDATION_RULES[field]
  if (!rule) return { errors: [], warnings: [], infos: [], severity: 'ok' }

  const errors = []
  const warnings = []
  const infos = []

  const normalized = values.map((v, i) => ({ original: v, normalized: normalizeForValidation(v), rowIndex: i }))
  const nonNull = normalized.filter(n => n.normalized !== null)
  const nullCount = normalized.length - nonNull.length

  if (!rule.nullable && nullCount > 0) {
    const failedRows = normalized.filter(n => n.normalized === null).map(n => n.rowIndex)
    errors.push({
      message: `${nullCount} من أصل ${values.length} قيمة فارغة في حقل إلزامي`,
      failedRows,
      type: 'nullable',
    })
  }

  if (rule.nullable && nullCount > 0 && rule.defaultValue !== undefined) {
    infos.push({
      message: `${nullCount} قيمة فارغة — ستُستبدل بالقيمة الافتراضية: ${rule.defaultValue}`,
      type: 'default',
    })
  }

  if (rule.dataType === 'numeric' || rule.dataType === 'integer') {
    const nonNumeric = nonNull.filter(n => typeof n.normalized === 'string' || isNaN(n.normalized))
    if (nonNumeric.length > 0) {
      errors.push({
        message: `${nonNumeric.length} قيمة غير رقمية (مثال: "${nonNumeric[0].original}")`,
        failedRows: nonNumeric.map(n => n.rowIndex),
        type: 'type_mismatch',
      })
    } else {
      const numericVals = nonNull.map(n => n.normalized).filter(n => typeof n === 'number')

      if (rule.dataType === 'integer') {
        const nonInteger = nonNull.filter(n => typeof n.normalized === 'number' && !Number.isInteger(n.normalized))
        if (nonInteger.length > 0) {
          warnings.push({
            message: `${nonInteger.length} قيمة تحتوي كسوراً عشرية في حقل يتوقع عدداً صحيحاً`,
            failedRows: nonInteger.map(n => n.rowIndex),
            type: 'non_integer',
          })
        }
      }

      if (rule.range && numericVals.length > 0) {
        const outOfRange = nonNull.filter(n =>
          typeof n.normalized === 'number' && (n.normalized < rule.range.min || n.normalized > rule.range.max)
        )
        if (outOfRange.length > 0) {
          warnings.push({
            message: `${outOfRange.length} قيمة خارج النطاق المتوقع (${rule.range.min}–${rule.range.max})`,
            failedRows: outOfRange.map(n => n.rowIndex),
            type: 'out_of_range',
          })
        }
      }

      if (!rule.allowNegative && numericVals.length > 0) {
        const negatives = nonNull.filter(n => typeof n.normalized === 'number' && n.normalized < 0)
        if (negatives.length > 0) {
          warnings.push({
            message: `${negatives.length} قيمة سالبة غير متوقعة`,
            failedRows: negatives.map(n => n.rowIndex),
            type: 'negative',
          })
        }
      }
    }
  }

  if (rule.dataType === 'categorical') {
    const invalid = nonNull.filter(n => {
      const val = String(n.normalized).trim().toUpperCase()
      return !rule.allowedValues.some(av => av.toUpperCase() === val)
    })
    if (invalid.length > 0) {
      const uniqueInvalid = [...new Set(invalid.map(n => String(n.normalized).trim()))]
      warnings.push({
        message: `قيم غير معروفة: ${uniqueInvalid.slice(0, 5).join(', ')}${uniqueInvalid.length > 5 ? ` (+${uniqueInvalid.length - 5})` : ''}`,
        failedRows: invalid.map(n => n.rowIndex),
        type: 'invalid_categorical',
        suggestions: rule.allowedValues,
      })
    }
  }

  if (rule.dataType === 'text' && rule.maxLength) {
    const tooLong = nonNull.filter(n => String(n.normalized).length > rule.maxLength)
    if (tooLong.length > 0) {
      warnings.push({
        message: `${tooLong.length} قيمة تتجاوز الحد الأقصى للطول (${rule.maxLength} حرف)`,
        failedRows: tooLong.map(n => n.rowIndex),
        type: 'too_long',
      })
    }
  }

  if (rule.dataType === 'compound' && rule.compoundPattern) {
    const invalid = nonNull.filter(n => !rule.compoundPattern.test(String(n.normalized)))
    if (invalid.length > 0 && invalid.length < nonNull.length) {
      warnings.push({
        message: `${invalid.length} قيمة لا تطابق التنسيق المتوقع`,
        failedRows: invalid.map(n => n.rowIndex),
        type: 'compound_format',
      })
    }
  }

  if (rule.dataType === 'id_reference' && existingIds) {
    const missing = nonNull.filter(n => !existingIds.has(String(n.normalized)))
    if (missing.length > 0) {
      const uniqueMissing = [...new Set(missing.map(n => String(n.normalized)))]
      errors.push({
        message: `${missing.length} معرّف غير موجود: ${uniqueMissing.slice(0, 5).join(', ')}`,
        failedRows: missing.map(n => n.rowIndex),
        type: 'missing_ref',
      })
    }
  }

  if (rule.mustBeUnique) {
    const seen = new Map()
    const duplicates = []
    for (const n of nonNull) {
      const val = String(n.normalized)
      if (seen.has(val)) {
        duplicates.push(n.rowIndex)
      } else {
        seen.set(val, true)
      }
    }
    if (duplicates.length > 0) {
      errors.push({
        message: `${duplicates.length} معرّف مكرر`,
        failedRows: duplicates,
        type: 'duplicate_id',
      })
    }
  }

  const severity = errors.length > 0 ? 'blocking' : warnings.length > 0 ? 'warning' : 'ok'

  return { errors, warnings, infos, severity }
}

export function getValidationSeverity(field) {
  return (values, existingIds) => {
    const result = validateColumnAssignment(values, field, existingIds)
    return result.severity
  }
}

export function validateAllMappings(columnDataMap, existingIds) {
  const allResults = {}
  let hasBlocking = false
  let hasWarning = false

  for (const [field, values] of Object.entries(columnDataMap)) {
    const result = validateColumnAssignment(values, field, existingIds)
    allResults[field] = result
    if (result.severity === 'blocking') hasBlocking = true
    if (result.severity === 'warning') hasWarning = true
  }

  return {
    results: allResults,
    overallSeverity: hasBlocking ? 'blocking' : hasWarning ? 'warning' : 'ok',
    totalErrors: Object.values(allResults).reduce((sum, r) => sum + r.errors.length, 0),
    totalWarnings: Object.values(allResults).reduce((sum, r) => sum + r.warnings.length, 0),
  }
}
