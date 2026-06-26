import { useState, useMemo } from 'react'
import DxfUploader from './components/DxfUploader'
import MapView from './components/MapView'
import DataTable from './components/DataTable'
import { toGeoJSON } from './utils/geoExport'
import './App.css'

function App() {
  const [data, setData] = useState(null)
  const [fileName, setFileName] = useState('')
  const [format, setFormat] = useState('')
  const [dxfContent, setDxfContent] = useState('')

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
    <div className="app">
      <header className="app-header">
        <h1>Covadis - Extraction Réseau Assainissement</h1>
        <p className="app-sub">Analyse de fichiers DXF &bull; Visualisation cartographique &bull; Export Shapefile</p>
      </header>

      <main className="app-main">
        <DxfUploader onData={handleData} />

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
