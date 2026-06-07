import { useEffect, useMemo, useState, useCallback } from 'react'
import { MapContainer, TileLayer, GeoJSON, useMap, useMapEvents } from 'react-leaflet'
import L from 'leaflet'
import proj4 from 'proj4'
import { toDxfString } from '../utils/dxfWriter'
import 'leaflet/dist/leaflet.css'

const CRS_OPTIONS = [
  { label: 'UTM zone 31N (WGS84)', code: 'EPSG:32631', def: '+proj=utm +zone=31 +datum=WGS84 +units=m +no_defs' },
  { label: 'UTM zone 32N (WGS84)', code: 'EPSG:32632', def: '+proj=utm +zone=32 +datum=WGS84 +units=m +no_defs' },
  { label: 'UTM zone 30N (WGS84)', code: 'EPSG:32630', def: '+proj=utm +zone=30 +datum=WGS84 +units=m +no_defs' },
  { label: 'Nord-Algérie (VNF)', code: 'EPSG:3405', def: '+proj=lcc +lat_1=36 +lat_0=36 +lon_0=2.7 +k_0=0.999625544 +x_0=500135 +y_0=300090 +ellps=clrk80 +units=m +no_defs' },
]

proj4.defs(CRS_OPTIONS.map(c => [c.code, c.def]))

function toLatLng(x, y, crsCode) {
  const t = proj4(crsCode, 'EPSG:4326', [x, y])
  return { lat: t[1], lng: t[0] }
}
function toDxfCoord(lat, lng, crsCode) {
  const t = proj4('EPSG:4326', crsCode, [lng, lat])
  return { x: t[0], y: t[1] }
}

function pipeColor(diam) {
  if (diam >= 400) return '#d62728'
  if (diam >= 315) return '#2c7bb6'
  if (diam >= 200) return '#fdae61'
  return '#1b9e77'
}
function pipeWeight(diam) {
  if (diam >= 400) return 5
  if (diam >= 315) return 4
  if (diam >= 200) return 3
  return 2
}

function FitBounds({ geoJSON }) {
  const map = useMap()
  useEffect(() => {
    if (geoJSON?.features?.length) {
      const gj = L.geoJSON(geoJSON)
      const bounds = gj.getBounds()
      if (bounds.isValid()) map.fitBounds(bounds, { padding: [30, 30] })
    }
  }, [geoJSON, map])
  return null
}

