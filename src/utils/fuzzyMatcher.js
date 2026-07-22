function levenshtein(a, b) {
  if (a === b) return 0
  if (a.length === 0) return b.length
  if (b.length === 0) return a.length
  const matrix = Array.from({ length: a.length + 1 }, (_, i) => [i])
  for (let j = 0; j <= b.length; j++) matrix[0][j] = j
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost,
      )
    }
  }
  return matrix[a.length][b.length]
}

function longestCommonSubstring(a, b) {
  let maxLen = 0
  let dp = Array(b.length + 1).fill(0)
  for (let i = 1; i <= a.length; i++) {
    let prev = 0
    for (let j = 1; j <= b.length; j++) {
      const temp = dp[j]
      if (a[i - 1] === b[j - 1]) {
        dp[j] = prev + 1
        maxLen = Math.max(maxLen, dp[j])
      } else {
        dp[j] = 0
      }
      prev = temp
    }
  }
  return maxLen
}

function containsBonus(a, b) {
  if (a.includes(b) || b.includes(a)) return 0.2
  const lcs = longestCommonSubstring(a, b)
  if (lcs >= 3) return 0.1 * (lcs / Math.max(a.length, b.length))
  return 0
}

export function stringSimilarity(a, b) {
  if (!a || !b) return 0
  a = a.toLowerCase()
  b = b.toLowerCase()
  if (a === b) return 1.0
  const maxLen = Math.max(a.length, b.length)
  const levDist = levenshtein(a, b)
  const baseScore = 1 - levDist / maxLen
  const bonus = containsBonus(a, b)
  return Math.min(1, baseScore + bonus)
}

export function matchColumnToField(columnName, synonyms, threshold = 0.5) {
  const normalized = columnName.toLowerCase().replace(/[_\-\s]+/g, '')
  let bestScore = 0
  let bestMatch = null
  for (const syn of synonyms) {
    const normalizedSyn = syn.toLowerCase().replace(/[_\-\s]+/g, '')
    const score = stringSimilarity(normalized, normalizedSyn)
    if (score > bestScore) {
      bestScore = score
      bestMatch = syn
    }
  }
  return {
    score: bestScore,
    matched: bestScore >= threshold,
    synonym: bestMatch,
  }
}

export function matchColumnToFields(columnName, allSynonymMap, threshold = 0.5) {
  const results = []
  for (const [field, synonyms] of Object.entries(allSynonymMap)) {
    const match = matchColumnToField(columnName, synonyms, threshold)
    results.push({ field, ...match })
  }
  results.sort((a, b) => b.score - a.score)
  return results
}

export function computeConfidenceScore(matchedFields, requiredFields, allFields) {
  if (requiredFields.length === 0) return 1
  const requiredMatched = requiredFields.filter(f => matchedFields.some(m => m.field === f && m.matched))
  const requiredScore = requiredMatched.length / requiredFields.length
  const totalScore = allFields.length > 0
    ? matchedFields.filter(m => m.matched).length / allFields.length
    : 0
  return requiredScore * 0.7 + totalScore * 0.3
}
