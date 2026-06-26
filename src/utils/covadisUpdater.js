function dist(a, b) {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2)
}

const BLOCK_DIAM_RE = /(\d+)/

function blockForDiameter(baseBlock, newDiam) {
  const re = /(DN|VanneDN|Té03Brides_DN|Cone_DN|Bouchon_DN|Coude90°_DN)(\d+)/
  const m = baseBlock.match(re)
  if (m) {
    return baseBlock.replace(re, `$1${newDiam}`)
  }
  // Fallback: just replace any number
  const m2 = baseBlock.match(/^(\D+)(\d+)$/)
  if (m2) {
    return m2[1] + newDiam
  }
  return baseBlock
}

export function updateCovadisFromEpanet(covadisData, epanetData, tolerance = 1.0) {
  const { aepPipes = [], aepNodes = [], aepSplines = [], dnPipes = [] } = covadisData
  const { junctions = [], pipes: epipes = [], valves = [] } = epanetData

  // Build spatial index of EPANET junctions
  const junctionCoords = junctions.filter(j => j.x !== 0 || j.y !== 0)

  function findNearestJunction(x, y) {
    let best = null
    let bestDist = tolerance
    for (const j of junctionCoords) {
      const d = dist({ x, y }, j)
      if (d < bestDist) {
        bestDist = d
        best = j
      }
    }
    return best
  }

  // Build map: junction id -> set of connected pipe diameters
  const junctionPipes = {}
  for (const p of epipes) {
    if (!junctionPipes[p.from]) junctionPipes[p.from] = []
    if (!junctionPipes[p.to]) junctionPipes[p.to] = []
    junctionPipes[p.from].push(p)
    junctionPipes[p.to].push(p)
  }

  // Build map: junction id -> nearest valve
  const junctionValves = {}
  for (const v of valves) {
    junctionValves[v.node] = v
  }

    // Preserve original layer name format (DN90 vs DN 90)
  function newAepLayer(oldLayer, diam) {
    if (/\s/.test(oldLayer)) return `DN ${diam}`
    return `DN${diam}`
  }

  // --- Update AEP pipes ---
  const updatedAepPipes = aepPipes.map(pipe => {
    const verts = pipe.vertices || []
    if (verts.length < 2) return { ...pipe }

    // Find EPANET junctions for each vertex
    const matchedJunctions = verts.map(v => findNearestJunction(v.x, v.y))

    // Collect all EPANET pipe diameters along this Covadis pipe
    const matchingDiams = []
    for (let i = 0; i < matchedJunctions.length - 1; i++) {
      const j1 = matchedJunctions[i]
      const j2 = matchedJunctions[i + 1]
      if (!j1 || !j2) continue

      // Find EPANET pipes connecting these two junctions
      const connPipes = (junctionPipes[j1.id] || []).filter(
        p => p.from === j2.id || p.to === j2.id
      )
      for (const cp of connPipes) {
        matchingDiams.push(cp.diameter)
      }
    }

    if (matchingDiams.length > 0) {
      // Use most common diameter
      const freq = {}
      let maxFreq = 0
      let newDiam = matchingDiams[0]
      for (const d of matchingDiams) {
        const key = Math.round(d)
        freq[key] = (freq[key] || 0) + 1
        if (freq[key] > maxFreq) {
          maxFreq = freq[key]
          newDiam = key
        }
      }

      return {
        ...pipe,
        diam: String(newDiam),
        layer: newAepLayer(pipe.layer, newDiam),
      }
    }

    // No match — check if ANY vertex matches and get diam from there
    for (const j of matchedJunctions) {
      if (!j) continue
      const connPipes = junctionPipes[j.id] || []
      if (connPipes.length > 0) {
        const diam = Math.round(connPipes[0].diameter)
        return {
          ...pipe,
          diam: String(diam),
          layer: newAepLayer(pipe.layer, diam),
        }
      }
    }

    return { ...pipe }
  })

  // --- Update DN pipes ---
  const updatedDnPipes = dnPipes.map(pipe => {
    const js = (pipe.vertices || []).map(v => findNearestJunction(v.x, v.y))
    const diams = []
    for (let i = 0; i < js.length - 1; i++) {
      if (!js[i] || !js[i + 1]) continue
      const conn = (junctionPipes[js[i].id] || []).filter(
        p => p.from === js[i + 1].id || p.to === js[i + 1].id
      )
      for (const cp of conn) diams.push(Math.round(cp.diameter))
    }
    if (diams.length > 0) {
      const freq = {}
      let maxFreq = 0
      let newDiam = diams[0]
      for (const d of diams) {
        freq[d] = (freq[d] || 0) + 1
        if (freq[d] > maxFreq) { maxFreq = freq[d]; newDiam = d }
      }
      return { ...pipe, diam: String(newDiam), layer: `DN ${newDiam}` }
    }
    return { ...pipe }
  })

  // --- Update AEP nodes ---
  const updatedAepNodes = aepNodes.map(node => {
    const match = findNearestJunction(node.x, node.y)
    if (!match) return { ...node }

    // Check if this junction has a valve
    const valve = junctionValves[match.id]
    if (valve && valve.diameter > 0) {
      return {
        ...node,
        block: blockForDiameter(node.block || 'VanneDN40', Math.round(valve.diameter)),
      }
    }

    // Check connected pipes for a diameter hint
    const conn = junctionPipes[match.id] || []
    if (conn.length > 0) {
      const avgDiam = Math.round(conn.reduce((s, p) => s + p.diameter, 0) / conn.length)
      if (node.block && /DN/i.test(node.block)) {
        return {
          ...node,
          block: blockForDiameter(node.block, avgDiam),
        }
      }
    }

    return { ...node }
  })

  return {
    ...covadisData,
    aepPipes: updatedAepPipes,
    aepNodes: updatedAepNodes,
    dnPipes: updatedDnPipes,
  }
}
