# Differences Between Network 1 and Network 2 — How to Generalize the Code

## Overview

Three DXF files from the same project but with different data coverage:

| Property | network 1.dxf | networks 1+2.dxf | network 2.dxf |
|----------|:------------:|:-----------------:|:------------:|
| Size | 10 MB | 82 MB | **329 MB** |
| Layers | ~10 | ~50 | **238** |
| Manholes (INSERT) | 137 | 146 + 97 MTEXT | **291** |
| Pipes (LWPOLYLINE) | 3 | 36 (13 real) | **887** (14 in EU 1) |
| Profiles (longitudinal sections) | 3 | 3 | **12** |
| Pipe labels | 0 | 192 TEXT → 96 groups | **96** |
| DN 200 | 0 | 101 | **101** |
| Assai | 0 | 399 INSERT | **101** |
| New_EU1 | 0 | 196 | **196** |
| Coordinate system | X≈790k, Y≈2.17M | X≈790k, Y≈2.17M | **X≈-2,363k, Y≈-1,361k** |
| Manhole naming | N104, N135, N55, N1... | N104, N135, N55, N1... | **R1…R97** |
| Creator | Covadis | Covadis | **cloudconvert (AC1018)** |

## Fundamental Differences

### 1. Coordinate System

- **network 1** uses coordinates in range X > 500,000 and Y > 2,000,000 (roughly UTM global coords)
- **network 2** uses completely different local coordinates: X ≈ -2,363,000 and Y ≈ -1,361,000
- Negative coordinates do **not** mean the data is invalid — they are simply transformed or projected in a different system
- **Key point**: all Covadis layer names (`EU 1_Regards`, `EU 1_Canalisations`, etc.) are **identical** across both files. Only the coordinate values differ
- The old code used `avgX > 500000 && avgY > 2000000` to filter out profile-view elements — this condition silently drops all of network 2's data

### 2. Profile Layer Naming

- **network 1**: `EU 1_PL_N104_N1_Textes` — node names starting with N
- **network 2**: `EU 1_PL_R19_R18_Textes` — node names starting with R
- The pattern is the same: `EU 1_PL_*_Textes`
- The old code used a **hardcoded list** (`['EU 1_PL_N104_N1_Textes', 'EU 1_PL_N135_N63_Textes', 'EU 1_PL_N55_N1_Textes']`) — unable to discover new profiles automatically

### 3. Data Density

- network 2 has 238 layers (topography, buildings, AEP, sewer, fire) — most are irrelevant for EU 1 sewer extraction
- 329 MB of DXF text — the `dxf` library tries to parse **all entities** into memory, causing `Out of Memory`
- Solution: a lightweight parser that extracts only the required layers (EU 1_Regards, EU 1_Canalisations, etc.) and discards the rest

### 4. File Encoding

- `network 1.dxf` and `networks 1+2.dxf` use iso-8859-1 (plain, no BOM)
- `network 2.dxf` uses `ANSI_1252` with `\r\n` (CRLF) line endings — each line has a trailing carriage return
- The parser must handle `\r` correctly (use `trim()` or `trimEnd()`)

### 5. Label Layer Availability — Critical Data Source Difference

This is a crucial difference that determines **how** manhole and pipe data is extracted:

| Label layer | network 1.dxf | networks 1+2.dxf | network 2.dxf |
|------------|:------------:|:-----------------:|:------------:|
| `EU 1_Regards_Habillage` (MTEXT: CT/CR/PP) | **absent** | present (97 manholes) | present (97 manholes) |
| `EU 1_Canalisations_Habillage` (TEXT: diam/material/length/slope) | **absent** | present (96 labels) | present (96 labels) |

- **network 1.dxf** has neither label layer:
  - No CT (ground level), CR (invert level), PP (depth) data for manholes in layers
  - No pipe labels specifying diameter, material, or length
  - **Profiles (longitudinal sections)** were the **only** source for detailed manhole data and individual inter-manhole segments
  - Example: 134 profile segments extracted from 3 profiles

- **network 2.dxf** has both label layers:
  - All 97 manholes carry CT/CR/PP from MTEXT
  - All 96 pipe labels are available with diameter, material, length, and slope
  - Profiles here are **supplementary**, not the sole source — they provide additional detail (cumulative distances, partial distances, node-by-node invert levels)
  - 12 profiles yield 84 profile segments for cross-validation with layer labels

**Takeaway**: whether `EU 1_Regards_Habillage` exists determines the extraction strategy:
- Layer exists → extract CT/CR/PP directly from MTEXT, use profiles as supplementary
- Layer missing → rely entirely on profiles for manhole data and inter-manhole segments

## How We Made the Code General

### 1️⃣ Auto-detect profile layers (regex instead of hardcoded list)

**Before:**
```js
const profileLayers = [
  'EU 1_PL_N104_N1_Textes',
  'EU 1_PL_N135_N63_Textes',
  'EU 1_PL_N55_N1_Textes',
]
```