function transformFeatures(data, crsCode) {
  const features = []
  for (const seg of data.profileSegments || []) {
    const s = toLatLng(seg.start.x, seg.start.y, crsCode)
    const e = toLatLng(seg.end.x, seg.end.y, crsCode)
    features.push({
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: [[s.lng, s.lat], [e.lng, e.lat]] },
      properties: {
        type: 'pipe_profile',
        fromNode: seg.fromNode, toNode: seg.toNode,
        diam_mm: seg.diam || 0, materiau: seg.material || '',
        longueur: seg.length_m || 0, pente_pct: seg.slope_pct || 0,
      },
    })
  }
  for (const pl of data.planPipes) {
    if (pl.profileIdx >= 0) continue
    if (pl.diam > 0) continue
    const coords = pl.vertices.map(v => { const ll = toLatLng(v.x, v.y, crsCode); return [ll.lng, ll.lat] })
    features.push({ type: 'Feature', geometry: { type: 'LineString', coordinates: coords }, properties: { type: 'pipe_plan' } })
  }
  for (const pl of data.planPipes) {
    if (pl.profileIdx >= 0) continue
    if (!pl.diam > 0) continue
    const coords = pl.vertices.map(v => { const ll = toLatLng(v.x, v.y, crsCode); return [ll.lng, ll.lat] })
    features.push({
      type: 'Feature', geometry: { type: 'LineString', coordinates: coords },
      properties: { type: 'pipe_label', diam_mm: pl.diam || 0, materiau: pl.material || '', longueur_totale: pl.labelLength || 0, pente: pl.labelSlope || 0 },
    })
  }
  for (const dnp of data.dnPipes) {
    const coords = dnp.vertices.map(v => { const ll = toLatLng(v.x, v.y, crsCode); return [ll.lng, ll.lat] })
    features.push({ type: 'Feature', geometry: { type: 'LineString', coordinates: coords }, properties: { type: 'pipe_dn', diam_mm: parseInt(dnp.diam) || 0, calque: dnp.layer } })
  }
  for (const m of data.manholes) {
    const ll = toLatLng(m.x, m.y, crsCode)
    features.push({
      type: 'Feature', geometry: { type: 'Point', coordinates: [ll.lng, ll.lat] },
      properties: {
        type: 'regard', id: m.id, profileId: m.profileId || '',
        profileInvert: m.profileInvert || 0, profileDepth: m.profileDepth || 0,
        profileGround: m.profileGround || 0, profileCumul: m.profileCumul || 0,
        ct: parseFloat(m.ct) || 0, cr: parseFloat(m.cr) || 0, pp: parseFloat(m.pp) || 0,
      },
    })
  }
  for (const n of data.newEu1Inserts || []) {
    const ll = toLatLng(n.x, n.y, crsCode)
    features.push({ type: 'Feature', geometry: { type: 'Point', coordinates: [ll.lng, ll.lat] }, properties: { type: 'new_eu1_noeud', block: n.block, rotation: n.rotation } })
  }
  for (const n of data.assaiNodes) {
    const ll = toLatLng(n.x, n.y, crsCode)
    features.push({ type: 'Feature', geometry: { type: 'Point', coordinates: [ll.lng, ll.lat] }, properties: { type: 'assai_noeud', rotation: n.rotation } })
  }
  for (const al of data.assaiLines) {
    const s = toLatLng(al.start.x, al.start.y, crsCode)
    const e = toLatLng(al.end.x, al.end.y, crsCode)
    features.push({ type: 'Feature', geometry: { type: 'LineString', coordinates: [[s.lng, s.lat], [e.lng, e.lat]] }, properties: { type: 'assai_tuyau', diam_mm: parseInt(al.diam) || 0, calque: al.layer } })
  }
  for (const ap of data.aepPipes || []) {
    const coords = ap.vertices.map(v => { const ll = toLatLng(v.x, v.y, crsCode); return [ll.lng, ll.lat] })
    features.push({ type: 'Feature', geometry: { type: 'LineString', coordinates: coords }, properties: { type: 'aep_pipe', diam_mm: parseInt(ap.diam) || 0, calque: ap.layer } })
  }
  for (const n of data.aepNodes || []) {
    const ll = toLatLng(n.x, n.y, crsCode)
    features.push({ type: 'Feature', geometry: { type: 'Point', coordinates: [ll.lng, ll.lat] }, properties: { type: 'aep_noeud', block: n.block, rotation: n.rotation } })
  }
  for (const s of data.aepSplines || []) {
    const coords = s.controlPoints.map(p => { const ll = toLatLng(p.x, p.y, crsCode); return [ll.lng, ll.lat] })
    features.push({ type: 'Feature', geometry: { type: 'LineString', coordinates: coords }, properties: { type: 'aep_spline' } })
  }
  for (const ip of data.incendiePipes || []) {
    const coords = ip.vertices.map(v => { const ll = toLatLng(v.x, v.y, crsCode); return [ll.lng, ll.lat] })
    features.push({ type: 'Feature', geometry: { type: 'LineString', coordinates: coords }, properties: { type: 'incendie_pipe' } })
  }
  for (const n of data.incendieNodes || []) {
    const ll = toLatLng(n.x, n.y, crsCode)
    features.push({ type: 'Feature', geometry: { type: 'Point', coordinates: [ll.lng, ll.lat] }, properties: { type: 'incendie_noeud', block: n.block } })
  }
  for (const rp of data.reseauProjete) {
    const coords = rp.vertices.map(v => { const ll = toLatLng(v.x, v.y, crsCode); return [ll.lng, ll.lat] })
    features.push({ type: 'Feature', geometry: { type: 'LineString', coordinates: coords }, properties: { type: 'reseau_projete' } })
  }
  return { type: 'FeatureCollection', features }
}

const pipeStyle = (feature) => {
  const p = feature.properties
  if (p.type === 'pipe_plan') return { color: '#888', weight: 2, opacity: 0.4, dashArray: '4 4' }
  if (p.type === 'pipe_label') {
    const color = p.diam_mm >= 400 ? '#d62728' : (p.diam_mm >= 315 ? '#2c7bb6' : (p.diam_mm >= 200 ? '#fdae61' : '#1b9e77'))
    return { color, weight: 3, opacity: 0.7, dashArray: '6 3' }
  }
  if (p.type === 'pipe_profile') {
    const color = p.diam_mm >= 500 ? '#d62728' : (p.diam_mm >= 400 ? '#2c7bb6' : '#e67e22')
    return { color, weight: 5, opacity: 0.9 }
  }
  if (p.type === 'assai_tuyau') return { color: '#8e44ad', weight: 3, opacity: 0.8, dashArray: '6 3' }
  if (p.type === 'reseau_projete') return { color: '#e67e22', weight: 4, opacity: 0.9 }
  if (p.type === 'aep_pipe') return { color: '#1f78b4', weight: pipeWeight(p.diam_mm), opacity: 0.85 }
  if (p.type === 'aep_spline') return { color: '#1f78b4', weight: 2, opacity: 0.5, dashArray: '2 4' }
  if (p.type === 'incendie_pipe') return { color: '#e31a1c', weight: 3, opacity: 0.8 }
  return { color: pipeColor(p.diam_mm), weight: pipeWeight(p.diam_mm), opacity: 0.85 }
}

