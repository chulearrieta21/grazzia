'use client'

import { useEffect, useState } from 'react'
import Barcode from 'react-barcode'
import '../print.css' // Reuse the print CSS from the orders

const API = typeof window !== 'undefined' && window.location.hostname === 'localhost'
  ? 'http://localhost:8000/api/v1'
  : 'https://grazzia-backend.onrender.com/api/v1'

export default function ImprimirCarnets() {
  const [operarios, setOperarios] = useState<any[]>([])

  useEffect(() => {
    // Enable print mode styles
    document.body.classList.add('print-mode')
    
    // Fetch all operarios
    fetch(`${API}/operarios`)
      .then(r => r.json())
      .then(data => setOperarios(data))

    return () => document.body.classList.remove('print-mode')
  }, [])

  return (
    <div className="print-container" style={{ padding: '20px' }}>
      <div className="no-print" style={{ marginBottom: '20px', textAlign: 'center' }}>
        <button onClick={() => window.print()} style={{
          padding: '10px 20px', background: '#3b82f6', color: 'white', 
          border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '1.2rem', fontWeight: 'bold'
        }}>
          🖨️ Imprimir Carnets
        </button>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '20px', justifyContent: 'center' }}>
        {operarios.filter(o => o.codigo_qr).map(o => (
          <div key={o.id} style={{ 
            width: '320px', height: '200px', border: '2px solid #000', 
            borderRadius: '12px', padding: '15px', display: 'flex', 
            flexDirection: 'column', alignItems: 'center', justifyContent: 'space-between',
            background: 'white', color: 'black', pageBreakInside: 'avoid'
          }}>
            <div style={{ textAlign: 'center', borderBottom: '2px solid #eee', width: '100%', paddingBottom: '10px' }}>
              <h2 style={{ margin: 0, fontSize: '1.4rem', textTransform: 'uppercase' }}>{o.nombre}</h2>
              <p style={{ margin: '5px 0 0', fontSize: '1.1rem', color: '#555', fontWeight: 'bold' }}>{o.rol}</p>
            </div>
            
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', transform: 'scale(0.9)' }}>
              <Barcode value={o.codigo_qr} text={`${o.nombre} - ${o.codigo_qr}`} height={60} width={2} fontSize={16} background="transparent" margin={0} />
            </div>
            
            <div style={{ display: 'flex', justifyContent: 'center', width: '100%' }}>
              <img src="/logo.png" alt="GRAZZIA" style={{ maxHeight: '25px', objectFit: 'contain' }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
