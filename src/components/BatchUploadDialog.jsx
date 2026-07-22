import { useState, useEffect, useCallback } from 'react'
import { isMultiSectionCsv, parseMultiSectionCsv, parseCsvText, mapCsvToEpanetData } from '../utils/csvAutoDetector.js'
import CsvMappingDialog from './CsvMappingDialog.jsx'

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
}

const STATUS_LABELS = { pending: 'Pending Review', type_needed: 'Needs type selection', type_selected: 'Type selected', mapping_incomplete: 'Mapping incomplete', validated: 'Reviewed ✓' }
const EMPTY = { junctions: [], pipes: [], valves: [], pumps: [], tanks: [], reservoirs: [], coordinates: [], patterns: [], curves: [], controls: [], status: [] }

export default function BatchUploadDialog({ files, onBatchConfirm, onCancel }) {
  const [fileStates, setFileStates] = useState(() => files.map((f, i) => ({ id: `b${Date.now()}_${i}`, file: f, name: f.name, status: 'pending', rawContent: null, isMultiSection: false, multiData: null, mapping: null, selectedType: null, detectedType: null, detectedConfidence: 0 })))
  const [activeIndex, setActiveIndex] = useState(0)
  const [showMapping, setShowMapping] = useState(false)
  const [preprocessing, setPreprocessing] = useState(true)

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
          else { const { parseCsvText: parse, detectTableType } = await import('../utils/csvAutoDetector.js'); const p = parse(t); if (p) { const d = detectTableType(p.headers, p.rows); e.detectedType = d.detectedType; e.detectedConfidence = d.confidence; e.status = d.confidence >= 0.75 ? 'type_selected' : 'type_needed' } else e.status = 'type_needed' }
        } catch { e.status = 'type_needed' }
      }
      if (!off) { setFileStates(u); setPreprocessing(false); const f = u.findIndex(x => x.status !== 'validated' && !x.isMultiSection); if (f >= 0) setActiveIndex(f) }
    })()
    return () => { off = true }
  }, [])

  const findNext = useCallback((from) => { for (let i = from + 1; i < fileStates.length; i++) if (fileStates[i].status !== 'validated') return i; for (let i = 0; i < from; i++) if (fileStates[i].status !== 'validated') return i; return -1 }, [fileStates])
  const findPrev = useCallback((from) => { for (let i = from - 1; i >= 0; i--) if (fileStates[i].status !== 'validated') return i; for (let i = fileStates.length - 1; i > from; i--) if (fileStates[i].status !== 'validated') return i; return -1 }, [fileStates])

  const buildAndDownload = useCallback(async () => {
    const { generateInp } = await import('../utils/inpGenerator.js')
    const all = { junctions: [], pipes: [], valves: [], pumps: [], tanks: [], reservoirs: [], coordinates: [], patterns: [], curves: [], controls: [], status: [] }
    for (const e of fileStates) {
      if (e.status !== 'validated') continue
      let d = EMPTY
      if (e.isMultiSection && e.multiData) d = e.multiData
      else if (e.mapping && e.rawContent) { const p = parseCsvText(e.rawContent); if (p) { const k = e.selectedType || e.detectedType; d = mapCsvToEpanetData(p, e.mapping[k] || e.mapping, k) } }
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
  const handleMappingStateChange = useCallback((s) => { updateFile(activeIndex, { mapping: s.mapping, selectedType: s.selectedType }) }, [activeIndex, updateFile])

  const handleNext = useCallback(() => {
    const entry = fileStates[activeIndex]
    if (entry?.status !== 'validated' && !entry?.isMultiSection) return
    setShowMapping(false)
    const nx = findNext(activeIndex)
    if (nx >= 0) {
      setActiveIndex(nx)
      if (!fileStates[nx].isMultiSection && fileStates[nx].status !== 'validated') {
        setTimeout(() => setShowMapping(true), 50)
      }
    } else {
      buildAndDownload()
    }
  }, [activeIndex, fileStates, findNext, buildAndDownload])

  const handlePrev = useCallback(() => { const p = findPrev(activeIndex); if (p >= 0) { setActiveIndex(p); setShowMapping(false) } }, [activeIndex, findPrev])

  const active = fileStates[activeIndex]
  const allDone = fileStates.every(f => f.status === 'validated')
  const vCount = fileStates.filter(f => f.status === 'validated').length
  const isLastStep = allDone || (active?.status === 'validated' && activeIndex === fileStates.length - 1)
  const canNext = active?.status === 'validated' || active?.isMultiSection
  const canPrev = findPrev(activeIndex) >= 0

  return (
    <div style={STYLE.overlay}>
      <div style={STYLE.dialog}>
        <div style={STYLE.header}>
          <div>
            <h3 style={{ margin: 0, fontSize: 15 }}>📋 Batch File Review</h3>
            <div style={STYLE.progress}>
              <span>File {activeIndex + 1} of {files.length}</span>
              <div style={{ display: 'flex', gap: 4, marginLeft: 8 }}>{fileStates.map((f, i) => <div key={f.id} style={STYLE.dot(i === activeIndex, f.status === 'validated')} />)}</div>
              <span style={{ color: '#6c757d', fontSize: 11 }}>({vCount}/{files.length})</span>
            </div>
          </div>
          <button onClick={onCancel} style={STYLE.btn('secondary')}>Cancel</button>
        </div>
        <div style={STYLE.body}>
          <div style={STYLE.sidebar}>
            {preprocessing && <div style={{ padding: 16, textAlign: 'center', fontSize: 12, color: '#6c757d' }}>Analyzing files...</div>}
            {fileStates.map((e, i) => (
              <div key={e.id} style={STYLE.fileItem(i === activeIndex, e.status)} onClick={() => { setActiveIndex(i); if (!e.isMultiSection && e.status !== 'validated') setShowMapping(true); else setShowMapping(false) }}>
                <span>{STYLE.statusIcon(e.status)}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: i === activeIndex ? 600 : 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.name}</div>
                  <div style={{ fontSize: 10, color: '#6c757d', marginTop: 2 }}>{STATUS_LABELS[e.status]}{e.detectedType && e.detectedType !== 'MULTI' && <span> — {e.detectedType}</span>}</div>
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
                  <span style={{ fontSize: 12, color: '#6c757d' }}>{STATUS_LABELS[active.status]}</span>
                </div>
                {active.isMultiSection && active.multiData && (
                  <div style={{ padding: 14, background: '#f8f9fa', borderRadius: 6, fontSize: 12 }}>
                    <p style={{ margin: '0 0 8px', fontWeight: 600 }}>Unified flat file — Auto-analyzed</p>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                      {Object.entries(active.multiData.sectionSummary || {}).map(([s, info]) => <div key={s} style={{ padding: '4px 8px', background: '#fff', borderRadius: 4, border: '1px solid #e0e0e0' }}><strong>{s}</strong>: {info.rowCount} rows</div>)}
                    </div>
                    <p style={{ margin: '8px 0 0', color: '#28a745', fontSize: 11 }}>✅ Ready — No manual review needed</p>
                  </div>
                )}
                {!active.isMultiSection && active.status === 'validated' && <div style={{ padding: 14, background: '#d4edda', borderRadius: 6, fontSize: 12, color: '#155724' }}>✅ File reviewed — Mapping saved</div>}
                {!active.isMultiSection && active.status !== 'validated' && (
                  <div style={{ padding: 14, background: '#f8f9fa', borderRadius: 6, fontSize: 12 }}>
                    <p style={{ margin: '0 0 10px', fontWeight: 500 }}>This step is only for column mapping</p>
                    <button onClick={() => setShowMapping(true)} style={STYLE.btn('info')}>Review Column Mapping</button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
        <div style={STYLE.nav}>
          <button onClick={handlePrev} disabled={!canPrev} style={{ ...STYLE.btn('secondary'), opacity: canPrev ? 1 : 0.4 }}>← Previous</button>
          <button onClick={isLastStep ? buildAndDownload : handleNext} disabled={!canNext && !isLastStep} style={{ ...STYLE.btn(isLastStep ? 'primary' : 'info'), opacity: canNext || isLastStep ? 1 : 0.4 }}>
            {isLastStep ? '✅ Finish Review & Generate EPANET Project' : 'Next →'}
          </button>
        </div>
      </div>
      {showMapping && active && !active.isMultiSection && active.rawContent && (
        <CsvMappingDialog key={active.id} rawCsv={active.rawContent} onConfirm={handleMappingConfirm} onCancel={handleMappingCancel}
          initialMapping={active.mapping ? { ...active.mapping, _selectedType: active.selectedType } : undefined} onStateChange={handleMappingStateChange}
          batchMode onNext={handleNext} />
      )}
    </div>
  )
}
