import { useCallback, useRef, useState } from 'react'
import CsvMappingDialog from './CsvMappingDialog'

export default function DxfUploader({ onData }) {
  const inputRef = useRef(null)
  const [loading, setLoading] = useState(false)
  const [fileName, setFileName] = useState('')
  const [dragOver, setDragOver] = useState(false)
  const [csvRawContent, setCsvRawContent] = useState('')
  const [showMapping, setShowMapping] = useState(false)

  const handleFile = useCallback(async (file) => {
    if (!file) return
    const name = file.name.toLowerCase()
    setFileName(file.name)

    if (name.endsWith('.json')) {
      setLoading(true)
      try {
        const text = await file.text()
        const data = JSON.parse(text)
        onData(data, file.name, 'json')
      } catch (err) {
        console.error(err)
        alert('Erreur lors du chargement du JSON: ' + err.message)
      }
      setLoading(false)
      return
    }

    if (name.endsWith('.csv')) {
      setLoading(true)
      try {
        const text = await file.text()
        const lines = text.split(/\r?\n/).filter(l => l.trim())
        if (lines.length < 2) {
          alert('Le fichier CSV doit contenir une ligne d\'en-tête et au moins une ligne de données')
          setLoading(false)
          return
        }
        setCsvRawContent(text)
        setShowMapping(true)
      } catch (err) {
        console.error(err)
        alert('Erreur lors du chargement du CSV: ' + err.message)
      }
      setLoading(false)
      return
    }

    if (!name.endsWith('.dxf')) {
      alert('Veuillez sélectionner un fichier DXF, JSON ou CSV')
      return
    }

    if (file.size > 50 * 1024 * 1024) {
      const proceed = window.confirm(
        `Le fichier est volumineux (${(file.size / 1024 / 1024).toFixed(0)} Mo).\n` +
        `L'analyse peut prendre plusieurs secondes.\n` +
        `Voulez-vous continuer ?`
      )
      if (!proceed) { setLoading(false); return }
    }

    setLoading(true)
    try {
      const buf = await file.arrayBuffer()
      const text = new TextDecoder('iso-8859-1').decode(buf)
      const isCivil3d = /C-STRM-(PIPE|STRC|TEXT)|C-SSWR-(PIPE|STRC|TEXT)/.test(text)

      if (isCivil3d) {
        const { parseCivil3dDxf } = await import('../utils/dxfParserCivil3d')
        const data = parseCivil3dDxf(text)
        onData(data, file.name, 'civil3d', text)
      } else {
        const { parseCovadisDxf } = await import('../utils/dxfParser')
        const data = parseCovadisDxf(text)
        onData(data, file.name, 'covadis', text)
      }
    } catch (err) {
      console.error(err)
      alert('Erreur lors de l\'analyse du fichier: ' + err.message)
    }
    setLoading(false)
  }, [onData])

  const onDrop = useCallback((e) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }, [handleFile])

  const handleMappingConfirm = async ({ mapping, detectedType, multiData, isMulti }) => {
    setShowMapping(false)
    setLoading(true)
    try {
      const { generateInp, generateSummary } = await import('../utils/inpGenerator.js')

      let mappedData
      if (isMulti && multiData) {
        mappedData = multiData
      } else {
        const { parseCsvText } = await import('../utils/csvAutoDetector.js')
        const parsed = parseCsvText(csvRawContent)
        if (!parsed) {
          alert('Erreur lors du parsing CSV')
          setLoading(false)
          return
        }
        mappedData = mapCsvToEpanet(parsed, mapping, detectedType)
      }

      mappedData.title = `Generated from ${fileName}`
      const result = generateInp(mappedData)
      const blob = new Blob([result.content], { type: 'text/plain' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = fileName.replace(/\.csv$/i, '.inp')
      a.click()
      URL.revokeObjectURL(url)

      const summary = generateSummary(result)
      alert(summary)

      onData({
        junctions: mappedData.junctions || [],
        pipes: mappedData.pipes || [],
        valves: mappedData.valves || [],
        pumps: mappedData.pumps || [],
        tanks: mappedData.tanks || [],
        reservoirs: mappedData.reservoirs || [],
      }, fileName.replace(/\.csv$/i, '.inp'), 'epanet-inp')

    } catch (err) {
      console.error(err)
      alert('Erreur lors du traitement CSV: ' + err.message)
    }
    setLoading(false)
  }

  const mapCsvToEpanet = (parsed, mapping, detectedType) => {
    const { headers, rows } = parsed
    const colMap = {}
    for (const [csvHeader, field] of Object.entries(mapping[detectedType] || {})) {
      const idx = headers.findIndex(h => h.toLowerCase() === csvHeader.toLowerCase())
      if (idx >= 0) colMap[field] = idx
    }

    const result = {
      junctions: [], pipes: [], valves: [], pumps: [],
      tanks: [], reservoirs: [], coordinates: [],
    }

    for (const row of rows) {
      const get = (field) => {
        const idx = colMap[field]
        if (idx === undefined || idx === null) return null
        const v = row[headers[idx]]
        return v !== undefined && v !== '' ? v : null
      }
      const num = (field) => { const v = get(field); return v !== null ? Number(v) : null }
      const str = (field) => get(field)

      if (detectedType === 'JUNCTIONS') {
        const id = str('id') || `J${result.junctions.length + 1}`
        const j = { id, elevation: num('elevation') || 0, demand: num('demand') || 0, pattern: str('pattern') || '' }
        const x = num('x')
        const y = num('y')
        if (x !== null && y !== null) result.coordinates.push({ id, x, y })
        result.junctions.push(j)
      } else if (detectedType === 'RESERVOIRS') {
        const id = str('id') || `R${result.reservoirs.length + 1}`
        result.reservoirs.push({ id, head: num('head') || 0, pattern: str('pattern') || '' })
        const x = num('x')
        const y = num('y')
        if (x !== null && y !== null) result.coordinates.push({ id, x, y })
      } else if (detectedType === 'TANKS') {
        const id = str('id') || `T${result.tanks.length + 1}`
        result.tanks.push({
          id, elevation: num('elevation') || 0, initLevel: num('initLevel') || 0,
          minLevel: num('minLevel') || 0, maxLevel: num('maxLevel') || 0,
          diameter: num('diameter') || 0, minVol: num('minVol') || 0, volCurve: str('volCurve') || '',
        })
        const x = num('x')
        const y = num('y')
        if (x !== null && y !== null) result.coordinates.push({ id, x, y })
      } else if (detectedType === 'PIPES') {
        const id = str('id') || `P${result.pipes.length + 1}`
        const n1 = str('node1')
        const n2 = str('node2')
        if (n1 && n2) {
          result.pipes.push({
            id, node1: n1, node2: n2, length: num('length') || 0,
            diameter: num('diameter') || 0, roughness: num('roughness') || 140,
            minorLoss: num('minorLoss') || 0, status: str('status') || 'Open',
          })
        }
      } else if (detectedType === 'PUMPS') {
        const id = str('id') || `PU${result.pumps.length + 1}`
        const n1 = str('node1')
        const n2 = str('node2')
        if (n1 && n2) {
          result.pumps.push({
            id, node1: n1, node2: n2, parameters: str('parameters') || '',
            curve: str('curve') || '', pattern: str('pattern') || '',
          })
        }
      } else if (detectedType === 'VALVES') {
        const id = str('id') || `V${result.valves.length + 1}`
        const n1 = str('node1')
        const n2 = str('node2')
        if (n1 && n2) {
          result.valves.push({
            id, node1: n1, node2: n2, diameter: num('diameter') || 0,
            type: str('type') || 'PRV', setting: num('setting') || 0,
            minorLoss: num('minorLoss') || 0,
          })
        }
      }
    }

    return result
  }

  const handleMappingCancel = () => {
    setShowMapping(false)
    setCsvRawContent('')
  }

  return (
    <>
      <div
        className={`upload-zone${dragOver ? ' drag-over' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".dxf,.json,.csv"
          style={{ display: 'none' }}
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) handleFile(file)
          }}
        />
        {loading ? (
          <div className="upload-loading">
            <div className="spinner" />
            <p>Analyse du fichier en cours...</p>
          </div>
        ) : (
          <>
            <div className="upload-icon">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
            </div>
            <p className="upload-text">
              {fileName
                ? `Fichier: ${fileName}`
                : 'Glissez-déposez un fichier DXF, JSON ou CSV ici'}
            </p>
            <p className="upload-sub">ou</p>
            <button className="upload-btn" onClick={() => inputRef.current?.click()}>
              Choisir un fichier DXF / JSON / CSV
            </button>
            <p className="upload-sub" style={{marginTop: 8, fontSize: '0.75rem'}}>
              Les fichiers volumineux (&gt;50 Mo) peuvent être pré-traités avec <code>extract_sewer_data.mjs</code>
            </p>
          </>
        )}
      </div>

      {showMapping && (
        <CsvMappingDialog
          rawCsv={csvRawContent}
          onConfirm={handleMappingConfirm}
          onCancel={handleMappingCancel}
        />
      )}
    </>
  )
}
