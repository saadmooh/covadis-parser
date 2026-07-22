import { describe, it, expect, beforeEach } from 'vitest'
import {
  createEmptyProject, addToProject, removeFromProject,
  getProjectStats, validateProject, resolveConflict,
  findSimilarIds,
} from '../projectManager.js'

describe('createEmptyProject', () => {
  it('creates a project with empty elements and sources', () => {
    const p = createEmptyProject()
    expect(p.id).toMatch(/^proj_/)
    expect(p.elements).toEqual({})
    expect(p.sources).toEqual({})
    expect(p.createdAt).toBeTruthy()
  })
})

describe('addToProject', () => {
  let project

  beforeEach(() => {
    project = createEmptyProject()
  })

  it('adds junctions to empty project', () => {
    const data = { junctions: [{ id: 'J1', elevation: 100 }, { id: 'J2', elevation: 200 }] }
    const result = addToProject(project, data, 'junctions.csv')
    expect(result.project.elements.junctions.length).toBe(2)
    expect(result.added.junctions).toBe(2)
    expect(result.conflicts.length).toBe(0)
  })

  it('appends pipes to existing project', () => {
    project.elements.pipes = [{ id: 'P1', node1: 'J1', node2: 'J2' }]
    const data = { pipes: [{ id: 'P2', node1: 'J2', node2: 'J3' }] }
    const result = addToProject(project, data, 'pipes.csv')
    expect(result.project.elements.pipes.length).toBe(2)
  })

  it('detects identical duplicates and skips them', () => {
    project.elements.junctions = [{ id: 'J1', elevation: 100 }]
    const data = { junctions: [{ id: 'J1', elevation: 100 }] }
    const result = addToProject(project, data, 'duplicate.csv')
    expect(result.project.elements.junctions.length).toBe(1)
    expect(result.skipped.length).toBe(1)
    expect(result.skipped[0].reason).toBe('identical')
  })

  it('detects conflicting IDs', () => {
    project.elements.junctions = [{ id: 'J1', elevation: 100 }]
    const data = { junctions: [{ id: 'J1', elevation: 200 }] }
    const result = addToProject(project, data, 'conflict.csv')
    expect(result.conflicts.length).toBe(1)
    expect(result.conflicts[0].id).toBe('J1')
    expect(result.project.elements.junctions.length).toBe(1)
  })

  it('tracks source files', () => {
    const data = { junctions: [{ id: 'J1', elevation: 100 }] }
    const result = addToProject(project, data, 'test.csv')
    expect(result.project.sources['test.csv']).toBeTruthy()
    expect(result.project.sources['test.csv'].counts.junctions).toBe(1)
  })

  it('adds items without ID directly', () => {
    const data = { patterns: [{ id: 'P1', factors: [1, 2, 3] }] }
    const result = addToProject(project, data, 'patterns.csv')
    expect(result.project.elements.patterns.length).toBe(1)
  })
})

describe('resolveConflict', () => {
  it('keeps existing value', () => {
    let project = createEmptyProject()
    project.elements.junctions = [{ id: 'J1', elevation: 100 }]
    const conflict = {
      id: 'J1', type: 'junctions',
      existing: { id: 'J1', elevation: 100 },
      incoming: { id: 'J1', elevation: 200 },
      sourceFile: 'new.csv',
    }
    project = resolveConflict(project, conflict, 'keep_existing')
    expect(project.elements.junctions[0].elevation).toBe(100)
  })

  it('replaces with new value', () => {
    let project = createEmptyProject()
    project.elements.junctions = [{ id: 'J1', elevation: 100 }]
    const conflict = {
      id: 'J1', type: 'junctions',
      existing: { id: 'J1', elevation: 100 },
      incoming: { id: 'J1', elevation: 200 },
      sourceFile: 'new.csv',
    }
    project = resolveConflict(project, conflict, 'replace')
    expect(project.elements.junctions[0].elevation).toBe(200)
  })

  it('renames the incoming item', () => {
    let project = createEmptyProject()
    project.elements.junctions = [{ id: 'J1', elevation: 100 }]
    const conflict = {
      id: 'J1', type: 'junctions',
      existing: { id: 'J1', elevation: 100 },
      incoming: { id: 'J1', elevation: 200 },
      sourceFile: 'new.csv',
    }
    project = resolveConflict(project, conflict, 'rename')
    expect(project.elements.junctions.length).toBe(2)
    expect(project.elements.junctions[1].id).toBe('J1_new')
  })
})

