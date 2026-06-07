export function toDxfString(data, options = {}) {
  const { covadisLayers = true } = options
  const { manholes = [], segments = [] } = data

  const lines = []

  function wr(g, v) {
    lines.push(`${g}\n${v}`)
  }

  // HEADER
  wr('0', 'SECTION')
  wr('2', 'HEADER')
  wr('9', '$ACADVER')
  wr('1', 'AC1009')
  wr('9', '$INSBASE')
  wr('10', '0.0')
  wr('20', '0.0')
  wr('30', '0.0')
  wr('0', 'ENDSEC')

  // TABLES
  wr('0', 'SECTION')
  wr('2', 'TABLES')
  wr('0', 'TABLE')
  wr('2', 'LAYER')

  const layerNames = ['0']
  if (covadisLayers) {
    layerNames.push('EU 1_Regards', 'EU 1_Canalisations', 'EU 1_Regards_Habillage')
  }
  wr('70', String(layerNames.length))

  for (const name of layerNames) {
    wr('0', 'LAYER')
    wr('2', name)
    wr('70', '0')
    wr('62', '7')
    wr('6', 'CONTINUOUS')
  }

  wr('0', 'ENDTAB')
  wr('0', 'ENDSEC')

  // ENTITIES
  wr('0', 'SECTION')
  wr('2', 'ENTITIES')

  const mhLayer = covadisLayers ? 'EU 1_Regards' : '0'
  const pipeLayer = covadisLayers ? 'EU 1_Canalisations' : '0'
  const lblLayer = covadisLayers ? 'EU 1_Regards_Habillage' : '0'

  for (const mh of manholes) {
    wr('0', 'INSERT')
    wr('8', mhLayer)
    wr('2', 'REGARD')
    wr('10', mh.x.toFixed(6))
    wr('20', mh.y.toFixed(6))
  }

  for (const seg of segments) {
    wr('0', 'LWPOLYLINE')
    wr('8', pipeLayer)
    wr('90', '2')
    wr('10', seg.start.x.toFixed(6))
    wr('20', seg.start.y.toFixed(6))
    wr('10', seg.end.x.toFixed(6))
    wr('20', seg.end.y.toFixed(6))
  }

  for (const mh of manholes) {
    const text = `${mh.id}\\PCT : ${mh.ct}\\PCR : ${mh.cr}\\PP : ${mh.pp}`
    wr('0', 'MTEXT')
    wr('8', lblLayer)
    wr('10', mh.x.toFixed(6))
    wr('20', mh.y.toFixed(6))
    wr('1', text)
  }

  wr('0', 'ENDSEC')
  wr('0', 'EOF')

  return lines.join('\n')
}