const onEachFeature = (feature, layer) => {
  const p = feature.properties
  if (p.type === 'pipe_plan') {
    layer.bindPopup('<div class="popup-content"><em>Tracé EU 1 (données non associées)</em></div>', { maxWidth: 250 })
  } else if (p.type === 'pipe_label') {
    const diamLabel = p.diam_mm ? `DN ${p.diam_mm} mm` : '?'
    const len = p.longueur_totale ? `${p.longueur_totale.toFixed(1)} m` : ''
    const pente = p.pente ? `Pente: ${p.pente.toFixed(2)} %` : ''
    let html = `<div class="popup-content"><strong>Conduite EU (label)</strong><br/>${diamLabel} — ${p.materiau || 'N/D'}<br/>`
    if (len) html += `Longueur: ${len}<br/>`
    if (pente) html += `${pente}`
    html += '</div>'
    layer.bindPopup(html, { maxWidth: 250 })
  } else if (p.type === 'pipe_profile') {
    const diamLabel = p.diam_mm ? `DN ${p.diam_mm} mm` : '?'
    const len = p.longueur ? `${p.longueur.toFixed(1)} m` : ''
    const pente = p.pente_pct ? `Pente: ${p.pente_pct.toFixed(2)} %` : ''
    let html = `<div class="popup-content"><strong>Conduite EU</strong><br/>`
    html += `${diamLabel} — ${p.materiau || 'N/D'}<br/>`
    if (p.fromNode && p.toNode) html += `${p.fromNode} → ${p.toNode}<br/>`
    if (len) html += `Longueur: ${len}<br/>`
    if (pente) html += `${pente}`
    html += '</div>'
    layer.bindPopup(html, { maxWidth: 250 })
    const latlngs = layer.getLatLngs()
    if (latlngs && latlngs.length >= 2) {
      const mid = Math.floor(latlngs.length / 2)
      const p1 = latlngs[Math.max(0, mid - 1)]
      const p2 = latlngs[Math.min(latlngs.length - 1, mid)]
      const bearing = Math.atan2(p2.lng - p1.lng, p2.lat - p1.lat) * 180 / Math.PI
      const cssAngle = bearing - 90
      const arrow = L.marker([(p1.lat + p2.lat) / 2, (p1.lng + p2.lng) / 2], {
        icon: L.divIcon({
          html: `<span style="display:inline-block;transform:rotate(${cssAngle}deg);font-size:12px;color:#222;text-shadow:0 0 3px #fff,0 0 3px #fff;line-height:1;font-weight:bold;">▶</span>`,
          iconSize: [12, 12], className: '',
        }),
        interactive: false, zIndexOffset: 1000,
      })
      layer.on('add', function() { if (this._map) arrow.addTo(this._map) })
    }
  } else if (p.type === 'assai_noeud') {
    layer.bindPopup('<div class="popup-content"><strong>Nœud assai</strong><br/>Réseau secondaire</div>', { maxWidth: 250 })
  } else if (p.type === 'assai_tuyau') {
    layer.bindPopup(`<div class="popup-content"><strong>Tuyau assai</strong><br/>DN: ${p.diam_mm} mm<br/>Calque: ${p.calque}</div>`, { maxWidth: 250 })
  } else if (p.type === 'reseau_projete') {
    layer.bindPopup('<div class="popup-content"><strong>Réseau assainissement projetée</strong><br/>Tracé projeté (DN 315 mm estimé)</div>', { maxWidth: 250 })
  } else if (p.type === 'aep_pipe') {
    layer.bindPopup(`<div class="popup-content"><strong>Conduite AEP</strong><br/>DN: ${p.diam_mm} mm<br/>Calque: ${p.calque}</div>`, { maxWidth: 250 })
  } else if (p.type === 'aep_noeud') {
    layer.bindPopup(`<div class="popup-content"><strong>Nœud AEP</strong><br/>Bloc: ${p.block}</div>`, { maxWidth: 250 })
  } else if (p.type === 'aep_spline') {
    layer.bindPopup('<div class="popup-content"><strong>Tracé AEP (spline)</strong></div>', { maxWidth: 250 })
  } else if (p.type === 'incendie_pipe') {
    layer.bindPopup('<div class="popup-content"><strong>Réseau incendie</strong><br/>DN 110 mm (estimé)</div>', { maxWidth: 250 })
  } else if (p.type === 'new_eu1_noeud') {
    layer.bindPopup(`<div class="popup-content"><strong>Nœud New_EU1</strong><br/>Bloc: ${p.block || 'N/D'}<br/>Rotation: ${(p.rotation || 0).toFixed(1)}°</div>`, { maxWidth: 250 })
  } else if (p.type === 'incendie_noeud') {
    layer.bindPopup(`<div class="popup-content"><strong>Nœud incendie</strong><br/>Bloc: ${p.block}</div>`, { maxWidth: 250 })
  } else if (p.type === 'pipe_dn') {
    layer.bindPopup(`<div class="popup-content"><strong>Conduite DN 200</strong><br/>DN: ${p.diam_mm} mm<br/>${p.calque ? `Calque: ${p.calque}` : ''}</div>`, { maxWidth: 250 })
  } else if (p.type === 'pipe') {
    const len = p.longueur ? `${p.longueur.toFixed(2)} m` : '?'
    const pente = p.pente_pct ? `${p.pente_pct.toFixed(2)} %` : 'N/A'
    layer.bindPopup(`<div class="popup-content"><strong>Conduite EU (label)</strong><br/>DN: ${p.diam_mm} mm<br/>Longueur: ${len}<br/>Pente: ${pente}<br/>${p.direction ? `Direction: ${p.direction}` : ''}${p.materiau ? `<br/>Matériau: ${p.materiau}` : ''}${p.calque ? `<br/>Calque: ${p.calque}` : ''}</div>`, { maxWidth: 250 })
  } else if (p.type === 'regard') {
    const id = p.profileId || p.id || '?'
    const invert = p.profileInvert ? `${p.profileInvert.toFixed(2)} m` : (p.cr ? `${p.cr.toFixed(2)} m` : 'N/D')
    const depth = p.profileDepth ? `${p.profileDepth.toFixed(2)} m` : (p.pp ? `${p.pp.toFixed(2)} m` : '')
    const ground = p.profileGround ? `${p.profileGround.toFixed(2)} m` : ''
    const cumul = p.profileCumul >= 0 ? `${p.profileCumul.toFixed(1)} m` : ''
    const ct = p.ct ? `${p.ct.toFixed(2)} m` : ''
    let html = `<div class="popup-content"><strong>Regard ${id}</strong><br/>Altitude radier: ${invert}<br/>`
    if (depth) html += `Profondeur: ${depth}<br/>`
    if (ground) html += `CT (tampon): ${ground}<br/>`
    if (ct) html += `CT (tampon): ${ct}<br/>`
    if (cumul) html += `Distance cumulée: ${cumul}`
    html += '</div>'
    layer.bindPopup(html, { maxWidth: 250 })
  }
}

