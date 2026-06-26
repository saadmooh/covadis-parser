import { useState, useEffect, useCallback } from 'react'
import { useMap, useMapEvents } from 'react-leaflet'
import L from 'leaflet'
import proj4 from 'proj4'
import { toDxfString } from '../utils/dxfWriter'

function encodeToLatin1(str) {
  // Encode string to Latin-1 bytes for DXF compatibility
  // Characters outside Latin-1 range (128-255) are replaced with '?'
  const view = new Uint8Array(str.length)
  for (let i = 0; i < str.length; i++) {
    const cp = str.charCodeAt(i)
    view[i] = cp < 256 ? cp : 63 // '?' for unknown
  }
  return view
}

function toDxfCoord(lat, lng, crsCode) {
  const t = proj4('EPSG:4326', crsCode, [lng, lat])
  return { x: t[0], y: t[1] }
}

function EditInteraction({ editMode, editTool, setDialogData, setEditManholes, setEditPipes, editManholes, editPipes, nextId, setNextId, pipeStartNode, setPipeStartNode, crsCode }) {
  const map = useMap()

  useMapEvents({
    click(e) {
      if (!editMode) return
      if (editTool === 'manhole') {
        const newMh = {
          id: `N${nextId}`, ct: '', cr: '', pp: '',
          x: 0, y: 0, lat: e.latlng.lat, lng: e.latlng.lng,
          _isNew: true,
        }
        setNextId(n => n + 1)
        setEditManholes(prev => {
          const idx = prev.length
          setDialogData({ type: 'manhole', index: idx, ...newMh })
          return [...prev, newMh]
        })
      }
    },
  })

  // Find nearest manhole to a latlng (threshold 20px)
  const findNearest = useCallback((latlng) => {
    if (!editManholes.length) return -1
    const pt = map.latLngToContainerPoint(latlng)
    let best = -1, bestDist = 20
    for (let i = 0; i < editManholes.length; i++) {
      const m = editManholes[i]
      const mp = map.latLngToContainerPoint(L.latLng(m.lat ?? 0, m.lng ?? 0))
      const d = pt.distanceTo(mp)
      if (d < bestDist) { bestDist = d; best = i }
    }
    return best
  }, [editManholes, map])

  // Manhole marker click handler registered via event delegation
  useEffect(() => {
    if (!editMode) return
    const handleClick = (e) => {
      const feat = e.sourceTarget
      if (!feat || !feat.editIdx === undefined) return
      const idx = feat.editIdx
      if (editTool === 'delete') {
        setEditManholes(prev => prev.filter((_, i) => i !== idx))
        setEditPipes(prev => prev.filter(p => p.fromNode !== editManholes[idx]?.id && p.toNode !== editManholes[idx]?.id))
      } else if (editTool === 'property') {
        setDialogData({ type: 'manhole', index: idx, ...editManholes[idx] })
      } else if (editTool === 'pipe') {
        if (pipeStartNode === null) {
          setPipeStartNode(idx)
          feat.setStyle({ color: '#ff0', weight: 4 })
        } else if (pipeStartNode !== idx) {
          const m1 = editManholes[pipeStartNode]
          const m2 = editManholes[idx]
          const newPipe = {
            fromNode: m1.id, toNode: m2.id,
            diam: 315, material: 'PVC',
            start: toDxfCoord(m1.lat, m1.lng, crsCode),
            end: toDxfCoord(m2.lat, m2.lng, crsCode),
            _isNew: true,
          }
          setEditPipes(prev => [...prev, newPipe])
          setPipeStartNode(null)
        } else {
          setPipeStartNode(null)
        }
      }
    }
    map.eachLayer(l => {
      if (l.editIdx !== undefined) {
        l.off('click', handleClick)
        l.on('click', handleClick)
      }
    })
    map.on('click', (e) => {
      if (editTool === 'manhole' && !e.originalEvent._skip) return
      if (editTool === 'pipe' && pipeStartNode !== null) {
        // Check if click is on the map (not a manhole)
        const nearest = findNearest(e.latlng)
        if (nearest === -1 && pipeStartNode !== null) {
          setPipeStartNode(null)
        }
      }
    })
    return () => { map.eachLayer(l => l.off('click', handleClick)) }
  }, [editMode, editTool, pipeStartNode, editManholes, setEditManholes, setEditPipes, setDialogData, map, crsCode, setPipeStartNode, findNearest])

  return null
}

