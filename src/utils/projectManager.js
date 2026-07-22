import { stringSimilarity } from './fuzzyMatcher.js'
import { validateReferentialIntegrity } from './referentialValidator.js'
import { generateInp, generateSummary } from './inpGenerator.js'

const STORAGE_KEY = 'covadis_project'

const ELEMENT_KEYS = ['junctions', 'reservoirs', 'tanks', 'pipes', 'pumps', 'valves', 'patterns', 'curves', 'coordinates', 'status', 'tags', 'labels', 'controls']

const ELEMENT_LABELS = {
  junctions: 'Junctions', reservoirs: 'Reservoirs', tanks: 'Tanks',
  pipes: 'Pipes', pumps: 'Pumps', valves: 'Valves',
  patterns: 'Patterns', curves: 'Curves', coordinates: 'Coordinates',
  status: 'Status', tags: 'Tags', labels: 'Labels', controls: 'Controls',
}

export function createEmptyProject() {
  return {
    id: generateId(),
    createdAt: new Date().toISOString(),
    elements: {},
    sources: {},
    warnings: [],
  }
}

function generateId() {
  return 'proj_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8)
}

export function loadProject() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw)
  } catch { /* ignore */ }
  return createEmptyProject()
}

export function saveProject(project) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(project))
  } catch { /* ignore */ }
}

export function clearProject() {
  localStorage.removeItem(STORAGE_KEY)
}

export function addToProject(project, uploadData, sourceFile) {
  const newProject = { ...project, sources: { ...project.sources }, elements: { ...project.elements } }
  const conflicts = []
  const added = {}
  const skipped = []

  for (const key of ELEMENT_KEYS) {
    const newItems = uploadData[key]
    if (!newItems || (Array.isArray(newItems) && newItems.length === 0)) continue
    if (typeof newItems === 'object' && !Array.isArray(newItems) && Object.keys(newItems).length === 0) continue

    if (Array.isArray(newItems)) {
      if (!newProject.elements[key]) newProject.elements[key] = []
      const existing = newProject.elements[key]

      for (const item of newItems) {
        const id = item.id
        if (!id) {
          existing.push({ ...item, _source: sourceFile })
          continue
        }

        const existingIdx = existing.findIndex(e => e.id === id)
        if (existingIdx >= 0) {
          const existingItem = existing[existingIdx]
          const isIdentical = JSON.stringify({ ...existingItem, _source: undefined }) === JSON.stringify({ ...item, _source: undefined })
          if (isIdentical) {
            skipped.push({ id, type: key, reason: 'identical' })
            continue
          }

          const hasConflict = Object.keys(item).some(k => k !== 'id' && k !== '_source' && item[k] !== existingItem[k])
          if (hasConflict) {
            conflicts.push({
              id, type: key,
              existing: existingItem,
              incoming: item,
              sourceFile,
            })
            continue
          }

          existing.push({ ...item, _source: sourceFile })
        } else {
          existing.push({ ...item, _source: sourceFile })
        }
      }

      added[key] = newItems.length
    } else if (typeof newItems === 'object') {
      if (!newProject.elements[key]) newProject.elements[key] = {}
      Object.assign(newProject.elements[key], newItems)
      added[key] = Object.keys(newItems).length
    }
  }

  newProject.sources[sourceFile] = {
    addedAt: new Date().toISOString(),
    counts: added,
  }

  return { project: newProject, conflicts, added, skipped }
}

export function resolveConflict(project, conflict, resolution) {
  const newProject = { ...project, elements: { ...project.elements } }
  const items = [...(newProject.elements[conflict.type] || [])]
  const idx = items.findIndex(e => e.id === conflict.id)

  if (resolution === 'keep_existing') {
    // Already in place, do nothing
  } else if (resolution === 'replace') {
    if (idx >= 0) items[idx] = { ...conflict.incoming, _source: conflict.sourceFile }
  } else if (resolution === 'rename') {
    const renamed = { ...conflict.incoming, id: conflict.incoming.id + '_new', _source: conflict.sourceFile }
    items.push(renamed)
  }

  newProject.elements[conflict.type] = items
  saveProject(newProject)
  return newProject
}

