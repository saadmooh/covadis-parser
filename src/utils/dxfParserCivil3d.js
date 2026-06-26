/**
 * Parse Civil 3D DXF files containing storm/sanitary sewer networks.
 *
 * The pipe/ structure data is stored as ACAD_PROXY_ENTITY with binary
 * proxy graphic data (group code 310). This parser:
 * 1. Parses raw DXF tags
 * 2. Finds ACAD_PROXY_ENTITY on C-STRM-* / C-SSWR-* layers
 * 3. Decodes their binary proxy graphic into POLYLINE/TEXT entities
 * 4. Returns structured data compatible with the app
 */

import { decodeProxyGraphic } from './proxyGraphicParser.js'

const SEWER_LAYERS = {
  'C-STRM-PIPE': 'storm',
  'C-STRM-STRC': 'storm',
  'C-STRM-TEXT': 'storm',
  'C-SSWR-PIPE': 'sanitary',
  'C-SSWR-STRC': 'sanitary',
  'C-SSWR-TEXT': 'sanitary',
}

/**
 * Parse a Civil 3D DXF file content (string).
 * Returns an object with pipes, structures, and blocks.
 */
export function parseCivil3dDxf(dxfContent) {
  const tags = parseRawDxfTags(dxfContent)
  const proxyEntities = extractProxyEntities(tags)

  const pipes = []
  const structures = []
  const labels = []
  const blocks = []

  const seenHandles = new Set()

  for (const ent of proxyEntities) {
    const networkType = SEWER_LAYERS[ent.layer] || 'unknown'
    let subEntities = []
    try {
      subEntities = decodeProxyGraphic(ent.binaryData)
    } catch (e) {
      console.warn('Civil3D: error decoding proxy graphic for ' + ent.layer + ' handle=' + ent.handle + ': ' + e.message)
      continue
    }

    let polyline = null
    let text = null

    for (const sub of subEntities) {
      if (sub.type === 'POLYLINE') polyline = sub
      if (sub.type === 'TEXT') text = sub
    }

    if (ent.layer.endsWith('-PIPE') && polyline && polyline.vertices.length >= 2) {
      const len = calcLength(polyline.vertices)
      pipes.push({
        handle: ent.handle,
        network: networkType,
        layer: ent.layer,
        vertices: polyline.vertices,
        length_m: len,
      })
    }

    if (ent.layer.endsWith('-STRC')) {
      let pt = null
      if (polyline && polyline.vertices.length > 0) {
        pt = polyline.vertices[0]
      } else if (text && text.insert) {
        pt = text.insert
      }
      if (pt) {
        structures.push({
          handle: ent.handle,
          network: networkType,
          layer: ent.layer,
          x: pt[0],
          y: pt[1],
        })
      }
    }

    if (ent.layer.endsWith('-TEXT') && text) {
      labels.push({
        handle: ent.handle,
        network: networkType,
        layer: ent.layer,
        x: text.insert[0],
        y: text.insert[1],
        text: text.text,
      })
    }
  }

  // Extract INSERT blocks
  const insertBlocks = extractInsertBlocks(tags)

  return {
    pipes,
    structures,
    labels,
    blocks: insertBlocks,
  }
}

function calcLength(verts) {
  let len = 0
  for (let i = 1; i < verts.length; i++) {
    const dx = verts[i][0] - verts[i - 1][0]
    const dy = verts[i][1] - verts[i - 1][1]
    len += Math.sqrt(dx * dx + dy * dy)
  }
  return Math.round(len * 100) / 100
}

/**
 * Extract raw DXF tags from text content.
 * Returns array of { code, value } objects.
 */
function parseRawDxfTags(text) {
  const lines = text.split(/\r?\n/)
  const tags = []
  for (let i = 0; i < lines.length; i++) {
    const codeStr = lines[i].trim()
    if (codeStr === '') continue
    const code = parseInt(codeStr, 10)
    if (isNaN(code)) continue
    i++
    if (i >= lines.length) break
    tags.push({ code, value: lines[i] })
  }
  return tags
}

/**
 * Find all ACAD_PROXY_ENTITY on sewer layers in modelspace (ENTITIES section, not inside BLOCK/ENDBLK).
 */
