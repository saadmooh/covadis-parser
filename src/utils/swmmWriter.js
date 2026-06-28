function dist(a, b) {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2)
}

function formatCoord(v) {
  return v.toFixed(3)
}

function makeId(prefix, num) {
  return `${prefix}${num}`
}

function diameterToInches(diamMm) {
  // Convert mm to feet (SWMM uses feet)
  // 1 foot = 304.8 mm
  return (diamMm / 304.8).toFixed(2)
}

function slopeToManning(diamMm, slopePercent) {
  // Convert slope % to Manning's n approximation
  // Typical values: PVC ~0.009-0.011, concrete ~0.012-0.014
  // For sewer pipes, use default based on material if available
  return 0.012
}

export function toSwmmInp(data) {
  const { manholes = [], planPipes = [], profileSegments = [], profiles = [], dnPipes = [], assaiNodes = [] } = data

  // Build manhole map: id -> elevation (invert level)
  const manholeMap = new Map()
  for (const m of manholes) {
    manholeMap.set(m.id || m.profileId, {
      elevation: parseFloat(m.profileInvert || m.cr || 0),
      ground: parseFloat(m.profileGround || m.ct || 0),
    })
  }

  // Build junctions from manholes
  const junctions = []
  const outfalls = []
  let junctionCounter = 0

  // Find lowest manhole for outfall
  let minElevation = Infinity
  let outfallManhole = null

  for (const m of manholes) {
    const elev = parseFloat(m.profileInvert || m.cr || 0)
    if (elev < minElevation) {
      minElevation = elev
      outfallManhole = m
    }
    junctionCounter++
    junctions.push({
      id: m.id || `J${junctionCounter}`,
      elevation: elev,
      maxHeight: (parseFloat(m.profileGround || m.ct || 0) - elev).toFixed(2),
    })
  }

  // Build conduits from profile segments
  const conduits = []
  const xsections = []
  let conduitCounter = 0

  for (const seg of profileSegments) {
    if (!seg.fromNode || !seg.toNode) continue
    const fromElev = manholeMap.get(seg.fromNode)?.elevation || 0
    const toElev = manholeMap.get(seg.toNode)?.elevation || 0
    const diamFt = diameterToInches(seg.diam || 300)

    conduitCounter++
    conduits.push({
      id: makeId('C', conduitCounter),
      fromNode: seg.fromNode,
      toNode: seg.toNode,
      length: seg.length_m || 0,
      roughness: slopeToManning(seg.diam, seg.slope_pct),
    })
    xsections.push({
      id: makeId('C', conduitCounter),
      shape: 'CIRCULAR',
      diameter: diamFt,
    })
  }

  // Build coordinates from manhole positions
  const coords = manholes.map((m, i) => ({
    id: m.id || `J${i + 1}`,
    x: m.x,
    y: m.y,
  }))

  // Build SWMM INP sections
  const inp = []

  // [TITLE]
  inp.push('[TITLE]')
  inp.push(';;Covadis Sewer Network - SWMM Export')
  inp.push('')

  // [OPTIONS]
  inp.push('[OPTIONS]')
  inp.push(';;Option            Value')
  inp.push('FLOW_UNITS           CMS')
  inp.push('INFILTRATION         NONE')
  inp.push('FLOW_ROUTING         DYNWAVE')
  inp.push('LINK_OFFSETS         ELEVATION')
  inp.push('MIN_SLOPE            0')
  inp.push('')

  // [JUNCTIONS]
  inp.push('[JUNCTIONS]')
  inp.push(';;Name            Elevation    MaxDepth    InitDepth    Ponded')
  for (const j of junctions) {
    inp.push(`${j.id}\t${j.elevation.toFixed(2)}\t\t0\t0`)
  }
  inp.push('')

  // [OUTFALLS]
  if (outfallManhole) {
    inp.push('[OUTFALLS]')
    inp.push(';;Name            Elevation    MaxDepth    InitDepth    Ponded    RouteTo')
    inp.push(`${outfallManhole.id || 'O1'}\t${outfallManhole.profileInvert?.toFixed(2) || '0'}\t\t0\t0\tOUTLET`)
    inp.push('')
  }

  // [CONDUITS]
  inp.push('[CONDUITS]')
  inp.push(';;Name       FromNode       ToNode      Length     Roughness   InOffset   OutOffset   InitFlow   MaxFlow')
  for (const c of conduits) {
    inp.push(`${c.id}\t${c.fromNode}\t${c.toNode}\t${c.length.toFixed(2)}\t${c.roughness}\t\t\t0\t0`)
  }
  inp.push('')

  // [XSECTIONS]
  inp.push('[XSECTIONS]')
  inp.push(';;Link            Shape               Geom1            Geom2            Geom3            Geom4            Barrels')
  for (const x of xsections) {
    inp.push(`${x.id}\t${x.shape}\t${x.diameter}\t\t\t\t1`)
  }
  inp.push('')

  // [COORDINATES]
  inp.push('[COORDINATES]')
  inp.push(';;Node            X-Coord            Y-Coord')
  for (const c of coords) {
    inp.push(`${c.id}\t${formatCoord(c.x)}\t${formatCoord(c.y)}`)
  }
  inp.push('')

  return inp.join('\n')
}