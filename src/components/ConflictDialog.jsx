import { useState } from 'react'

const STYLE = {
  overlay: {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10001,
  },
  dialog: {
    background: '#fff', borderRadius: 10, padding: 24, width: '90vw', maxWidth: 800,
    maxHeight: '80vh', overflow: 'auto', boxShadow: '0 8px 40px rgba(0,0,0,0.35)',
  },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 12, marginTop: 12 },
  th: { textAlign: 'left', padding: '8px', borderBottom: '2px solid #dee2e6', background: '#f8f9fa' },
  td: { padding: '8px', borderBottom: '1px solid #eee' },
  diffCell: (changed) => ({
    padding: '8px', borderBottom: '1px solid #eee',
    background: changed ? '#fff3cd' : 'transparent',
  }),
  btn: (variant) => ({
    padding: '8px 16px', border: 'none', borderRadius: 6, cursor: 'pointer',
    fontWeight: 600, fontSize: 13, marginRight: 8,
    background: variant === 'keep' ? '#6c757d' : variant === 'replace' ? '#dc3545' : '#28a745',
    color: '#fff',
  }),
}

export default function ConflictDialog({ conflicts, onResolve, onResolveAll, onCancel }) {
  const [currentIdx, setCurrentIdx] = useState(0)

  if (!conflicts || conflicts.length === 0) return null

  const conflict = conflicts[currentIdx]

  const handleResolve = (resolution) => {
    onResolve(conflict, resolution)
    if (currentIdx < conflicts.length - 1) {
      setCurrentIdx(currentIdx + 1)
    } else {
      onResolveAll()
    }
  }

  const allFields = [...new Set([...Object.keys(conflict.existing), ...Object.keys(conflict.incoming)])].filter(k => k !== 'id' && k !== '_source')

  return (
    <div style={STYLE.overlay}>
      <div style={STYLE.dialog}>
        <h3 style={{ margin: '0 0 8px', fontSize: 16 }}>
          تعارض معرّفات — {currentIdx + 1} من {conflicts.length}
        </h3>
        <p style={{ fontSize: 13, color: '#666', marginBottom: 16 }}>
          المعرّف <strong>{conflict.id}</strong> موجود مسبقاً في {conflict.type} لكن قيمه مختلفة في الملف الجديد.
          <br />
          المصدر الحالي: <em>{conflict.existing._source}</em> | المصدر الجديد: <em>{conflict.sourceFile}</em>
        </p>

        <table style={STYLE.table}>
          <thead>
            <tr>
              <th style={STYLE.th}>الحقل</th>
              <th style={STYLE.th}>القيمة الحالية ({conflict.existing._source})</th>
              <th style={STYLE.th}>القيمة الجديدة ({conflict.sourceFile})</th>
            </tr>
          </thead>
          <tbody>
            {allFields.map(field => {
              const oldVal = conflict.existing[field]
              const newVal = conflict.incoming[field]
              const changed = String(oldVal) !== String(newVal)
              return (
                <tr key={field}>
                  <td style={STYLE.td}><strong>{field}</strong></td>
                  <td style={STYLE.diffCell(changed)}>{String(oldVal ?? '')}</td>
                  <td style={STYLE.diffCell(changed)}>{String(newVal ?? '')}</td>
                </tr>
              )
            })}
          </tbody>
        </table>

        <div style={{ marginTop: 20, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={() => handleResolve('keep_existing')} style={STYLE.btn('keep')}>
            الإبقاء على القديمة
          </button>
          <button onClick={() => handleResolve('replace')} style={STYLE.btn('replace')}>
            استبدال بالجديدة
          </button>
          <button onClick={() => handleResolve('rename')} style={STYLE.btn('rename')}>
            إعادة تسمية الجديد
          </button>
          <button onClick={onCancel} style={{ ...STYLE.btn('keep'), background: '#adb5bd' }}>
            إلغاء الكل
          </button>
        </div>
      </div>
    </div>
  )
}