function extractProxyEntities(tags) {
  const entities = []
  let i = 0
  let inEntitiesSection = false
  let blockDepth = 0

  while (i < tags.length) {
    const t = tags[i]

    // Track sections
    if (t.code === 0 && t.value.trim() === 'SECTION' && i + 1 < tags.length && tags[i + 1].code === 2) {
      const sectionName = tags[i + 1].value.trim()
      inEntitiesSection = sectionName === 'ENTITIES'
      blockDepth = 0
      i++
      continue
    }
    if (t.code === 0 && t.value.trim() === 'ENDSEC') {
      inEntitiesSection = false
      i++
      continue
    }

    // Track block nesting
    if (inEntitiesSection && t.code === 0 && t.value.trim() === 'BLOCK') {
      blockDepth++
      i++
      continue
    }
    if (inEntitiesSection && t.code === 0 && t.value.trim() === 'ENDBLK') {
      blockDepth--
      i++
      continue
    }

    // Collect only modelspace (top-level in ENTITIES, not inside BLOCK/ENDBLK)
    if (inEntitiesSection && blockDepth === 0 && t.code === 0 && t.value.trim() === 'ACAD_PROXY_ENTITY') {
      i++
      const ent = extractProxyEntity(tags, i)
      if (ent && ent.layer in SEWER_LAYERS) {
        entities.push(ent)
      }
      // Advance past this entity's tags
      while (i < tags.length && tags[i].code !== 0) i++
      continue
    }

    i++
  }

  return entities
}

/**
 * Extract a single proxy entity starting from current position.
 * Returns { handle, layer, binaryData } or null.
 */
function extractProxyEntity(tags, startIdx) {
  let handle = ''
  let layer = ''
  let binaryChunks = []
  let i = startIdx
  let inEntity = true
  let proxySize = 0
  let seen93 = false

  while (i < tags.length && inEntity) {
    const t = tags[i]
    switch (t.code) {
      case 0:
        inEntity = false
        break
      case 5:
        handle = t.value.trim()
        break
      case 8:
        layer = t.value.trim()
        break
      case 92:
        proxySize = parseInt(t.value.trim(), 10) || 0
        break
      case 93:
        seen93 = true
        break
      case 310:
        if (!seen93) binaryChunks.push(t.value.trim())
        break
    }
    if (inEntity) i++
    else break
  }

  if (!handle || !layer) return null

  // Trim to exact proxy size (group code 92) if specified
  let binaryData = binaryChunks.join('')
  if (proxySize > 0) {
    binaryData = binaryData.slice(0, proxySize * 2)
  }

  return {
    handle,
    layer,
    binaryData,
  }
}

/**
 * Extract all INSERT blocks from the modelspace entities.
 */
function extractInsertBlocks(tags) {
  const blocks = []
  let i = 0
  let inEntities = false

  while (i < tags.length) {
    const t = tags[i]
    if (t.code === 0 && t.value.trim() === 'SECTION') {
      i++
      if (i < tags.length && tags[i].code === 2 && tags[i].value.trim() === 'ENTITIES') {
        inEntities = true
      }
      i++
      continue
    }
    if (inEntities && t.code === 0 && t.value.trim() === 'ENDSEC') {
      break
    }
    if (inEntities && t.code === 0) {
      const etype = t.value.trim()
      if (etype === 'INSERT') {
        i++
        const block = extractInsertBlock(tags, i)
        if (block) blocks.push(block)
        continue
      }
    }
    i++
  }

  return blocks
}

/**
 * Extract a single INSERT block reference.
 */
function extractInsertBlock(tags, startIdx) {
  let blockName = ''
  let layer = ''
  let x = 0, y = 0
  let i = startIdx

  while (i < tags.length) {
    const t = tags[i]
    if (t.code === 0) break
    switch (t.code) {
      case 2:
        blockName = t.value.trim()
        break
      case 8:
        layer = t.value.trim()
        break
      case 10:
        x = parseFloat(t.value.trim()) || 0
        break
      case 20:
        y = parseFloat(t.value.trim()) || 0
        break
    }
    i++
  }

  return { block: blockName, layer, x, y }
}