**After:**
```js
const allLayersInFile = new Set(entities.map(e => e.layer).filter(Boolean))
const profileLayers = [...allLayersInFile].filter(l =>
  /^EU\s+1_PL_.*_Textes$/.test(l) || /^Proj\d+\s+.*_PL_.*_Textes$/.test(l)
)
```

Now the code discovers any profile layer regardless of node naming (N, R, or any other prefix).

### 2️⃣ Adaptive Coordinate Filter

Compute the average of all pipe vertices in `EU 1_Canalisations`:

```js
const allVerts = allCanalLines.flatMap(e => e.vertices || []);
const avgAllX = allVerts.reduce((s, v) => s + v.x, 0) / allVerts.length;
const avgAllY = allVerts.reduce((s, v) => s + v.y, 0) / allVerts.length;
const isPlanCoords = avgAllX > 300000 && avgAllY > 1000000;
```

- If coords are in "global" range (X>300k, Y>1M) → apply strict filter `avgX > 500000 && avgY > 2000000` to remove profile-view elements
- If coords are local (network 2 style) → **skip the filter entirely** — all `EU 1_Canalisations` entities are plan-view

### 3️⃣ Lightweight DXF Parser for Large Files

The `dxf` library parses every entity into memory at once — causing OOM on 329 MB files.

Solution: `extract_network2.mjs` — a custom parser that reads lines sequentially and extracts only:
- Entities on required layers (`EU 1_Regards`, `EU 1_Canalisations`, `DN 200`, `assai`, etc.)
- TEXT entities on profile layers matching `^EU\s+1_PL_.*_Textes$`

This reduces memory from several GB to ~350 MB (329 MB for text + 126 KB for extracted entities).

### 4️⃣ JSON Loading for Pre-Processed Files

In the web UI (`DxfUploader.jsx`):
- Changed `accept=".dxf,.json"` to accept JSON files directly
- Files >50 MB trigger a warning before parsing begins
- Large files can be pre-processed with `extract_network2.mjs` and the resulting JSON loaded into the browser directly

### 5️⃣ Handling `\r\n` vs `\n`

Different files use different line endings:
- `network 1.dxf`: `\n` only (LF)
- `network 2.dxf`: `\r\n` (CRLF)

Solution: use `trim()` instead of `trimEnd()` when reading values, because `trim()` removes both leading/trailing whitespace (including `\r` and `\n`).

## Summary: General Rules for Any Covadis File

| Problem | General solution |
|---------|-----------------|
| Different profile layer names | Use regex `/^EU\s+1_PL_.*_Textes$/` |
| Different coordinate system | Auto-detect: compute average coords, choose filter accordingly |
| Very large file (>100MB) | Lightweight parser targeting only required layers + JSON loading |
| Different line endings (CRLF vs LF) | Use `trim()` when reading values |
| Unnecessary layers (238 total) | Define `RELEVANT_LAYERS` as a Set of important layers only |
| Different manhole prefixes (N vs R) | Don't depend on a specific letter prefix — accept any text ID |

## Lightweight Parser Flow

```
Read file (fs.readFileSync + TextDecoder iso-8859-1)
    │
    ▼
Split text into lines (split '\n')
    │
    ▼
Locate ENTITIES section → parse entities only inside ENTITIES
    │
    ▼
For each entity (INSERT, LWPOLYLINE, MTEXT, TEXT, LINE):
    ├── if layer is in RELEVANT_LAYERS → keep entity
    └── if layer matches ^EU 1_PL_.*_Textes$ and type is TEXT → keep entity
    │
    ▼
Skip all other entities (HATCH, 3DFACE, ARC, CIRCLE, ...) → big memory saving
    │
    ▼
Process stored entities with same logic as extract_sewer_data.mjs
```

## Performance Comparison

| Metric | `dxf` library + network 2 | Lightweight parser + network 2 |
|--------|--------------------------|--------------------------------|
| Memory | >4 GB (OOM) | ~350 MB |
| Parse time | ~85s (before crash) | ~30s |
| Entities parsed | All (5000+) | 1788 relevant |
| Output size | — | 126 KB |

## Conclusion

The main difference between network 1 and network 2 is **not in layer names** — the Covadis layers (`EU 1_Regards`, `EU 1_Canalisations`, etc.) are identical. The real differences are:

1. **Coordinate system**: completely different — must be auto-detected
2. **File size**: 329 MB requires a lightweight parser to avoid OOM
3. **Profile node naming**: N-prefix vs R-prefix — but the pattern `EU 1_PL_*_Textes` is uniform
4. **Line endings**: CRLF vs LF — both must be handled
5. **Label layer presence**: network 1 lacks `EU 1_Regards_Habillage` and `EU 1_Canalisations_Habillage`, forcing profile-only extraction; network 2 has both layers so profiles are supplementary

With these generalizations, the code can now analyze any Covadis DXF regardless of coordinate system, file size, or node naming convention.