describe('removeFromProject', () => {
  it('removes all items from a source file', () => {
    let project = createEmptyProject()
    project.elements.junctions = [
      { id: 'J1', elevation: 100, _source: 'a.csv' },
      { id: 'J2', elevation: 200, _source: 'b.csv' },
    ]
    project.sources = { 'a.csv': {}, 'b.csv': {} }
    project = removeFromProject(project, 'a.csv')
    expect(project.elements.junctions.length).toBe(1)
    expect(project.elements.junctions[0]._source).toBe('b.csv')
    expect(project.sources['a.csv']).toBeUndefined()
  })
})

describe('getProjectStats', () => {
  it('counts elements and sources', () => {
    const project = createEmptyProject()
    project.elements.junctions = [{ id: 'J1' }, { id: 'J2' }]
    project.elements.pipes = [{ id: 'P1' }]
    project.sources = { 'a.csv': { counts: { junctions: 2 } }, 'b.csv': { counts: { pipes: 1 } } }
    const { stats, totalElements, sourceCount } = getProjectStats(project)
    expect(stats.junctions.count).toBe(2)
    expect(stats.pipes.count).toBe(1)
    expect(totalElements).toBe(3)
    expect(sourceCount).toBe(2)
  })
})

describe('validateProject', () => {
  it('returns blocking error when no water source', () => {
    const project = createEmptyProject()
    project.elements.junctions = [{ id: 'J1' }]
    project.elements.pipes = [{ id: 'P1', node1: 'J1', node2: 'J1' }]
    const result = validateProject(project)
    expect(result.canGenerate).toBe(false)
    expect(result.blockingErrors.some(e => e.includes('مصدر مياه'))).toBe(true)
  })

  it('returns blocking error when no junctions', () => {
    const project = createEmptyProject()
    project.elements.reservoirs = [{ id: 'R1' }]
    project.elements.pipes = [{ id: 'P1', node1: 'R1', node2: 'R1' }]
    const result = validateProject(project)
    expect(result.canGenerate).toBe(false)
    expect(result.blockingErrors.some(e => e.includes('عقد'))).toBe(true)
  })

  it('returns blocking error when no links', () => {
    const project = createEmptyProject()
    project.elements.junctions = [{ id: 'J1' }]
    project.elements.reservoirs = [{ id: 'R1' }]
    const result = validateProject(project)
    expect(result.canGenerate).toBe(false)
    expect(result.blockingErrors.some(e => e.includes('روابط'))).toBe(true)
  })

  it('passes with complete minimal network', () => {
    const project = createEmptyProject()
    project.elements.junctions = [{ id: 'J1' }, { id: 'J2' }]
    project.elements.reservoirs = [{ id: 'R1' }]
    project.elements.pipes = [{ id: 'P1', node1: 'R1', node2: 'J1' }, { id: 'P2', node1: 'J1', node2: 'J2' }]
    const result = validateProject(project)
    expect(result.canGenerate).toBe(true)
  })

  it('warns about missing patterns', () => {
    const project = createEmptyProject()
    project.elements.junctions = [{ id: 'J1' }]
    project.elements.reservoirs = [{ id: 'R1' }]
    project.elements.pipes = [{ id: 'P1', node1: 'R1', node2: 'J1' }]
    const result = validateProject(project)
    expect(result.warnings.some(w => w.includes('Patterns'))).toBe(true)
  })
})

describe('findSimilarIds', () => {
  it('finds similar IDs', () => {
    const project = createEmptyProject()
    project.elements.junctions = [{ id: 'J511' }, { id: 'J512' }, { id: 'J100' }]
    const similar = findSimilarIds(project, 'J-511', 'junctions')
    expect(similar.length).toBeGreaterThan(0)
    expect(similar[0].id).toBe('J511')
  })

  it('returns empty for unique ID', () => {
    const project = createEmptyProject()
    project.elements.junctions = [{ id: 'J1' }]
    const similar = findSimilarIds(project, ' completely_different ', 'junctions')
    expect(similar.length).toBe(0)
  })
})
