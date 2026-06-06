import { useCallback, useRef, useState } from 'react'

export default function DxfUploader({ onData }) {
  const inputRef = useRef(null)
  const [loading, setLoading] = useState(false)
  const [fileName, setFileName] = useState('')
  const [dragOver, setDragOver] = useState(false)

  const handleFile = useCallback(async (file) => {
    if (!file) return
    const name = file.name.toLowerCase()
    setFileName(file.name)

    if (name.endsWith('.json')) {
      setLoading(true)
      try {
        const text = await file.text()
        const data = JSON.parse(text)
        onData(data, file.name)
      } catch (err) {
        console.error(err)
        alert('Erreur lors du chargement du JSON: ' + err.message)
      }
      setLoading(false)
      return
    }

    if (!name.endsWith('.dxf')) {
      alert('Veuillez sélectionner un fichier DXF ou JSON')
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
      const { parseCovadisDxf } = await import('../utils/dxfParser')
      const data = parseCovadisDxf(text)
      onData(data, file.name)
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

  return (
    <div
      className={`upload-zone${dragOver ? ' drag-over' : ''}`}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".dxf,.json"
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
              : 'Glissez-déposez un fichier DXF ou JSON ici'}
          </p>
          <p className="upload-sub">ou</p>
          <button className="upload-btn" onClick={() => inputRef.current?.click()}>
            Choisir un fichier DXF / JSON
          </button>
          <p className="upload-sub" style={{marginTop: 8, fontSize: '0.75rem'}}>
            Les fichiers volumineux (&gt;50 Mo) peuvent être pré-traités avec <code>extract_sewer_data.mjs</code>
          </p>
        </>
      )}
    </div>
  )
}
