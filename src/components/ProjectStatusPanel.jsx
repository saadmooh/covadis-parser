import { useState } from 'react'
import { getProjectStats } from '../utils/projectManager.js'

const STYLE = {
  panel: {
    background: '#f8f9fa', border: '1px solid #e0e0e0', borderRadius: 8,
    padding: '12px 16px', marginBottom: 16,
  },
  header: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8,
  },
  title: { margin: 0, fontSize: 14, fontWeight: 600, color: '#333' },
  row: (hasItems) => ({
    display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0',
    fontSize: 12, color: hasItems ? '#155724' : '#856404',
  }),
  icon: {
    fontSize: 14, width: 20, textAlign: 'center',
  },
  sources: {
    fontSize: 10, color: '#6c757d', marginLeft: 28,
  },
  removeBtn: {
    fontSize: 10, color: '#dc3545', background: 'none', border: 'none',
    cursor: 'pointer', padding: '0 4px', marginLeft: 'auto',
  },
  summary: {
    marginTop: 8, padding: '6px 10px', background: '#e8f4fd', borderRadius: 4,
    fontSize: 11, color: '#0c5460',
  },
}

export default function ProjectStatusPanel({ project, onRemoveFile }) {
  const [expanded, setExpanded] = useState(true)
  const { stats, totalElements, sourceCount } = getProjectStats(project)

  if (totalElements === 0 && sourceCount === 0) return null

  const elementOrder = ['junctions', 'reservoirs', 'tanks', 'pipes', 'pumps', 'valves', 'patterns', 'curves', 'coordinates', 'status', 'tags', 'labels', 'controls']
  const requiredTypes = ['junctions', 'pipes']
  const importantTypes = ['reservoirs', 'tanks', 'pumps', 'valves']

  return (
    <div style={STYLE.panel}>
      <div style={STYLE.header}>
        <h4 style={STYLE.title}>
          📦 حالة المشروع — {totalElements} عنصر من {sourceCount} ملف
        </h4>
        <button
          onClick={() => setExpanded(!expanded)}
          style={{ fontSize: 11, color: '#2c7bb6', background: 'none', border: 'none', cursor: 'pointer' }}
        >
          {expanded ? 'تصغير' : 'توسيع'}
        </button>
      </div>

      {expanded && (
        <>
          <div>
            {elementOrder.map(key => {
              const s = stats[key]
              if (!s) return null
              const hasItems = s.count > 0
              const isRequired = requiredTypes.includes(key)
              const isImportant = importantTypes.includes(key)

              return (
                <div key={key} style={STYLE.row(hasItems)}>
                  <span style={STYLE.icon}>
                    {hasItems ? '✅' : isRequired ? '⚠️' : isImportant ? '⚠️' : '🔵'}
                  </span>
                  <span style={{ fontWeight: hasItems ? 600 : 400 }}>
                    {s.label}: {s.count > 0 ? `${s.count} عنصر` : 'لا يوجد بعد'}
                  </span>
                  {s.sources.length > 0 && (
                    <span style={STYLE.sources}>
                      من: {s.sources.join(', ')}
                    </span>
                  )}
                  {hasItems && onRemoveFile && s.sources.length > 0 && (
                    <button
                      onClick={() => {
                        if (window.confirm(`إزالة جميع ${s.label} المُضافة من: ${s.sources.join(', ')}؟`)) {
                          s.sources.forEach(src => onRemoveFile(src))
                        }
                      }}
                      style={STYLE.removeBtn}
                    >
                      ✕
                    </button>
                  )}
                </div>
              )
            })}
          </div>

          {sourceCount > 0 && (
            <div style={STYLE.summary}>
              <strong>الملفات المُضافة:</strong>
              {Object.entries(project.sources).map(([file]) => (
                <div key={file} style={{ marginTop: 2 }}>
                  📄 {file}
                  <button
                    onClick={() => {
                      if (window.confirm(`إزالة "${file}" بالكامل من المشروع؟`)) {
                        onRemoveFile?.(file)
                      }
                    }}
                    style={{ ...STYLE.removeBtn, marginLeft: 8 }}
                  >
                    إزالة
                  </button>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
