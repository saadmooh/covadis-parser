import { useState, useCallback, useMemo, useEffect } from 'react'
import { EPANET_SCHEMA, getRequiredFields } from '../utils/schemaDictionary.js'
import { detectTableType, parseCsvText, isMultiSectionCsv, parseMultiSectionCsv, suggestMappingsForType } from '../utils/csvAutoDetector.js'
import { validateColumnAssignment } from '../utils/fieldValidator.js'

const STYLE = {
  overlay: {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000,
  },
  dialog: {
    background: '#fff', borderRadius: 10, padding: 0, width: '95vw', maxWidth: 1200,
    maxHeight: '90vh', boxShadow: '0 8px 40px rgba(0,0,0,0.35)', display: 'flex',
    flexDirection: 'column', overflow: 'hidden',
  },
  header: {
    padding: '16px 24px', borderBottom: '1px solid #e0e0e0', background: '#f7f8fa',
    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
  },
  body: { flex: 1, overflowY: 'auto', padding: 20 },
  footer: {
    padding: '14px 24px', borderTop: '1px solid #e0e0e0', background: '#f7f9fa',
    display: 'flex', gap: 8, justifyContent: 'space-between', alignItems: 'center',
  },
  confidence: (score) => {
    if (score >= 0.75) return { bg: '#d4edda', color: '#155724', border: '#c3e6cb' }
    if (score >= 0.5) return { bg: '#fff3cd', color: '#856404', border: '#ffc107' }
    return { bg: '#f8d7da', color: '#721c24', border: '#f5c6cb' }
  },
  select: {
    width: '100%', padding: '6px 8px', fontSize: 13, borderRadius: 4,
    border: '1px solid #ccc', background: '#fff',
  },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 12 },
  th: { textAlign: 'left', padding: '8px 10px', borderBottom: '2px solid #dee2e6', fontSize: 11, fontWeight: 600, color: '#495057', textTransform: 'uppercase', letterSpacing: '0.03em' },
  td: { padding: '7px 10px', borderBottom: '1px solid #eee', fontSize: 13 },
  previewTable: { width: '100%', borderCollapse: 'collapse', fontSize: 11 },
  previewTh: { textAlign: 'left', padding: '5px 8px', borderBottom: '2px solid #dee2e6', fontSize: 10, fontWeight: 600, color: '#6c757d', whiteSpace: 'nowrap' },
  previewTd: { padding: '4px 8px', borderBottom: '1px solid #f0f0f0', whiteSpace: 'nowrap', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis' },
  btn: (variant) => ({
    padding: '8px 20px', border: 'none', borderRadius: 6, cursor: 'pointer',
    fontWeight: 600, fontSize: 13, transition: 'all 0.15s',
    background: variant === 'primary' ? '#28a745' : variant === 'danger' ? '#dc3545' : '#6c757d',
    color: '#fff',
  }),
  chip: (active, isAuto) => ({
    padding: '8px 16px', border: '2px solid', borderRadius: 20, cursor: 'pointer',
    fontSize: 13, fontWeight: active ? 700 : 500, transition: 'all 0.15s',
    background: active ? '#2c7bb6' : '#fff',
    color: active ? '#fff' : '#495057',
    borderColor: active ? '#2c7bb6' : isAuto ? '#28a745' : '#dee2e6',
    display: 'inline-flex', alignItems: 'center', gap: 6,
    whiteSpace: 'nowrap',
  }),
  sectionRow: (expanded) => ({
    display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px',
    borderRadius: 6, cursor: 'pointer', fontSize: 13,
    background: expanded ? '#e8f4fd' : '#f8f9fa',
    border: `1px solid ${expanded ? '#b3d7f2' : '#e9ecef'}`,
    marginBottom: 4, transition: 'all 0.15s',
  }),
  notification: {
    padding: '8px 14px', borderRadius: 6, fontSize: 12, marginBottom: 12,
    background: '#d1ecf1', color: '#0c5460', border: '1px solid #bee5eb',
    display: 'flex', alignItems: 'center', gap: 6,
  },
}

const ELEMENT_TYPES = [
  'JUNCTIONS', 'RESERVOIRS', 'TANKS', 'PIPES', 'PUMPS', 'VALVES',
  'PATTERNS', 'CURVES', 'COORDINATES', 'STATUS', 'TAGS', 'LABELS', 'CONTROLS',
]

