export function toDxfString(data, options = {}) {
  const { covadisLayers = true } = options
  const { manholes = [], segments = [], aepPipes = [], aepNodes = [], aepSplines = [], dnPipes = [], assaiLines = [], assaiNodes = [], incendiePipes = [], incendieNodes = [], reseauProjete = [] } = data

  const lines = []

  function wr(g, v) {
    lines.push(`${g}\n${v}`)
  }

  // HEADER
  wr('0', 'SECTION')
  wr('2', 'HEADER')
  wr('9', '$ACADVER')
  wr('1', 'AC1009')
  wr('9', '$DWGCODEPAGE')
  wr('3', 'ANSI_1252')
  wr('9', '$INSBASE')
  wr('10', '0.0')
  wr('20', '0.0')
  wr('30', '0.0')
  wr('0', 'ENDSEC')

  // TABLES
  wr('0', 'SECTION')
  wr('2', 'TABLES')
  wr('0', 'TABLE')
  wr('2', 'LAYER')

  // Collect all unique layer names used
  const layerSet = new Set(['0'])
  if (covadisLayers) {
    layerSet.add('EU 1_Regards')
    layerSet.add('EU 1_Canalisations')
    layerSet.add('EU 1_Regards_Habillage')
    layerSet.add('_AEP')
    // Add DN layers used
    for (const p of aepPipes) {
      if (p.layer) layerSet.add(p.layer)
    }
    // Add DN layer for each pipe
    for (const p of dnPipes) {
      if (p.layer) layerSet.add(p.layer)
    }
    for (const al of assaiLines) {
      if (al.layer) layerSet.add(al.layer)
    }
    for (const rp of reseauProjete) {
      if (rp.layer) layerSet.add(rp.layer)
    }
    layerSet.add('_RESEAU INCENDIE')
    layerSet.add('assai')
    for (const ip of incendiePipes) {
      if (ip.layer) layerSet.add(ip.layer)
    }
  }

  wr('70', String(layerSet.size))

  for (const name of [...layerSet].sort()) {
    wr('0', 'LAYER')
    wr('2', name)
    wr('70', '0')
    wr('62', '7')
    wr('6', 'CONTINUOUS')
  }

  wr('0', 'ENDTAB')
  wr('0', 'ENDSEC')

  // ENTITIES
  wr('0', 'SECTION')
  wr('2', 'ENTITIES')

  const mhLayer = covadisLayers ? 'EU 1_Regards' : '0'
  const pipeLayer = covadisLayers ? 'EU 1_Canalisations' : '0'
  const lblLayer = covadisLayers ? 'EU 1_Regards_Habillage' : '0'

  // Manholes
  for (const mh of manholes) {
    wr('0', 'INSERT')
    wr('8', mhLayer)
    wr('2', 'REGARD')
    wr('10', mh.x.toFixed(6))
    wr('20', mh.y.toFixed(6))
  }

  // Profile segments
  for (const seg of segments) {
    wr('0', 'LWPOLYLINE')
    wr('8', pipeLayer)
    wr('90', '2')
    wr('10', seg.start.x.toFixed(6))
    wr('20', seg.start.y.toFixed(6))
    wr('10', seg.end.x.toFixed(6))
    wr('20', seg.end.y.toFixed(6))
  }

  // Manhole labels
  for (const mh of manholes) {
    const text = `${mh.id}\\PCT : ${mh.ct}\\PCR : ${mh.cr}\\PP : ${mh.pp}`
    wr('0', 'MTEXT')
    wr('8', lblLayer)
    wr('10', mh.x.toFixed(6))
    wr('20', mh.y.toFixed(6))
    wr('1', text)
  }

  // AEP pipes (LWPOLYLINE on DN layers)
  for (const p of aepPipes) {
    const verts = p.vertices || []
    if (verts.length < 2) continue
    const layer = p.layer || `DN${p.diam}`
    wr('0', 'LWPOLYLINE')
    wr('8', layer)
    wr('90', String(verts.length))
    wr('70', p.closed ? '1' : '0')
    for (const v of verts) {
      wr('10', (typeof v.x === 'number' ? v.x : v.x).toFixed(6))
      wr('20', (typeof v.y === 'number' ? v.y : v.y).toFixed(6))
    }
  }

  // DN pipes
  for (const p of dnPipes) {
    const verts = p.vertices || []
    if (verts.length < 2) continue
    const layer = p.layer || `DN ${p.diam}`
    wr('0', 'LWPOLYLINE')
    wr('8', layer)
    wr('90', String(verts.length))
    wr('70', '0')
    for (const v of verts) {
      wr('10', (typeof v.x === 'number' ? v.x : v.x).toFixed(6))
      wr('20', (typeof v.y === 'number' ? v.y : v.y).toFixed(6))
    }
  }

  // AEP nodes (INSERT on _AEP layer)
  for (const n of aepNodes) {
    wr('0', 'INSERT')
    wr('8', '_AEP')
    wr('2', n.block || 'VanneDN40')
    wr('10', n.x.toFixed(6))
    wr('20', n.y.toFixed(6))
    if (n.rotation !== undefined) {
      wr('50', n.rotation.toFixed(6))
    }
  }

  // AEP splines
  for (const s of aepSplines) {
    const pts = s.controlPoints || []
    if (pts.length < 2) continue
    wr('0', 'SPLINE')
    wr('8', '_AEP')
    wr('100', 'AcDbSpline')
    wr('71', String(s.degree || 3))
    wr('72', '0')
    wr('73', String(pts.length))
    wr('74', '0')
    for (const p of pts) {
      wr('10', p.x.toFixed(6))
      wr('20', p.y.toFixed(6))
      wr('30', '0.0')
    }
  }

  // Assai lines
  for (const al of assaiLines) {
    wr('0', 'LINE')
    wr('8', al.layer || 'pvc 200')
    wr('10', al.start.x.toFixed(6))
    wr('20', al.start.y.toFixed(6))
    wr('30', '0.0')
    wr('11', al.end.x.toFixed(6))
    wr('21', al.end.y.toFixed(6))
    wr('31', '0.0')
  }

  // Assai nodes
  for (const n of assaiNodes || []) {
    wr('0', 'INSERT')
    wr('8', 'assai')
    wr('2', 'NOEUD')
    wr('10', n.x.toFixed(6))
    wr('20', n.y.toFixed(6))
    if (n.rotation !== undefined) {
      wr('50', n.rotation.toFixed(6))
    }
  }

  // Incendie pipes
  for (const ip of incendiePipes || []) {
    const verts = ip.vertices || []
    if (verts.length < 2) continue
    wr('0', 'LWPOLYLINE')
    wr('8', '_RESEAU INCENDIE')
    wr('90', String(verts.length))
    wr('70', '0')
    for (const v of verts) {
      wr('10', (typeof v.x === 'number' ? v.x : v.x).toFixed(6))
      wr('20', (typeof v.y === 'number' ? v.y : v.y).toFixed(6))
    }
  }

  // Incendie nodes
  for (const n of incendieNodes || []) {
    wr('0', 'INSERT')
    wr('8', '_RESEAU INCENDIE')
    wr('2', n.block || 'PI')
    wr('10', n.x.toFixed(6))
    wr('20', n.y.toFixed(6))
  }

  // Reseau projete
  for (const rp of reseauProjete || []) {
    const verts = rp.vertices || []
    if (verts.length < 2) continue
    wr('0', 'LWPOLYLINE')
    wr('8', rp.layer || 'Réseau assainissement projetée')
    wr('90', String(verts.length))
    wr('70', rp.closed ? '1' : '0')
    for (const v of verts) {
      wr('10', (typeof v.x === 'number' ? v.x : v.x).toFixed(6))
      wr('20', (typeof v.y === 'number' ? v.y : v.y).toFixed(6))
    }
  }

  wr('0', 'ENDSEC')
  wr('0', 'EOF')

  return lines.join('\n')
}
