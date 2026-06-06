import { useState } from 'react'
import { downloadShapefile, downloadGeoJSON } from '../utils/geoExport'

export default function DataTable({ data, geoJSON }) {
  const [tab, setTab] = useState('pipes')

  if (!data) return null

  const pipeCount = data.pipes.length
  const segCount = data.profileSegments?.length || 0
  const dnCount = data.dnPipes?.length || 0
  const manholeCount = data.manholes.length
  const newEu1Count = data.newEu1Inserts?.length || 0
  const assaiNodeCount = data.assaiNodes?.length || 0
  const assaiLineCount = data.assaiLines?.length || 0
  const reseauCount = data.reseauProjete?.length || 0
  const aepPipeCount = data.aepPipes?.length || 0
  const aepNodeCount = data.aepNodes?.length || 0
  const aepSplineCount = data.aepSplines?.length || 0
  const incendieNodeCount = data.incendieNodes?.length || 0
  const profileCount = data.profiles?.length || 0

  return (
    <div className="data-panel">
      <div className="data-header">
        <div className="data-tabs">
          <button className={tab === 'pipes' ? 'active' : ''} onClick={() => setTab('pipes')}>
            Conduites EU ({pipeCount})
          </button>
          <button className={tab === 'segments' ? 'active' : ''} onClick={() => setTab('segments')}>
            Tronçons ({segCount})
          </button>
          <button className={tab === 'dn200' ? 'active' : ''} onClick={() => setTab('dn200')}>
            DN 200 ({dnCount})
          </button>
          <button className={tab === 'manholes' ? 'active' : ''} onClick={() => setTab('manholes')}>
            Regards ({manholeCount})
          </button>
          <button className={tab === 'new-eu1' ? 'active' : ''} onClick={() => setTab('new-eu1')}>
            New EU1 ({newEu1Count})
          </button>
          <button className={tab === 'assai-nodes' ? 'active' : ''} onClick={() => setTab('assai-nodes')}>
            Nœuds assai ({assaiNodeCount})
          </button>
          <button className={tab === 'assai-lines' ? 'active' : ''} onClick={() => setTab('assai-lines')}>
            Tuyaux assai ({assaiLineCount})
          </button>
          <button className={tab === 'reseau' ? 'active' : ''} onClick={() => setTab('reseau')}>
            Réseau projeté ({reseauCount})
          </button>
          <button className={tab === 'aep-pipes' ? 'active' : ''} onClick={() => setTab('aep-pipes')}>
            AEP tuyaux ({aepPipeCount})
          </button>
          <button className={tab === 'aep-nodes' ? 'active' : ''} onClick={() => setTab('aep-nodes')}>
            AEP nœuds ({aepNodeCount})
          </button>
          <button className={tab === 'aep-splines' ? 'active' : ''} onClick={() => setTab('aep-splines')}>
            AEP splines ({aepSplineCount})
          </button>
          <button className={tab === 'incendie' ? 'active' : ''} onClick={() => setTab('incendie')}>
            Incendie ({incendieNodeCount})
          </button>
          <button className={tab === 'profiles' ? 'active' : ''} onClick={() => setTab('profiles')}>
            Profils ({profileCount})
          </button>
        </div>
        <div className="data-export">
          <button onClick={() => downloadShapefile(geoJSON)}>
            Télécharger Shapefile
          </button>
          <button onClick={() => downloadGeoJSON(geoJSON)}>
            Télécharger GeoJSON
          </button>
        </div>
      </div>

      <div className="data-content">
        {tab === 'pipes' && (
          <table>
            <thead>
              <tr>
                <th>N</th>
                <th>DN (mm)</th>
                <th>Longueur (m)</th>
                <th>Pente (%)</th>
                <th>Direction</th>
                <th>Matériau</th>
              </tr>
            </thead>
            <tbody>
              {data.pipes.map((p, i) => (
                <tr key={i}>
                  <td>{i + 1}</td>
                  <td><span className="diam-badge">{p.diam}</span></td>
                  <td>{p.length}</td>
                  <td>{p.slope}</td>
                  <td>{p.dir}</td>
                  <td>{p.material}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {tab === 'segments' && (
          <div className="table-wrap">
            <p className="table-info">Tronçons individuels entre regards (extraits des profils en long). Les segments sans nœud de début/fin sont des tronçons de fin de profil.</p>
            <table>
              <thead>
                <tr>
                  <th>N</th>
                  <th>De</th>
                  <th>Vers</th>
                  <th>Longueur (m)</th>
                  <th>DN (mm)</th>
                  <th>Pente (%)</th>
                  <th>Matériau</th>
                  <th>Profil</th>
                </tr>
              </thead>
              <tbody>
                {data.profileSegments?.map((s, i) => (
                  <tr key={i}>
                    <td>{i + 1}</td>
                    <td><strong>{s.fromNode || '?'}</strong></td>
                    <td><strong>{s.toNode || '?'}</strong></td>
                    <td>{(s.length_m || s.length || 0).toFixed(2)}</td>
                    <td><span className="diam-badge">{s.diam || s.diam_mm || 0}</span></td>
                    <td>{(s.slope_pct || 0).toFixed(2)}</td>
                    <td>{s.material || ''}</td>
                    <td>{s.profileIdx !== undefined ? `#${s.profileIdx}` : s.profile || ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {tab === 'dn200' && (
          <table>
            <thead>
              <tr>
                <th>N</th>
                <th>Calque</th>
                <th>DN (mm)</th>
                <th>Sommets</th>
                <th>X min</th>
                <th>Y min</th>
                <th>X max</th>
                <th>Y max</th>
              </tr>
            </thead>
            <tbody>
              {data.dnPipes?.map((d, i) => {
                const xs = d.vertices.map(v => v.x), ys = d.vertices.map(v => v.y)
                return (
                  <tr key={i}>
                    <td>{i + 1}</td>
                    <td>{d.layer}</td>
                    <td><span className="diam-badge">{d.diam}</span></td>
                    <td>{d.vertices.length}</td>
                    <td>{Math.min(...xs).toFixed(2)}</td>
                    <td>{Math.min(...ys).toFixed(2)}</td>
                    <td>{Math.max(...xs).toFixed(2)}</td>
                    <td>{Math.max(...ys).toFixed(2)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}

        {tab === 'assai-nodes' && (
          <table>
            <thead>
              <tr>
                <th>N</th>
                <th>X</th>
                <th>Y</th>
                <th>Rotation</th>
              </tr>
            </thead>
            <tbody>
              {data.assaiNodes.map((n, i) => (
                <tr key={i}>
                  <td>{i + 1}</td>
                  <td>{n.x.toFixed(2)}</td>
                  <td>{n.y.toFixed(2)}</td>
                  <td>{n.rotation?.toFixed(1)}°</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {tab === 'assai-lines' && (
          <table>
            <thead>
              <tr>
                <th>N</th>
                <th>Calque</th>
                <th>DN (mm)</th>
                <th>X1</th>
                <th>Y1</th>
                <th>X2</th>
                <th>Y2</th>
              </tr>
            </thead>
            <tbody>
              {data.assaiLines.map((l, i) => (
                <tr key={i}>
                  <td>{i + 1}</td>
                  <td>{l.layer}</td>
                  <td>{l.diam}</td>
                  <td>{l.start.x.toFixed(2)}</td>
                  <td>{l.start.y.toFixed(2)}</td>
                  <td>{l.end.x.toFixed(2)}</td>
                  <td>{l.end.y.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {tab === 'reseau' && (
          <table>
            <thead>
              <tr>
                <th>N</th>
                <th>Sommets</th>
                <th>Fermé</th>
                <th>X min</th>
                <th>Y min</th>
                <th>X max</th>
                <th>Y max</th>
              </tr>
            </thead>
            <tbody>
              {data.reseauProjete.map((r, i) => {
                const xs = r.vertices.map(v => v.x), ys = r.vertices.map(v => v.y)
                return (
                  <tr key={i}>
                    <td>{i + 1}</td>
                    <td>{r.vertices.length}</td>
                    <td>{r.closed ? 'Oui' : 'Non'}</td>
                    <td>{Math.min(...xs).toFixed(2)}</td>
                    <td>{Math.min(...ys).toFixed(2)}</td>
                    <td>{Math.max(...xs).toFixed(2)}</td>
                    <td>{Math.max(...ys).toFixed(2)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}

        {tab === 'aep-pipes' && (
          <table>
            <thead>
              <tr>
                <th>N</th>
                <th>Calque</th>
                <th>DN (mm)</th>
                <th>Sommets</th>
                <th>X min</th>
                <th>Y min</th>
                <th>X max</th>
                <th>Y max</th>
              </tr>
            </thead>
            <tbody>
              {data.aepPipes.map((ap, i) => {
                const xs = ap.vertices.map(v => v.x), ys = ap.vertices.map(v => v.y)
                return (
                  <tr key={i}>
                    <td>{i + 1}</td>
                    <td>{ap.layer}</td>
                    <td>{ap.diam}</td>
                    <td>{ap.vertices.length}</td>
                    <td>{Math.min(...xs).toFixed(2)}</td>
                    <td>{Math.min(...ys).toFixed(2)}</td>
                    <td>{Math.max(...xs).toFixed(2)}</td>
                    <td>{Math.max(...ys).toFixed(2)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}

        {tab === 'aep-nodes' && (
          <table>
            <thead>
              <tr>
                <th>N</th>
                <th>X</th>
                <th>Y</th>
                <th>Bloc</th>
              </tr>
            </thead>
            <tbody>
              {data.aepNodes.map((n, i) => (
                <tr key={i}>
                  <td>{i + 1}</td>
                  <td>{n.x.toFixed(2)}</td>
                  <td>{n.y.toFixed(2)}</td>
                  <td>{n.block}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {tab === 'aep-splines' && (
          <table>
            <thead>
              <tr>
                <th>N</th>
                <th>Points de contrôle</th>
                <th>Degré</th>
              </tr>
            </thead>
            <tbody>
              {data.aepSplines.map((s, i) => (
                <tr key={i}>
                  <td>{i + 1}</td>
                  <td>{s.controlPoints.length}</td>
                  <td>{s.degree}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {tab === 'incendie' && (
          <table>
            <thead>
              <tr>
                <th>N</th>
                <th>Type</th>
                <th>X</th>
                <th>Y</th>
                <th>Détail</th>
              </tr>
            </thead>
            <tbody>
              {data.incendieNodes.map((n, i) => (
                <tr key={i}>
                  <td>{i + 1}</td>
                  <td>Nœud</td>
                  <td>{n.x.toFixed(2)}</td>
                  <td>{n.y.toFixed(2)}</td>
                  <td>{n.block}</td>
                </tr>
              ))}
              {data.incendiePipes.map((p, i) => {
                const xs = p.vertices.map(v => v.x), ys = p.vertices.map(v => v.y)
                let len = 0
                for (let j = 1; j < p.vertices.length; j++) len += Math.sqrt((p.vertices[j].x - p.vertices[j-1].x)**2 + (p.vertices[j].y - p.vertices[j-1].y)**2)
                return (
                  <tr key={'pipe-' + i}>
                    <td>{data.incendieNodes.length + i + 1}</td>
                    <td>Tuyau</td>
                    <td>{Math.min(...xs).toFixed(2)}</td>
                    <td>{Math.min(...ys).toFixed(2)}</td>
                    <td>Long: {len.toFixed(1)} m</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}

        {tab === 'manholes' && (
          <div className="table-wrap">
            <p className="table-info">Les regards avec ID R# sont issus des labels MTEXT (Réseau assai). Ceux avec ID profil (N#) sont enrichis depuis les profils en long.</p>
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>CT (alt. terrain)</th>
                  <th>CR (alt. radier)</th>
                  <th>PP (prof.)</th>
                  <th>Distance cumulée (m)</th>
                </tr>
              </thead>
              <tbody>
                {data.manholes.map((m, i) => (
                  <tr key={i}>
                    <td><strong>{m.profileId || m.id || 'R?'}</strong></td>
                    <td>{(m.profileGround || m.ct || '-').toFixed ? (m.profileGround || parseFloat(m.ct) || 0).toFixed(2) : (m.profileGround || m.ct || '-')}</td>
                    <td>{(m.profileInvert || m.cr || '-').toFixed ? (m.profileInvert || parseFloat(m.cr) || 0).toFixed(2) : (m.profileInvert || m.cr || '-')}</td>
                    <td>{(m.profileDepth || m.pp || '-').toFixed ? (m.profileDepth || parseFloat(m.pp) || 0).toFixed(2) : (m.profileDepth || m.pp || '-')}</td>
                    <td>{m.profileCumul != null ? m.profileCumul.toFixed(1) : '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {tab === 'new-eu1' && (
          <table>
            <thead>
              <tr>
                <th>N</th>
                <th>X</th>
                <th>Y</th>
                <th>Bloc</th>
                <th>Rotation</th>
              </tr>
            </thead>
            <tbody>
              {data.newEu1Inserts?.map((n, i) => (
                <tr key={i}>
                  <td>{i + 1}</td>
                  <td>{n.x.toFixed(2)}</td>
                  <td>{n.y.toFixed(2)}</td>
                  <td>{n.block || '-'}</td>
                  <td>{n.rotation?.toFixed(1)}°</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {tab === 'profiles' && (
          <div className="profile-container">
            {data.profiles.length === 0 && <p className="empty-msg">Aucun profil trouvé dans ce fichier DXF.</p>}
            {data.profiles.map((prof, pi) => (
              <div key={pi} className="profile-card">
                <div className="profile-card-header">
                  <strong>{prof.title || prof.layer}</strong>
                  {prof.material && <span className="diam-badge">{prof.material}</span>}
                  {prof.diam && <span className="diam-badge">DN {prof.diam} mm</span>}
                </div>
                {prof.sections.map((sec, si) => (
                  sec.values.length > 0 && (
                    <div key={si} className="profile-section">
                      <div className="profile-section-header">{sec.header}</div>
                      <table>
                        <thead>
                          <tr>
                            <th>N</th>
                            <th>Valeur</th>
                          </tr>
                        </thead>
                        <tbody>
                          {sec.values.map((v, vi) => (
                            <tr key={vi}>
                              <td>{vi + 1}</td>
                              <td>{v}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )
                ))}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
