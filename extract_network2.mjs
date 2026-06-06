import fs from 'fs';

const RELEVANT_LAYERS = new Set([
  'EU 1_Regards',
  'EU 1_Regards_Habillage',
  'EU 1_Canalisations',
  'EU 1_Canalisations_Habillage',
  'DN 200',
  'assai',
  'assai 250',
  'pvc 200',
  'New_EU 1_Canalisations_Pen_No__14',
]);

const ENTITY_TYPES = new Set(['INSERT', 'LWPOLYLINE', 'MTEXT', 'TEXT', 'LINE']);

function dist(a, b) {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

function pipeCumLen(verts) {
  const lens = [0];
  for (let i = 1; i < verts.length; i++)
    lens.push(lens[lens.length - 1] + dist(verts[i - 1], verts[i]));
  return lens;
}

function interpolateAt(verts, lens, target) {
  if (target <= 0 || lens.length < 2) return verts[0];
  const total = lens[lens.length - 1];
  if (target >= total) return verts[verts.length - 1];
  for (let i = 1; i < lens.length; i++) {
    if (lens[i] >= target) {
      const t = (target - lens[i - 1]) / (lens[i] - lens[i - 1]);
      return { x: verts[i - 1].x + t * (verts[i].x - verts[i - 1].x), y: verts[i - 1].y + t * (verts[i].y - verts[i - 1].y) };
    }
  }
  return verts[verts.length - 1];
}

// Lightweight DXF parser: extracts only entities on relevant layers
function parseRelevantEntities(text) {
  const entities = [];
  const lines = text.split('\n');
  let i = 0;

  function nextLine() { return i < lines.length ? lines[i++].trim() : null; }
  function expectCode(code) {
    const c = nextLine();
    if (c === null) return false;
    const v = nextLine();
    if (v === null) return false;
    return parseInt(c) === code ? v : null;
  }

  // Walk through the file looking for ENTITIES section
  let inEntities = false;
  while (i < lines.length) {
    const c1 = nextLine(); if (c1 === null) break;
    const v1 = nextLine(); if (v1 === null) break;

    if (c1 === '0' && v1 === 'SECTION') {
      const secType = expectCode(2);
      if (secType === 'ENTITIES') inEntities = true;
      continue;
    }
    if (c1 === '0' && v1 === 'ENDSEC') {
      inEntities = false;
      continue;
    }

    if (inEntities && c1 === '0' && ENTITY_TYPES.has(v1)) {
      const entityType = v1;
      let layer = '';
      let insertData = { block: '', x: 0, y: 0, rotation: 0 };
      let mtextData = { x: 0, y: 0, string: '' };
      let textData = { x: 0, y: 0, string: '' };
      let lineData = { start: null, end: null };
      let lwpolyVerts = [];
      let vertCount = 0;
      let inside = true;

      while (inside && i < lines.length) {
        const gc = nextLine(); if (gc === null) break;
        const gv = nextLine(); if (gv === null) break;
        const code = parseInt(gc);

        switch (code) {
          case 0: // next entity or ENDSEC
            i -= 2; // push back
            inside = false;
            break;
          case 8: layer = gv; break;
          case 2: insertData.block = gv; break;
          case 10:
            if (entityType === 'LWPOLYLINE') lwpolyVerts.push({ x: parseFloat(gv), y: 0 });
            else if (entityType === 'INSERT') insertData.x = parseFloat(gv);
            else if (entityType === 'MTEXT') mtextData.x = parseFloat(gv);
            else if (entityType === 'TEXT') textData.x = parseFloat(gv);
            else if (entityType === 'LINE') { if (!lineData.start) lineData.start = {}; lineData.start.x = parseFloat(gv); }
            break;
          case 20:
            if (entityType === 'LWPOLYLINE' && lwpolyVerts.length > 0) lwpolyVerts[lwpolyVerts.length - 1].y = parseFloat(gv);
            else if (entityType === 'INSERT') insertData.y = parseFloat(gv);
            else if (entityType === 'MTEXT') mtextData.y = parseFloat(gv);
            else if (entityType === 'TEXT') textData.y = parseFloat(gv);
            else if (entityType === 'LINE') { if (!lineData.start) lineData.start = {}; lineData.start.y = parseFloat(gv); }
            break;
          case 11:
            if (entityType === 'LINE') { if (!lineData.end) lineData.end = {}; lineData.end.x = parseFloat(gv); }
            break;
          case 21:
            if (entityType === 'LINE') { if (!lineData.end) lineData.end = {}; lineData.end.y = parseFloat(gv); }
            break;
          case 50: insertData.rotation = parseFloat(gv); break;
          case 1:
            if (entityType === 'MTEXT') mtextData.string = gv;
            else if (entityType === 'TEXT') textData.string = gv;
            break;
          case 90: vertCount = parseInt(gv); break;
        }
      }

      const isProfileLayer = /^EU\s+1_PL_.*_Textes$/.test(layer);

      if (RELEVANT_LAYERS.has(layer) || (isProfileLayer && entityType === 'TEXT')) {
        switch (entityType) {
          case 'INSERT':
            entities.push({ layer, type: 'INSERT', x: insertData.x, y: insertData.y, block: insertData.block, rotation: insertData.rotation });
            break;
          case 'MTEXT':
            entities.push({ layer, type: 'MTEXT', x: mtextData.x, y: mtextData.y, string: mtextData.string });
            break;
          case 'TEXT':
            entities.push({ layer, type: 'TEXT', x: textData.x, y: textData.y, string: textData.string });
            break;
          case 'LWPOLYLINE':
            if (lwpolyVerts.length >= 2) {
              // Ensure we have the right number of vertices from vertCount
              if (vertCount > 0 && lwpolyVerts.length > vertCount) lwpolyVerts = lwpolyVerts.slice(0, vertCount);
              entities.push({ layer, type: 'LWPOLYLINE', vertices: lwpolyVerts });
            }
            break;
          case 'LINE':
            if (lineData.start && lineData.end) {
              entities.push({ layer, type: 'LINE', start: lineData.start, end: lineData.end });
            }
            break;
        }
      }

      // Also capture profile text layers
      if (/^EU\s+1_PL_.*_Textes$/.test(layer) && entityType === 'TEXT') {
        // Already pushed above
      }
    }
  }

  return entities;
}

function processFile(filepath, label) {
  console.log(`Reading ${filepath}...`);
  const buf = fs.readFileSync(filepath);
  const text = new TextDecoder('iso-8859-1').decode(buf);
  console.log(`Parsing entities (${(buf.length / 1024 / 1024).toFixed(0)} MB)...`);
  const entities = parseRelevantEntities(text);
  console.log(`Found ${entities.length} relevant entities`);

  // ========== 1. MANHOLES ==========
  const inserts = entities.filter(e => e.layer === 'EU 1_Regards' && e.type === 'INSERT');
  const rawMtexts = entities.filter(e => e.layer === 'EU 1_Regards_Habillage' && e.type === 'MTEXT');

  const mtextRecords = rawMtexts.map(lbl => {
    const parts = lbl.string.split('\\P');
    let id = '', ct = '', cr = '', pp = '';
    for (const p of parts) {
      const s = p.trim();
      if (s.match(/^R\d+/)) id = s;
      else if (s.startsWith('CT')) ct = s.split(':')[1]?.trim() || '';
      else if (s.startsWith('CR')) cr = s.split(':')[1]?.trim() || '';
      else if (s.startsWith('P ') || s.startsWith('P:')) pp = s.split(':')[1]?.trim() || '';
    }
    return { id, ct, cr, pp, x: lbl.x, y: lbl.y };
  });

  const sInserts = [...inserts].sort((a, b) => a.y - b.y);
  const sLabels = [...mtextRecords].sort((a, b) => a.y - b.y);
  const usedIns = new Set();
  const manholes = [];

  for (const lbl of sLabels) {
    let bestIdx = -1, bestDist = 300;
    for (let i = 0; i < sInserts.length; i++) {
      if (usedIns.has(i)) continue;
      const d = dist(lbl, sInserts[i]);
      if (d < bestDist) { bestDist = d; bestIdx = i; }
    }
    if (bestIdx >= 0) {
      usedIns.add(bestIdx);
      manholes.push({
        id: lbl.id, ct: lbl.ct, cr: lbl.cr, pp: lbl.pp,
        x: sInserts[bestIdx].x, y: sInserts[bestIdx].y,
        positionMatch: bestDist.toFixed(1),
        _sources: {
          id: 'EU 1_Regards_Habillage MTEXT: "' + lbl.id + '"',
          ct: lbl.ct ? 'EU 1_Regards_Habillage MTEXT PCT' : '—',
          cr: lbl.cr ? 'EU 1_Regards_Habillage MTEXT PCR' : '—',
          pp: lbl.pp ? 'EU 1_Regards_Habillage MTEXT PP' : '—',
          position: 'EU 1_Regards INSERT (match=' + bestDist.toFixed(1) + ')'
        }
      });
    } else {
      manholes.push({
        id: lbl.id, ct: lbl.ct, cr: lbl.cr, pp: lbl.pp,
        x: lbl.x, y: lbl.y,
        positionMatch: '— (no INSERT)',
        _sources: { position: 'EU 1_Regards_Habillage MTEXT (lonely label)' }
      });
    }
  }
  for (let i = 0; i < sInserts.length; i++) {
    if (!usedIns.has(i)) {
      manholes.push({
        id: 'R?', ct: '', cr: '', pp: '',
        x: sInserts[i].x, y: sInserts[i].y,
        positionMatch: '—',
        _sources: { position: 'EU 1_Regards INSERT (unlabeled)' }
      });
    }
  }

  // ========== 2. PROFILES ==========
  const allLayersInFile = new Set(entities.map(e => e.layer).filter(Boolean));
  const profileLayers = [...allLayersInFile].filter(l =>
    /^EU\s+1_PL_.*_Textes$/.test(l) || /^Proj\d+\s+.*_PL_.*_Textes$/.test(l)
  );
  const profiles = [];
  for (const layer of profileLayers) {
    const texts = entities.filter(e => e.layer === layer && e.type === 'TEXT').map(e => e.string.trim());
    if (texts.length === 0) continue;
    const sectionHeaders = [
      'Cotes Terrain Naturel', 'Numéros des regards', 'Cotes fil d\'eau',
      'Profondeurs fil d\'eau', 'Distances partielles', 'Distances cumulées',
      'Pentes', 'Alignements en plan', 'Dimensions et Matériaux',
      'Profil entre les noeuds', 'Echelle en X', 'Echelle en Y', 'PC'
    ];
    let sections = [], currentValues = [], title = '', fromNode = '', toNode = '';
    for (const t of texts) {
      const matched = sectionHeaders.find(h => t.startsWith(h));
      if (matched) {
        sections.push({ header: matched, values: currentValues });
        currentValues = [];
        if (matched.startsWith('Profil')) {
          title = t;
          const nm = t.match(/noeuds\s+(\S+)-(\S+)/);
          if (nm) { fromNode = nm[1]; toNode = nm[2]; }
        }
      } else { currentValues.push(t); }
    }
    if (currentValues.length > 0) sections.push({ header: '', values: currentValues });
    const profile = { layer, title, fromNode, toNode, sections };
    for (const s of sections) {
      if ((s.header.startsWith('Dimensions') || s.header.startsWith('Alignements')) && s.values[0]) {
        profile.material = s.values[0];
        const dm = s.values[0].match(/(\d{3,4})$/);
        if (dm) profile.diam = parseInt(dm[1]);
        else { const dm2 = s.values[0].match(/-(\d{2,4})/); if (dm2) profile.diam = parseInt(dm2[1]); }
      }
    }
    profiles.push(profile);
  }

  // ========== 3. EU 1_Canalisations PIPES ==========
  const allCanalLines = entities.filter(e =>
    e.layer === 'EU 1_Canalisations' && e.type === 'LWPOLYLINE' && e.vertices?.length >= 2
  );

  const allVerts = allCanalLines.flatMap(e => e.vertices || []);
  const avgAllX = allVerts.length > 0 ? allVerts.reduce((s, v) => s + v.x, 0) / allVerts.length : 0;
  const avgAllY = allVerts.length > 0 ? allVerts.reduce((s, v) => s + v.y, 0) / allVerts.length : 0;
  const isPlanCoords = avgAllX > 300000 && avgAllY > 1000000;

  const planPipes = [];
  for (const e of allCanalLines) {
    const xs = e.vertices.map(v => v.x), ys = e.vertices.map(v => v.y);
    const xMin = Math.min(...xs), xMax = Math.max(...xs);
    const yMin = Math.min(...ys), yMax = Math.max(...ys);
    const xSpan = xMax - xMin, ySpan = yMax - yMin;
    const avgX = (xMin + xMax) / 2, avgY = (yMin + yMax) / 2;
    const len = e.vertices.reduce((l, v, j) => j > 0 ? l + dist(e.vertices[j - 1], v) : l, 0);

    let type = 'pipe';
    if (isPlanCoords) {
      if (!(avgX > 500000 && avgY > 2000000)) type = 'profile_zone';
      else if (xSpan < 5 && ySpan > 50) type = 'profile_vertical';
      else if (ySpan < 5 && xSpan > 50) type = 'profile_horizontal';
      else if (xSpan > 100 && ySpan > 100 && Math.min(xSpan, ySpan) / Math.max(xSpan, ySpan) < 0.05) type = 'profile_diagonal';
    }

    const anchoredVerts = e.vertices.map(v => {
      const nearest = inserts.reduce((best, ins, idx) => {
        const d = dist(v, ins);
        return d < best.d ? { d, idx } : best;
      }, { d: 999, idx: -1 });
      return { x: v.x, y: v.y, manholeIdx: nearest.d < 2 ? nearest.idx : -1, manholeDist: nearest.d < 2 ? nearest.d : undefined };
    });

    const connections = [
      { pos: 'start', idx: 0, manhole: -1, dist: 999 },
      { pos: 'end', idx: e.vertices.length - 1, manhole: -1, dist: 999 }
    ];
    for (const conn of connections) {
      for (let j = 0; j < inserts.length; j++) {
        const d = dist(e.vertices[conn.idx], inserts[j]);
        if (d < conn.dist) { conn.dist = d; conn.manhole = j; }
      }
    }

    planPipes.push({
      index: allCanalLines.indexOf(e),
      type, length: Math.round(len * 100) / 100,
      classifyReason: type !== 'pipe' ? `filtered: ${type}` : 'real',
      vertices: e.vertices.length,
      verticesAnchored: anchoredVerts.filter(v => v.manholeIdx >= 0).length,
      startVertex: anchoredVerts[0],
      endVertex: anchoredVerts[anchoredVerts.length - 1],
      nearestStart: { manholeIdx: connections[0].manhole, dist: Math.round(connections[0].dist * 100) / 100 },
      nearestEnd: { manholeIdx: connections[1].manhole, dist: Math.round(connections[1].dist * 100) / 100 },
    });
  }

  // ========== 4. PIPE LABELS ==========
  const pipeTexts = entities.filter(e => e.layer === 'EU 1_Canalisations_Habillage' && e.type === 'TEXT');
  const labelGroups = [];
  const usedT = new Set();
  for (let i = 0; i < pipeTexts.length; i++) {
    if (usedT.has(i)) continue;
    const group = [pipeTexts[i]];
    usedT.add(i);
    for (let j = i + 1; j < pipeTexts.length; j++) {
      if (usedT.has(j)) continue;
      if (dist(pipeTexts[i], pipeTexts[j]) < 5) { group.push(pipeTexts[j]); usedT.add(j); }
    }
    if (group.length > 0) labelGroups.push(group);
  }

  const diamRegex = /^(\S+)-(\d+)\s+([\d.]+)\s*ml?$/;
  const slopeRegex = /^([\-\d.]+)\s*%\s*(<--|-->)$/;
  const parsedLabels = labelGroups.map(g => {
    let diam = 0, mat = '', length = 0, slope = '', dir = '';
    for (const lbl of g) {
      const dm = lbl.string.trim().match(diamRegex);
      if (dm) { mat = dm[1]; diam = parseInt(dm[2]); length = parseFloat(dm[3]); }
      const sm = lbl.string.trim().match(slopeRegex);
      if (sm) { slope = parseFloat(sm[1]); dir = sm[2].trim(); }
    }
    const cx = g.reduce((s, l) => s + l.x, 0) / g.length;
    const cy = g.reduce((s, l) => s + l.y, 0) / g.length;
    return { diam, material: mat, length_m: length, slope_pct: slope, direction: dir, x: Math.round(cx * 100) / 100, y: Math.round(cy * 100) / 100, texts: g.map(l => l.string.trim()) };
  });

  // ========== 5. OTHER NETWORKS ==========
  const dn200Pipes = entities
    .filter(e => e.layer === 'DN 200' && e.type === 'LWPOLYLINE' && e.vertices?.length >= 2)
    .filter(e => {
      if (isPlanCoords) {
        const xs = e.vertices.map(v => v.x);
        const avgX = (Math.min(...xs) + Math.max(...xs)) / 2;
        return avgX > 500000;
      }
      return true;
    })
    .map(e => ({
      vertices: e.vertices.length,
      length: Math.round(e.vertices.reduce((l, v, j) => j > 0 ? l + dist(e.vertices[j - 1], v) : l, 0) * 100) / 100,
      diam: 200,
      layer: 'DN 200'
    }));

  const assaiInserts = entities.filter(e => e.layer === 'assai' && e.type === 'INSERT' && (isPlanCoords ? (e.x > 500000 && e.y > 2000000) : true));
  const assaiLines = entities.filter(e =>
    (e.layer === 'assai 250' || e.layer === 'pvc 200') && e.type === 'LINE' && (isPlanCoords ? e.start?.x > 500000 : true)
  ).map(e => ({
    layer: e.layer,
    diam: e.layer === 'assai 250' ? 250 : 200,
    length: Math.round(dist(e.start, e.end) * 100) / 100
  }));

  const reseauProj = entities.filter(e => e.layer?.includes('assainissement') && e.type === 'LWPOLYLINE' && e.vertices?.length >= 2);
  const newEu1Inserts = entities.filter(e => e.layer?.startsWith('New_EU 1_Canalisations') && e.type === 'INSERT');

  // ========== 6. BUILD NETWORK ==========
  const mhById = new Map();
  manholes.forEach((m, mi) => {
    if (m.id && m.id !== 'R?') mhById.set(m.id, { ...m, arrayIdx: mi });
  });

  const matchedProfiles = profiles.map(prof => {
    const cumulSection = prof.sections.find(s => s.header.startsWith('Distances cumulées'));
    if (!cumulSection) return { ...prof, matchedPipe: -1, error: 'no cumul section' };
    const cumulDists = cumulSection.values.map(Number).filter(v => !isNaN(v));
    const totalLength = cumulDists.length > 0 ? cumulDists[cumulDists.length - 1] : 0;

    let bestPipe = -1, bestDiff = Infinity;
    for (let i = 0; i < planPipes.length; i++) {
      if (planPipes[i].type !== 'pipe') continue;
      const diff = Math.abs(planPipes[i].length - totalLength);
      if (diff < bestDiff) { bestDiff = diff; bestPipe = i; }
    }
    return {
      from: prof.fromNode, to: prof.toNode,
      material: prof.material, diam: prof.diam,
      totalLength: Math.round(totalLength * 100) / 100,
      matchedPipeIndex: bestPipe,
      lengthMatchDiff: bestPipe >= 0 ? Math.round(bestDiff * 100) / 100 : '—',
      nodesInProfile: cumulDists.length,
      nodes: prof.sections.find(s => s.header.startsWith('Numéros'))?.values || [],
      inverts: prof.sections.find(s => s.header.startsWith('Cotes fil'))?.values.map(Number) || [],
      depths: prof.sections.find(s => s.header.startsWith('Profondeurs'))?.values.map(Number) || [],
      grounds: prof.sections.find(s => s.header.startsWith('Cotes Terrain'))?.values.map(Number) || [],
      cumuls: cumulDists,
      partials: prof.sections.find(s => s.header.startsWith('Distances partielles'))?.values.map(Number) || []
    };
  });

  const profileNodeMap = new Map();
  for (const mp of matchedProfiles) {
    if (mp.matchedPipeIndex < 0 || mp.matchedPipeIndex >= planPipes.length) continue;
    const pipe = planPipes[mp.matchedPipeIndex];
    const pipeVerts = allCanalLines[pipe.index].vertices;
    const pipeLens = pipeCumLen(pipeVerts);

    for (let ni = 0; ni < mp.cumuls.length; ni++) {
      const pos = interpolateAt(pipeVerts, pipeLens, mp.cumuls[ni]);
      let bestMh = -1, bestDist = 50;
      for (let j = 0; j < inserts.length; j++) {
        const d = dist(pos, inserts[j]);
        if (d < bestDist) { bestDist = d; bestMh = j; }
      }
      profileNodeMap.set(`${pos.x.toFixed(1)}_${pos.y.toFixed(1)}`, {
        id: mp.nodes[ni] || '',
        invert: mp.inverts[ni] || 0,
        depth: mp.depths[ni] || 0,
        ground: mp.grounds[ni] || 0,
        cumul: mp.cumuls[ni],
        profileFrom: mp.from, profileTo: mp.to,
        profileDiam: mp.diam, profileMaterial: mp.material,
        insertIdx: bestMh >= 0 ? bestMh : undefined
      });
    }
  }

  for (const mh of manholes) {
    const key = `${mh.x.toFixed(1)}_${mh.y.toFixed(1)}`;
    const pn = profileNodeMap.get(key);
    if (pn) {
      mh.profileId = pn.id;
      mh.profileInvert = pn.invert;
      mh.profileDepth = pn.depth;
      mh.profileGround = pn.ground;
      mh.profileCumul = pn.cumul;
      mh._sources.profile = 'EU 1_PL_*_Textes (profile longitudinal section)';
    }
  }

  const profileSegments = [];
  for (const mp of matchedProfiles) {
    if (mp.matchedPipeIndex < 0) continue;
    for (let si = 0; si < mp.cumuls.length - 1; si++) {
      profileSegments.push({
        fromNode: mp.nodes[si] || '',
        toNode: mp.nodes[si + 1] || '',
        length: Math.round((mp.partials[si] || (mp.cumuls[si + 1] - mp.cumuls[si])) * 100) / 100,
        invertFrom: mp.inverts[si] || 0,
        invertTo: mp.inverts[si + 1] || 0,
        slope_pct: mp.inverts[si + 1] && mp.inverts[si] ? Math.round((mp.inverts[si + 1] - mp.inverts[si]) / (mp.partials[si] || (mp.cumuls[si + 1] - mp.cumuls[si])) * 10000) / 100 : 0,
        diam: mp.diam,
        material: mp.material,
        profile: `${mp.from}→${mp.to}`,
        _source: 'EU 1_PL_*_Textes partial distances + invert levels'
      });
    }
  }

  console.log(`  manholes: ${manholes.length} (labeled: ${mtextRecords.length}, inserts: ${inserts.length}, matched: ${usedIns.size})`);
  console.log(`  profiles: ${profiles.length}`);
  console.log(`  profileSegments: ${profileSegments.length}`);
  console.log(`  canalLines: ${allCanalLines.length} total, ${planPipes.filter(p => p.type === 'pipe').length} real`);
  console.log(`  pipeLabels: ${parsedLabels.length}`);
  console.log(`  dn200: ${dn200Pipes.length}`);
  console.log(`  assai: ${assaiInserts.length} inserts, ${assaiLines.length} lines`);
  console.log(`  reseauProjete: ${reseauProj.length}`);
  console.log(`  newEu1Inserts: ${newEu1Inserts.length}`);

  return {
    meta: { file: label, path: filepath },
    manholes: {
      count: manholes.length,
      withLabel: mtextRecords.length,
      withInsert: inserts.length,
      labeledAndMatched: usedIns.size,
      labeledUnmatched: mtextRecords.length - usedIns.size,
      unlabeledInserts: inserts.length - usedIns.size,
      items: manholes
    },
    profiles: { count: profiles.length, items: matchedProfiles },
    profileSegments: { count: profileSegments.length, items: profileSegments },
    pipesEU1: {
      totalLwpolylines: allCanalLines.length,
      realPipes: planPipes.filter(p => p.type === 'pipe').length,
      profileZone: planPipes.filter(p => p.type === 'profile_zone').length,
      profileConstructionLines: planPipes.filter(p => p.type !== 'pipe').length,
      items: planPipes
    },
    pipeLabels: { totalTexts: pipeTexts.length, groups: parsedLabels.length, items: parsedLabels },
    dn200: { count: dn200Pipes.length, totalLength: Math.round(dn200Pipes.reduce((s, p) => s + p.length, 0) * 100) / 100 },
    assai: { inserts: assaiInserts.length, lines: assaiLines.length, linesDetail: assaiLines },
    reseauProjete: { count: reseauProj.length },
    newEu1Inserts: { count: newEu1Inserts.length }
  };
}

const result = processFile('network 2.dxf', 'Network 2');

fs.writeFileSync('network2_data.json', JSON.stringify(result, null, 2));
console.log('Written network2_data.json');
