export const EPANET_SCHEMA = {
  JUNCTIONS: {
    section: '[JUNCTIONS]',
    header: ';ID\tElevation\tDemand\tPattern',
    required: ['id', 'elevation'],
    optional: ['demand', 'pattern'],
    fields: {
      id:        { type: 'string',  label: 'ID',         range: null },
      elevation: { type: 'number',  label: 'Elevation',  range: [-500, 10000] },
      demand:    { type: 'number',  label: 'Demand',     range: [0, 100000] },
      pattern:   { type: 'ref',     label: 'Pattern',    refSection: 'PATTERNS' },
    },
    synonyms: {
      id:        ['id', 'node_id', 'nodeid', 'junction_id', 'junctionid', 'name', 'nom', 'numero', 'num', '编号', 'المعرف'],
      elevation: ['elevation', 'elev', 'z', 'altitude', 'elv', 'elev_m', 'elevation_m', 'الارتفاع', 'منسوب', 'ترتفع'],
      demand:    ['demand', 'flow', 'debit', 'usage', 'consommation', ' besoins', 'الحاجة', 'الطلب', 'استهلاك'],
      pattern:   ['pattern', 'pat', 'patt', 'regime', 'نمط', ' wzan'],
    },
  },
  RESERVOIRS: {
    section: '[RESERVOIRS]',
    header: ';ID\tHead\tPattern',
    required: ['id', 'head'],
    optional: ['pattern'],
    fields: {
      id:      { type: 'string', label: 'ID',    range: null },
      head:    { type: 'number', label: 'Head',  range: [0, 10000] },
      pattern: { type: 'ref',    label: 'Pattern', refSection: 'PATTERNS' },
    },
    synonyms: {
      id:      ['id', 'reservoir_id', 'reservoirid', 'name', 'source', 'الමාරකාය', 'المصدر', 'خزان'],
      head:    ['head', 'hd', 'total_head', 'piezometric_head', 'المنسوب', 'رأس الماء'],
      pattern: ['pattern', 'pat', 'regime', 'النمط'],
    },
  },
  TANKS: {
    section: '[TANKS]',
    header: ';ID\tElevation\tInitLevel\tMinLevel\tMaxLevel\tDiameter\tMinVol\tVolCurve',
    required: ['id', 'elevation', 'initLevel', 'minLevel', 'maxLevel', 'diameter'],
    optional: ['minVol', 'volCurve'],
    fields: {
      id:        { type: 'string', label: 'ID',        range: null },
      elevation: { type: 'number', label: 'Elevation',  range: [-500, 10000] },
      initLevel: { type: 'number', label: 'InitLevel',  range: [0, 1000] },
      minLevel:  { type: 'number', label: 'MinLevel',   range: [0, 1000] },
      maxLevel:  { type: 'number', label: 'MaxLevel',   range: [0, 1000] },
      diameter:  { type: 'number', label: 'Diameter',   range: [0, 10000] },
      minVol:    { type: 'number', label: 'MinVol',     range: [0, 1000000] },
      volCurve:  { type: 'ref',    label: 'VolCurve',   refSection: 'CURVES' },
    },
    synonyms: {
      id:        ['id', 'tank_id', 'tankid', 'name', 'reservoir_id', 'خزان'],
      elevation: ['elevation', 'elev', 'z', 'altitude', 'الارتفاع'],
      initLevel: ['initlevel', 'init_level', 'initial_level', 'initlevel', 'niveau_initial', 'المستوى_الابتدائي'],
      minLevel:  ['minlevel', 'min_level', 'minimum_level', 'niveau_min', 'المستوى_الادنى'],
      maxLevel:  ['maxlevel', 'max_level', 'maximum_level', 'niveau_max', 'المستوى_الاقصى'],
      diameter:  ['diameter', 'diam', 'dia', 'd', 'calibre', 'القطر'],
      minVol:    ['minvol', 'min_vol', 'minimum_volume', 'volume_min', 'الحد_الادنى_للحجم'],
      volCurve:  ['volcurve', 'vol_curve', 'curve', 'courbe', 'المنحنى'],
    },
  },
  PIPES: {
    section: '[PIPES]',
    header: ';ID\tNode1\tNode2\tLength\tDiameter\tRoughness\tMinorLoss\tStatus',
    required: ['id', 'node1', 'node2', 'length', 'diameter'],
    optional: ['roughness', 'minorLoss', 'status'],
    fields: {
      id:        { type: 'string', label: 'ID',        range: null },
      node1:     { type: 'ref',    label: 'Node1',     refSection: 'JUNCTIONS' },
      node2:     { type: 'ref',    label: 'Node2',     refSection: 'JUNCTIONS' },
      length:    { type: 'number', label: 'Length',     range: [0, 100000] },
      diameter:  { type: 'number', label: 'Diameter',   range: [10, 3000] },
      roughness: { type: 'number', label: 'Roughness',  range: [0, 200] },
      minorLoss: { type: 'number', label: 'MinorLoss',  range: [0, 100] },
      status:    { type: 'string', label: 'Status',     range: null },
    },
    synonyms: {
      id:        ['id', 'pipe_id', 'pipeid', 'name', 'numero', 'num', 'conduit_id', 'رقم'],
      node1:     ['from', 'start', 'node1', 'upstream', 'from_node', 'fromnode', 'start_node', 'begin', ' depart', 'debut', '源头', 'من', 'العقدة1', 'نقطة_البداية'],
      node2:     ['to', 'end', 'node2', 'downstream', 'to_node', 'tonode', 'end_node', 'finish', ' arrivee', 'fin', '到', 'الى', 'العقدة2', 'نقطة_النهاية'],
      length:    ['length', 'len', 'lng', 'longueur', 'dist', 'distance', 'الطول'],
      diameter:  ['diameter', 'diam', 'dia', 'd', 'calibre', 'قطر', 'القطر'],
      roughness: ['roughness', 'rough', 'roughn', 'c', 'hazen', 'hw', 'n', 'mannings', 'rugosite', 'الإحطاط'],
      minorLoss: ['minorloss', 'minor_loss', 'minor', 'loss', 'km', 'minorlosscoeff', 'perteslocales', 'الخسائر_المحلية'],
      status:    ['status', 'state', 'etat', 'position', 'الحالة'],
    },
  },
  PUMPS: {
    section: '[PUMPS]',
    header: ';ID\tNode1\tNode2\tParameters\tCurve/Pattern',
    required: ['id', 'node1', 'node2'],
    optional: ['parameters', 'curve', 'pattern'],
    fields: {
      id:         { type: 'string', label: 'ID',         range: null },
      node1:      { type: 'ref',    label: 'Node1',      refSection: 'JUNCTIONS' },
      node2:      { type: 'ref',    label: 'Node2',      refSection: 'JUNCTIONS' },
      parameters: { type: 'string', label: 'Parameters',  range: null },
      curve:      { type: 'ref',    label: 'Curve',       refSection: 'CURVES' },
      pattern:    { type: 'ref',    label: 'Pattern',     refSection: 'PATTERNS' },
    },
    synonyms: {
      id:         ['id', 'pump_id', 'pumpid', 'name', ' pompe'],
      node1:      ['from', 'start', 'node1', 'upstream', 'from_node', 'fromnode', 'من'],
      node2:      ['to', 'end', 'node2', 'downstream', 'to_node', 'tonode', 'الى'],
      parameters: ['parameters', 'params', 'parametres', 'settings'],
      curve:      ['curve', 'courbe', 'pump_curve', 'courbe_pompe', 'المنحنى'],
      pattern:    ['pattern', 'pat', 'regime', 'النمط'],
    },
  },
  VALVES: {
    section: '[VALVES]',
    header: ';ID\tNode1\tNode2\tDiameter\tType\tSetting\tMinorLoss',
    required: ['id', 'node1', 'node2', 'diameter', 'type', 'setting'],
    optional: ['minorLoss'],
    fields: {
      id:        { type: 'string', label: 'ID',        range: null },
      node1:     { type: 'ref',    label: 'Node1',     refSection: 'JUNCTIONS' },
      node2:     { type: 'ref',    label: 'Node2',     refSection: 'JUNCTIONS' },
      diameter:  { type: 'number', label: 'Diameter',  range: [10, 3000] },
      type:      { type: 'string', label: 'Type',      range: null },
      setting:   { type: 'number', label: 'Setting',   range: [0, 100000] },
      minorLoss: { type: 'number', label: 'MinorLoss', range: [0, 100] },
    },
    synonyms: {
      id:        ['id', 'valve_id', 'valveid', 'name', ' vanne'],
      node1:     ['from', 'start', 'node1', 'upstream', 'from_node', 'fromnode', 'من'],
      node2:     ['to', 'end', 'node2', 'downstream', 'to_node', 'tonode', 'الى'],
      diameter:  ['diameter', 'diam', 'dia', 'd', 'calibre', 'القطر'],
      type:      ['type', 'valve_type', 'valvetype', 'kind', 'genre', 'النوع'],
      setting:   ['setting', 'set', 'value', 'parametre', 'valeur', 'القيمة'],
      minorLoss: ['minorloss', 'minor_loss', 'minor', 'loss', 'km', 'الخسائر'],
    },
  },
  PATTERNS: {
    section: '[PATTERNS]',
    header: ';ID\tFactor1\tFactor2\t...',
    required: ['id'],
    optional: ['factors'],
    fields: {
      id:      { type: 'string', label: 'ID',      range: null },
      factors: { type: 'array',  label: 'Factors', range: null },
    },
    synonyms: {
      id:      ['id', 'pattern_id', 'patternid', 'name', 'nom', 'النمط'],
      factors: ['factors', 'values', 'multipliers', 'valeurs', 'facteurs', 'العوامل'],
    },
  },
  CURVES: {
    section: '[CURVES]',
    header: ';ID\tX-Value\tY-Value',
    required: ['id', 'x', 'y'],
    optional: [],
    fields: {
      id: { type: 'string', label: 'ID', range: null },
      x:  { type: 'number', label: 'X-Value', range: null },
      y:  { type: 'number', label: 'Y-Value', range: null },
    },
    synonyms: {
      id: ['id', 'curve_id', 'curveid', 'name', 'nom', 'المنحنى'],
      x:  ['x', 'xvalue', 'x_value', 'flow', 'deb', 'debit', 'التدفق'],
      y:  ['y', 'yvalue', 'y_value', 'head', 'hd', 'pression', 'الضغط'],
    },
  },
  CONTROLS: {
    section: '[CONTROLS]',
    header: ';Control statements',
    required: [],
    optional: [],
    fields: {},
    synonyms: {},
  },
  COORDINATES: {
    section: '[COORDINATES]',
    header: ';Node\tX\tY',
    required: ['id', 'x', 'y'],
    optional: [],
    fields: {
      id: { type: 'string', label: 'Node', range: null },
      x:  { type: 'number', label: 'X',    range: null },
      y:  { type: 'number', label: 'Y',    range: null },
    },
    synonyms: {
      id: ['id', 'node', 'node_id', 'nodeid', 'العقدة'],
      x:  ['x', 'x_coord', 'xcoord', 'longitude', 'lon', 'long', 'الاحداثي_x'],
      y:  ['y', 'y_coord', 'ycoord', 'latitude', 'lat', 'lati', 'الاحداثي_y'],
    },
  },
  OPTIONS: {
    section: '[OPTIONS]',
    required: [],
    optional: [],
    fields: {},
    synonyms: {},
  },
  TIMES: {
    section: '[TIMES]',
    required: [],
    optional: [],
    fields: {},
    synonyms: {},
  },
  REPORT: {
    section: '[REPORT]',
    required: [],
    optional: [],
    fields: {},
    synonyms: {},
  },
  STATUS: {
    section: '[STATUS]',
    required: [],
    optional: [],
    fields: {},
    synonyms: {},
  },
}

export function getRequiredFields(sectionKey) {
  const schema = EPANET_SCHEMA[sectionKey]
  return schema ? schema.required : []
}

export function getOptionalFields(sectionKey) {
  const schema = EPANET_SCHEMA[sectionKey]
  return schema ? schema.optional : []
}

export function getAllFields(sectionKey) {
  const schema = EPANET_SCHEMA[sectionKey]
  return schema ? [...schema.required, ...schema.optional] : []
}

export function getAllSynonymsForField(sectionKey, field) {
  const schema = EPANET_SCHEMA[sectionKey]
  return schema?.synonyms?.[field] || [field]
}

export function buildSynonymList(sectionKey) {
  const schema = EPANET_SCHEMA[sectionKey]
  if (!schema?.synonyms) return []
  const list = []
  for (const [field, syns] of Object.entries(schema.synonyms)) {
    for (const s of syns) {
      list.push({ field, synonym: s })
    }
  }
  return list
}