const TYPE_LABELS = {
  JUNCTIONS: 'Junctions (Nodes)', RESERVOIRS: 'Reservoirs', TANKS: 'Tanks',
  PIPES: 'Pipes', PUMPS: 'Pumps', VALVES: 'Valves',
  PATTERNS: 'Patterns', CURVES: 'Curves', COORDINATES: 'Coordinates',
  STATUS: 'Status', TAGS: 'Tags', LABELS: 'Labels', CONTROLS: 'Controls',
}

const SIMPLE_FIELDS = {
  COORDINATES: ['id', 'x', 'y'],
  STATUS: ['id', 'status'],
  TAGS: ['objectType', 'id', 'tag'],
}

export default function CsvMappingDialog({ rawCsv, onConfirm, onCancel, projectMode, initialMapping, onStateChange, batchMode, onNext }) {
  const [fieldMappings, setFieldMappings] = useState(initialMapping || {})
  const [showPreview, setShowPreview] = useState(true)
  const [expandedSection, setExpandedSection] = useState(null)
  const [notification, setNotification] = useState(null)

  const parsed = useMemo(() => {
    if (!rawCsv) return null
    return parseCsvText(rawCsv)
  }, [rawCsv])

  const isMulti = useMemo(() => {
    if (!rawCsv) return false
    return isMultiSectionCsv(rawCsv)
  }, [rawCsv])

  useEffect(() => {
    setExpandedSection(null)
    setShowPreview(true)
  }, [rawCsv, batchMode])

  const multiData = useMemo(() => {
    if (!isMulti || !rawCsv) return null
    return parseMultiSectionCsv(rawCsv)
  }, [isMulti, rawCsv])

  const detection = useMemo(() => {
    if (!parsed || isMulti) return null
    return detectTableType(parsed.headers, parsed.rows)
  }, [parsed, isMulti])

  const detectedType = detection?.detectedType || null
  const confidence = detection?.confidence || 0
  const isHighConfidence = confidence >= 0.85

  const [selectedType, setSelectedType] = useState(initialMapping?._selectedType || null)
  const currentType = selectedType || (isHighConfidence ? detectedType : null)

  const autoSuggestions = useMemo(() => {
    if (!parsed || !currentType) return {}
    const suggestions = suggestMappingsForType(parsed.headers, parsed.rows, currentType)
    const map = {}
    for (const s of suggestions) {
      if (s.field && s.score >= 0.4) {
        map[s.header] = { field: s.field, section: currentType, score: s.score, ignored: false, auto: true }
      }
    }
    return map
  }, [parsed, currentType])

  const mergedMappings = useMemo(() => {
    const preserved = {}
    for (const [key, val] of Object.entries(fieldMappings)) {
      if (val && (!val.auto || !autoSuggestions[key.split('__')[1]])) {
        preserved[key] = val
      }
    }
    const result = {}
    for (const [header, suggestion] of Object.entries(autoSuggestions)) {
      const manualKey = `${currentType}__${header}`
      if (preserved[manualKey]) {
        result[manualKey] = { ...preserved[manualKey], auto: false }
      } else {
        result[manualKey] = suggestion
      }
    }
    for (const [key, val] of Object.entries(preserved)) {
      if (val && !result[key]) result[key] = val
    }
    return result
  }, [autoSuggestions, fieldMappings, currentType])

  const allFieldOptions = useMemo(() => {
    if (!currentType) return {}
    const schema = EPANET_SCHEMA[currentType]
    if (!schema?.synonyms) return {}
    return Object.fromEntries(Object.keys(schema.synonyms).map(f => [f, f]))
  }, [currentType])

  const requiredFields = useMemo(() => {
    if (!currentType) return []
    return getRequiredFields(currentType)
  }, [currentType])

  const mappedRequiredCount = useMemo(() => {
    return requiredFields.filter(f =>
      Object.values(mergedMappings).some(m => m && m.field === f && !m.ignored && m.section === currentType)
    ).length
  }, [requiredFields, mergedMappings, currentType])

  const allRequiredMet = requiredFields.length === 0 || mappedRequiredCount >= requiredFields.length

  const handleTypeChange = useCallback((newType) => {
    setSelectedType(newType)
    setFieldMappings({})
    setNotification(newType ? `Suggestions updated for new type (${TYPE_LABELS[newType] || newType})` : null)
    setTimeout(() => setNotification(null), 3000)
  }, [])

  const handleMappingChange = useCallback((header, field, section) => {
    setFieldMappings(prev => {
      const next = { ...prev, [`${section}__${header}`]: { field, section, score: 0, ignored: false, auto: false } }
      return next
    })
  }, [])

  const handleIgnore = useCallback((header, section) => {
    setFieldMappings(prev => {
      const key = `${section}__${header}`
      return { ...prev, [key]: { ...(prev[key] || {}), field: null, ignored: true, auto: false } }
    })
  }, [])

  const handleUnignore = useCallback((header, section) => {
    setFieldMappings(prev => {
      const key = `${section}__${header}`
      return { ...prev, [key]: { ...(prev[key] || {}), ignored: false, auto: false } }
    })
  }, [])

  useEffect(() => {
    if (onStateChange) {
      onStateChange({ mapping: fieldMappings, selectedType: currentType })
    }
  }, [fieldMappings, currentType])

  const handleConfirm = useCallback(() => {
    if (isMulti && multiData) {
      onConfirm({ multiData, isMulti: true })
      return
    }
    const result = {}
    for (const [key, mapping] of Object.entries(mergedMappings)) {
      if (mapping.ignored || !mapping.field || !mapping.section) continue
      const header = key.split('__')[1]
      if (!header) continue
      if (!result[mapping.section]) result[mapping.section] = {}
      result[mapping.section][header] = mapping.field
    }
    onConfirm({ mapping: result, detectedType: currentType, isMulti: false })
  }, [mergedMappings, currentType, onConfirm, isMulti, multiData])

  const previewRows = useMemo(() => {
    if (!parsed) return []
    return parsed.rows.slice(0, 8)
  }, [parsed])

  const confidenceBadge = (score) => {
    const s = STYLE.confidence(score)
    return (
      <span style={{
        display: 'inline-block', padding: '2px 8px', borderRadius: 10,
        fontSize: 11, fontWeight: 600, background: s.bg, color: s.color,
        border: `1px solid ${s.border}`,
      }}>
        {(score * 100).toFixed(0)}%
      </span>
    )
  }

  const getMatchedField = (header) => {
    if (!currentType) return null
    return mergedMappings[`${currentType}__${header}`] || null
  }

  const columnValidations = useMemo(() => {
    if (!parsed || !currentType) return {}
    const results = {}
    for (const header of parsed.headers) {
      const match = mergedMappings[`${currentType}__${header}`] || null
      if (!match || match.ignored || !match.field) continue
      const colValues = parsed.rows.map(r => r[header])
      results[header] = validateColumnAssignment(colValues, match.field)
    }
    return results
  }, [parsed, currentType, mergedMappings])

  const overallValidation = useMemo(() => {
    const vals = Object.values(columnValidations)
    const hasBlocking = vals.some(v => v.severity === 'blocking')
    return {
      severity: hasBlocking ? 'blocking' : vals.some(v => v.severity === 'warning') ? 'warning' : 'ok',
      totalErrors: vals.reduce((sum, v) => sum + v.errors.length, 0),
      totalWarnings: vals.reduce((sum, v) => sum + v.warnings.length, 0),
    }
  }, [columnValidations])

  const severityIcon = (severity) => {
    if (severity === 'blocking') return '🔴'
    if (severity === 'warning') return '🟡'
    return '🟢'
  }

  const isSpecialType = (type) => ['CONTROLS', 'LABELS'].includes(type)
  const isSimpleType = (type) => !!SIMPLE_FIELDS[type]

  const renderSpecialUI = () => {
    if (currentType === 'CONTROLS') {
      return (
        <div style={{ padding: 16, background: '#f8f9fa', borderRadius: 6, border: '1px solid #e9ecef' }}>
          <h4 style={{ margin: '0 0 8px', fontSize: 14 }}>Control Rules (CONTROLS)</h4>
          <p style={{ fontSize: 12, color: '#666', marginBottom: 8 }}>
            This section contains full control texts that cannot be broken into columns. Each row represents one rule.
          </p>
          {parsed?.rows.slice(0, 5).map((row, i) => {
            const vals = Object.values(row).filter(v => v && v !== ';').join(',').trim()
            return vals ? <div key={i} style={{ padding: '4px 8px', fontSize: 12, background: '#fff', borderRadius: 4, marginBottom: 4, border: '1px solid #dee2e6', fontFamily: 'monospace' }}>{vals}</div> : null
          })}
        </div>
      )
    }
    if (currentType === 'LABELS') {
      return (
        <div style={{ padding: 16, background: '#f8f9fa', borderRadius: 6, border: '1px solid #e9ecef' }}>
          <h4 style={{ margin: '0 0 8px', fontSize: 14 }}>Text Labels (LABELS)</h4>
          <p style={{ fontSize: 12, color: '#666', marginBottom: 8 }}>
            Each label: X, Y, "text", reference_id (optional). Merged automatically with elements.
          </p>
          {parsed?.rows.slice(0, 5).map((row, i) => {
            const vals = Object.values(row).slice(1).join(' ').trim()
            return vals ? <div key={i} style={{ padding: '4px 8px', fontSize: 12, background: '#fff', borderRadius: 4, marginBottom: 4, border: '1px solid #dee2e6' }}>{vals}</div> : null
          })}
        </div>
      )
    }
    return null
  }

  if (isMulti && multiData) {
    return (
      <div style={STYLE.overlay} onClick={(e) => { if (e.target === e.currentTarget) onCancel() }}>
        <div style={STYLE.dialog} onClick={(e) => e.stopPropagation()}>
          <div style={STYLE.header}>
            <div>
              <h3 style={{ margin: 0, fontSize: 16 }}>Unified flat file — Auto-detected with high confidence</h3>
              <p style={{ margin: '4px 0 0', fontSize: 12, color: '#6c757d' }}>
                {parsed ? `${parsed.rows.length} rows | Key element column: "Section"` : ''}
              </p>
            </div>
          </div>

          <div style={STYLE.body}>
            {multiData.junctions.length > 0 && (
              <div style={STYLE.sectionRow(expandedSection === 'JUNCTIONS')} onClick={() => setExpandedSection(expandedSection === 'JUNCTIONS' ? null : 'JUNCTIONS')}>
                <span>{expandedSection === 'JUNCTIONS' ? '▼' : '▶'}</span>
                <span style={{ fontWeight: 600 }}>JUNCTIONS</span>
                <span style={{ color: '#6c757d' }}>({multiData.junctions.length} rows)</span>
                {confidenceBadge(0.98)}
                <span style={{ flex: 1 }} />
                <span style={{ fontSize: 11, color: '#28a745' }}>Auto-detected</span>
              </div>
            )}
            {expandedSection === 'JUNCTIONS' && (
              <div style={{ padding: '8px 12px 12px', background: '#f8fffe', borderRadius: 6, marginBottom: 4, border: '1px solid #d4edda' }}>
                <div style={{ overflowX: 'auto' }}>
                  <table style={STYLE.previewTable}>
                    <thead>
                      <tr>
                        {Object.keys(multiData.junctions[0] || {}).map(k => (
                          <th key={k} style={STYLE.previewTh}>{k}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {multiData.junctions.slice(0, 5).map((j, i) => (
                        <tr key={i}>
                          {Object.values(j).map((v, vi) => (
                            <td key={vi} style={STYLE.previewTd}>{String(v)}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {multiData.pipes.length > 0 && (
              <div style={STYLE.sectionRow(expandedSection === 'PIPES')} onClick={() => setExpandedSection(expandedSection === 'PIPES' ? null : 'PIPES')}>
                <span>{expandedSection === 'PIPES' ? '▼' : '▶'}</span>
                <span style={{ fontWeight: 600 }}>PIPES</span>
                <span style={{ color: '#6c757d' }}>({multiData.pipes.length} rows)</span>
                {confidenceBadge(0.96)}
                <span style={{ flex: 1 }} />
                <span style={{ fontSize: 11, color: '#28a745' }}>Auto-detected</span>
              </div>
            )}
            {expandedSection === 'PIPES' && (
              <div style={{ padding: '8px 12px 12px', background: '#f8fffe', borderRadius: 6, marginBottom: 4, border: '1px solid #d4edda' }}>
                <div style={{ overflowX: 'auto' }}>
                  <table style={STYLE.previewTable}>
                    <thead>
                      <tr>
                        {Object.keys(multiData.pipes[0] || {}).map(k => (
                          <th key={k} style={STYLE.previewTh}>{k}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {multiData.pipes.slice(0, 5).map((p, i) => (
                        <tr key={i}>
                          {Object.values(p).map((v, vi) => (
                            <td key={vi} style={STYLE.previewTd}>{String(v)}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {['RESERVOIRS', 'TANKS', 'PUMPS', 'VALVES'].filter(s => multiData[s.toLowerCase() + 's']?.length > 0 || multiData[s.toLowerCase()]?.length > 0).map(section => {
              const key = section.toLowerCase() + (section === 'RESERVOIRS' ? '' : 's')
              const items = multiData[key] || []
              if (items.length === 0) return null
              return (
                <div key={section}>
                  <div style={STYLE.sectionRow(expandedSection === section)} onClick={() => setExpandedSection(expandedSection === section ? null : section)}>
                    <span>{expandedSection === section ? '▼' : '▶'}</span>
                    <span style={{ fontWeight: 600 }}>{section}</span>
                    <span style={{ color: '#6c757d' }}>({items.length} rows)</span>
                    {confidenceBadge(0.95)}
                    <span style={{ flex: 1 }} />
                    <span style={{ fontSize: 11, color: '#28a745' }}>Auto-detected</span>
                  </div>
                  {expandedSection === section && (
                    <div style={{ padding: '8px 12px 12px', background: '#f8fffe', borderRadius: 6, marginBottom: 4, border: '1px solid #d4edda' }}>
                      <div style={{ overflowX: 'auto' }}>
                        <table style={STYLE.previewTable}>
                          <thead><tr>{Object.keys(items[0] || {}).map(k => <th key={k} style={STYLE.previewTh}>{k}</th>)}</tr></thead>
                          <tbody>
                            {items.slice(0, 5).map((item, i) => (
                              <tr key={i}>{Object.values(item).map((v, vi) => <td key={vi} style={STYLE.previewTd}>{String(v)}</td>)}</tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}

            {multiData.patterns.length > 0 && (
              <div style={STYLE.sectionRow(expandedSection === 'PATTERNS')} onClick={() => setExpandedSection(expandedSection === 'PATTERNS' ? null : 'PATTERNS')}>
                <span>{expandedSection === 'PATTERNS' ? '▼' : '▶'}</span>
                <span style={{ fontWeight: 600 }}>PATTERNS</span>
                <span style={{ color: '#6c757d' }}>({multiData.patterns.length} rows → {multiData.sectionSummary.PATTERNS?.groupedCount || '?'} patterns)</span>
                {confidenceBadge(0.97)}
                <span style={{ flex: 1 }} />
                <span style={{ fontSize: 11, color: '#28a745' }}>Auto-detected</span>
              </div>
            )}
            {expandedSection === 'PATTERNS' && (
              <div style={{ padding: '8px 12px 12px', background: '#f8fffe', borderRadius: 6, marginBottom: 4, border: '1px solid #d4edda' }}>
                <div style={{ overflowX: 'auto' }}>
                  <table style={STYLE.previewTable}>
                    <thead><tr><th style={STYLE.previewTh}>ID</th><th style={STYLE.previewTh}>Factors</th></tr></thead>
                    <tbody>
                      {multiData.patterns.slice(0, 5).map((p, i) => (
                        <tr key={i}><td style={STYLE.previewTd}>{p.id}</td><td style={STYLE.previewTd}>{(p.factors || []).slice(0, 6).join(', ')}...</td></tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {multiData.curves.length > 0 && (
              <div style={STYLE.sectionRow(expandedSection === 'CURVES')} onClick={() => setExpandedSection(expandedSection === 'CURVES' ? null : 'CURVES')}>
                <span>{expandedSection === 'CURVES' ? '▼' : '▶'}</span>
                <span style={{ fontWeight: 600 }}>CURVES</span>
                <span style={{ color: '#6c757d' }}>({multiData.curves.length} rows → {multiData.sectionSummary.CURVES?.groupedCount || '?'} curves)</span>
                {confidenceBadge(0.95)}
                <span style={{ flex: 1 }} />
                <span style={{ fontSize: 11, color: '#28a745' }}>Auto-detected</span>
              </div>
            )}
            {expandedSection === 'CURVES' && (
              <div style={{ padding: '8px 12px 12px', background: '#f8fffe', borderRadius: 6, marginBottom: 4, border: '1px solid #d4edda' }}>
                <div style={{ overflowX: 'auto' }}>
                  <table style={STYLE.previewTable}>
                    <thead><tr><th style={STYLE.previewTh}>ID</th><th style={STYLE.previewTh}>X</th><th style={STYLE.previewTh}>Y</th></tr></thead>
                    <tbody>
                      {multiData.curves.slice(0, 8).map((c, i) => (
                        <tr key={i}><td style={STYLE.previewTd}>{c.id}</td><td style={STYLE.previewTd}>{c.x}</td><td style={STYLE.previewTd}>{c.y}</td></tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {multiData.coordinates.length > 0 && (
              <div style={STYLE.sectionRow(false)}>
                <span>📎</span>
                <span style={{ fontWeight: 600 }}>COORDINATES</span>
                <span style={{ color: '#6c757d' }}>({multiData.coordinates.length} rows — attachment)</span>
                {confidenceBadge(0.99)}
              </div>
            )}

            {multiData.tags.length > 0 && (
              <div style={STYLE.sectionRow(false)}>
                <span>📎</span>
                <span style={{ fontWeight: 600 }}>TAGS</span>
                <span style={{ color: '#6c757d' }}>({multiData.tags.length} rows — attachment)</span>
                {confidenceBadge(0.95)}
              </div>
            )}

            {multiData.labels.length > 0 && (
              <div style={STYLE.sectionRow(false)}>
                <span>📎</span>
                <span style={{ fontWeight: 600 }}>LABELS</span>
                <span style={{ color: '#6c757d' }}>({multiData.labels.length} labels — text analysis)</span>
                {confidenceBadge(0.90)}
              </div>
            )}

            {Object.keys(multiData.options).length > 0 && (
              <div style={STYLE.sectionRow(expandedSection === 'OPTIONS')} onClick={() => setExpandedSection(expandedSection === 'OPTIONS' ? null : 'OPTIONS')}>
                <span>{expandedSection === 'OPTIONS' ? '▼' : '▶'}</span>
                <span style={{ fontWeight: 600 }}>⚙️ General Settings</span>
                <span style={{ color: '#6c757d' }}>(OPTIONS/TIMES)</span>
              </div>
            )}
            {expandedSection === 'OPTIONS' && (
              <div style={{ padding: '8px 12px 12px', background: '#f8f9fa', borderRadius: 6, marginBottom: 4, border: '1px solid #e9ecef' }}>
                <div style={{ overflowX: 'auto' }}>
                  <table style={STYLE.previewTable}>
                    <thead><tr><th style={STYLE.previewTh}>Key</th><th style={STYLE.previewTh}>Value</th></tr></thead>
                    <tbody>
                      {Object.entries({ ...multiData.options, ...multiData.times }).map(([k, v], i) => (
                        <tr key={i}><td style={STYLE.previewTd}>{k}</td><td style={STYLE.previewTd}>{v}</td></tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {multiData.junkColumns?.length > 0 && (
              <div style={STYLE.sectionRow(false)}>
                <span>🗑️</span>
                <span style={{ fontWeight: 600 }}>Ignored columns</span>
                <span style={{ color: '#6c757d' }}>({multiData.junkColumns.length} columns — junk/empty)</span>
              </div>
            )}

            {multiData.controls.length > 0 && (
              <div style={STYLE.sectionRow(false)}>
                <span>📎</span>
                <span style={{ fontWeight: 600 }}>CONTROLS</span>
                <span style={{ color: '#6c757d' }}>({multiData.controls.length} control rules)</span>
              </div>
            )}

            {multiData.status.length > 0 && (
              <div style={STYLE.sectionRow(false)}>
                <span>📎</span>
                <span style={{ fontWeight: 600 }}>STATUS</span>
                <span style={{ color: '#6c757d' }}>({multiData.status.length} status)</span>
              </div>
            )}
          </div>

          <div style={STYLE.footer}>
            <button onClick={onCancel} style={STYLE.btn('secondary')}>Cancel</button>
            <button onClick={handleConfirm} style={STYLE.btn('primary')}>
              Confirm and Generate .inp ({multiData.junctions.length + multiData.pipes.length + multiData.valves.length + multiData.pumps.length + multiData.tanks.length + multiData.reservoirs.length} elements)
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={STYLE.overlay} onClick={(e) => { if (e.target === e.currentTarget) onCancel() }}>
      <div style={STYLE.dialog} onClick={(e) => e.stopPropagation()}>
        <div style={STYLE.header}>
          <div>
            <h3 style={{ margin: 0, fontSize: 16 }}>Map CSV columns to EPANET elements</h3>
            <p style={{ margin: '4px 0 0', fontSize: 12, color: '#6c757d' }}>
              {parsed ? `${parsed.rows.length} rows | ${parsed.headers.length} columns` : ''}
            </p>
          </div>
        </div>

        <div style={STYLE.body}>
          <div style={{ marginBottom: 16, padding: '12px 16px', background: '#f0f4f8', borderRadius: 8, border: '1px solid #d0d7de' }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, color: '#333' }}>
              Element Type {!currentType && <span style={{ color: '#dc3545', fontWeight: 400 }}>* Please select</span>}
              {isHighConfidence && !selectedType && (
                <span style={{ fontSize: 11, color: '#28a745', fontWeight: 400, marginRight: 8 }}>🔍 Auto-detected with confidence {(confidence * 100).toFixed(0)}%</span>
              )}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {ELEMENT_TYPES.map(type => (
                <button
                  key={type}
                  onClick={() => handleTypeChange(type)}
                  style={STYLE.chip(currentType === type, isHighConfidence && detectedType === type && !selectedType)}
                >
                  {TYPE_LABELS[type]}
                  {isHighConfidence && detectedType === type && !selectedType && (
                    <span style={{ fontSize: 10, opacity: 0.8 }}>auto</span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {notification && (
            <div style={STYLE.notification}>ℹ️ {notification}</div>
          )}

          {!currentType && (
            <div style={{ padding: 20, textAlign: 'center', color: '#856404', background: '#fff3cd', borderRadius: 6, fontSize: 13 }}>
              Could not determine data type with sufficient confidence — Please select an element type above
            </div>
          )}

          {currentType && isSpecialType(currentType) && renderSpecialUI()}

          {currentType && !isSpecialType(currentType) && (
            <div style={{ display: 'grid', gridTemplateColumns: showPreview && !isSimpleType(currentType) ? '1fr 1fr' : '1fr', gap: 20 }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                  <h4 style={{ margin: 0, fontSize: 14, color: '#333' }}>
                    Column Mapping — {TYPE_LABELS[currentType]}
                  </h4>
                  {!isSimpleType(currentType) && (
                    <button
                      onClick={() => setShowPreview(!showPreview)}
                      style={{ fontSize: 11, color: '#2c7bb6', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}
                    >
                      {showPreview ? 'Hide Preview' : 'Show Preview'}
                    </button>
                  )}
                </div>

                {isSimpleType(currentType) && (
                  <div style={{ fontSize: 12, color: '#6c757d', marginBottom: 8, padding: '6px 10px', background: '#e8f4fd', borderRadius: 4 }}>
                    Attachment — merged with existing elements via ID
                  </div>
                )}

                {requiredFields.length > 0 && (
                  <div style={{
                    padding: '6px 10px', borderRadius: 4, fontSize: 12, marginBottom: 8,
                    background: allRequiredMet ? '#d4edda' : '#f8d7da',
                    color: allRequiredMet ? '#155724' : '#721c24',
                    border: `1px solid ${allRequiredMet ? '#c3e6cb' : '#f5c6cb'}`,
                  }}>
                    Required fields: {mappedRequiredCount}/{requiredFields.length}
                    {!allRequiredMet && (
                      <span> — Missing: {requiredFields.filter(f => !Object.values(mergedMappings).some(m => m && m.field === f && !m.ignored && m.section === currentType)).join(', ')}</span>
                    )}
                  </div>
                )}

                <table style={STYLE.table}>
                  <thead>
                    <tr>
                      <th style={STYLE.th}>CSV Column</th>
                      <th style={STYLE.th}>Detected Field</th>
                      <th style={STYLE.th}>Confidence</th>
                      <th style={STYLE.th}>Validation</th>
                      <th style={STYLE.th}>Manual Assignment</th>
                      <th style={STYLE.th}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parsed?.headers.map((header) => {
                      const match = getMatchedField(header)
                      const isIgnored = match?.ignored
                      const isRequired = requiredFields.includes(match?.field)
                      const validation = columnValidations[header]
                      const hasError = validation?.severity === 'blocking'
                      const hasWarning = validation?.severity === 'warning'
                      const rowStyle = isIgnored ? { opacity: 0.4 } : hasError ? { background: '#fff5f5' } : hasWarning ? { background: '#fffbe6' } : isRequired ? { background: '#f0fff4' } : {}

                      return (
                        <tr key={header} style={rowStyle}>
                          <td style={STYLE.td}>
                            <code style={{ fontSize: 12, background: '#f0f0f0', padding: '2px 6px', borderRadius: 3 }}>{header}</code>
                          </td>
                          <td style={STYLE.td}>
                            {match?.field && !isIgnored ? (
                              <span style={{ fontWeight: 600, fontSize: 13 }}>{match.field}</span>
                            ) : (
                              <span style={{ color: '#999', fontSize: 12 }}>{isIgnored ? 'Ignore' : '—'}</span>
                            )}
                          </td>
                          <td style={STYLE.td}>
                            {match && !isIgnored ? confidenceBadge(match.score) : null}
                          </td>
                          <td style={STYLE.td}>
                            {validation && !isIgnored && (
                              <div style={{ fontSize: 11 }}>
                                <span>{severityIcon(validation.severity)}</span>
                                {validation.errors.length > 0 && (
                                  <span style={{ color: '#dc3545', marginRight: 4 }}>{validation.errors[0].message}</span>
                                )}
                                {validation.warnings.length > 0 && validation.errors.length === 0 && (
                                  <span style={{ color: '#856404', marginRight: 4 }}>{validation.warnings[0].message}</span>
                                )}
                                {validation.infos.length > 0 && validation.errors.length === 0 && validation.warnings.length === 0 && (
                                  <span style={{ color: '#0c5460', marginRight: 4 }}>{validation.infos[0].message}</span>
                                )}
                              </div>
                            )}
                          </td>
                          <td style={STYLE.td}>
                            <select
                              value={match?.field || ''}
                              onChange={(e) => {
                                if (e.target.value) {
                                  handleMappingChange(header, e.target.value, currentType)
                                } else {
                                  handleIgnore(header, currentType)
                                }
                              }}
                              style={STYLE.select}
                            >
                              <option value="">-- Select --</option>
                              {Object.entries(allFieldOptions).map(([field]) => (
                                <option key={field} value={field}>{field}</option>
                              ))}
                            </select>
                          </td>
                          <td style={STYLE.td}>
                            {isIgnored ? (
                              <button onClick={() => handleUnignore(header, currentType)} style={{ fontSize: 11, color: '#2c7bb6', background: 'none', border: 'none', cursor: 'pointer' }}>
                                Restore
                              </button>
                            ) : match?.field ? (
                              <button onClick={() => handleIgnore(header, currentType)} style={{ fontSize: 11, color: '#dc3545', background: 'none', border: 'none', cursor: 'pointer' }}>
                                Ignore
                              </button>
                            ) : null}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              {showPreview && !isSimpleType(currentType) && (
                <div>
                  <h4 style={{ margin: '0 0 12px', fontSize: 14, color: '#333' }}>Data Preview</h4>
                  <div style={{ overflowX: 'auto', border: '1px solid #e0e0e0', borderRadius: 6 }}>
                    <table style={STYLE.previewTable}>
                      <thead>
                        <tr>
                          <th style={STYLE.previewTh}>#</th>
                          {parsed?.headers.map(h => {
                            const m = getMatchedField(h)
                            const bg = m && !m.ignored
                              ? (m.score >= 0.7 ? '#d4edda' : m.score >= 0.5 ? '#fff3cd' : '#f8d7da')
                              : '#f8f9fa'
                            return <th key={h} style={{ ...STYLE.previewTh, background: bg }}>{h}</th>
                          })}
                        </tr>
                      </thead>
                      <tbody>
                        {previewRows.map((row, i) => (
                          <tr key={i}>
                            <td style={{ ...STYLE.previewTd, fontWeight: 600, color: '#999' }}>{i + 1}</td>
                            {parsed?.headers.map(h => (
                              <td key={h} style={STYLE.previewTd}>{row[h] || ''}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <div style={STYLE.footer}>
          <button onClick={onCancel} style={STYLE.btn('secondary')}>Cancel</button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {!currentType && (
              <span style={{ fontSize: 11, color: '#dc3545' }}>Select element type first</span>
            )}
            {currentType && !allRequiredMet && !isSpecialType(currentType) && (
              <span style={{ fontSize: 11, color: '#856404' }}>Please map all required fields</span>
            )}
            {overallValidation.severity === 'blocking' && (
              <span style={{ fontSize: 11, color: '#dc3545' }}>🔴 Validation errors ({overallValidation.totalErrors})</span>
            )}
            {overallValidation.severity === 'warning' && (
              <span style={{ fontSize: 11, color: '#856404' }}>🟡 Warnings ({overallValidation.totalWarnings})</span>
            )}
            {!batchMode && (
              <button
                onClick={handleConfirm}
                disabled={!currentType || (!allRequiredMet && !isSpecialType(currentType)) || overallValidation.severity === 'blocking'}
                style={{ ...STYLE.btn('primary'), opacity: currentType && (allRequiredMet || isSpecialType(currentType)) && overallValidation.severity !== 'blocking' ? 1 : 0.5, cursor: currentType ? 'pointer' : 'not-allowed' }}
              >
                Confirm {projectMode ? 'and Add to Project' : 'and Generate .inp'}
              </button>
            )}
            {batchMode && (
              <button
                onClick={() => {
                  if (onStateChange) onStateChange({ mapping: fieldMappings, selectedType: currentType })
                  onNext()
                }}
                style={{ ...STYLE.btn('primary') }}
              >
                Next →
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
