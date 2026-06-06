import fs from 'fs'
import dxf from 'dxf'

function dist(a, b) {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2)
}

function extractEntities(dxfContent) {
  const helper = new dxf.Helper(dxfContent)
  const parsed = helper.parse()
  return parsed.entities || []
}

function parseSewerData(entities) {
  const sewerData = {
    pipes: [],
    manholes: [],
    profiles: [],
    segments: [],
    layers: [],
  }

  // Collect all unique layer names
  const layerSet = new Set()
  entities.forEach(e => {
    if (e.layer) layerSet.add(e.layer)
  })
  sewerData.layers = Array.from(layerSet).sort()

  // Find all LWPOLYLINE entities (potential pipe geometries)
  const polylines = entities.filter(e => e.type === 'LWPOLYLINE' && e.vertices)

  // Find all LINE entities
  const lines = entities.filter(e => e.type === 'LINE')

  // Find all INSERT entities (manholes)
  const inserts = entities.filter(e => e.type === 'INSERT')

  // Find TEXT/MTEXT entities (labels)
  const texts = entities.filter(e => e.type === 'TEXT' || e.type === 'MTEXT')

  // Find potential sewer pipes by various criteria
  // 1. Layers containing 'assai', 'canal', 'regard', 'tn_' etc
  const sewerKeywords = /assai|canal|caniveau|regard|tn_|sewer|pipe|dn\s+\d/i

  const sewerPolylines = polylines.filter(e => 
    sewerKeywords.test(e.layer || '')
  )

  for (const pl of sewerPolylines) {
    const verts = pl.vertices || []
    if (verts.length < 2) continue

    const xs = verts.map(v => v.x)
    const ys = verts.map(v => v.y)
    const xMin = Math.min(...xs), xMax = Math.max(...xs)
    const yMin = Math.min(...ys), yMax = Math.max(...ys)

    const totalLength = verts.slice(1).reduce((sum, v, i) => 
      sum + dist(verts[i], v), 0
    )

    sewerData.pipes.push({
      layer: pl.layer,
      vertices: verts.map(v => ({ x: v.x, y: v.y })),
      xMin, xMax, yMin, yMax,
      totalLength,
      vertexCount: verts.length,
    })
  }

  // Process INSERT entities as manholes
  for (const ins of inserts) {
    if (sewerKeywords.test(ins.layer || '')) {
      sewerData.manholes.push({
        layer: ins.layer,
        x: ins.x,
        y: ins.y,
        block: ins.block,
        rotation: ins.rotation,
      })
    }
  }

  // Process LINE entities
  const sewerLines = lines.filter(e => 
    sewerKeywords.test(e.layer || '')
  )

  for (const line of sewerLines) {
    if (line.start && line.end) {
      sewerData.pipes.push({
        layer: line.layer,
        type: 'LINE',
        start: { x: line.start.x, y: line.start.y },
        end: { x: line.end.x, y: line.end.y },
        length: dist(line.start, line.end),
      })
    }
  }

  // Extract profile data from TEXT/MTEXT
  const profilePatterns = {
    diam: /\b(DN|diamètre|diam)\s*:?\s*(\d+)/i,
    material: /\b(mat|matériau|material)\s*:?\s*(\w+)/i,
    length: /\b(long|length|longueur)\s*:?\s*([\d.]+)/i,
    slope: /\b(pente|slope)\s*:?\s*([-+]?\d+\.?\d*)/i,
  }

  return sewerData
}

// Parse all DXF files in the directory
const dxfFiles = [
  '2026 aep 27 02.dxf',
  'new sewer line.dxf',
]

const allResults = {}

for (const file of dxfFiles) {
  try {
    if (fs.existsSync(file)) {
      console.log(`Parsing ${file}...`)
      const content = fs.readFileSync(file, 'utf8')
      const entities = extractEntities(content)
      console.log(`Found ${entities.length} entities`)
      const data = parseSewerData(entities)
      allResults[file] = data
      console.log(`  Pipes: ${data.pipes.length}`)
      console.log(`  Manholes: ${data.manholes.length}`)
      console.log(`  Layers found: ${data.layers.length}`)
    }
  } catch (err) {
    console.error(`Error parsing ${file}:`, err.message)
  }
}

// Write results to JSON
fs.writeFileSync('sewer_data_output.json', JSON.stringify(allResults, null, 2))
console.log('\nOutput written to sewer_data_output.json')