const pointToLayer = (feature, latlng) => {
  const p = feature.properties
  if (p.type === 'assai_noeud') return L.circleMarker(latlng, { radius: 5, fillColor: '#8e44ad', color: '#4a235a', weight: 2, fillOpacity: 0.8 })
  if (p.type === 'aep_noeud') return L.circleMarker(latlng, { radius: 6, fillColor: '#1f78b4', color: '#0d3b66', weight: 2, fillOpacity: 0.8 })
  if (p.type === 'new_eu1_noeud') return L.circleMarker(latlng, { radius: 5, fillColor: '#2ca02c', color: '#1a5e1a', weight: 2, fillOpacity: 0.8 })
  if (p.type === 'incendie_noeud') return L.circleMarker(latlng, { radius: 6, fillColor: '#e31a1c', color: '#8b0000', weight: 2, fillOpacity: 0.8 })
  const hasId = p.profileId && p.profileId !== 'R?'
  const marker = L.circleMarker(latlng, {
    radius: hasId ? 8 : 6, fillColor: hasId ? '#e67e22' : '#aaa', color: hasId ? '#7f3b00' : '#666', weight: 2, fillOpacity: 0.9,
  })
  if (hasId) {
    const invert = p.profileInvert ? `R=${p.profileInvert.toFixed(2)}` : ''
    marker.bindTooltip(p.profileId + (invert ? ` | ${invert}` : ''), {
      permanent: false, direction: 'top', offset: [0, -8], className: 'manhole-label', sticky: true,
    })
  }
  return marker
}

