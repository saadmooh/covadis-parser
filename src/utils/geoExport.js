import proj4 from 'proj4'

proj4.defs('EPSG:32631', '+proj=utm +zone=31 +datum=WGS84 +units=m +no_defs')
proj4.defs('EPSG:32632', '+proj=utm +zone=32 +datum=WGS84 +units=m +no_defs')
proj4.defs('EPSG:32630', '+proj=utm +zone=30 +datum=WGS84 +units=m +no_defs')
proj4.defs('EPSG:3405', '+proj=lcc +lat_1=36 +lat_0=36 +lon_0=2.7 +k_0=0.999625544 +x_0=500135 +y_0=300090 +ellps=clrk80 +units=m +no_defs')

function toLatLng(x, y, crsCode) {
  const t = proj4(crsCode, 'EPSG:4326', [x, y])
  return { lat: t[1], lng: t[0] }
}

export function toGeoJSON(data, crsCode = 'EPSG:32631') {
  const features = []

  // Labelled pipes matched to plan geometries
  for (const p of data.pipes) {
    let matchedGeom = null
    for (const g of data.planPipes) {
      if (g.vertices.length >= 2) {
        const midX = g.vertices.reduce((s, v) => s + v.x, 0) / g.vertices.length
        const midY = g.vertices.reduce((s, v) => s + v.y, 0) / g.vertices.length
        if (Math.abs(midX - p.labelX) < 100 && Math.abs(midY - p.labelY) < 100) {
          matchedGeom = g; break
        }
      }
    }
    const src = matchedGeom || { vertices: [{ x: p.labelX, y: p.labelY }] }
    const coords = src.vertices.map(v => {
      const ll = toLatLng(v.x, v.y, crsCode)
      return [ll.lng, ll.lat]
    })
    features.push({
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: coords },
      properties: {
        type: 'pipe',
        diam_mm: parseInt(p.diam) || 0,
        longueur: parseFloat(p.length) || 0,
        pente_pct: parseFloat(p.slope) || 0,
        direction: p.dir,
        materiau: p.material,
      },
    })
  }

  // DN 200 pipes
  for (const dnp of data.dnPipes) {
    const coords = dnp.vertices.map(v => {
      const ll = toLatLng(v.x, v.y, crsCode)
      return [ll.lng, ll.lat]
    })
    features.push({
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: coords },
      properties: { type: 'pipe_dn', diam_mm: parseInt(dnp.diam) || 0, calque: dnp.layer },
    })
  }

  // Manholes (use profile ID when available)
  for (const m of data.manholes) {
    const ll = toLatLng(m.x, m.y, crsCode)
    features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [ll.lng, ll.lat] },
      properties: {
        type: 'regard',
        id: m.profileId || m.id,
        ct: m.profileGround || parseFloat(m.ct) || 0,
        cr: m.profileInvert || parseFloat(m.cr) || 0,
        pp: m.profileDepth || parseFloat(m.pp) || 0,
        cumul: m.profileCumul || 0,
      },
    })
  }

  // assai nodes
  for (const n of data.assaiNodes || []) {
    const ll = toLatLng(n.x, n.y, crsCode)
    features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [ll.lng, ll.lat] },
      properties: { type: 'assai_noeud', rotation: n.rotation },
    })
  }

  // assai lines
  for (const al of data.assaiLines || []) {
    const s = toLatLng(al.start.x, al.start.y, crsCode)
    const e = toLatLng(al.end.x, al.end.y, crsCode)
    features.push({
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: [[s.lng, s.lat], [e.lng, e.lat]] },
      properties: { type: 'assai_tuyau', diam_mm: parseInt(al.diam) || 0, calque: al.layer },
    })
  }

  // AEP pipes
  for (const ap of data.aepPipes || []) {
    const coords = ap.vertices.map(v => {
      const ll = toLatLng(v.x, v.y, crsCode)
      return [ll.lng, ll.lat]
    })
    features.push({
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: coords },
      properties: { type: 'aep_pipe', diam_mm: parseInt(ap.diam) || 0, calque: ap.layer },
    })
  }

  // AEP nodes
  for (const n of data.aepNodes || []) {
    const ll = toLatLng(n.x, n.y, crsCode)
    features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [ll.lng, ll.lat] },
      properties: { type: 'aep_noeud', block: n.block },
    })
  }

  // AEP splines
  for (const s of data.aepSplines || []) {
    const coords = s.controlPoints.map(p => {
      const ll = toLatLng(p.x, p.y, crsCode)
      return [ll.lng, ll.lat]
    })
    features.push({
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: coords },
      properties: { type: 'aep_spline' },
    })
  }

  // Fire hydrant pipes
  for (const ip of data.incendiePipes || []) {
    const coords = ip.vertices.map(v => {
      const ll = toLatLng(v.x, v.y, crsCode)
      return [ll.lng, ll.lat]
    })
    features.push({
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: coords },
      properties: { type: 'incendie_pipe' },
    })
  }

  // Fire hydrant nodes
  for (const n of data.incendieNodes || []) {
    const ll = toLatLng(n.x, n.y, crsCode)
    features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [ll.lng, ll.lat] },
      properties: { type: 'incendie_noeud', block: n.block },
    })
  }

  // Réseau d'assainissement projetée
  for (const rp of data.reseauProjete || []) {
    const coords = rp.vertices.map(v => {
      const ll = toLatLng(v.x, v.y, crsCode)
      return [ll.lng, ll.lat]
    })
    features.push({
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: coords },
      properties: { type: 'reseau_projete' },
    })
  }

  return { type: 'FeatureCollection', features }
}

export async function downloadShapefile(geoJSON, name = 'covadis_export') {
  const mod = await import('@mapbox/shp-write')
  mod.download(geoJSON, { filename: name })
}

export function downloadGeoJSON(geoJSON, name = 'covadis_export') {
  const blob = new Blob([JSON.stringify(geoJSON, null, 2)], { type: 'application/geo+json' })
  downloadBlob(blob, `${name}.geojson`)
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