export default function NetworkEditor({ data, crsCode, onSaveDxf }) {
  const [editMode, setEditMode] = useState(false)
  const [editTool, setEditTool] = useState(null)
  const [editManholes, setEditManholes] = useState([])
  const [editPipes, setEditPipes] = useState([])
  const [pipeStartNode, setPipeStartNode] = useState(null)
  const [dialogData, setDialogData] = useState(null)
  const [nextId, setNextId] = useState(1)

  useEffect(() => {
    if (data && !editMode) {
      const mhs = (data.manholes || []).map(m => ({
        ...m, lat: 0, lng: 0,
      }))
      const segs = (data.profileSegments || []).map(s => ({
        ...s, _isNew: false,
      }))
      setEditManholes(mhs)
      setEditPipes(segs)
    }
  }, [data, editMode])

  const toggleEdit = () => {
    if (editMode) {
      setEditMode(false)
      setEditTool(null)
      setDialogData(null)
      setPipeStartNode(null)
    } else {
      setEditMode(true)
      setEditTool('manhole')
    }
  }

  const handleSaveDxf = useCallback(() => {
    const finalManholes = editManholes.map(m => {
      if (m._isNew) {
        const dxf = toDxfCoord(m.lat, m.lng, crsCode)
        return { ...m, x: dxf.x, y: dxf.y }
      }
      return m
    })
    const dxf = toDxfString({ manholes: finalManholes, segments: editPipes })
    // DXF uses ANSI_1252 (Latin-1) encoding for text with French accents
    // Encode string to Latin-1 bytes to preserve accented characters
    const encoded = encodeToLatin1(dxf)
    const blob = new Blob([encoded], { type: 'application/dxf' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = 'edited_network.dxf'
    a.click()
    URL.revokeObjectURL(url)
    onSaveDxf?.(dxf)
  }, [editManholes, editPipes, crsCode, onSaveDxf])

  const tools = [
    { id: 'manhole', label: '➕ Regard', desc: 'Add manhole' },
    { id: 'pipe', label: '➡ Tuyau', desc: 'Connect manholes' },
    { id: 'delete', label: '🗑 Suppr', desc: 'Delete element' },
    { id: 'property', label: '✏ Prop', desc: 'Edit properties' },
  ]

  return (
    <>
      <div className="edit-toolbar" style={{
        display: 'flex', gap: 4, padding: '4px 8px',
        background: editMode ? '#fff3cd' : 'transparent',
        borderBottom: editMode ? '2px solid #ffc107' : 'none',
        flexWrap: 'wrap', alignItems: 'center',
      }}>
        <button
          onClick={toggleEdit}
          style={{
            background: editMode ? '#dc3545' : '#28a745',
            color: '#fff', border: 'none', padding: '4px 12px',
            borderRadius: 4, cursor: 'pointer', fontWeight: 'bold',
          }}
        >
          {editMode ? '✕ Exit Edit' : '✎ Edit Network'}
        </button>
        {editMode && tools.map(t => (
          <button
            key={t.id}
            onClick={() => { setEditTool(t.id); setPipeStartNode(null) }}
            title={t.desc}
            style={{
              background: editTool === t.id ? '#007bff' : '#6c757d',
              color: '#fff', border: 'none', padding: '4px 10px',
              borderRadius: 4, cursor: 'pointer', fontSize: '0.85rem',
              opacity: editTool === t.id ? 1 : 0.7,
            }}
          >
            {t.label}
          </button>
        ))}
        {editMode && (
          <>
            <span style={{ fontSize: '0.8rem', color: '#856404', marginLeft: 8 }}>
              {editManholes.length} regards · {editPipes.length} tuyaux
            </span>
            <button
              onClick={handleSaveDxf}
              style={{
                marginLeft: 'auto', background: '#004085', color: '#fff',
                border: 'none', padding: '4px 12px', borderRadius: 4,
                cursor: 'pointer', fontWeight: 'bold',
              }}
            >
              💾 Save DXF
            </button>
          </>
        )}
      </div>

      {editMode && (
        <EditInteraction
          editMode={editMode} editTool={editTool}
          setDialogData={setDialogData}
          setEditManholes={setEditManholes} setEditPipes={setEditPipes}
          editManholes={editManholes} editPipes={editPipes}
          nextId={nextId} setNextId={setNextId}
          pipeStartNode={pipeStartNode} setPipeStartNode={setPipeStartNode}
          crsCode={crsCode}
        />
      )}

      {dialogData && (dialogData.type === 'manhole') && (
        <div className="edit-dialog-overlay" style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 10000,
        }}>
          <div className="edit-dialog" style={{
            background: '#fff', borderRadius: 8, padding: 20,
            minWidth: 300, maxWidth: 400, boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
          }}>
            <h3 style={{ margin: '0 0 12px' }}>Regard {dialogData.id}</h3>
            <label style={{display:'block',marginBottom:6}}>
              ID: <input value={dialogData.id} onChange={e => {
                const v = e.target.value
                setDialogData(d => ({...d, id: v}))
                setEditManholes(prev => prev.map((m,i) => i === dialogData.index ? {...m, id: v} : m))
              }} style={{width:'100%',padding:4}} />
            </label>
            <label style={{display:'block',marginBottom:6}}>
              CT (altitude tampon): <input value={dialogData.ct || ''} onChange={e => {
                const v = e.target.value
                setDialogData(d => ({...d, ct: v}))
                setEditManholes(prev => prev.map((m,i) => i === dialogData.index ? {...m, ct: v} : m))
              }} style={{width:'100%',padding:4}} />
            </label>
            <label style={{display:'block',marginBottom:6}}>
              CR (altitude radier): <input value={dialogData.cr || ''} onChange={e => {
                const v = e.target.value
                setDialogData(d => ({...d, cr: v}))
                setEditManholes(prev => prev.map((m,i) => i === dialogData.index ? {...m, cr: v} : m))
              }} style={{width:'100%',padding:4}} />
            </label>
            <label style={{display:'block',marginBottom:12}}>
              PP (profondeur): <input value={dialogData.pp || ''} onChange={e => {
                const v = e.target.value
                setDialogData(d => ({...d, pp: v}))
                setEditManholes(prev => prev.map((m,i) => i === dialogData.index ? {...m, pp: v} : m))
              }} style={{width:'100%',padding:4}} />
            </label>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setDialogData(null)} style={{
                padding: '6px 16px', background: '#6c757d', color: '#fff',
                border: 'none', borderRadius: 4, cursor: 'pointer',
              }}>Close</button>
              <button onClick={() => {
                setDialogData(null)
                setEditManholes(prev => prev.filter((_, i) => i !== dialogData.index))
              }} style={{
                padding: '6px 16px', background: '#dc3545', color: '#fff',
                border: 'none', borderRadius: 4, cursor: 'pointer',
              }}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