// --- Editor components ---

function EditInteraction({ editMode, editTool, setDialogData, setEditManholes, setEditPipes, editManholes, editPipes, nextId, setNextId, pipeStart, setPipeStart, crsCode }) {
  const map = useMap()

  useMapEvents({
    click(e) {
      if (!editMode || editTool !== 'manhole') return
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
    },
  })

  const findNearest = useCallback((latlng) => {
    if (!editManholes.length || !map) return -1
    const pt = map.latLngToContainerPoint(latlng)
    let best = -1, bestDist = 25
    for (let i = 0; i < editManholes.length; i++) {
      const m = editManholes[i]
      const ll = m._isNew ? L.latLng(m.lat, m.lng) : toLatLng(m.x, m.y, crsCode)
      const mp = map.latLngToContainerPoint(L.latLng(ll.lat, ll.lng))
      const d = pt.distanceTo(mp)
      if (d < bestDist) { bestDist = d; best = i }
    }
    return best
  }, [editManholes, map, crsCode])

  useMapEvents({
    click(e) {
      if (!editMode || editTool === 'manhole') return
      if (editTool === 'delete' || editTool === 'property') {
        const idx = findNearest(e.latlng)
        if (idx < 0) return
        if (editTool === 'delete') {
          setEditManholes(prev => prev.filter((_, i) => i !== idx))
          setEditPipes(prev => prev.filter(p => p.fromNode !== editManholes[idx]?.id && p.toNode !== editManholes[idx]?.id))
        } else if (editTool === 'property') {
          setDialogData({ type: 'manhole', index: idx, ...editManholes[idx] })
        }
      } else if (editTool === 'pipe') {
        const idx = findNearest(e.latlng)
        if (idx < 0) {
          if (pipeStart !== null) setPipeStart(null)
          return
        }
        if (pipeStart === null) {
          setPipeStart(idx)
        } else if (pipeStart !== idx) {
          const m1 = editManholes[pipeStart]
          const m2 = editManholes[idx]
          const c1 = m1._isNew ? toDxfCoord(m1.lat, m1.lng, crsCode) : { x: m1.x, y: m1.y }
          const c2 = m2._isNew ? toDxfCoord(m2.lat, m2.lng, crsCode) : { x: m2.x, y: m2.y }
          setEditPipes(prev => [...prev, {
            fromNode: m1.id, toNode: m2.id,
            diam: 315, material: 'PVC',
            length_m: 0, slope_pct: 0,
            start: c1, end: c2,
            _isNew: true,
          }])
          setPipeStart(null)
        } else {
          setPipeStart(null)
        }
      }
    },
  })

  // Render edited manholes
  useEffect(() => {
    if (!editMode || !map) return
    const markers = []
    for (let i = 0; i < editManholes.length; i++) {
      const m = editManholes[i]
      const ll = m._isNew ? L.latLng(m.lat, m.lng) : toLatLng(m.x, m.y, crsCode)
      const isStart = pipeStart === i
      const marker = L.circleMarker(ll, {
        radius: isStart ? 12 : 9,
        fillColor: isStart ? '#ffc107' : (m._isNew ? '#28a745' : '#e67e22'),
        color: '#333', weight: 2, fillOpacity: 0.9,
      })
      marker.bindTooltip(m.id, { permanent: false, direction: 'top', sticky: true })
      marker.addTo(map)
      markers.push(marker)
    }
    // Render edited pipes
    for (const seg of editPipes) {
      if (!seg._isNew && !seg.fromNode?.startsWith('N')) continue
      const m1 = editManholes.find(mh => mh.id === seg.fromNode)
      const m2 = editManholes.find(mh => mh.id === seg.toNode)
      if (!m1 || !m2) continue
      const c1 = m1._isNew ? [m1.lng, m1.lat] : (() => { const ll = toLatLng(m1.x, m1.y, crsCode); return [ll.lng, ll.lat] })()
      const c2 = m2._isNew ? [m2.lng, m2.lat] : (() => { const ll = toLatLng(m2.x, m2.y, crsCode); return [ll.lng, ll.lat] })()
      const line = L.polyline([c1.reverse(), c2.reverse()], {
        color: '#28a745', weight: 4, opacity: 0.8, dashArray: '8 4',
      }).addTo(map)
      markers.push(line)
      line.bindPopup(`<div class="popup-content"><strong>Nouveau tuyau</strong><br/>${seg.fromNode} → ${seg.toNode}<br/>DN ${seg.diam} mm ${seg.material}</div>`)
    }
    return () => { markers.forEach(m => m.remove()) }
  }, [editMode, editManholes, editPipes, pipeStart, map, crsCode])

  return null
}

