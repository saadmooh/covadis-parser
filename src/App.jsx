import { useState, useMemo } from 'react'
import DxfUploader from './components/DxfUploader'
import MapView from './components/MapView'
import DataTable from './components/DataTable'
import { toGeoJSON } from './utils/geoExport'
import './App.css'

function App() {
  const [data, setData] = useState(null)
  const [fileName, setFileName] = useState('')

  const geoJSON = useMemo(() => data ? toGeoJSON(data) : null, [data])

  const handleData = (parsedData, name) => {
    setData(parsedData)
    setFileName(name)
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
            <MapView data={data} />
            <DataTable data={data} geoJSON={geoJSON} />
          </div>
        )}
      </main>
    </div>
  )
}

export default App
