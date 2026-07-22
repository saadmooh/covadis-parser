import { useState, useEffect, useCallback } from 'react'
import { isMultiSectionCsv, parseMultiSectionCsv, parseCsvText, mapCsvToEpanetData } from '../utils/csvAutoDetector.js'
import CsvMappingDialog from './CsvMappingDialog.jsx'

const STYLE = {
  overlay: {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000,
  },
  dialog: {
    background: '#fff', borderRadius: 10, width: '95vw', maxWidth: 1100,
    maxHeight: '90vh', boxShadow: '0 8px 40px rgba(0,0,0,0.35)', display: 'flex',
    flexDirection: 'column', overflow: 'hidden',
  },
  header: {
    padding: '14px 20px', borderBottom: '1px solid #e0e0e0', background: '#f7f8fa',
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  },
  body: { flex: 1, display: 'flex', overflow: 'hidden' },
  sidebar: { width: 280, borderRight: '1px solid #e0e0e0', overflowY: 'auto', flexShrink: 0 },
  content: { flex: 1, overflowY: 'auto', padding: 16 },
  footer: {
    padding: '12px 20px', borderTop: '1px solid #e0e0e0', background: '#f7f9fa',
    display: 'flex', gap: 8, justifyContent: 'space-between', alignItems: 'center',
  },
  fileItem: (active, status) => ({
    display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px',
    cursor: 'pointer', fontSize: 12, borderBottom: '1px solid #f0f0f0',
    background: active ? '#e8f4fd' : '#fff',
    borderLeft: `3px solid ${status === 'added' ? '#28a745' : status === 'validated' ? '#28a745' : status === 'mapping_incomplete' || status === 'type_needed' ? '#ffc107' : status === 'type_selected' ? '#17a2b8' : '#dee2e6'}`,
    transition: 'all 0.15s',
  }),
  statusIcon: (status) => {
    const map = { pending: '⚪', type_needed: '🔴', type_selected: '🟡', mapping_incomplete: '🟡', validated: '🟢', added: '✅' }
    return map[status] || '⚪'
  },
  btn: (variant) => ({
    padding: '8px 16px', border: 'none', borderRadius: 6, cursor: 'pointer',
    fontWeight: 600, fontSize: 13,
    background: variant === 'primary' ? '#28a745' : variant === 'secondary' ? '#6c757d' : '#2c7bb6',
    color: '#fff',
  }),
}

const STATUS_LABELS = {
  pending: 'بانتظار المراجعة',
  type_needed: 'يحتاج اختيار النوع',
  type_selected: 'النوع محدد',
  mapping_incomplete: 'ربط الأعمدة غير مكتمل',
  validated: 'جاهز للإضافة',
  added: 'أُضيف للمشروع',
}

const EMPTY_UPLOAD = { junctions: [], pipes: [], valves: [], pumps: [], tanks: [], reservoirs: [], coordinates: [] }

function mapCsvLocal(parsed, mapping, detectedType) {
  if (!parsed || !mapping || !detectedType) return EMPTY_UPLOAD
  return mapCsvToEpanetData(parsed, mapping[detectedType] || {}, detectedType)
}

