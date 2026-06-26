export function parseEpanetInp(inpContent) {
  const sections = {}
  let currentSection = ''
  const lines = inpContent.split('\n')

  for (const raw of lines) {
    const line = raw.trim()
    if (line.startsWith('[') && line.endsWith(']')) {
      currentSection = line.slice(1, -1).toUpperCase()
      sections[currentSection] = []
      continue
    }
    if (!currentSection || !line || line.startsWith(';')) continue
    sections[currentSection].push(line)
  }

  const junctions = parseTable(sections.JUNCTIONS || [], ['id', 'elevation', 'demand', 'pattern'])
  const pipes = parseTable(sections.PIPES || [], ['id', 'node1', 'node2', 'length', 'diameter', 'roughness', 'minorLoss', 'status'])
  const valves = parseTable(sections.VALVES || [], ['id', 'node1', 'node2', 'diameter', 'type', 'setting', 'minorLoss'])
  const coords = parseTable(sections.COORDINATES || [], ['id', 'x', 'y'])

  // Build coordinate map: junction id -> { x, y }
  const coordMap = {}
  for (const c of coords) {
    coordMap[c.id] = { x: Number(c.x), y: Number(c.y) }
  }

  // Enrich junctions with coordinates from [COORDINATES] or pipe endpoints
  const enrichedJunctions = junctions.map(j => {
    const c = coordMap[j.id]
    return {
      id: j.id,
      elevation: Number(j.elevation) || 0,
      demand: Number(j.demand) || 0,
      pattern: j.pattern || '',
      x: c ? Number(c.x) : 0,
      y: c ? Number(c.y) : 0,
    }
  })

  // Derive coordinates for junctions not in [COORDINATES] from pipe endpoints
  const pipeCoords = {}
  for (const p of pipes) {
    if (coordMap[p.node1]) {
      pipeCoords[p.node1] = coordMap[p.node1]
    }
    if (coordMap[p.node2]) {
      pipeCoords[p.node2] = coordMap[p.node2]
    }
  }
  for (const j of enrichedJunctions) {
    if (j.x === 0 && j.y === 0 && pipeCoords[j.id]) {
      j.x = pipeCoords[j.id].x
      j.y = pipeCoords[j.id].y
    }
  }

  return {
    junctions: enrichedJunctions,
    pipes: pipes.map(p => ({
      id: p.id,
      from: p.node1,
      to: p.node2,
      length: Number(p.length) || 0,
      diameter: Number(p.diameter) || 0,
      roughness: Number(p.roughness) || 0,
      minorLoss: Number(p.minorLoss) || 0,
      status: p.status || 'Open',
    })),
    valves: valves.map(v => ({
      id: v.id,
      node: v.node1,
      diameter: Number(v.diameter) || 0,
      type: v.type || 'FCV',
      setting: Number(v.setting) || 0,
      minorLoss: Number(v.minorLoss) || 0,
    })),
    coords: coords.map(c => ({
      id: c.id,
      x: Number(c.x),
      y: Number(c.y),
    })),
  }
}

function parseTable(lines, fieldNames) {
  const result = []
  for (const line of lines) {
    // Split by semicolon to get data and comment
    const parts = line.split(';')
    const dataPart = parts[0].trim()
    if (!dataPart) continue

    // Tab-separated values
    const values = dataPart.split('\t').map(v => v.trim()).filter(Boolean)
    if (values.length === 0) continue

    const row = {}
    for (let i = 0; i < fieldNames.length && i < values.length; i++) {
      row[fieldNames[i]] = values[i]
    }
    if (parts[1]) {
      row._comment = parts.slice(1).join(';').trim()
    }
    result.push(row)
  }
  return result
}
