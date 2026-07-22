import { describe, it, expect } from 'vitest'
import { stringSimilarity, matchColumnToField, matchColumnToFields, computeConfidenceScore } from '../fuzzyMatcher.js'

describe('stringSimilarity', () => {
  it('returns 1.0 for identical strings', () => {
    expect(stringSimilarity('hello', 'hello')).toBe(1.0)
  })

  it('returns high score for very similar strings', () => {
    expect(stringSimilarity('diameter', 'diam')).toBeGreaterThan(0.6)
  })

  it('returns 0 for empty strings', () => {
    expect(stringSimilarity('', 'hello')).toBe(0)
    expect(stringSimilarity('hello', '')).toBe(0)
  })

  it('returns low score for very different strings', () => {
    expect(stringSimilarity('abc', 'xyz')).toBeLessThan(0.5)
  })

  it('gives bonus for containment', () => {
    const s1 = stringSimilarity('roughness', 'rough')
    const s2 = stringSimilarity('smooth', 'rough')
    expect(s1).toBeGreaterThan(s2)
  })
})

describe('matchColumnToField', () => {
  it('matches exact synonym', () => {
    const result = matchColumnToField('diameter', ['diameter', 'diam', 'dia'])
    expect(result.matched).toBe(true)
    expect(result.score).toBe(1.0)
  })

  it('matches fuzzy synonym', () => {
    const result = matchColumnToField('diam', ['diameter', 'diam', 'dia'])
    expect(result.matched).toBe(true)
    expect(result.score).toBeGreaterThan(0.7)
  })

  it('does not match when below threshold', () => {
    const result = matchColumnToField('xyz123', ['diameter', 'diam'], 0.8)
    expect(result.matched).toBe(false)
  })
})

describe('matchColumnToFields', () => {
  const synonymMap = {
    diameter: ['diameter', 'diam', 'dia', 'd', 'calibre'],
    length: ['length', 'len', 'lng', 'longueur'],
    roughness: ['roughness', 'rough', 'roughn'],
  }

  it('returns matches sorted by score', () => {
    const results = matchColumnToFields('diameter', synonymMap)
    expect(results[0].field).toBe('diameter')
    expect(results[0].score).toBeGreaterThan(0.8)
  })

  it('matches partial names', () => {
    const results = matchColumnToFields('roughn', synonymMap)
    expect(results[0].field).toBe('roughness')
  })

  it('handles no matches', () => {
    const results = matchColumnToFields('zzz_nothing', synonymMap, 0.9)
    expect(results.every(r => !r.matched)).toBe(true)
  })
})

describe('computeConfidenceScore', () => {
  it('returns 1 when all required fields matched', () => {
    const matched = [
      { field: 'id', matched: true },
      { field: 'elevation', matched: true },
      { field: 'demand', matched: true },
    ]
    const score = computeConfidenceScore(matched, ['id', 'elevation'], ['id', 'elevation', 'demand'])
    expect(score).toBeGreaterThan(0.9)
  })

  it('returns lower score when required fields missing', () => {
    const matched = [
      { field: 'demand', matched: true },
    ]
    const score = computeConfidenceScore(matched, ['id', 'elevation'], ['id', 'elevation', 'demand'])
    expect(score).toBeLessThan(0.5)
  })
})