export default function BatchUploadDialog({ files, onAddToProject, onCancel, projectMode }) {
  const [fileStates, setFileStates] = useState(() =>
    files.map((f, i) => ({
      id: `batch_${Date.now()}_${i}`,
      file: f,
      name: f.name,
      status: 'pending',
      rawContent: null,
      isMultiSection: false,
      multiData: null,
      mapping: null,
      detectedType: null,
      detectedConfidence: 0,
    }))
  )
  const [activeIndex, setActiveIndex] = useState(0)
  const [showMapping, setShowMapping] = useState(false)
  const [preprocessing, setPreprocessing] = useState(true)

  useEffect(() => {
    let cancelled = false
    const runPreprocessing = async () => {
      const updated = [...fileStates]
      for (let i = 0; i < updated.length; i++) {
        const entry = updated[i]
        if (!entry.name.toLowerCase().endsWith('.csv')) {
          entry.status = 'validated'
          continue
        }
        try {
          const text = await entry.file.text()
          if (cancelled) return
          entry.rawContent = text
          entry.isMultiSection = isMultiSectionCsv(text)
          if (entry.isMultiSection) {
            entry.multiData = parseMultiSectionCsv(text)
            entry.status = 'validated'
            entry.detectedType = 'MULTI'
            entry.detectedConfidence = 0.98
          } else {
            const { parseCsvText: parse, detectTableType } = await import('../utils/csvAutoDetector.js')
            const parsed = parse(text)
            if (parsed) {
              const detection = detectTableType(parsed.headers, parsed.rows)
              entry.detectedType = detection.detectedType
              entry.detectedConfidence = detection.confidence
              entry.status = detection.confidence >= 0.75 ? 'type_selected' : 'type_needed'
            } else {
              entry.status = 'type_needed'
            }
          }
        } catch {
          entry.status = 'type_needed'
        }
      }
      if (!cancelled) {
        setFileStates(updated)
        setPreprocessing(false)
      }
    }
    runPreprocessing()
    return () => { cancelled = true }
  }, [])

  const updateFileState = useCallback((index, updates) => {
    setFileStates(prev => {
      const next = [...prev]
      next[index] = { ...next[index], ...updates }
      return next
    })
  }, [])

  const handleMappingConfirm = useCallback(({ mapping, detectedType, multiData, isMulti }) => {
    const idx = activeIndex
    setShowMapping(false)

    if (isMulti && multiData) {
      updateFileState(idx, {
        status: 'validated',
        multiData,
        isMultiSection: true,
      })
    } else {
      const entry = fileStates[idx]
      updateFileState(idx, {
        status: 'validated',
        mapping,
        detectedType: detectedType || entry.detectedType,
      })
    }
  }, [activeIndex, fileStates, updateFileState])

  const handleMappingCancel = useCallback(() => {
    setShowMapping(false)
  }, [])

  const handleAddSingle = useCallback((index) => {
    const entry = fileStates[index]
    if (!entry || entry.status !== 'validated') return
    const uploadData = entry.isMultiSection && entry.multiData
      ? entry.multiData
      : entry.mapping && entry.rawContent
        ? (() => {
            const parsed = parseCsvText(entry.rawContent)
            return parsed ? mapCsvLocal(parsed, { [entry.detectedType]: entry.mapping }, entry.detectedType) : EMPTY_UPLOAD
          })()
        : EMPTY_UPLOAD
    onAddToProject(uploadData, entry.name)
    updateFileState(index, { status: 'added' })
  }, [fileStates, onAddToProject, updateFileState])

  const handleAddAll = useCallback(() => {
    for (let i = 0; i < fileStates.length; i++) {
      if (fileStates[i].status === 'validated') {
        const entry = fileStates[i]
        const uploadData = entry.isMultiSection && entry.multiData
          ? entry.multiData
          : entry.mapping && entry.rawContent
            ? (() => {
                const parsed = parseCsvText(entry.rawContent)
                return parsed ? mapCsvLocal(parsed, { [entry.detectedType]: entry.mapping }, entry.detectedType) : EMPTY_UPLOAD
              })()
            : EMPTY_UPLOAD
        onAddToProject(uploadData, entry.name)
        updateFileState(i, { status: 'added' })
      }
    }
  }, [fileStates, onAddToProject, updateFileState])

  const activeEntry = fileStates[activeIndex]
  const allValidated = fileStates.every(f => f.status === 'validated' || f.status === 'added')
  const allAdded = fileStates.every(f => f.status === 'added')
  const addedCount = fileStates.filter(f => f.status === 'added').length
  const validatedCount = fileStates.filter(f => f.status === 'validated').length

  return (
    <div style={STYLE.overlay}>
      <div style={STYLE.dialog}>
        <div style={STYLE.header}>
          <div>
            <h3 style={{ margin: 0, fontSize: 15 }}>📋 طابور مراجعة الملفات — {files.length} ملفات</h3>
            <p style={{ margin: '2px 0 0', fontSize: 11, color: '#6c757d' }}>
              {addedCount} أُضيف | {validatedCount} جاهز | {fileStates.length - addedCount - validatedCount} يحتاج مراجعة
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={onCancel} style={STYLE.btn('secondary')}>إغلاق</button>
            {allValidated && !allAdded && (
              <button onClick={handleAddAll} style={STYLE.btn('primary')}>
                ✅ تأكيد الكل وإضافة للمشروع ({validatedCount})
              </button>
            )}
          </div>
        </div>

        <div style={STYLE.body}>
          <div style={STYLE.sidebar}>
            {preprocessing && (
              <div style={{ padding: 16, textAlign: 'center', fontSize: 12, color: '#6c757d' }}>
                جاري تحليل الملفات...
              </div>
            )}
            {fileStates.map((entry, i) => (
              <div
                key={entry.id}
                style={STYLE.fileItem(i === activeIndex, entry.status)}
                onClick={() => {
                  setActiveIndex(i)
                  if (!entry.isMultiSection && entry.status !== 'added') setShowMapping(true)
                }}
              >
                <span>{STYLE.statusIcon(entry.status)}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: i === activeIndex ? 600 : 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {entry.name}
                  </div>
                  <div style={{ fontSize: 10, color: '#6c757d', marginTop: 2 }}>
                    {STATUS_LABELS[entry.status]}
                    {entry.detectedType && entry.detectedType !== 'MULTI' && (
                      <span> — {entry.detectedType} ({(entry.detectedConfidence * 100).toFixed(0)}%)</span>
                    )}
                    {entry.detectedType === 'MULTI' && <span> — مسطّح</span>}
                  </div>
                </div>
                {entry.status === 'validated' && !allAdded && (
                  <button
                    onClick={(e) => { e.stopPropagation(); handleAddSingle(i) }}
                    style={{ fontSize: 10, color: '#28a745', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}
                  >
                    إضافة
                  </button>
                )}
              </div>
            ))}
          </div>

          <div style={STYLE.content}>
            {activeEntry && (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                  <h4 style={{ margin: 0, fontSize: 14 }}>{activeEntry.name}</h4>
                  {STYLE.statusIcon(activeEntry.status)}
                  <span style={{ fontSize: 12, color: '#6c757d' }}>{STATUS_LABELS[activeEntry.status]}</span>
                </div>

                {activeEntry.isMultiSection && activeEntry.multiData && (
                  <div style={{ padding: 12, background: '#f8f9fa', borderRadius: 6, fontSize: 12 }}>
                    <p style={{ margin: '0 0 8px', fontWeight: 600 }}>ملف مسطّح موحّد (multi-section)</p>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                      {Object.entries(activeEntry.multiData.sectionSummary || {}).map(([section, info]) => (
                        <div key={section} style={{ padding: '4px 8px', background: '#fff', borderRadius: 4, border: '1px solid #e0e0e0' }}>
                          <strong>{section}</strong>: {info.rowCount} صف
                        </div>
                      ))}
                    </div>
                    <button
                      onClick={() => handleAddSingle(activeIndex)}
                      disabled={activeEntry.status === 'added'}
                      style={{ ...STYLE.btn('primary'), marginTop: 12, opacity: activeEntry.status === 'added' ? 0.5 : 1 }}
                    >
                      {activeEntry.status === 'added' ? 'تمت الإضافة ✓' : '✅ تأكيد وإضافة هذا الملف'}
                    </button>
                  </div>
                )}

                {!activeEntry.isMultiSection && activeEntry.status !== 'added' && (
                  <div style={{ padding: 12, background: '#f8f9fa', borderRadius: 6, fontSize: 12 }}>
                    <p style={{ margin: '0 0 8px' }}>اضغط على الملف في القائمة لفتح شاشة ربط الأعمدة</p>
                    <button onClick={() => setShowMapping(true)} style={STYLE.btn('info')}>
                      مراجعة ربط الأعمدة
                    </button>
                  </div>
                )}

                {activeEntry.status === 'added' && (
                  <div style={{ padding: 16, textAlign: 'center', color: '#28a745', fontSize: 14 }}>
                    ✅ تمت إضافة هذا الملف للمشروع بنجاح
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {showMapping && activeEntry && !activeEntry.isMultiSection && activeEntry.rawContent && (
        <CsvMappingDialog
          rawCsv={activeEntry.rawContent}
          onConfirm={handleMappingConfirm}
          onCancel={handleMappingCancel}
          projectMode={projectMode}
        />
      )}
    </div>
  )
}
