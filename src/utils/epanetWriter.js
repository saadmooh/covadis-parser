function dist(a, b) {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2)
}

function distToSegment(px, py, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y
  const lenSq = dx * dx + dy * dy
  if (lenSq === 0) return dist({ x: px, y: py }, a)
  let t = ((px - a.x) * dx + (py - a.y) * dy) / lenSq
  t = Math.max(0, Math.min(1, t))
  return dist({ x: px, y: py }, { x: a.x + t * dx, y: a.y + t * dy })
}

function formatCoord(v) {
  return v.toFixed(3)
}

function makeId(prefix, num) {
  return `${prefix}${num}`
}

export function toEpanetInp(data) {
  const { aepPipes = [], aepNodes = [], aepSplines = [], dnPipes = [], incendieNodes = [] } = data

  // Collect all pipes
  const allPipes = [
    ...aepPipes.map(p => ({ ...p, source: 'aep' })),
    ...dnPipes.map(p => ({ ...p, source: 'dn' })),
  ]

  // Build junction map: vertex key -> junction id
  const vertexMap = new Map()
  const junctions = []
  let junctionCounter = 0

  function getOrCreateJunction(v) {
    const key = `${formatCoord(v.x)},${formatCoord(v.y)}`
    if (vertexMap.has(key)) return vertexMap.get(key)
    junctionCounter++
    const id = makeId('J', junctionCounter)
    vertexMap.set(key, id)
    junctions.push({ id, x: v.x, y: v.y, elevation: 0, demand: 0 })
    return id
  }

  // Also add AEP nodes as junctions (skip VanneDN* which are valves, not standalone nodes)
  for (const node of aepNodes) {
    const block = node.block || ''
    if (/VanneDN/i.test(block)) continue
    const key = `${formatCoord(node.x)},${formatCoord(node.y)}`
    if (!vertexMap.has(key)) {
      junctionCounter++
      const id = makeId('J', junctionCounter)
      vertexMap.set(key, id)
      junctions.push({ id, x: node.x, y: node.y, elevation: 0, demand: 0, block: node.block })
    }
  }

  // Add incendie nodes as junctions (with Incendie prefix, separate numbering)
  for (const node of incendieNodes) {
    const id = node.id || `Incendie${incendieNodes.indexOf(node) + 1}`
    const key = `${formatCoord(node.x)},${formatCoord(node.y)}`
    if (!vertexMap.has(key)) {
      vertexMap.set(key, id)
      junctions.push({ id, x: node.x, y: node.y, elevation: 0, demand: 0, block: node.block })
    }
  }

  // Build pipes list: each segment between consecutive vertices
  const epanetPipes = []
  let pipeCounter = 0

  for (const p of allPipes) {
    const verts = p.vertices || []
    if (verts.length < 2) continue

    const diam = parseInt(p.diam) || 0
    if (diam <= 0) continue

    for (let i = 0; i < verts.length - 1; i++) {
      const fromId = getOrCreateJunction(verts[i])
      const toId = getOrCreateJunction(verts[i + 1])
      const length = dist(verts[i], verts[i + 1])
      if (length < 0.001) continue

      pipeCounter++
      epanetPipes.push({
        id: makeId('P', pipeCounter),
        from: fromId,
        to: toId,
        length: length,
        diameter: diam,
        roughness: 140,
        minorLoss: 0,
        status: 'Open',
        comment: p.source === 'dn' ? 'DN pipe' : '',
      })
    }
  }

  // Build valves from VanneDN* nodes (valve is like a pipe, connects two pipe vertices)
  const valves = []
  for (const node of aepNodes) {
    const block = node.block || ''
    const vm = block.match(/VanneDN(\d+)/i)
    if (!vm) continue
    const diam = parseInt(vm[1])
    const vx = node.x, vy = node.y

    // Find the closest AEP pipe segment for this valve
    let bestDist = Infinity
    let bestFromId = null, bestToId = null
    for (const p of aepPipes) {
      const verts = p.vertices || []
      for (let i = 0; i < verts.length - 1; i++) {
        const d = distToSegment(vx, vy, verts[i], verts[i + 1])
        if (d < bestDist) {
          bestDist = d
          const fromKey = `${formatCoord(verts[i].x)},${formatCoord(verts[i].y)}`
          const toKey = `${formatCoord(verts[i + 1].x)},${formatCoord(verts[i + 1].y)}`
          bestFromId = vertexMap.get(fromKey)
          bestToId = vertexMap.get(toKey)
        }
      }
    }
    if (bestFromId && bestToId) {
      valves.push({
        id: makeId('V', valves.length + 1),
        node1: bestFromId,
        node2: bestToId,
        diameter: diam,
        type: 'FCV',
        setting: 0,
        minorLoss: 0,
      })
    }
  }

  // Build coordinates section
  const coords = junctions.map(j => ({
    id: j.id,
    x: j.x,
    y: j.y,
  }))

  // Helper: format a line with fixed-width columns
  function fmtLine(parts) {
    return parts.join('\t')
  }

  const inp = []

  // [TITLE]
  inp.push('[TITLE]')
  inp.push('Covadis AEP conversion')
  inp.push('')

  // [JUNCTIONS]
  inp.push('[JUNCTIONS]')
  inp.push(';ID\tElevation\tDemand\tPattern')
  for (const j of junctions) {
    inp.push(fmtLine([j.id, formatCoord(j.elevation || 0), '0.000000', '']) + (j.block ? `\t;${j.block}` : ''))
  }
  inp.push('')

  // [PIPES]
  inp.push('[PIPES]')
  inp.push(';ID\tNode1\tNode2\tLength\tDiameter\tRoughness\tMinorLoss\tStatus')
  for (const p of epanetPipes) {
    inp.push(fmtLine([
      p.id, p.from, p.to,
      p.length.toFixed(4),
      p.diameter.toFixed(1),
      p.roughness.toFixed(1),
      p.minorLoss.toFixed(4),
      p.status,
    ]) + (p.comment ? `\t;${p.comment}` : ''))
  }
  inp.push('')

  // [VALVES]
  if (valves.length > 0) {
    inp.push('[VALVES]')
    inp.push(';ID\tNode1\tNode2\tDiameter\tType\tSetting\tMinorLoss')
    for (const v of valves) {
      inp.push(fmtLine([
        v.id, v.node1, v.node2,
        v.diameter.toFixed(1),
        v.type,
        v.setting.toFixed(1),
        v.minorLoss.toFixed(4),
      ]))
    }
    inp.push('')
  }

  // [COORDINATES]
  inp.push('[COORDINATES]')
  inp.push(';Node\tX\tY')
  for (const c of coords) {
    inp.push(fmtLine([c.id, formatCoord(c.x), formatCoord(c.y)]))
  }

  inp.push('')

  return inp.join('\n')
}
