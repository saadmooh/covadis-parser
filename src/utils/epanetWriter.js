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

function findConnectedComponents(pipes) {
  const graph = new Map()
  for (const p of pipes) {
    if (!graph.has(p.from)) graph.set(p.from, [])
    if (!graph.has(p.to)) graph.set(p.to, [])
    graph.get(p.from).push(p.to)
    graph.get(p.to).push(p.from)
  }
  const visited = new Set()
  const components = []
  for (const [node] of graph) {
    if (visited.has(node)) continue
    const component = []
    const stack = [node]
    visited.add(node)
    while (stack.length) {
      const current = stack.pop()
      component.push(current)
      for (const neighbor of (graph.get(current) || [])) {
        if (!visited.has(neighbor)) {
          visited.add(neighbor)
          stack.push(neighbor)
        }
      }
    }
    components.push(component)
  }
  return components
}

export function toEpanetInp(data) {
  const { aepPipes = [], aepNodes = [], aepSplines = [], dnPipes = [], incendieNodes = [], incendiePipes = [], tanks = [] } = data

  const allPipes = [
    ...aepPipes.map(p => ({ ...p, source: 'aep' })),
    ...dnPipes.map(p => ({ ...p, source: 'dn' })),
    ...incendiePipes.map(p => ({ ...p, source: 'incendie', diam: p.diam || '100' })),
  ]

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
        length,
        diameter: diam,
        roughness: 140,
        minorLoss: 0,
        status: 'Open',
        comment: p.source === 'dn' ? 'DN pipe' : '',
      })
    }
  }

  const referencedNodes = new Set()
  for (const p of epanetPipes) {
    referencedNodes.add(p.from)
    referencedNodes.add(p.to)
  }

  const valves = []
  for (const node of aepNodes) {
    const block = node.block || ''
    const vm = block.match(/VanneDN(\d+)/i)
    if (!vm) continue
    const diam = parseInt(vm[1])
    const vx = node.x, vy = node.y
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
      const vid = makeId('V', valves.length + 1)
      valves.push({
        id: vid,
        node1: bestFromId,
        node2: bestToId,
        diameter: diam,
        type: 'FCV',
        setting: 0,
        minorLoss: 0,
      })
      referencedNodes.add(bestFromId)
      referencedNodes.add(bestToId)
    }
  }

  for (const node of [...aepNodes, ...incendieNodes]) {
    const key = `${formatCoord(node.x)},${formatCoord(node.y)}`
    if (vertexMap.has(key) && node.block) {
      const jId = vertexMap.get(key)
      const j = junctions.find(j => j.id === jId)
      if (j && !j.block) j.block = node.block
    }
  }

  const activeJunctions = junctions.filter(j => referencedNodes.has(j.id))

  const components = findConnectedComponents(epanetPipes)
  const largestSize = components.length > 0 ? Math.max(...components.map(c => c.length)) : 0
  const isolatedCount = components.filter(c => c.length < largestSize).length

  const coords = activeJunctions.map(j => ({
    id: j.id,
    x: j.x,
    y: j.y,
  }))

  function fmtLine(parts) {
    return parts.join('\t')
  }

  const inp = []

  inp.push('[TITLE]')
  inp.push('Covadis AEP conversion')
  if (isolatedCount > 0) {
    inp.push(`; Topology warning: ${isolatedCount} of ${components.length} components disconnected from source`)
  }
  inp.push('')

  inp.push('[JUNCTIONS]')
  inp.push(';ID\tElevation\tDemand\tPattern')
  for (const j of activeJunctions) {
    inp.push(fmtLine([j.id, formatCoord(j.elevation || 0), '0.000000', '']) + (j.block ? `\t;${j.block}` : ''))
  }
  inp.push('')

  if (tanks.length > 0) {
    inp.push('[TANKS]')
    inp.push(';ID\tElevation\tInitLevel\tMinLevel\tMaxLevel\tDiameter\tMinVol\tVolCurve')
    for (const t of tanks) {
      inp.push(fmtLine([
        t.id,
        formatCoord(t.elevation || 0),
        formatCoord(t.initLevel || 0),
        formatCoord(t.minLevel || 0),
        formatCoord(t.maxLevel || 0),
        formatCoord(t.diameter || 50),
        formatCoord(t.minVol || 0),
        t.volCurve || '',
      ]))
    }
    inp.push('')
  }

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

  inp.push('[COORDINATES]')
  inp.push(';Node\tX\tY')
  for (const c of coords) {
    inp.push(fmtLine([c.id, formatCoord(c.x), formatCoord(c.y)]))
  }
  inp.push('')

  return inp.join('\n')
}
