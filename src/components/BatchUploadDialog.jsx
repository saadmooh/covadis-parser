import { useState, useEffect, useCallback } from 'react'
import { isMultiSectionCsv, parseMultiSectionCsv, parseCsvText, mapCsvToEpanetData } from '../utils/csvAutoDetector.js'
import CsvMappingDialog from './CsvMappingDialog.jsx'
import { t, STATUS_LABELS } from '../utils/translations.js'

const STYLE = {
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000 },
  dialog: { background: '#fff', borderRadius: 10, width: '95vw', maxWidth: 1100, maxHeight: '90vh', boxShadow: '0 8px 40px rgba(0,0,0,0.35)', display: 'flex', flexDirection: 'column', overflow: 'hidden' },
  header: { padding: '14px 20px', borderBottom: '1px solid #e0e0e0', background: '#f7f8fa', display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  progress: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#333' },
  dot: (active, done) => ({ width: 10, height: 10, borderRadius: '50%', background: done ? '#28a745' : active ? '#2c7bb6' : '#dee2e6', transition: 'all 0.2s' }),
  body: { flex: 1, display: 'flex', overflow: 'hidden' },
  sidebar: { width: 260, borderRight: '1px solid #e0e0e0', overflowY: 'auto', flexShrink: 0 },
  content: { flex: 1, overflowY: 'auto', padding: 20 },
  nav: { padding: '12px 20px', borderTop: '1px solid #e0e0e0', background: '#f7f9fa', display: 'flex', gap: 8, justifyContent: 'space-between', alignItems: 'center' },
  fileItem: (active, status) => ({ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', cursor: 'pointer', fontSize: 12, borderBottom: '1px solid #f0f0f0', background: active ? '#e8f4fd' : '#fff', borderLeft: `3px solid ${status === 'validated' ? '#28a745' : status === 'type_needed' ? '#ffc107' : status === 'type_selected' ? '#17a2b8' : '#dee2e6'}`, transition: 'all 0.15s' }),
  statusIcon: (s) => ({ pending: '⚪', type_needed: '🔴', type_selected: '🟡', mapping_incomplete: '🟡', validated: '🟢' }[s] || '⚪'),
  btn: (v) => ({ padding: '8px 16px', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600, fontSize: 13, background: v === 'primary' ? '#28a745' : v === 'info' ? '#2c7bb6' : '#6c757d', color: '#fff' }),
  langBtn: (active) => ({ padding: '4px 10px', border: `1px solid ${active ? '#2c7bb6' : '#ccc'}`, borderRadius: 4, cursor: 'pointer', fontWeight: active ? 700 : 400, fontSize: 11, background: active ? '#e8f4fd' : '#fff', color: active ? '#2c7bb6' : '#666', transition: 'all 0.15s' }),
}

const LANG_OPTIONS = [
  { code: 'en', label: 'EN' },
  { code: 'fr', label: 'FR' },
  { code: 'ar', label: 'عربي' },
]

const EMPTY = { junctions: [], pipes: [], valves: [], pumps: [], tanks: [], reservoirs: [], coordinates: [], patterns: [], curves: [], controls: [], status: [] }

export default function BatchUploadDialog({ files, onBatchConfirm, onCancel }) {
  const [fileStates, setFileStates] = useState(() => files.map((f, i) => ({ id: `b${Date.now()}_${i}`, file: f, name: f.name, status: 'pending', rawContent: null, isMultiSection: false, multiData: null, mapping: null, selectedType: null, detectedType: null, detectedConfidence: 0 })))
  const [activeIndex, setActiveIndex] = useState(0)
  const [showMapping, setShowMapping] = useState(false)
  const [preprocessing, setPreprocessing] = useState(true)
  const [lang, setLang] = useState('en')

  const labels = STATUS_LABELS(lang)
  const rtl = lang === 'ar'

  const updateFile = useCallback((i, u) => { setFileStates(p => { const n = [...p]; n[i] = { ...n[i], ...u }; return n }) }, [])

  useEffect(() => {
    let off = false
    ;(async () => {
      const u = [...fileStates]
      for (let i = 0; i < u.length; i++) {
        const e = u[i]
        if (!e.name.toLowerCase().endsWith('.csv')) { e.status = 'validated'; continue }
        try {
          const t = await e.file.text()
          if (off) return
          e.rawContent = t
          e.isMultiSection = isMultiSectionCsv(t)
          if (e.isMultiSection) { e.multiData = parseMultiSectionCsv(t); e.status = 'validated'; e.detectedType = 'MULTI'; e.detectedConfidence = 0.98 }
          else { const { parseCsvText: parse, detectTableType, suggestMappingsForType } = await import('../utils/csvAutoDetector.js'); const p = parse(t); if (p) { const d = detectTableType(p.headers, p.rows); e.detectedType = d.detectedType; e.detectedConfidence = d.confidence; if (d.confidence >= 0.75 && d.detectedType) { const suggestions = suggestMappingsForType(p.headers, p.rows, d.detectedType); const mapping = {}; for (const s of suggestions) { if (s.field) mapping[s.header] = s.field; } e.mapping = mapping; } e.status = d.confidence >= 0.75 ? 'type_selected' : 'type_needed' } else e.status = 'type_needed' }
        } catch { e.status = 'type_needed' }
      }
      if (!off) { setFileStates(u); setPreprocessing(false); const f = u.findIndex(x => x.status !== 'validated' && !x.isMultiSection); if (f >= 0) setActiveIndex(f) }
    })()
    return () => { off = true }
  }, [])

  const findNext = useCallback((from) => {
    if (from + 1 < fileStates.length) return from + 1
    return -1
  }, [fileStates])
  const findPrev = useCallback((from) => { for (let i = from - 1; i >= 0; i--) if (fileStates[i].status !== 'validated') return i; for (let i = fileStates.length - 1; i > from; i--) if (fileStates[i].status !== 'validated') return i; return -1 }, [fileStates])

  const buildAndDownload = useCallback(async () => {
    const { generateInp } = await import('../utils/inpGenerator.js')
    const { suggestMappingsForType: suggest } = await import('../utils/csvAutoDetector.js')
    const all = { junctions: [], pipes: [], valves: [], pumps: [], tanks: [], reservoirs: [], coordinates: [], patterns: [], curves: [], controls: [], status: [] }
    for (const e of fileStates) {
      if (e.status !== 'validated') continue
      let d = EMPTY
      if (e.isMultiSection && e.multiData) d = e.multiData
      else if (e.rawContent) {
        const p = parseCsvText(e.rawContent)
        if (p) {
          const typeKey = e.selectedType || e.detectedType
          let mapping = e.mapping?.[typeKey] || e.mapping
          if (!mapping || Object.keys(mapping).length === 0) {
            const suggestions = suggest(p.headers, p.rows, typeKey)
            mapping = {}
            for (const s of suggestions) { if (s.field) mapping[s.header] = s.field }
          }
          if (mapping && Object.keys(mapping).length > 0) d = mapCsvToEpanetData(p, mapping, typeKey)
        }
      }
      for (const k of Object.keys(all)) { if (Array.isArray(d[k])) all[k] = all[k].concat(d[k]); else if (typeof d[k] === 'object' && d[k] !== null) Object.assign(all[k], d[k]) }
    }
    all.title = 'Batch Generated from CSV Files'
    const r = generateInp(all)
    const b = new Blob([r.content], { type: 'text/plain' })
    const u = URL.createObjectURL(b); const a = document.createElement('a'); a.href = u; a.download = 'project_epanet.inp'; a.click(); URL.revokeObjectURL(u)
    onBatchConfirm(all)
  }, [fileStates, onBatchConfirm])

  const handleMappingConfirm = useCallback(({ mapping, detectedType, multiData, isMulti }) => {
    const idx = activeIndex
    setShowMapping(false)
    if (isMulti && multiData) updateFile(idx, { status: 'validated', multiData, isMultiSection: true })
    else { const e = fileStates[idx]; updateFile(idx, { status: 'validated', mapping, selectedType: detectedType || e.detectedType, detectedType: detectedType || e.detectedType }) }
    const nx = findNext(idx)
    if (nx >= 0) {
      setActiveIndex(nx)
      if (!fileStates[nx].isMultiSection) setTimeout(() => setShowMapping(true), 50)
    }
  }, [activeIndex, fileStates, updateFile, findNext])

  const handleMappingCancel = useCallback(() => { setShowMapping(false) }, [])
  const handleMappingStateChange = useCallback((s) => {
    const update = { mapping: s.mapping, selectedType: s.selectedType }
    if (fileStates[activeIndex]?.status !== 'validated') update.status = 'type_selected'
    updateFile(activeIndex, update)
  }, [activeIndex, updateFile, fileStates])

  const handleNext = useCallback(() => {
    setShowMapping(false)
    if (fileStates[activeIndex]?.status !== 'validated') updateFile(activeIndex, { status: 'validated' })
    const nx = findNext(activeIndex)
    if (nx >= 0) {
      setActiveIndex(nx)
      if (!fileStates[nx].isMultiSection) setTimeout(() => setShowMapping(true), 50)
    }
  }, [activeIndex, fileStates, findNext, updateFile])

  const handlePrev = useCallback(() => { const p = findPrev(activeIndex); if (p >= 0) { setActiveIndex(p); setShowMapping(false) } }, [activeIndex, findPrev])

  const active = fileStates[activeIndex]
  const allDone = fileStates.every(f => f.status === 'validated')
  const vCount = fileStates.filter(f => f.status === 'validated').length
  const isLastStep = activeIndex === fileStates.length - 1
  const canNext = active?.status === 'validated' || active?.isMultiSection
  const canPrev = findPrev(activeIndex) >= 0

  return (
    <div style={STYLE.overlay}>
      <div style={{ ...STYLE.dialog, direction: rtl ? 'rtl' : 'ltr' }}>
        <div style={STYLE.header}>
          <div>
            <h3 style={{ margin: 0, fontSize: 15 }}>{t(lang, 'batchTitle')}</h3>
            <div style={STYLE.progress}>
              <span>{t(lang, 'fileOf', activeIndex + 1, files.length)}</span>
              <div style={{ display: 'flex', gap: 4, marginLeft: 8 }}>{fileStates.map((f, i) => <div key={f.id} style={STYLE.dot(i === activeIndex, f.status === 'validated')} />)}</div>
              <span style={{ color: '#6c757d', fontSize: 11 }}>({vCount}/{files.length})</span>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ display: 'flex', gap: 4 }}>
              {LANG_OPTIONS.map(l => (
                <button key={l.code} onClick={() => setLang(l.code)} style={STYLE.langBtn(lang === l.code)}>{l.label}</button>
              ))}
            </div>
            <button onClick={onCancel} style={STYLE.btn('secondary')}>{t(lang, 'cancel')}</button>
          </div>
        </div>
        <div style={STYLE.body}>
          <div style={STYLE.sidebar}>
            {preprocessing && <div style={{ padding: 16, textAlign: 'center', fontSize: 12, color: '#6c757d' }}>{t(lang, 'analyzing')}</div>}
            {fileStates.map((e, i) => (
              <div key={e.id} style={STYLE.fileItem(i === activeIndex, e.status)} onClick={() => { setActiveIndex(i); if (!e.isMultiSection && e.status !== 'validated') setShowMapping(true); else setShowMapping(false) }}>
                <span>{STYLE.statusIcon(e.status)}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: i === activeIndex ? 600 : 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.name}</div>
                  <div style={{ fontSize: 10, color: '#6c757d', marginTop: 2 }}>{labels[e.status]}{e.detectedType && e.detectedType !== 'MULTI' && <span> — {e.detectedType}</span>}</div>
                </div>
              </div>
            ))}
          </div>
          <div style={STYLE.content}>
            {active && (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                  <h4 style={{ margin: 0, fontSize: 15 }}>{active.name}</h4>
                  {STYLE.statusIcon(active.status)}
                  <span style={{ fontSize: 12, color: '#6c757d' }}>{labels[active.status]}</span>
                </div>
                {active.isMultiSection && active.multiData && (
                  <div style={{ padding: 14, background: '#f8f9fa', borderRadius: 6, fontSize: 12 }}>
                    <p style={{ margin: '0 0 8px', fontWeight: 600 }}>{t(lang, 'unifiedFile')}</p>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                      {Object.entries(active.multiData.sectionSummary || {}).map(([s, info]) => <div key={s} style={{ padding: '4px 8px', background: '#fff', borderRadius: 4, border: '1px solid #e0e0e0' }}><strong>{s}</strong>: {t(lang, 'rows', info.rowCount)}</div>)}
                    </div>
                    <p style={{ margin: '8px 0 0', color: '#28a745', fontSize: 11 }}>✅ {t(lang, 'readyNoReview')}</p>
                  </div>
                )}
                {!active.isMultiSection && active.status === 'validated' && <div style={{ padding: 14, background: '#d4edda', borderRadius: 6, fontSize: 12, color: '#155724' }}>✅ {t(lang, 'fileReviewed')}</div>}
                {!active.isMultiSection && active.status !== 'validated' && (
                  <div style={{ padding: 14, background: '#f8f9fa', borderRadius: 6, fontSize: 12 }}>
                    <p style={{ margin: '0 0 10px', fontWeight: 500 }}>{t(lang, 'columnMappingOnly')}</p>
                    <button onClick={() => setShowMapping(true)} style={STYLE.btn('info')}>{t(lang, 'reviewMapping')}</button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
        <div style={STYLE.nav}>
          <button onClick={handlePrev} disabled={!canPrev} style={{ ...STYLE.btn('secondary'), opacity: canPrev ? 1 : 0.4 }}>{t(lang, 'previous')}</button>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {!allDone && <span style={{ fontSize: 11, color: '#856404' }}>{t(lang, 'filesReviewed', vCount, files.length)}</span>}
            {isLastStep && allDone && (
              <button onClick={buildAndDownload} style={STYLE.btn('primary')}>
                {t(lang, 'generateInp')}
              </button>
            )}
            {!isLastStep && (
              <button onClick={handleNext} style={STYLE.btn('info')}>{t(lang, 'next')}</button>
            )}
          </div>
        </div>
      </div>
      {showMapping && active && !active.isMultiSection && active.rawContent && (
        <CsvMappingDialog key={active.id} rawCsv={active.rawContent} onConfirm={handleMappingConfirm} onCancel={handleMappingCancel}
          initialMapping={active.mapping ? { ...active.mapping, _selectedType: active.selectedType } : undefined} onStateChange={handleMappingStateChange}
          batchMode onNext={handleNext} lang={lang} />
      )}
    </div>
  )
}
