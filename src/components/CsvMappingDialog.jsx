import { useState, useCallback, useMemo } from 'react'
import { EPANET_SCHEMA, getRequiredFields } from '../utils/schemaDictionary.js'
import { detectTableType, parseCsvText } from '../utils/csvAutoDetector.js'

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
    padding: '14px 24px', borderTop: '1px solid #e0e0e0', background: '#f7f8fa',
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
}

const DETECTABLE_SECTIONS = Object.keys(EPANET_SCHEMA).filter(k =>
  EPANET_SCHEMA[k].synonyms && Object.keys(EPANET_SCHEMA[k].synonyms).length > 0
)

export default function CsvMappingDialog({ rawCsv, onConfirm, onCancel }) {
  const [fieldMappings, setFieldMappings] = useState({})
  const [showPreview, setShowPreview] = useState(true)

  const parsed = useMemo(() => {
    if (!rawCsv) return null
    return parseCsvText(rawCsv)
  }, [rawCsv])

  const detection = useMemo(() => {
    if (!parsed) return null
    return detectTableType(parsed.headers, parsed.rows)
  }, [parsed])

  const detectedType = detection?.detectedType || null
  const confidence = detection?.confidence || 0
  const ambiguous = detection?.ambiguous || false
  const alternatives = detection?.alternatives || []

  const [manualType, setManualType] = useState(null)
  const currentType = manualType || detectedType

  const initialMappings = useMemo(() => {
    if (!detection) return {}
    const m = {}
    for (const fm of detection.fieldMappings) {
      const key = `${detection.detectedType || 'JUNCTIONS'}__${fm.header}`
      if (fm.suggestedField) {
        m[key] = { field: fm.suggestedField, section: fm.suggestedSection, score: fm.score, ignored: false }
      }
    }
    return m
  }, [detection])

  const mergedMappings = useMemo(() => {
    if (Object.keys(fieldMappings).length === 0) return initialMappings
    return { ...initialMappings, ...fieldMappings }
  }, [initialMappings, fieldMappings])

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
      Object.values(mergedMappings).some(m => m.field === f && !m.ignored && m.section === currentType)
    ).length
  }, [requiredFields, mergedMappings, currentType])

  const allRequiredMet = requiredFields.length === 0 || mappedRequiredCount >= requiredFields.length

  const handleMappingChange = useCallback((header, field, section) => {
    setFieldMappings(prev => ({
      ...prev,
      [`${section}__${header}`]: { field, section, score: 0, ignored: false },
    }))
  }, [])

  const handleIgnore = useCallback((header, section) => {
    setFieldMappings(prev => {
      const key = `${section}__${header}`
      const existing = prev[key]
      if (existing) return { ...prev, [key]: { ...existing, ignored: true } }
      return prev
    })
  }, [])

  const handleUnignore = useCallback((header, section) => {
    setFieldMappings(prev => {
      const key = `${section}__${header}`
      const existing = prev[key]
      if (existing) return { ...prev, [key]: { ...existing, ignored: false } }
      return prev
    })
  }, [])

  const handleConfirm = useCallback(() => {
    const result = {}
    for (const [, mapping] of Object.entries(mergedMappings)) {
      if (mapping.ignored || !mapping.field || !mapping.section) continue
      if (!result[mapping.section]) result[mapping.section] = {}
      result[mapping.section][mapping._header || ''] = mapping.field
    }
    for (const [key, mapping] of Object.entries(mergedMappings)) {
      if (mapping.ignored || !mapping.field || !mapping.section) continue
      const header = key.split('__')[1]
      if (header && result[mapping.section]) {
        result[mapping.section][header] = mapping.field
      }
    }
    onConfirm({ mapping: result, detectedType: currentType })
  }, [mergedMappings, currentType, onConfirm])

  const handleTypeChange = useCallback((newType) => {
    setManualType(newType)
    setFieldMappings({})
  }, [])

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

  return (
    <div style={STYLE.overlay} onClick={(e) => { if (e.target === e.currentTarget) onCancel() }}>
      <div style={STYLE.dialog} onClick={(e) => e.stopPropagation()}>
        <div style={STYLE.header}>
          <div>
            <h3 style={{ margin: 0, fontSize: 16 }}>ربط أعمدة CSV بعناصر EPANET</h3>
            <p style={{ margin: '4px 0 0', fontSize: 12, color: '#6c757d' }}>
              {parsed ? `${parsed.rows.length} صف | ${parsed.headers.length} عمود` : ''}
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {detectedType && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 12, color: '#555' }}>النوع المكتشف:</span>
                <select
                  value={currentType || ''}
                  onChange={(e) => handleTypeChange(e.target.value)}
                  style={{ padding: '4px 8px', fontSize: 13, borderRadius: 4, border: '1px solid #ccc' }}
                >
                  {DETECTABLE_SECTIONS.map(k => (
                    <option key={k} value={k}>{EPANET_SCHEMA[k].section}</option>
                  ))}
                </select>
                {confidenceBadge(confidence)}
              </div>
            )}
            {ambiguous && (
              <span style={{ fontSize: 11, color: '#856404', background: '#fff3cd', padding: '2px 8px', borderRadius: 4 }}>
                غامض - يرجى التحقق
              </span>
            )}
          </div>
        </div>

        <div style={STYLE.body}>
          {alternatives.length > 1 && (
            <div style={{ marginBottom: 16, padding: 10, background: '#f8f9fa', borderRadius: 6, fontSize: 12 }}>
              <strong>البدائل المحتملة:</strong>
              <div style={{ display: 'flex', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
                {alternatives.slice(0, 5).map((alt, i) => (
                  <button
                    key={i}
                    onClick={() => handleTypeChange(alt.section)}
                    style={{
                      padding: '6px 12px', border: 'none', borderRadius: 6, cursor: 'pointer',
                      fontSize: 12, fontWeight: currentType === alt.section ? 600 : 400,
                      background: currentType === alt.section ? '#2c7bb6' : '#e9ecef',
                      color: currentType === alt.section ? '#fff' : '#495057',
                      display: 'flex', alignItems: 'center', gap: 4,
                    }}
                  >
                    {EPANET_SCHEMA[alt.section]?.section || alt.section}
                    {confidenceBadge(alt.score)}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: showPreview ? '1fr 1fr' : '1fr', gap: 20 }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <h4 style={{ margin: 0, fontSize: 14, color: '#333' }}>
                  تعيين الأعمدة — {currentType ? EPANET_SCHEMA[currentType]?.section : ''}
                </h4>
                <button
                  onClick={() => setShowPreview(!showPreview)}
                  style={{ fontSize: 11, color: '#2c7bb6', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}
                >
                  {showPreview ? 'إخفاء المعاينة' : 'إظهار المعاينة'}
                </button>
              </div>

              {requiredFields.length > 0 && (
                <div style={{
                  padding: '6px 10px', borderRadius: 4, fontSize: 12, marginBottom: 8,
                  background: allRequiredMet ? '#d4edda' : '#f8d7da',
                  color: allRequiredMet ? '#155724' : '#721c24',
                  border: `1px solid ${allRequiredMet ? '#c3e6cb' : '#f5c6cb'}`,
                }}>
                  الحقول الإلزامية: {mappedRequiredCount}/{requiredFields.length}
                  {!allRequiredMet && (
                    <span> — الناقصة: {requiredFields.filter(f => !Object.values(mergedMappings).some(m => m.field === f && !m.ignored && m.section === currentType)).join(', ')}</span>
                  )}
                </div>
              )}

              <table style={STYLE.table}>
                <thead>
                  <tr>
                    <th style={STYLE.th}>عمود CSV</th>
                    <th style={STYLE.th}>الحقل المكتشف</th>
                    <th style={STYLE.th}>الثقة</th>
                    <th style={STYLE.th}>التعيين اليدوي</th>
                    <th style={STYLE.th}>إجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {parsed?.headers.map((header) => {
                    const match = getMatchedField(header)
                    const isIgnored = match?.ignored
                    const isRequired = requiredFields.includes(match?.field)
                    const rowStyle = isIgnored ? { opacity: 0.4 } : isRequired ? { background: '#f0fff4' } : {}

                    return (
                      <tr key={header} style={rowStyle}>
                        <td style={STYLE.td}>
                          <code style={{ fontSize: 12, background: '#f0f0f0', padding: '2px 6px', borderRadius: 3 }}>{header}</code>
                        </td>
                        <td style={STYLE.td}>
                          {match?.field && !isIgnored ? (
                            <span style={{ fontWeight: 600, fontSize: 13 }}>{match.field}</span>
                          ) : (
                            <span style={{ color: '#999', fontSize: 12 }}>{isIgnored ? 'تجاهل' : '—'}</span>
                          )}
                        </td>
                        <td style={STYLE.td}>
                          {match && !isIgnored ? confidenceBadge(match.score) : null}
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
                            <option value="">-- اختر --</option>
                            {Object.entries(allFieldOptions).map(([field]) => (
                              <option key={field} value={field}>{field}</option>
                            ))}
                          </select>
                        </td>
                        <td style={STYLE.td}>
                          {isIgnored ? (
                            <button onClick={() => handleUnignore(header, currentType)} style={{ fontSize: 11, color: '#2c7bb6', background: 'none', border: 'none', cursor: 'pointer' }}>
                              استعادة
                            </button>
                          ) : match?.field ? (
                            <button onClick={() => handleIgnore(header, currentType)} style={{ fontSize: 11, color: '#dc3545', background: 'none', border: 'none', cursor: 'pointer' }}>
                              تجاهل
                            </button>
                          ) : null}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {showPreview && (
              <div>
                <h4 style={{ margin: '0 0 12px', fontSize: 14, color: '#333' }}>معاينة البيانات</h4>
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
        </div>

        <div style={STYLE.footer}>
          <button onClick={onCancel} style={STYLE.btn('secondary')}>إلغاء</button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {!allRequiredMet && (
              <span style={{ fontSize: 11, color: '#856404' }}>يرجى تعيين جميع الحقول الإلزامية أولاً</span>
            )}
            <button
              onClick={handleConfirm}
              disabled={!allRequiredMet}
              style={{ ...STYLE.btn('primary'), opacity: allRequiredMet ? 1 : 0.5, cursor: allRequiredMet ? 'pointer' : 'not-allowed' }}
            >
              تأكيد وتوليد .inp
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
