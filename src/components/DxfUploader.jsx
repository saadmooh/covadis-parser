import { useCallback, useRef, useState, useEffect } from 'react'
import CsvMappingDialog from './CsvMappingDialog'
import BatchUploadDialog from './BatchUploadDialog'

export default function DxfUploader({ onData, onConfirmToProject, projectMode, lang = 'en' }) {
  const inputRef = useRef(null)
  const [loading, setLoading] = useState(false)
  const [fileName, setFileName] = useState('')
  const [dragOver, setDragOver] = useState(false)
  const [csvRawContent, setCsvRawContent] = useState('')
  const [showMapping, setShowMapping] = useState(false)
  const [batchFiles, setBatchFiles] = useState(null)
  const [fileQueue, setFileQueue] = useState([])
  const [queueIndex, setQueueIndex] = useState(0)

  const fileQueueRef = useRef([])
  const queueIndexRef = useRef(0)

  const processFile = useCallback(async (file) => {
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
      return true
    }

    if (name.endsWith('.csv')) {
      setLoading(true)
      try {
        const text = await file.text()
        const lines = text.split(/\r?\n/).filter(l => l.trim())
        if (lines.length < 2) {
          alert(`Le fichier ${file.name} ne contient pas assez de données`)
          setLoading(false)
          return false
        }
        setCsvRawContent(text)
        setShowMapping(true)
        return true
      } catch (err) {
        console.error(err)
        alert('Erreur lors du chargement du CSV: ' + err.message)
        setLoading(false)
        return false
      }
    }

    if (!name.endsWith('.dxf')) {
      alert('Veuillez sélectionner un fichier DXF, JSON ou CSV')
      return false
    }

    if (file.size > 50 * 1024 * 1024) {
      const proceed = window.confirm(
        `Le fichier est volumineux (${(file.size / 1024 / 1024).toFixed(0)} Mo).\n` +
        `L'analyse peut prendre plusieurs secondes.\n` +
        `Voulez-vous continuer ?`
      )
      if (!proceed) return false
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
    return true
  }, [onData])

  const advanceQueueRef = useRef(null)

  const advanceQueue = useCallback(() => {
    const nextIdx = queueIndexRef.current + 1
    const queue = fileQueueRef.current
    if (nextIdx >= queue.length) {
      fileQueueRef.current = []
      queueIndexRef.current = 0
      setFileQueue([])
      setQueueIndex(0)
      setFileName('')
      return
    }
    queueIndexRef.current = nextIdx
    setQueueIndex(nextIdx)
    const nextFile = queue[nextIdx]
    setFileName(nextFile.name)

    if (nextFile.name.toLowerCase().endsWith('.csv')) {
      nextFile.text().then(text => {
        const lines = text.split(/\r?\n/).filter(l => l.trim())
        if (lines.length < 2) {
          alert(`Le fichier ${nextFile.name} ne contient pas assez de données`)
          advanceQueueRef.current?.()
          return
        }
        setCsvRawContent(text)
        setShowMapping(true)
      })
    } else {
      processFile(nextFile).then(() => {
        advanceQueueRef.current?.()
      })
    }
  }, [processFile])

  useEffect(() => { advanceQueueRef.current = advanceQueue })

  const handleFiles = useCallback((files) => {
    const fileArray = Array.from(files)
    if (fileArray.length === 0) return

    const csvFiles = fileArray.filter(f => f.name.toLowerCase().endsWith('.csv'))
    const otherFiles = fileArray.filter(f => !f.name.toLowerCase().endsWith('.csv'))

    for (const f of otherFiles) {
      processFile(f)
    }

    if (csvFiles.length === 0) return

    if (csvFiles.length === 1 && fileArray.length === 1) {
      processFile(csvFiles[0])
      return
    }

    setBatchFiles(csvFiles)
    return
  }, [processFile, projectMode])

  const onDrop = useCallback((e) => {
    e.preventDefault()
    setDragOver(false)
    handleFiles(e.dataTransfer.files)
  }, [handleFiles])

  const handleMappingConfirm = async ({ mapping, detectedType, multiData, isMulti }) => {
    setShowMapping(false)
    setLoading(true)
    try {
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

      if (projectMode && onConfirmToProject) {
        onConfirmToProject(mappedData, fileName)
        setCsvRawContent('')
      } else {
        const { generateInp, generateSummary } = await import('../utils/inpGenerator.js')
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
      }

      if (fileQueueRef.current.length > 0 && queueIndexRef.current < fileQueueRef.current.length - 1) {
        advanceQueue()
      } else {
        fileQueueRef.current = []
        queueIndexRef.current = 0
        setFileQueue([])
        setQueueIndex(0)
        setFileName('')
      }
    } catch (err) {
      console.error(err)
      alert('Erreur lors du traitement CSV: ' + err.message)
    }
    setLoading(false)
  }

  const mapCsvToEpanet = (parsed, mapping, detectedType) => {
    const { headers, rows } = parsed
    const colMap = {}
    const typeMapping = mapping[detectedType] || mapping
    for (const [csvHeader, field] of Object.entries(typeMapping || {})) {
      if (typeof field !== 'string') continue
      const idx = headers.findIndex(h => h.toLowerCase() === csvHeader.toLowerCase())
      if (idx >= 0) colMap[field] = idx
    }

    if (Object.keys(colMap).length === 0 && detectedType) {
      const POSITIONAL = {
        JUNCTIONS: ['id', 'elevation', 'demand', 'pattern'],
        RESERVOIRS: ['id', 'head', 'pattern'],
        TANKS: ['id', 'elevation', 'initLevel', 'minLevel', 'maxLevel', 'diameter', 'minVol', 'volCurve'],
        PIPES: ['id', 'node1', 'node2', 'length', 'diameter', 'roughness', 'minorLoss', 'status'],
        PUMPS: ['id', 'node1', 'node2', 'parameters'],
        VALVES: ['id', 'node1', 'node2', 'diameter', 'type', 'setting', 'minorLoss'],
        PATTERNS: ['id', 'factors'],
        CURVES: ['id', 'x', 'y'],
        COORDINATES: ['id', 'x', 'y'],
      }
      const posFields = POSITIONAL[detectedType]
      if (posFields) {
        for (let i = 0; i < Math.min(headers.length, posFields.length); i++) {
          colMap[posFields[i]] = i
        }
      }
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
    if (fileQueueRef.current.length > 0 && queueIndexRef.current < fileQueueRef.current.length - 1) {
      advanceQueue()
    } else {
      fileQueueRef.current = []
      queueIndexRef.current = 0
      setFileQueue([])
      setQueueIndex(0)
      setFileName('')
    }
  }

  const hasQueue = fileQueue.length > 0

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
          multiple
          style={{ display: 'none' }}
          onChange={(e) => {
            if (e.target.files?.length) handleFiles(e.target.files)
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
            {hasQueue ? (
              <p className="upload-text">
                📋 {fileQueue.length} ملفات CSV — المعالجة: {queueIndex + 1}/{fileQueue.length}
              </p>
            ) : (
              <p className="upload-text">
                {fileName
                  ? `Fichier: ${fileName}`
                  : projectMode
                    ? 'Glissez-déposez ملفات DXF, JSON أو CSV — أو اختر ملفاً/عدة ملفات'
                    : 'Glissez-déposez un fichier DXF, JSON ou CSV ici'}
              </p>
            )}
            <p className="upload-sub">ou</p>
            <button className="upload-btn" onClick={() => inputRef.current?.click()}>
              {projectMode ? 'اختر ملفات' : 'Choisir un fichier DXF / JSON / CSV'}
            </button>
            <p className="upload-sub" style={{marginTop: 8, fontSize: '0.75rem'}}>
              {projectMode
                ? 'يمكنك اختيار عدة ملفات CSV دفعة واحدة'
                : 'Fichiers multiples supportés'}
            </p>
          </>
        )}
      </div>

      {showMapping && (
        <CsvMappingDialog
          rawCsv={csvRawContent}
          onConfirm={handleMappingConfirm}
          onCancel={handleMappingCancel}
          projectMode={projectMode}
          lang={lang}
        />
      )}

      {batchFiles && (
        <BatchUploadDialog
          files={batchFiles}
          onBatchConfirm={onConfirmToProject}
          onCancel={() => setBatchFiles(null)}
          lang={lang}
        />
      )}
    </>
  )
}
