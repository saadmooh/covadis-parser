import { useState, useMemo } from 'react'
import DxfUploader from './components/DxfUploader'
import MapView from './components/MapView'
import DataTable from './components/DataTable'
import { toGeoJSON } from './utils/geoExport'
import { t } from './utils/translations.js'
import './App.css'

const LANG_OPTIONS = [
  { code: 'en', label: 'EN' },
  { code: 'fr', label: 'FR' },
  { code: 'ar', label: 'عربي' },
]

function App() {
  const [data, setData] = useState(null)
  const [fileName, setFileName] = useState('')
  const [format, setFormat] = useState('')
  const [dxfContent, setDxfContent] = useState('')
  const [lang, setLang] = useState('en')

  const geoJSON = useMemo(() => data ? toGeoJSON(data) : null, [data])

  const handleData = (parsedData, name, fmt, dxfRaw) => {
    setData(parsedData)
    setFileName(name)
    setFormat(fmt || 'covadis')
    if (dxfRaw) setDxfContent(dxfRaw)
  }

  const handleEditAepPipe = (index, newDiam) => {
    setData(prev => {
      const aepPipes = [...prev.aepPipes]
      aepPipes[index] = { ...aepPipes[index], diam: newDiam, layer: `DN${newDiam}` }
      return { ...prev, aepPipes }
    })
  }

  const handleEditDnPipe = (index, newDiam) => {
    setData(prev => {
      const dnPipes = [...prev.dnPipes]
      dnPipes[index] = { ...dnPipes[index], diam: newDiam, layer: `DN${newDiam}` }
      return { ...prev, dnPipes }
    })
  }

  const handleBulkEditAepPipes = (sourceDiam, targetDiam) => {
    setData(prev => {
      const aepPipes = prev.aepPipes.map(p =>
        p.diam == sourceDiam ? { ...p, diam: targetDiam, layer: `DN${targetDiam}` } : p
      )
      return { ...prev, aepPipes }
    })
  }

  const handleBulkEditDnPipes = (sourceDiam, targetDiam) => {
    setData(prev => {
      const dnPipes = prev.dnPipes.map(p =>
        p.diam == sourceDiam ? { ...p, diam: targetDiam, layer: `DN${targetDiam}` } : p
      )
      return { ...prev, dnPipes }
    })
  }

  return (
    <div className="app" style={{ direction: lang === 'ar' ? 'rtl' : 'ltr' }}>
      <header className="app-header">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
          <div>
            <h1>{t(lang, 'appTitle')}</h1>
            <p className="app-sub">{t(lang, 'appSub')}</p>
          </div>
          <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
            {LANG_OPTIONS.map(l => (
              <button
                key={l.code}
                onClick={() => setLang(l.code)}
                style={{
                  padding: '6px 14px', border: `1px solid ${lang === l.code ? '#fff' : 'rgba(255,255,255,0.4)'}`,
                  borderRadius: 6, cursor: 'pointer', fontWeight: lang === l.code ? 700 : 400,
                  fontSize: 13, background: lang === l.code ? 'rgba(255,255,255,0.2)' : 'transparent',
                  color: '#fff', transition: 'all 0.15s',
                }}
              >{l.label}</button>
            ))}
          </div>
        </div>
      </header>

      <main className="app-main">
        <DxfUploader onData={handleData} lang={lang} />

        {data && (
          <div className="app-results">
            <MapView data={data} format={format} dxfContent={dxfContent} fileName={fileName} />
            <DataTable data={data} geoJSON={geoJSON} format={format} onEditAepPipe={handleEditAepPipe} onEditDnPipe={handleEditDnPipe} onBulkEditAepPipes={handleBulkEditAepPipes} onBulkEditDnPipes={handleBulkEditDnPipes} />
          </div>
        )}
      </main>
    </div>
  )
}

export default App
