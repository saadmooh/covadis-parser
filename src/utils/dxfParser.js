import dxf from 'dxf'

function dist(a, b) {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2)
}

export function parseCovadisDxf(dxfContent) {
  const helper = new dxf.Helper(dxfContent)
  const parsed = helper.parse()
  const entities = parsed.entities

  // --- 1. Pipe labels (diameter, length, slope from EU 1_Canalisations_Habillage) ---
  const pipeLabels = entities
    .filter(e => e.layer === 'EU 1_Canalisations_Habillage' && e.type === 'TEXT')
    .map(e => ({ text: e.string.trim(), x: e.x, y: e.y }))

  const diamRegex = /^(\S+)-(\d+)\s+([\d.]+)\s*ml?$/
  const slopeRegex = /^([-\d.]+)\s*%\s*(<--|-->)$/

  const groupedLabels = []
  const used = new Set()
  for (let i = 0; i < pipeLabels.length; i++) {
    if (used.has(i)) continue
    const group = [pipeLabels[i]]
    used.add(i)
    for (let j = i + 1; j < pipeLabels.length; j++) {
      if (used.has(j)) continue
      if (dist(pipeLabels[i], pipeLabels[j]) < 5) {
        group.push(pipeLabels[j])
        used.add(j)
      }
    }
    if (group.length > 1) groupedLabels.push(group)
  }

  const pipes = []
  for (const group of groupedLabels) {
    let diam = '', length = '', slope = '', dir = '', material = ''
    for (const lbl of group) {
      const dm = lbl.text.match(diamRegex)
      if (dm) { material = dm[1]; diam = dm[2]; length = dm[3] }
      const sm = lbl.text.match(slopeRegex)
      if (sm) { slope = sm[1]; dir = sm[2].trim(); }
    }
    if (diam) {
      pipes.push({ material, diam, length, slope, dir, labelX: group[0].x, labelY: group[0].y })
    }
  }

  // --- 2. Plan view pipe geometries (EU 1_Canalisations) ---
  const allCanalLines = entities
    .filter(e => e.layer === 'EU 1_Canalisations' && e.type === 'LWPOLYLINE')

  // Detect coordinate system: compute median of all vertices
  const allVerts = allCanalLines.flatMap(e => e.vertices || []);
  const avgAllX = allVerts.length > 0 ? allVerts.reduce((s, v) => s + v.x, 0) / allVerts.length : 0;
  const avgAllY = allVerts.length > 0 ? allVerts.reduce((s, v) => s + v.y, 0) / allVerts.length : 0;
  const isPlanCoords = avgAllX > 300000 && avgAllY > 1000000;

  // Filter: plan view pipes (remove profile construction lines mixed in same layer)
  const planPipes = allCanalLines.filter(e => {
    const verts = e.vertices || []
    if (verts.length < 2) return false
    const xs = verts.map(v => v.x)
    const ys = verts.map(v => v.y)
    const xMin = Math.min(...xs), xMax = Math.max(...xs)
    const yMin = Math.min(...ys), yMax = Math.max(...ys)
    const xSpan = xMax - xMin, ySpan = yMax - yMin
    
    // In plan coordinate mode (e.g. network 1/1+2), filter out profile view elements
    if (isPlanCoords) {
      const avgX = (xMin + xMax) / 2
      const avgY = (yMin + yMax) / 2
      if (!(avgX > 500000 && avgY > 2000000)) return false
      const xyRatio = xSpan > ySpan ? ySpan / xSpan : xSpan / ySpan
      if (xSpan > 100 && ySpan > 100 && xyRatio < 0.05) return false
      if (xSpan < 5 && ySpan > 50) return false
      if (ySpan < 5 && xSpan > 50) return false
    }
    // In local coords mode (e.g. network 2), all EU 1_Canalisations are plan view
    return true
  })

  // --- 3. DN 200 pipes ---
  const dnEntities = entities.filter(e => /^DN\s+\d+$/i.test(e.layer) && e.type === 'LWPOLYLINE')
  const dnPipes = dnEntities.map(e => ({
    layer: e.layer,
    diam: e.layer.match(/DN\s+(\d+)/i)?.[1] || '',
    vertices: e.vertices.map(v => ({ x: v.x, y: v.y })),
  }))

  // --- 4. Manhole positions (INSERT blocks) ---
  const inserts = entities.filter(e => e.layer === 'EU 1_Regards' && e.type === 'INSERT')

  // --- 5. Manhole labels (MTEXT with R#, CT, CR, PP) ---
  const rawLabels = entities
    .filter(e => e.layer === 'EU 1_Regards_Habillage' && e.type === 'MTEXT')

  const labelRecords = rawLabels.map(lbl => {
    const parts = lbl.string.split('\\P')
    let id = '', ct = '', cr = '', pp = ''
    for (const p of parts) {
      const s = p.trim()
      if (s.startsWith('CT ')) ct = s.split(':')[1]?.trim() || ''
      else if (s.startsWith('CR ')) cr = s.split(':')[1]?.trim() || ''
      else if (s.startsWith('P ') || s.startsWith('P:')) pp = s.split(':')[1]?.trim() || ''
      else if (s.match(/^R\d+/)) id = s
    }
    return { id, ct, cr, pp, x: lbl.x, y: lbl.y }
  })

  // Match labels to inserts by Y-based proximity (greedy, threshold 300)
  const sortedInserts = [...inserts].sort((a, b) => a.y - b.y)
  const sortedLabels = [...labelRecords].sort((a, b) => a.y - b.y)

  const usedInserts = new Set()
  const matched = []

  for (const lbl of sortedLabels) {
    let bestIdx = -1
    let bestDist = 300
    for (let i = 0; i < sortedInserts.length; i++) {
      if (usedInserts.has(i)) continue
      const d = dist(lbl, sortedInserts[i])
      if (d < bestDist) {
        bestDist = d
        bestIdx = i
      }
    }
    if (bestIdx >= 0) {
      usedInserts.add(bestIdx)
      matched.push({ ...lbl, x: sortedInserts[bestIdx].x, y: sortedInserts[bestIdx].y })
    } else {
      matched.push({ ...lbl, x: lbl.x, y: lbl.y })
    }
  }

  // Remaining unmatched inserts as anonymous manholes
  for (let i = 0; i < sortedInserts.length; i++) {
    if (!usedInserts.has(i)) {
      matched.push({
        id: 'R?', ct: '', cr: '', pp: '',
        x: sortedInserts[i].x, y: sortedInserts[i].y,
      })
    }
  }

  // --- 6. assai network (second sewer) ---
  const assaiInserts = entities
    .filter(e => e.layer === 'assai' && e.type === 'INSERT' && (isPlanCoords ? (e.x > 500000 && e.y > 2000000) : true))

  // --- 7. assai 250 / pvc 200 LINE segments ---
  const assaiLines = entities
    .filter(e => (e.layer === 'assai 250' || e.layer === 'pvc 200') && e.type === 'LINE')
    .filter(e => e.start && e.end && (isPlanCoords ? e.start.x > 500000 : true))
    .map(e => ({
      layer: e.layer,
      diam: e.layer === 'assai 250' ? '250' : '200',
      start: { x: e.start.x, y: e.start.y },
      end: { x: e.end.x, y: e.end.y },
    }))

  // --- 8. New_EU 1_Canalisations_Pen_No__14 (additional manholes/nodes) ---
  const newEu1Inserts = entities
    .filter(e => e.layer === 'New_EU 1_Canalisations_Pen_No__14' && e.type === 'INSERT' && (isPlanCoords ? (e.x > 500000 && e.y > 2000000) : true))
    .map(e => ({ x: e.x, y: e.y, block: e.block, rotation: e.rotation }))

  // --- 8b. Réseau d'assainissement projetée ---
  const reseauProjete = entities
    .filter(e => e.layer?.includes('assainissement') && e.type === 'LWPOLYLINE')

// --- 9. AEP (water supply network) ---
   const aepPipeLayers = ['DN 90', 'DN110', 'DN160', 'DN200', 'DN400', 'DN500', 'MA-P14-pipe 63', 'DN 90', 'DN 63']
  const aepPipes = entities
    .filter(e => aepPipeLayers.includes(e.layer) && e.type === 'LWPOLYLINE' && e.vertices?.length >= 2)
    .filter(e => {
      if (isPlanCoords) {
        const xs = e.vertices.map(v => v.x)
        const avgX = xs.reduce((a, b) => a + b, 0) / xs.length
        return avgX > 500000
      }
      return true
    })
    .map(e => {
      let diam = '0'
      const dm = e.layer.match(/DN\s*(\d+)/i)
      if (dm) diam = dm[1]
      const pm = e.layer.match(/pipe\s+(\d+)/i)
      if (pm) diam = pm[1]
      return {
        layer: e.layer,
        diam,
        vertices: e.vertices.map(v => ({ x: v.x, y: v.y })),
        closed: e.closed,
      }
    })

  // AEP nodes (_AEP layer INSERT blocks)
  const aepNodes = entities
    .filter(e => e.layer === '_AEP' && e.type === 'INSERT' && (isPlanCoords ? (e.x > 500000 && e.y > 2000000) : true))
    .map(e => ({ x: e.x, y: e.y, block: e.block, rotation: e.rotation }))

  // --- 10. Profile / longitudinal section data ---
  // Auto-detect profile layers: any EU 1_PL_*_Textes or Proj*_PL_*_Textes
  const allLayersInFile = new Set(entities.map(e => e.layer).filter(Boolean))
  const profileLayers = [...allLayersInFile].filter(l =>
    /^EU\s+1_PL_.*_Textes$/.test(l) || /^Proj\d+\s+.*_PL_.*_Textes$/.test(l)
  )

  const profiles = []
  for (const layer of profileLayers) {
    const texts = entities
      .filter(e => e.layer === layer && e.type === 'TEXT')
      .map(e => e.string.trim())
    if (texts.length === 0) continue

    const sectionHeaders = [
      'Cotes Terrain Naturel', 'Numéros des regards', "Cotes fil d'eau",
      "Profondeurs fil d'eau", 'Distances partielles', 'Distances cumulées',
      'Pentes', 'Alignements en plan', 'Dimensions et Matériaux',
      'Profil entre les noeuds', 'Echelle en X', 'Echelle en Y', 'PC',
    ]

    const sections = []
    let currentValues = []
    let title = ''
    let fromNode = '', toNode = ''

    for (const t of texts) {
      const matched = sectionHeaders.find(h => t.startsWith(h))
      if (matched) {
        sections.push({ header: matched, raw: t, values: currentValues })
        currentValues = []
        // Extract title and node names from "Profil entre les noeuds" text
        if (matched.startsWith('Profil')) {
          title = t
          const nm = t.match(/noeuds\s+(\S+)-(\S+)/)
          if (nm) { fromNode = nm[1]; toNode = nm[2] }
        }
      } else {
        currentValues.push(t)
      }
    }
    if (currentValues.length > 0) {
      sections.push({ header: '', raw: '', values: currentValues })
    }

    const profile = { layer, title, fromNode, toNode, sections }

    for (const s of sections) {
      if ((s.header.startsWith('Dimensions') || s.header.startsWith('Alignements')) && s.values[0]) {
        profile.material = s.values[0]
        const dm = s.values[0].match(/(\d{3,4})$/)
        let diamStr = ''
        if (dm) diamStr = dm[1]
        else { const dm2 = s.values[0].match(/-(\d{2,4})/); if (dm2) diamStr = dm2[1] }
        if (diamStr) profile.diam = parseInt(diamStr)
      }
      if (s.header.startsWith('Echelle en X')) profile.scaleX = s.raw
      if (s.header.startsWith('Echelle en Y')) profile.scaleY = s.raw
      if (s.header.startsWith('PC')) profile.pc = s.raw
    }

    profiles.push(profile)
  }

  // --- 11. Match profiles to plan pipes & attach node data to manholes ---
  function pipeCumulativeLengths(verts) {
    const lens = [0]
    for (let i = 1; i < verts.length; i++) lens.push(lens[i-1] + dist(verts[i-1], verts[i]))
    return lens
  }

  function interpolateAtDist(verts, lens, target) {
    if (target <= 0) return verts[0]
    if (target >= lens[lens.length - 1]) return verts[verts.length - 1]
    for (let i = 1; i < lens.length; i++) {
      if (lens[i] >= target) {
        const t = (target - lens[i-1]) / (lens[i] - lens[i-1])
        return { x: verts[i-1].x + t * (verts[i].x - verts[i-1].x), y: verts[i-1].y + t * (verts[i].y - verts[i-1].y) }
      }
    }
    return verts[verts.length - 1]
  }

  // Match each profile to its plan pipe and enrich manholes
  const profileNodes = []
  const annotatedPipes = planPipes.map(pp => ({ ...pp, profileIdx: -1, diam: 0, material: '' }))

  for (const prof of profiles) {
    const cumulSection = prof.sections.find(s => s.header.startsWith('Distances cumulées'))
    if (!cumulSection) continue
    const cumulDists = cumulSection.values.map(Number).filter(v => !isNaN(v))
    if (cumulDists.length < 2) continue

    const totalLength = cumulDists[cumulDists.length - 1]

    // Find best matching plan pipe by total length proximity (skip already matched)
    let bestPipeIdx = -1
    let bestLenDiff = Infinity
    for (let i = 0; i < planPipes.length; i++) {
      if (annotatedPipes[i].profileIdx >= 0) continue
      const pp = planPipes[i]
      const ppLens = pipeCumulativeLengths(pp.vertices)
      const ppLen = ppLens[ppLens.length - 1]
      const diff = Math.abs(ppLen - totalLength)
      if (diff < bestLenDiff) { bestLenDiff = diff; bestPipeIdx = i }
    }
    if (bestPipeIdx < 0) continue

    const matchedPipe = planPipes[bestPipeIdx]
    const pipeLens = pipeCumulativeLengths(matchedPipe.vertices)

    // Extract all profile fields
    const manholeSection = prof.sections.find(s => s.header.startsWith('Numéros'))
    const invertSection = prof.sections.find(s => s.header.startsWith('Cotes fil'))
    const depthSection = prof.sections.find(s => s.header.startsWith('Profondeurs'))
    const groundSection = prof.sections.find(s => s.header.startsWith('Cotes Terrain'))

    const nodeIds = manholeSection ? manholeSection.values : []
    const inverts = invertSection ? invertSection.values.map(Number) : []
    const depths = depthSection ? depthSection.values.map(Number) : []
    const grounds = groundSection ? groundSection.values.map(Number) : []

    // For each cumulative distance, interpolate position and find nearest manhole
    const availableInserts = [...inserts]
    const matchedNodes = []

    for (let ni = 0; ni < cumulDists.length; ni++) {
      const pos = interpolateAtDist(matchedPipe.vertices, pipeLens, cumulDists[ni])
      let bestIdx = -1
      let bestDist = 50
      for (let j = 0; j < availableInserts.length; j++) {
        const d = dist(pos, availableInserts[j])
        if (d < bestDist) { bestDist = d; bestIdx = j }
      }
      let mhPos = pos
      if (bestIdx >= 0) {
        mhPos = availableInserts[bestIdx]
        availableInserts.splice(bestIdx, 1)
      }
      matchedNodes.push({
        id: nodeIds[ni] || '',
        invert: inverts[ni] || 0,
        depth: depths[ni] || 0,
        ground: grounds[ni] || 0,
        cumulDist: cumulDists[ni],
        profileIdx: profiles.indexOf(prof),
        x: mhPos.x,
        y: mhPos.y,
      })
    }

    // Annotate the matched pipe
    annotatedPipes[bestPipeIdx].profileIdx = profiles.indexOf(prof)
    annotatedPipes[bestPipeIdx].diam = prof.diam || 0
    annotatedPipes[bestPipeIdx].material = prof.material || ''
    annotatedPipes[bestPipeIdx].totalLength = totalLength
    // Extract slopes (grouped values)
    const slopeSection = prof.sections.find(s => s.header.startsWith('Pentes'))
    annotatedPipes[bestPipeIdx].slopes = slopeSection ? slopeSection.values.map(Number) : []

    profileNodes.push(...matchedNodes)

    // Create individual pipe segments between consecutive manholes
    const partialSection = prof.sections.find(s => s.header.startsWith('Distances partielles'))
    const partials = partialSection ? partialSection.values.map(Number) : []
    const segNodes = nodeIds
    const segInverts = inverts
    const profileSegments = []
    for (let si = 0; si < cumulDists.length - 1; si++) {
      const fromPos = interpolateAtDist(matchedPipe.vertices, pipeLens, cumulDists[si])
      const toPos = interpolateAtDist(matchedPipe.vertices, pipeLens, cumulDists[si + 1])
      const pDist = partials[si] || (cumulDists[si + 1] - cumulDists[si])
      const slope = segInverts[si + 1] && segInverts[si] ? (segInverts[si + 1] - segInverts[si]) / pDist : 0
      profileSegments.push({
        fromNode: segNodes[si] || '',
        toNode: segNodes[si + 1] || '',
        length_m: pDist,
        slope_pct: slope * 100,
        slope: slope,
        diam: prof.diam || 0,
        material: prof.material || '',
        start: { x: fromPos.x, y: fromPos.y },
        end: { x: toPos.x, y: toPos.y },
        profileIdx: profiles.indexOf(prof),
      })
    }
    annotatedPipes[bestPipeIdx].segments = profileSegments
  }

  // Enrich unmatched plan pipes with label data from EU 1_Canalisations_Habillage
  // Match by closest distance to ANY vertex (not just midpoint)
  for (let i = 0; i < annotatedPipes.length; i++) {
    const ap = annotatedPipes[i]
    if (ap.profileIdx >= 0) continue
    let bestLabel = null
    let bestLabelDist = 200
    for (const pl of pipes) {
      let minDist = Infinity
      for (const v of ap.vertices) {
        const d = dist(v, { x: pl.labelX, y: pl.labelY })
        if (d < minDist) minDist = d
      }
      if (minDist < bestLabelDist) { bestLabelDist = minDist; bestLabel = pl }
    }
    if (bestLabel) {
      ap.diam = parseInt(bestLabel.diam) || 0
      ap.material = bestLabel.material || ''
      ap.labelLength = parseFloat(bestLabel.length) || 0
      ap.labelSlope = parseFloat(bestLabel.slope) || 0
    }
  }

  // Merge profile data into manholes
  const profileManholeMap = new Map()
  for (const pn of profileNodes) {
    const key = `${pn.x.toFixed(1)}_${pn.y.toFixed(1)}`
    if (!profileManholeMap.has(key) || pn.cumulDist > profileManholeMap.get(key).cumulDist) {
      profileManholeMap.set(key, pn)
    }
  }

  const enrichedManholes = matched.map(m => {
    const key = `${m.x.toFixed(1)}_${m.y.toFixed(1)}`
    const pm = profileManholeMap.get(key)
    if (pm) {
      return { ...m, profileId: pm.id, profileInvert: pm.invert, profileDepth: pm.depth, profileGround: pm.ground, profileCumul: pm.cumulDist }
    }
    for (const [, v] of profileManholeMap) {
      if (dist(m, v) < 0.5) return { ...m, profileId: v.id, profileInvert: v.invert, profileDepth: v.depth, profileGround: v.ground, profileCumul: v.cumulDist }
    }
    return m
  })

  // AEP SPLINE entities
  const aepSplines = entities
    .filter(e => e.layer === '_AEP' && e.type === 'SPLINE' && e.controlPoints?.length >= 2)
    .map(e => ({
      controlPoints: e.controlPoints.map(p => ({ x: p.x, y: p.y })),
      degree: e.degree,
    }))

  // Fire hydrant network (_RESEAU INCENDIE)
  const incendiePipes = entities
    .filter(e => e.layer === '_RESEAU INCENDIE' && e.type === 'LWPOLYLINE' && e.vertices?.length >= 2)
    .map(e => ({
      vertices: e.vertices.map(v => ({ x: v.x, y: v.y })),
    }))

  const incendieNodes = entities
    .filter(e => e.layer === '_RESEAU INCENDIE' && e.type === 'INSERT' && (isPlanCoords ? (e.x > 500000 && e.y > 2000000) : true))
    .map(e => ({ x: e.x, y: e.y, block: e.block, rotation: e.rotation }))

  // Collect all profile segments into a flat array
  const allSegments = []
  for (const ap of annotatedPipes) {
    if (ap.segments) allSegments.push(...ap.segments)
  }

  return {
    pipes,
    planPipes: annotatedPipes,
    profileSegments: allSegments,
    dnPipes,
    manholes: enrichedManholes,
    profileNodes,
    assaiNodes: assaiInserts.map(e => ({ x: e.x, y: e.y, rotation: e.rotation })),
    assaiLines,
    reseauProjete: reseauProjete.map(e => ({
      vertices: e.vertices.map(v => ({ x: v.x, y: v.y })),
      closed: e.closed,
    })),
    newEu1Inserts,
    aepPipes,
    aepNodes,
    aepSplines,
    incendiePipes,
    incendieNodes,
    profiles,
  }
}