export default function MapView({ data }) {
  const [crsCode, setCrsCode] = useState('EPSG:32631')
  const [editMode, setEditMode] = useState(false)
  const [editTool, setEditTool] = useState(null)
  const [editManholes, setEditManholes] = useState([])
  const [editPipes, setEditPipes] = useState([])
  const [pipeStart, setPipeStart] = useState(null)
  const [dialogData, setDialogData] = useState(null)
  const [nextId, setNextId] = useState(1)
  const [editInitialized, setEditInitialized] = useState(false)

  useEffect(() => {
    if (data && !editInitialized) {
      const mhs = (data.manholes || []).map(m => ({ ...m }))
      const segs = (data.profileSegments || []).map(s => ({ ...s }))
      setEditManholes(mhs)
      setEditPipes(segs)
      setEditInitialized(true)
    }
  }, [data, editInitialized])

  const handleSaveDxf = useCallback(() => {
    const finalManholes = editManholes.map(m =>
      m._isNew ? { ...m, x: toDxfCoord(m.lat, m.lng, crsCode).x, y: toDxfCoord(m.lat, m.lng, crsCode).y } : m
    )
    const dxf = toDxfString({ manholes: finalManholes, segments: editPipes })
    const blob = new Blob([dxf], { type: 'application/dxf' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = 'edited_network.dxf'; a.click()
    URL.revokeObjectURL(url)
  }, [editManholes, editPipes, crsCode])

  const toggleEdit = () => {
    if (editMode) { setEditMode(false); setEditTool(null); setDialogData(null); setPipeStart(null) }
    else { setEditMode(true); setEditTool('manhole'); setPipeStart(null) }
  }

  const tools = [
    { id: 'manhole', label: '➕ Regard', desc: 'Add manhole' },
    { id: 'pipe', label: '➡ Tuyau', desc: 'Connect manholes' },
    { id: 'delete', label: '🗑 Suppr', desc: 'Delete element' },
    { id: 'property', label: '✏ Prop', desc: 'Edit properties' },
  ]

  const geoJSON = useMemo(() => data ? transformFeatures(data, crsCode) : null, [data, crsCode])

  const dnPipeFC = useMemo(() => geoJSON ? { ...geoJSON, features: geoJSON.features.filter(f => f.properties.type === 'pipe_dn') } : null, [geoJSON])
  const profileSegFC = useMemo(() => geoJSON ? { ...geoJSON, features: geoJSON.features.filter(f => f.properties.type === 'pipe_profile') } : null, [geoJSON])
  const planFC = useMemo(() => geoJSON ? { ...geoJSON, features: geoJSON.features.filter(f => f.properties.type === 'pipe_plan') } : null, [geoJSON])
  const labelPipeFC = useMemo(() => geoJSON ? { ...geoJSON, features: geoJSON.features.filter(f => f.properties.type === 'pipe_label') } : null, [geoJSON])
  const manholeFC = useMemo(() => geoJSON ? { ...geoJSON, features: geoJSON.features.filter(f => f.properties.type === 'regard') } : null, [geoJSON])
  const newEu1NodeFC = useMemo(() => geoJSON ? { ...geoJSON, features: geoJSON.features.filter(f => f.properties.type === 'new_eu1_noeud') } : null, [geoJSON])
  const assaiNodeFC = useMemo(() => geoJSON ? { ...geoJSON, features: geoJSON.features.filter(f => f.properties.type === 'assai_noeud') } : null, [geoJSON])
  const assaiLineFC = useMemo(() => geoJSON ? { ...geoJSON, features: geoJSON.features.filter(f => f.properties.type === 'assai_tuyau') } : null, [geoJSON])
  const reseauFC = useMemo(() => geoJSON ? { ...geoJSON, features: geoJSON.features.filter(f => f.properties.type === 'reseau_projete') } : null, [geoJSON])
  const aepPipeFC = useMemo(() => geoJSON ? { ...geoJSON, features: geoJSON.features.filter(f => f.properties.type === 'aep_pipe') } : null, [geoJSON])
  const aepNodeFC = useMemo(() => geoJSON ? { ...geoJSON, features: geoJSON.features.filter(f => f.properties.type === 'aep_noeud') } : null, [geoJSON])
  const aepSplineFC = useMemo(() => geoJSON ? { ...geoJSON, features: geoJSON.features.filter(f => f.properties.type === 'aep_spline') } : null, [geoJSON])
  const incendiePipeFC = useMemo(() => geoJSON ? { ...geoJSON, features: geoJSON.features.filter(f => f.properties.type === 'incendie_pipe') } : null, [geoJSON])
  const incendieNodeFC = useMemo(() => geoJSON ? { ...geoJSON, features: geoJSON.features.filter(f => f.properties.type === 'incendie_noeud') } : null, [geoJSON])

  return (
    <div className="map-wrapper">
      <div className="map-toolbar">
        <label>
          Système de coordonnées:
          <select value={crsCode} onChange={e => setCrsCode(e.target.value)}>
            {CRS_OPTIONS.map(c => <option key={c.code} value={c.code}>{c.label}</option>)}
          </select>
        </label>
        <span className="map-counts">
          {data && (
            <>
              <span className="badge pipe">{data.planPipes.filter(p => p.diam > 0).length}/{data.planPipes.length} conduites</span>
              <span className="badge manhole">{data.manholes.filter(m => m.profileId || m.id !== 'R?').length} regards</span>
              {data.profileNodes?.length > 0 && <span className="badge" style={{background:'#d62728'}}>{data.profileNodes.length} nœuds profilés</span>}
              {data.profileSegments?.length > 0 && <span className="badge" style={{background:'#2c7bb6'}}>{data.profileSegments.length} tronçons</span>}
              {data.newEu1Inserts?.length > 0 && <span className="badge" style={{background:'#2ca02c'}}>{data.newEu1Inserts.length} nœuds New EU1</span>}
              <span className="badge assai-node">{data.assaiNodes.length} nœuds assai</span>
              <span className="badge aep-pipe">{data.aepPipes?.length || 0} tuyaux AEP</span>
              <span className="badge aep-node">{data.aepNodes?.length || 0} nœuds AEP</span>
              <span className="badge incendie">{data.incendieNodes?.length || 0} incendie</span>
              {data.profiles?.length > 0 && <span className="badge" style={{background:'#27ae60'}}>{data.profiles.length} profils</span>}
            </>
          )}
        </span>
        <button onClick={toggleEdit} style={{
          marginLeft: 8, background: editMode ? '#dc3545' : '#28a745', color: '#fff',
          border: 'none', padding: '4px 12px', borderRadius: 4, cursor: 'pointer', fontWeight: 'bold',
        }}>{editMode ? '✕ Exit Edit' : '✎ Edit'}</button>
      </div>
      {editMode && (
        <div style={{ display: 'flex', gap: 2, padding: '4px 8px', background: '#fff3cd', flexWrap: 'wrap', alignItems: 'center' }}>
          {tools.map(t => (
            <button key={t.id} onClick={() => { setEditTool(t.id); setPipeStart(null) }} title={t.desc} style={{
              background: editTool === t.id ? '#007bff' : '#6c757d', color: '#fff', border: 'none',
              padding: '2px 10px', borderRadius: 4, cursor: 'pointer', fontSize: '0.82rem',
            }}>{t.label}</button>
          ))}
          <span style={{ fontSize: '0.78rem', color: '#856404', marginLeft: 4 }}>{editManholes.length} regards · {editPipes.length} tuyaux</span>
          <button onClick={handleSaveDxf} style={{
            marginLeft: 'auto', background: '#004085', color: '#fff', border: 'none',
            padding: '2px 12px', borderRadius: 4, cursor: 'pointer', fontWeight: 'bold', fontSize: '0.85rem',
          }}>💾 Save DXF</button>
        </div>
      )}
      <MapContainer center={[36.5, 3.0]} zoom={6} style={{ height: '100%', width: '100%' }}>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {profileSegFC && <GeoJSON key={crsCode + 'ps'} data={profileSegFC} style={pipeStyle} onEachFeature={onEachFeature} />}
        {planFC && <GeoJSON key={crsCode + 'pf'} data={planFC} style={pipeStyle} onEachFeature={onEachFeature} />}
        {labelPipeFC && <GeoJSON key={crsCode + 'lb'} data={labelPipeFC} style={pipeStyle} onEachFeature={onEachFeature} />}
        {dnPipeFC && <GeoJSON key={crsCode + 'pp'} data={dnPipeFC} style={pipeStyle} onEachFeature={onEachFeature} />}
        {manholeFC && <GeoJSON key={crsCode + 'mm'} data={manholeFC} pointToLayer={pointToLayer} onEachFeature={onEachFeature} />}
        {newEu1NodeFC && <GeoJSON key={crsCode + 'ne'} data={newEu1NodeFC} pointToLayer={pointToLayer} onEachFeature={onEachFeature} />}
        {assaiNodeFC && <GeoJSON key={crsCode + 'a2'} data={assaiNodeFC} pointToLayer={pointToLayer} onEachFeature={onEachFeature} />}
        {assaiLineFC && <GeoJSON key={crsCode + 'al'} data={assaiLineFC} style={pipeStyle} onEachFeature={onEachFeature} />}
        {reseauFC && <GeoJSON key={crsCode + 'rp'} data={reseauFC} style={pipeStyle} onEachFeature={onEachFeature} />}
        {aepPipeFC && <GeoJSON key={crsCode + 'ap'} data={aepPipeFC} style={pipeStyle} onEachFeature={onEachFeature} />}
        {aepNodeFC && <GeoJSON key={crsCode + 'a3'} data={aepNodeFC} pointToLayer={pointToLayer} onEachFeature={onEachFeature} />}
        {aepSplineFC && <GeoJSON key={crsCode + 'as'} data={aepSplineFC} style={pipeStyle} onEachFeature={onEachFeature} />}
        {incendiePipeFC && <GeoJSON key={crsCode + 'ip'} data={incendiePipeFC} style={pipeStyle} onEachFeature={onEachFeature} />}
        {incendieNodeFC && <GeoJSON key={crsCode + 'in'} data={incendieNodeFC} pointToLayer={pointToLayer} onEachFeature={onEachFeature} />}
        {geoJSON && <FitBounds geoJSON={geoJSON} />}
        {editMode && (
          <EditInteraction
            editMode={editMode} editTool={editTool}
            setDialogData={setDialogData}
            setEditManholes={setEditManholes} setEditPipes={setEditPipes}
            editManholes={editManholes} editPipes={editPipes}
            nextId={nextId} setNextId={setNextId}
            pipeStart={pipeStart} setPipeStart={setPipeStart}
            crsCode={crsCode}
          />
        )}
      </MapContainer>

      {/* Manhole property dialog */}
      {dialogData && dialogData.type === 'manhole' && (
        <div className="edit-dialog-overlay" style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000,
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
              }} style={{width:'100%',padding:4,border:'1px solid #ccc',borderRadius:3}} />
            </label>
            <label style={{display:'block',marginBottom:6}}>
              CT (tampon): <input value={dialogData.ct || ''} onChange={e => {
                const v = e.target.value
                setDialogData(d => ({...d, ct: v}))
                setEditManholes(prev => prev.map((m,i) => i === dialogData.index ? {...m, ct: v} : m))
              }} style={{width:'100%',padding:4,border:'1px solid #ccc',borderRadius:3}} />
            </label>
            <label style={{display:'block',marginBottom:6}}>
              CR (radier): <input value={dialogData.cr || ''} onChange={e => {
                const v = e.target.value
                setDialogData(d => ({...d, cr: v}))
                setEditManholes(prev => prev.map((m,i) => i === dialogData.index ? {...m, cr: v} : m))
              }} style={{width:'100%',padding:4,border:'1px solid #ccc',borderRadius:3}} />
            </label>
            <label style={{display:'block',marginBottom:12}}>
              PP (profondeur): <input value={dialogData.pp || ''} onChange={e => {
                const v = e.target.value
                setDialogData(d => ({...d, pp: v}))
                setEditManholes(prev => prev.map((m,i) => i === dialogData.index ? {...m, pp: v} : m))
              }} style={{width:'100%',padding:4,border:'1px solid #ccc',borderRadius:3}} />
            </label>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setDialogData(null)} style={{
                padding: '6px 16px', background: '#6c757d', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer',
              }}>Close</button>
              <button onClick={() => {
                setEditManholes(prev => prev.filter((_, i) => i !== dialogData.index))
                setEditPipes(prev => prev.filter(p => p.fromNode !== dialogData.id && p.toNode !== dialogData.id))
                setDialogData(null)
              }} style={{
                padding: '6px 16px', background: '#dc3545', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer',
              }}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