export function removeFromProject(project, sourceFile) {
  const newProject = { ...project, elements: {}, sources: { ...project.sources } }
  delete newProject.sources[sourceFile]

  for (const key of ELEMENT_KEYS) {
    const items = project.elements[key]
    if (!items) continue
    if (Array.isArray(items)) {
      newProject.elements[key] = items.filter(item => item._source !== sourceFile)
    } else if (typeof items === 'object') {
      const filtered = {}
      for (const [k, v] of Object.entries(items)) {
        if (v._source !== sourceFile) filtered[k] = v
      }
      newProject.elements[key] = filtered
    }
  }

  saveProject(newProject)
  return newProject
}

export function getProjectStats(project) {
  const stats = {}
  let totalElements = 0
  for (const key of ELEMENT_KEYS) {
    const items = project.elements[key]
    let count = 0
    if (Array.isArray(items)) count = items.length
    else if (typeof items === 'object') count = Object.keys(items).length
    stats[key] = { count, label: ELEMENT_LABELS[key], sources: [] }
    totalElements += count
  }

  for (const [file, info] of Object.entries(project.sources)) {
    for (const key of Object.keys(info.counts)) {
      if (stats[key]) stats[key].sources.push(file)
    }
  }

  return { stats, totalElements, sourceCount: Object.keys(project.sources).length }
}

export function validateProject(project) {
  const allData = {
    junctions: project.elements.junctions || [],
    reservoirs: project.elements.reservoirs || [],
    tanks: project.elements.tanks || [],
    pipes: project.elements.pipes || [],
    pumps: project.elements.pumps || [],
    valves: project.elements.valves || [],
  }

  const refValidation = validateReferentialIntegrity(allData)

  const hasWaterSource = allData.reservoirs.length > 0 || allData.tanks.length > 0
  const hasJunctions = allData.junctions.length > 0
  const hasLinks = allData.pipes.length > 0 || allData.pumps.length > 0 || allData.valves.length > 0

  const blockingErrors = []
  const warnings = []

  if (!hasWaterSource) {
    blockingErrors.push('لا يوجد مصدر مياه (Reservoir أو Tank) في المشروع')
  }
  if (!hasJunctions) {
    blockingErrors.push('لا توجد عقد (Junctions) في المشروع')
  }
  if (!hasLinks) {
    blockingErrors.push('لا توجد روابط (Pipes/Pumps/Valves) في المشروع')
  }

  for (const err of refValidation.errors) {
    if (err.type === 'missing_ref') {
      blockingErrors.push(err.message)
    } else {
      warnings.push(err.message)
    }
  }

  if (!project.elements.patterns || (Array.isArray(project.elements.patterns) && project.elements.patterns.length === 0)) {
    warnings.push('لا توجد أنماط طلب (Patterns) — الشبكة ستعمل بأحمال ثابتة')
  }
  if (!project.elements.curves || (Array.isArray(project.elements.curves) && project.elements.curves.length === 0)) {
    warnings.push('لا توجد منحنيات (Curves)')
  }

  return {
    blockingErrors,
    warnings,
    hasWaterSource,
    hasJunctions,
    hasLinks,
    refValidation,
    canGenerate: blockingErrors.length === 0,
  }
}

export function generateProjectInp(project, title) {
  const elements = project.elements
  const mappedData = {
    junctions: elements.junctions || [],
    reservoirs: elements.reservoirs || [],
    tanks: elements.tanks || [],
    pipes: elements.pipes || [],
    pumps: elements.pumps || [],
    valves: elements.valves || [],
    patterns: elements.patterns || [],
    curves: elements.curves || [],
    coordinates: elements.coordinates || [],
    controls: elements.controls || [],
    status: elements.status || [],
    title: title || 'Generated from Covadis Project',
  }

  const result = generateInp(mappedData)
  const summary = generateSummary(result)

  const sourceSummary = []
  for (const [file, info] of Object.entries(project.sources)) {
    const counts = Object.entries(info.counts).map(([k, v]) => `${ELEMENT_LABELS[k] || k}: ${v}`).join(', ')
    sourceSummary.push(`  ${file}: ${counts}`)
  }

  return {
    ...result,
    fullSummary: summary + '\n\nSources:\n' + sourceSummary.join('\n'),
  }
}

export function findSimilarIds(project, newId, type) {
  const items = project.elements[type] || []
  const similar = []
  for (const item of items) {
    if (!item.id) continue
    const sim = stringSimilarity(newId.toLowerCase(), item.id.toLowerCase())
    if (sim > 0.7 && sim < 1.0) {
      similar.push({ id: item.id, similarity: sim })
    }
  }
  return similar.sort((a, b) => b.similarity - a.similarity)
}
