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
  fileItem: (active, status) => ({
    display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px',
    cursor: 'pointer', fontSize: 12, borderBottom: '1px solid #f0f0f0',
    background: active ? '#e8f4fd' : '#fff',
    borderLeft: `3px solid ${status === 'validated' ? '#28a745' : status === 'mapping_incomplete' || status === 'type_needed' ? '#ffc107' : status === 'type_selected' ? '#17a2b8' : '#dee2e6'}`,
    transition: 'all 0.15s',
  }),
  statusIcon: (status) => {
    const map = { pending: '⚪', type_needed: '🔴', type_selected: '🟡', mapping_incomplete: '🟡', validated: '🟢' }
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
  type_selected: 'النوع محدد — جاهز للربط',
  mapping_incomplete: 'ربط الأعمدة غير مكتمل',
  validated: 'تمت المراجعة ✓',
}

export default function BatchUploadDialog({ files, onBatchConfirm, onCancel }) {
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
      selectedType: null,
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

  const handleMappingStateChange = useCallback((state) => {
    updateFileState(activeIndex, {
      mapping: state.mapping,
      selectedType: state.selectedType,
    })
  }, [activeIndex, updateFileState])

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
        selectedType: detectedType || entry.detectedType,
        detectedType: detectedType || entry.detectedType,
      })
    }
  }, [activeIndex, fileStates, updateFileState])

  const handleMappingCancel = useCallback(() => {
    setShowMapping(false)
  }, [])

  const handleBuildAllAndGenerate = useCallback(async () => {
    const { generateInp } = await import('../utils/inpGenerator.js')
    const allData = { junctions: [], pipes: [], valves: [], pumps: [], tanks: [], reservoirs: [], coordinates: [], patterns: [], curves: [], controls: [], status: [] }

    for (const entry of fileStates) {
      if (entry.status !== 'validated') continue
      let uploadData = EMPTY_UPLOAD
      if (entry.isMultiSection && entry.multiData) {
        uploadData = entry.multiData
      } else if (entry.mapping && entry.rawContent) {
        const parsed = parseCsvText(entry.rawContent)
        if (parsed) {
          const typeKey = entry.selectedType || entry.detectedType
          uploadData = mapCsvToEpanetData(parsed, entry.mapping[typeKey] || entry.mapping, typeKey)
        }
      }
      for (const key of Object.keys(allData)) {
        if (Array.isArray(uploadData[key])) {
          allData[key] = allData[key].concat(uploadData[key])
        } else if (typeof uploadData[key] === 'object' && uploadData[key] !== null) {
          Object.assign(allData[key], uploadData[key])
        }
      }
    }

    allData.title = 'Batch Generated from CSV Files'
    const result = generateInp(allData)
    const blob = new Blob([result.content], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'project_epanet.inp'
    a.click()
    URL.revokeObjectURL(url)

    onBatchConfirm(allData)
  }, [fileStates, onBatchConfirm])

  const activeEntry = fileStates[activeIndex]
  const allValidated = fileStates.every(f => f.status === 'validated')
  const validatedCount = fileStates.filter(f => f.status === 'validated').length
  const pendingCount = fileStates.filter(f => f.status !== 'validated').length

  return (
    <div style={STYLE.overlay}>
      <div style={STYLE.dialog}>
        <div style={STYLE.header}>
          <div>
            <h3 style={{ margin: 0, fontSize: 15 }}>📋 طابور مراجعة الملفات — {files.length} ملفات</h3>
            <p style={{ margin: '2px 0 0', fontSize: 11, color: '#6c757d' }}>
              {validatedCount}/{files.length} تمت مراجعته | {pendingCount} متبقي
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={onCancel} style={STYLE.btn('secondary')}>إلغاء</button>
            <button
              onClick={handleBuildAllAndGenerate}
              disabled={!allValidated}
              style={{ ...STYLE.btn('primary'), opacity: allValidated ? 1 : 0.5, cursor: allValidated ? 'pointer' : 'not-allowed' }}
            >
              ✅ تأكيد الكل وإنشاء المشروع ({validatedCount} ملف)
            </button>
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
                  if (!entry.isMultiSection) setShowMapping(true)
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
                    <p style={{ margin: '0 0 8px', fontWeight: 600 }}>ملف مسطّح موحّد — تم التحليل تلقائياً</p>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                      {Object.entries(activeEntry.multiData.sectionSummary || {}).map(([section, info]) => (
                        <div key={section} style={{ padding: '4px 8px', background: '#fff', borderRadius: 4, border: '1px solid #e0e0e0' }}>
                          <strong>{section}</strong>: {info.rowCount} صف
                        </div>
                      ))}
                    </div>
                    <p style={{ margin: '8px 0 0', color: '#28a745', fontSize: 11 }}>✅ جاهز — لا يحتاج مراجعة يدوية</p>
                  </div>
                )}

                {!activeEntry.isMultiSection && activeEntry.status === 'validated' && (
                  <div style={{ padding: 12, background: '#d4edda', borderRadius: 6, fontSize: 12, color: '#155724' }}>
                    ✅ تمت مراجعة هذا الملف — الربط محفوظ
                  </div>
                )}

                {!activeEntry.isMultiSection && activeEntry.status !== 'validated' && (
                  <div style={{ padding: 12, background: '#f8f9fa', borderRadius: 6, fontSize: 12 }}>
                    <p style={{ margin: '0 0 8px' }}>هذه المرحلة مخصصة فقط لإسناد الأعمدة — لا يتم إنشاء ملفات هنا</p>
                    <button onClick={() => setShowMapping(true)} style={STYLE.btn('info')}>
                      مراجعة ربط الأعمدة
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {showMapping && activeEntry && !activeEntry.isMultiSection && activeEntry.rawContent && (
        <CsvMappingDialog
          key={activeEntry.id}
          rawCsv={activeEntry.rawContent}
          onConfirm={handleMappingConfirm}
          onCancel={handleMappingCancel}
          initialMapping={activeEntry.mapping ? { ...activeEntry.mapping, _selectedType: activeEntry.selectedType } : undefined}
          onStateChange={handleMappingStateChange}
        />
      )}
    </div>
  )
}

const EMPTY_UPLOAD = { junctions: [], pipes: [], valves: [], pumps: [], tanks: [], reservoirs: [], coordinates: [], patterns: [], curves: [], controls: [], status: [] }
