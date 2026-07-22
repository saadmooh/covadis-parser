export function parseCsvToData(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim())
  if (lines.length < 2) throw new Error('CSV file must have a header row and at least one data row')

  const headers = lines[0].split(',').map(h => h.trim().toLowerCase())

  const data = {
    pipes: [],
    aepPipes: [],
    dnPipes: [],
    incendiePipes: [],
    aepNodes: [],
    incendieNodes: [],
    aepSplines: [],
    dnPipesAssai: [],
  }

  for (let i = 1; i < lines.length; i++) {
    const vals = lines[i].split(',').map(v => v.trim())
    const row = {}
    headers.forEach((h, idx) => { row[h] = vals[idx] || '' })

    const type = (row.type || '').toLowerCase()

    if (type === 'aep' || type === 'dn' || type === 'incendie') {
      const x1 = parseFloat(row.x1)
      const y1 = parseFloat(row.y1)
      const x2 = parseFloat(row.x2)
      const y2 = parseFloat(row.y2)
      if (isNaN(x1) || isNaN(y1) || isNaN(x2) || isNaN(y2)) continue

      const pipe = {
        vertices: [{ x: x1, y: y1 }, { x: x2, y: y2 }],
        diam: row.diam || (type === 'incendie' ? '' : ''),
        layer: row.layer || (type === 'incendie' ? '_RESEAU INCENDIE' : ''),
      }
      if (row.length) pipe.labelLength = parseFloat(row.length)
      if (row.slope) pipe.slope = row.slope

      if (type === 'aep') {
        if (pipe.layer === '') pipe.layer = row.diam ? `DN${row.diam}` : ''
        if (pipe.diam === '' && row.diam) pipe.diam = row.diam
        data.aepPipes.push(pipe)
      } else if (type === 'dn') {
        if (pipe.layer === '') pipe.layer = row.diam ? `DN${row.diam}` : ''
        if (pipe.diam === '' && row.diam) pipe.diam = row.diam
        data.dnPipes.push(pipe)
      } else {
        data.incendiePipes.push(pipe)
      }
    } else if (type === 'aepnode' || type === 'aep_node') {
      const x = parseFloat(row.x)
      const y = parseFloat(row.y)
      if (isNaN(x) || isNaN(y)) continue
      data.aepNodes.push({
        x, y,
        block: row.block || row.name || '',
        rotation: parseFloat(row.rotation) || 0,
      })
    } else if (type === 'incendienode' || type === 'incendie_node' || type === 'pinet') {
      const x = parseFloat(row.x)
      const y = parseFloat(row.y)
      if (isNaN(x) || isNaN(y)) continue
      data.incendieNodes.push({
        x, y,
        block: row.block || row.name || 'PI',
        rotation: parseFloat(row.rotation) || 0,
      })
    }
  }

  return data
}
