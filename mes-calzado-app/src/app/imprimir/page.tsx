'use client'

import { useEffect, useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Barcode from 'react-barcode'
import './print.css'

function ImprimirOrdenesContent() {
  const searchParams = useSearchParams()
  const [orders, setOrders] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const ids = searchParams.get('ids')
    if (ids) {
      fetch('https://grazzia-backend.onrender.com/api/v1/ordenes')
        .then(res => res.json())
        .then(data => {
          const selectedIds = ids.split(',')
          const filtered = data.filter((o: any) => selectedIds.includes(o.id))
          setOrders(filtered)
          setLoading(false)
          // Esperar un momento a que renderice y luego abrir ventana de impresión
          setTimeout(() => {
            window.print()
          }, 1000)
        })
        .catch(() => setLoading(false))
    } else {
      setLoading(false)
    }
  }, [searchParams])

  if (loading) return <div style={{ padding: '2rem' }}>Cargando órdenes para impresión...</div>
  if (orders.length === 0) return <div style={{ padding: '2rem' }}>No se encontraron órdenes para imprimir.</div>

  const parseSizes = (sizeString: string) => {
    // Si viene en formato "35:1, 36:2", intentamos parsearlo
    const sizeMap: Record<string, string> = {}
    for (let i = 34; i <= 43; i++) sizeMap[i.toString()] = ''
    
    if (sizeString) {
      // Intento simple: asume que es formato de pares
      // Pero si solo dice "37-40", simplemente lo dejamos, no podemos deducir cantidades exactas
      // Vamos a poner el valor crudo en la columna 34 si no tiene el formato esperado
      if (sizeString.includes(':') || sizeString.includes('=')) {
        const pairs = sizeString.replace(/,/g, ' ').split(/\s+/)
        pairs.forEach(p => {
          const parts = p.split(/[:=]/)
          if (parts.length === 2 && parts[0] in sizeMap) {
            sizeMap[parts[0]] = parts[1]
          }
        })
      } else {
        // Fallback: lo ponemos a un lado
        sizeMap['34'] = sizeString
      }
    }
    return sizeMap
  }

  return (
    <div className="print-container">
      {/* Botón flotante para impresión manual (se oculta al imprimir) */}
      <div className="no-print" style={{ padding: '1rem', textAlign: 'center', background: '#f0f0f0', marginBottom: '1rem' }}>
        <p style={{ color: '#333', marginBottom: '1rem' }}>
          Para guardar como PDF: En el cuadro de diálogo de impresión, cambia el Destino a <strong>"Guardar como PDF"</strong>. Asegúrate de habilitar "Gráficos de fondo".
        </p>
        <button 
          onClick={() => window.print()}
          style={{ padding: '10px 20px', background: '#2563eb', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer', fontSize: '1.1rem' }}
        >
          🖨️ Imprimir / Guardar PDF
        </button>
      </div>

      <div className="tickets-wrapper">
        {orders.map(o => {
          const sizeMap = parseSizes(o.sizes)
          return (
            <div key={o.id} className="order-print-group">
              {/* Card 1: Hoja de Ruta Principal (Con Logo y Procesos) */}
              <div className="ticket-container-wrapper" style={{ pageBreakInside: 'avoid' }}>
                <div className="ticket-card" style={{ marginBottom: '1rem' }}>
                  <table className="ticket-table">
                    <colgroup>
                      <col style={{ width: '16%' }} />
                      <col style={{ width: '8%' }} />
                      <col style={{ width: '10%' }} />
                      <col style={{ width: '5%' }} />
                      <col style={{ width: '9%' }} />
                      <col style={{ width: '3%' }} />
                      <col style={{ width: '3%' }} />
                      <col style={{ width: '3%' }} />
                      <col style={{ width: '3%' }} />
                      <col style={{ width: '3%' }} />
                      <col style={{ width: '3%' }} />
                      <col style={{ width: '3%' }} />
                      <col style={{ width: '3%' }} />
                      <col style={{ width: '3%' }} />
                      <col style={{ width: '3%' }} />
                      <col style={{ width: '8%' }} />
                      <col style={{ width: '14%' }} />
                    </colgroup>
                    <tbody>
                      {/* Fila 1: Cabecera */}
                      <tr className="header-row">
                        <td colSpan={5} className="logo-cell" style={{ borderRight: 'none' }}>
                          <div className="logo-container" style={{ display: 'flex', alignItems: 'center', padding: '10px' }}>
                            <img src="/logo.png" alt="GRAZZIA" style={{ maxHeight: '60px', objectFit: 'contain' }} />
                          </div>
                        </td>
                        <td colSpan={12} className="title-cell" style={{ textAlign: 'center', fontFamily: 'Georgia, serif', color: '#64748b', fontSize: '24px', fontWeight: 'bold', borderLeft: 'none' }}>
                          ORDEN DE PRODUCCION
                        </td>
                      </tr>

                      {/* Fila 2: Subcabeceras */}
                      <tr className="subheaders">
                        <td>CLIENTE</td>
                        <td>REF</td>
                        <td>COLOR</td>
                        <td>PARES</td>
                        <td>SUELA</td>
                        <td className="sz">34</td>
                        <td className="sz">35</td>
                        <td className="sz">36</td>
                        <td className="sz">37</td>
                        <td className="sz">38</td>
                        <td className="sz">39</td>
                        <td className="sz">40</td>
                        <td className="sz">41</td>
                        <td className="sz">42</td>
                        <td className="sz">43</td>
                        <td className="ord-title" style={{ color: 'red', fontWeight: 'bold' }}>N ORDEN</td>
                        <td className="obs-title" style={{ color: 'red', fontWeight: 'bold' }}>OBSERVACIONES</td>
                      </tr>

                      {/* Fila 3: Datos de la orden */}
                      <tr className="data-row">
                        <td>{o.client ? o.client.toUpperCase() : ''}</td>
                        <td>{o.reference}</td>
                        <td>{o.color ? o.color.toUpperCase() : ''}</td>
                        <td><strong style={{ fontSize: '1.2rem' }}>{o.totalQuantity}</strong></td>
                        <td>{o.sole ? o.sole.toUpperCase() : ''}</td>
                        <td className="sz-data">{sizeMap['34']}</td>
                        <td className="sz-data">{sizeMap['35']}</td>
                        <td className="sz-data">{sizeMap['36']}</td>
                        <td className="sz-data">{sizeMap['37']}</td>
                        <td className="sz-data">{sizeMap['38']}</td>
                        <td className="sz-data">{sizeMap['39']}</td>
                        <td className="sz-data">{sizeMap['40']}</td>
                        <td className="sz-data">{sizeMap['41']}</td>
                        <td className="sz-data">{sizeMap['42']}</td>
                        <td className="sz-data">{sizeMap['43']}</td>
                        <td className="ord-data" style={{ color: 'red', fontWeight: 'bold' }}>{o.id.split('-').pop()}</td>
                        <td className="sz-data"></td>
                      </tr>

                      {/* Fila 4: Procesos */}
                      <tr className="subheaders proc-header">
                        <td>MARCA</td>
                        <td>PRO</td>
                        <td>PIC</td>
                        <td>GUA</td>
                        <td>REC</td>
                        <td>MON</td>
                        <td>PEG</td>
                        <td>DET</td>
                        <td>DES</td>
                        <td></td>
                        <td></td>
                        <td></td>
                        <td></td>
                        <td></td>
                        <td></td>
                        <td colSpan={2} rowSpan={2} className="obs-data" style={{ color: 'red', fontWeight: 'bold', fontSize: '20px', verticalAlign: 'middle', textAlign: 'center', textTransform: 'uppercase' }}>
                          {o.observations ? o.observations.toUpperCase() : ''}
                        </td>
                      </tr>

                      {/* Fila 5: Espacios de Procesos */}
                      <tr className="data-row proc-data">
                        <td className="marca-data" style={{ color: 'red', fontWeight: 'bold' }}>GRAZZIA</td>
                        <td className="bold" style={{ fontWeight: 'bold' }}>SB</td>
                        <td></td>
                        <td></td>
                        <td></td>
                        <td></td>
                        <td></td>
                        <td></td>
                        <td></td>
                        <td></td>
                        <td></td>
                        <td></td>
                        <td></td>
                        <td></td>
                        <td></td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <div className="ticket-separator" style={{ borderTop: '1.5px dashed #000', marginBottom: '1.5rem', pageBreakAfter: 'avoid' }} />
              </div>

              {/* Tarjeta 2: Colilla 1 (Sin Logo y Sin Procesos) */}
              {(() => {
                const batch1 = o.batches && o.batches.length > 0 ? o.batches[0] : null;
                return (
                  <div className="ticket-container-wrapper" style={{ pageBreakInside: 'avoid' }}>
                    <div className="ticket-card" style={{ marginBottom: '1rem' }}>
                      <table className="ticket-table">
                        <colgroup>
                          <col style={{ width: '16%' }} />
                          <col style={{ width: '8%' }} />
                          <col style={{ width: '10%' }} />
                          <col style={{ width: '5%' }} />
                          <col style={{ width: '9%' }} />
                          <col style={{ width: '3%' }} />
                          <col style={{ width: '3%' }} />
                          <col style={{ width: '3%' }} />
                          <col style={{ width: '3%' }} />
                          <col style={{ width: '3%' }} />
                          <col style={{ width: '3%' }} />
                          <col style={{ width: '3%' }} />
                          <col style={{ width: '3%' }} />
                          <col style={{ width: '3%' }} />
                          <col style={{ width: '3%' }} />
                          <col style={{ width: '8%' }} />
                          <col style={{ width: '14%' }} />
                        </colgroup>
                        <tbody>
                          {/* Fila 1: Subcabeceras */}
                          <tr className="subheaders">
                            <td>CLIENTE</td>
                            <td>REF</td>
                            <td>COLOR</td>
                            <td>PARES</td>
                            <td>SUELA</td>
                            <td className="sz">34</td>
                            <td className="sz">35</td>
                            <td className="sz">36</td>
                            <td className="sz">37</td>
                            <td className="sz">38</td>
                            <td className="sz">39</td>
                            <td className="sz">40</td>
                            <td className="sz">41</td>
                            <td className="sz">42</td>
                            <td className="sz">43</td>
                            <td className="ord-title" style={{ color: 'red', fontWeight: 'bold' }}>N ORDEN</td>
                            <td className="obs-title" style={{ color: 'red', fontWeight: 'bold' }}>OBSERVACIONES</td>
                          </tr>

                          {/* Fila 2: Datos de la colilla */}
                          <tr className="data-row">
                            <td>{o.client ? o.client.toUpperCase() : ''}</td>
                            <td>{o.reference}</td>
                            <td>{o.color ? o.color.toUpperCase() : ''}</td>
                            <td><strong style={{ fontSize: '1.2rem' }}>{batch1 ? batch1.quantity : ''}</strong></td>
                            <td>{o.sole ? o.sole.toUpperCase() : ''}</td>
                            <td className="sz-data">{batch1 ? sizeMap['34'] : ''}</td>
                            <td className="sz-data">{batch1 ? sizeMap['35'] : ''}</td>
                            <td className="sz-data">{batch1 ? sizeMap['36'] : ''}</td>
                            <td className="sz-data">{batch1 ? sizeMap['37'] : ''}</td>
                            <td className="sz-data">{batch1 ? sizeMap['38'] : ''}</td>
                            <td className="sz-data">{batch1 ? sizeMap['39'] : ''}</td>
                            <td className="sz-data">{batch1 ? sizeMap['40'] : ''}</td>
                            <td className="sz-data">{batch1 ? sizeMap['41'] : ''}</td>
                            <td className="sz-data">{batch1 ? sizeMap['42'] : ''}</td>
                            <td className="sz-data">{batch1 ? sizeMap['43'] : ''}</td>
                            <td className="ord-data" style={{ color: 'red', fontWeight: 'bold' }}>{batch1 ? batch1.id.split('-').pop() : (o.id.split('-').pop() + '-B001')}</td>
                            <td className="sz-data"></td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                    <div className="ticket-separator" style={{ borderTop: '1.5px dashed #000', marginBottom: '1.5rem', pageBreakAfter: 'avoid' }} />
                  </div>
                );
              })()}

              {/* Tarjeta 3: Colilla 2 (Sin Logo y Sin Procesos) */}
              {(() => {
                const batch2 = o.batches && o.batches.length > 1 ? o.batches[1] : null;
                return (
                  <div className="ticket-container-wrapper" style={{ pageBreakInside: 'avoid' }}>
                    <div className="ticket-card" style={{ marginBottom: '1rem' }}>
                      <table className="ticket-table">
                        <colgroup>
                          <col style={{ width: '16%' }} />
                          <col style={{ width: '8%' }} />
                          <col style={{ width: '10%' }} />
                          <col style={{ width: '5%' }} />
                          <col style={{ width: '9%' }} />
                          <col style={{ width: '3%' }} />
                          <col style={{ width: '3%' }} />
                          <col style={{ width: '3%' }} />
                          <col style={{ width: '3%' }} />
                          <col style={{ width: '3%' }} />
                          <col style={{ width: '3%' }} />
                          <col style={{ width: '3%' }} />
                          <col style={{ width: '3%' }} />
                          <col style={{ width: '3%' }} />
                          <col style={{ width: '3%' }} />
                          <col style={{ width: '8%' }} />
                          <col style={{ width: '14%' }} />
                        </colgroup>
                        <tbody>
                          {/* Fila 1: Subcabeceras */}
                          <tr className="subheaders">
                            <td>CLIENTE</td>
                            <td>REF</td>
                            <td>COLOR</td>
                            <td>PARES</td>
                            <td>SUELA</td>
                            <td className="sz">34</td>
                            <td className="sz">35</td>
                            <td className="sz">36</td>
                            <td className="sz">37</td>
                            <td className="sz">38</td>
                            <td className="sz">39</td>
                            <td className="sz">40</td>
                            <td className="sz">41</td>
                            <td className="sz">42</td>
                            <td className="sz">43</td>
                            <td className="ord-title" style={{ color: 'red', fontWeight: 'bold' }}>N ORDEN</td>
                            <td className="obs-title" style={{ color: 'red', fontWeight: 'bold' }}>OBSERVACIONES</td>
                          </tr>

                          {/* Fila 2: Datos de la colilla */}
                          <tr className="data-row">
                            <td>{o.client ? o.client.toUpperCase() : ''}</td>
                            <td>{o.reference}</td>
                            <td>{o.color ? o.color.toUpperCase() : ''}</td>
                            <td><strong style={{ fontSize: '1.2rem' }}>{batch2 ? batch2.quantity : ''}</strong></td>
                            <td>{o.sole ? o.sole.toUpperCase() : ''}</td>
                            <td className="sz-data">{batch2 ? sizeMap['34'] : ''}</td>
                            <td className="sz-data">{batch2 ? sizeMap['35'] : ''}</td>
                            <td className="sz-data">{batch2 ? sizeMap['36'] : ''}</td>
                            <td className="sz-data">{batch2 ? sizeMap['37'] : ''}</td>
                            <td className="sz-data">{batch2 ? sizeMap['38'] : ''}</td>
                            <td className="sz-data">{batch2 ? sizeMap['39'] : ''}</td>
                            <td className="sz-data">{batch2 ? sizeMap['40'] : ''}</td>
                            <td className="sz-data">{batch2 ? sizeMap['41'] : ''}</td>
                            <td className="sz-data">{batch2 ? sizeMap['42'] : ''}</td>
                            <td className="sz-data">{batch2 ? sizeMap['43'] : ''}</td>
                            <td className="ord-data" style={{ color: 'red', fontWeight: 'bold' }}>{batch2 ? batch2.id.split('-').pop() : (o.id.split('-').pop() + '-B002')}</td>
                            <td className="sz-data"></td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                    <div className="ticket-separator" style={{ borderTop: '1.5px dashed #000', marginBottom: '1.5rem', pageBreakAfter: 'avoid' }} />
                  </div>
                );
              })()}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default function ImprimirOrdenes() {
  return (
    <Suspense fallback={<div style={{ padding: '2rem' }}>Cargando órdenes para impresión...</div>}>
      <ImprimirOrdenesContent />
    </Suspense>
  )
}
