export function validateReferentialIntegrity(allData) {
  const errors = []
  const warnings = []
  const nodeIds = new Set()

  if (allData.junctions) {
    for (const j of allData.junctions) {
      if (nodeIds.has(j.id)) {
        errors.push({ type: 'duplicate_id', section: 'JUNCTIONS', id: j.id, message: `Duplicate junction ID: ${j.id}` })
      }
      nodeIds.add(j.id)
    }
  }
  if (allData.reservoirs) {
    for (const r of allData.reservoirs) {
      if (nodeIds.has(r.id)) {
        errors.push({ type: 'duplicate_id', section: 'RESERVOIRS', id: r.id, message: `Duplicate reservoir ID: ${r.id}` })
      }
      nodeIds.add(r.id)
    }
  }
  if (allData.tanks) {
    for (const t of allData.tanks) {
      if (nodeIds.has(t.id)) {
        errors.push({ type: 'duplicate_id', section: 'TANKS', id: t.id, message: `Duplicate tank ID: ${t.id}` })
      }
      nodeIds.add(t.id)
    }
  }

  const pipeIds = new Set()
  if (allData.pipes) {
    for (const p of allData.pipes) {
      if (pipeIds.has(p.id)) {
        errors.push({ type: 'duplicate_id', section: 'PIPES', id: p.id, message: `Duplicate pipe ID: ${p.id}` })
      }
      pipeIds.add(p.id)

      if (!nodeIds.has(p.node1)) {
        errors.push({ type: 'missing_ref', section: 'PIPES', id: p.id, field: 'Node1', value: p.node1, message: `Pipe ${p.id} Node1 "${p.node1}" not found in nodes` })
      }
      if (!nodeIds.has(p.node2)) {
        errors.push({ type: 'missing_ref', section: 'PIPES', id: p.id, field: 'Node2', value: p.node2, message: `Pipe ${p.id} Node2 "${p.node2}" not found in nodes` })
      }
    }
  }

  const valveIds = new Set()
  if (allData.valves) {
    for (const v of allData.valves) {
      if (valveIds.has(v.id)) {
        errors.push({ type: 'duplicate_id', section: 'VALVES', id: v.id, message: `Duplicate valve ID: ${v.id}` })
      }
      valveIds.add(v.id)

      if (v.node1 && !nodeIds.has(v.node1)) {
        errors.push({ type: 'missing_ref', section: 'VALVES', id: v.id, field: 'Node1', value: v.node1, message: `Valve ${v.id} Node1 "${v.node1}" not found in nodes` })
      }
      if (v.node2 && !nodeIds.has(v.node2)) {
        errors.push({ type: 'missing_ref', section: 'VALVES', id: v.id, field: 'Node2', value: v.node2, message: `Valve ${v.id} Node2 "${v.node2}" not found in nodes` })
      }
    }
  }

  const pumpIds = new Set()
  if (allData.pumps) {
    for (const p of allData.pumps) {
      if (pumpIds.has(p.id)) {
        errors.push({ type: 'duplicate_id', section: 'PUMPS', id: p.id, message: `Duplicate pump ID: ${p.id}` })
      }
      pumpIds.add(p.id)

      if (p.node1 && !nodeIds.has(p.node1)) {
        errors.push({ type: 'missing_ref', section: 'PUMPS', id: p.id, field: 'Node1', value: p.node1, message: `Pump ${p.id} Node1 "${p.node1}" not found in nodes` })
      }
      if (p.node2 && !nodeIds.has(p.node2)) {
        errors.push({ type: 'missing_ref', section: 'PUMPS', id: p.id, field: 'Node2', value: p.node2, message: `Pump ${p.id} Node2 "${p.node2}" not found in nodes` })
      }
    }
  }

  if (nodeIds.size === 0 && (allData.pipes?.length || 0) + (allData.valves?.length || 0) + (allData.pumps?.length || 0) > 0) {
    warnings.push({ message: 'No nodes defined but pipes/valves/pumps reference nodes' })
  }

  return { errors, warnings, nodeCount: nodeIds.size, pipeCount: pipeIds.size, valveCount: valveIds.size, pumpCount: pumpIds.size }
}

export function filterRowsWithMissingRefs(rows, nodeIds) {
  const valid = []
  const invalid = []
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]
    if ((r.node1 && !nodeIds.has(r.node1)) || (r.node2 && !nodeIds.has(r.node2))) {
      invalid.push({ index: i, row: r })
    } else {
      valid.push(r)
    }
  }
  return { valid, invalid }
}
