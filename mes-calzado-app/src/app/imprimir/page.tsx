'use client'

import { useEffect, useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import QRCode from 'react-qr-code'
import './print.css'

const API = typeof window !== 'undefined' && window.location.hostname === 'localhost'
  ? 'http://localhost:8000/api/v1'
  : 'https://grazzia-backend.onrender.com/api/v1'

function ImprimirOrdenesContent() {
  const searchParams = useSearchParams()
  const [orders, setOrders] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const ids = searchParams.get('ids')
    if (ids) {
      fetch(`${API}/ordenes?ids=${ids}`)
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
    const sizeMap: Record<string, string> = {}
    for (let i = 21; i <= 43; i++) sizeMap[i.toString()] = ''
    
    if (sizeString) {
      if (sizeString.includes(':') || sizeString.includes('=')) {
        const pairs = sizeString.replace(/,/g, ' ').split(/\s+/)
        pairs.forEach(p => {
          const parts = p.split(/[:=]/)
          if (parts.length === 2 && parts[0] in sizeMap) {
            sizeMap[parts[0]] = parts[1]
          }
        })
      } else {
        sizeMap['34'] = sizeString
      }
    }
    return sizeMap
  }

  const getOrderRange = (sizesString: string) => {
    // Determinar el rango real de tallas con cantidad > 0
    const tallasConCantidad: number[] = []
    if (sizesString) {
      const pairs = sizesString.replace(/,/g, ' ').split(/\s+/)
      pairs.forEach(p => {
        const parts = p.split(/[:=]/)
        if (parts.length === 2) {
          const szNum = parseInt(parts[0])
          const qty = parseInt(parts[1])
          if (!isNaN(szNum) && qty > 0) {
            tallasConCantidad.push(szNum)
          }
        }
      })
    }

    // Si no hay tallas con cantidad, usar rango adulto por defecto
    if (tallasConCantidad.length === 0) {
      return {
        type: 'adulto',
        sizes: ['34', '35', '36', '37', '38', '39', '40', '41', '42', '43'],
        widths: ['16%', '8%', '10%', '5%', '9%', ...Array(10).fill('3%'), '8%', '14%'],
        titleColSpan: 10,
        emptyCellsProcHeader: 6,
        emptyCellsProcData: 13
      }
    }

    const minTalla = Math.min(...tallasConCantidad)
    const maxTalla = Math.max(...tallasConCantidad)

    // Generar todas las tallas entre min y max (inclusive)
    const sizes: string[] = []
    for (let t = minTalla; t <= maxTalla; t++) {
      sizes.push(t.toString())
    }

    const n = sizes.length
    // Distribuir el ancho disponible (~48%) entre las tallas
    const pct = Math.max(1.8, Math.floor(480 / n) / 10)
    const tallasWidth = sizes.map(() => `${pct}%`)

    return {
      type: 'dinamico',
      sizes,
      widths: ['16%', '8%', '10%', '5%', '9%', ...tallasWidth, '8%', '14%'],
      titleColSpan: n,
      emptyCellsProcHeader: Math.max(0, n - 4),
      emptyCellsProcData: Math.max(0, n + 7)
    }
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
          const rangeInfo = getOrderRange(o.sizes)
          
          // Obtener los lotes de la base de datos
          const batch1 = o.batches && o.batches.length > 0 ? o.batches[0] : null
          const batch2 = o.batches && o.batches.length > 1 ? o.batches[1] : null
          
          // Datos para la primera colilla (Lote 1)
          const c1Qty = batch1 ? batch1.quantity : o.totalQuantity
          const c1Id = batch1 ? batch1.id : `${o.id}-B001`
          
          // Datos para la segunda colilla (Lote 2)
          // Si no existe un segundo lote, se replica la información de la primera colilla
          const c2Qty = batch2 ? batch2.quantity : c1Qty
          const c2Id = batch2 ? batch2.id : c1Id

          return (
            <div key={o.id} className="order-print-group">
              {/* Card 1: Hoja de Ruta Principal */}
              <div className="ticket-card" style={{ marginBottom: '0.2rem' }}>
                <table className="ticket-table">
                  <colgroup>
                    {rangeInfo.widths.map((w, idx) => <col key={idx} style={{ width: w }} />)}
                  </colgroup>
                  <tbody>
                    {/* Fila 1: Cabecera */}
                    <tr className="header-row">
                      <td colSpan={4} className="logo-cell" style={{ borderRight: 'none' }}>
                        <div className="logo-container" style={{ display: 'flex', alignItems: 'center', padding: '3px' }}>
                          <img src="/logo.png" alt="GRAZZIA" style={{ maxHeight: '36px', objectFit: 'contain' }} />
                        </div>
                      </td>
                      <td colSpan={rangeInfo.titleColSpan} className="title-cell" style={{ textAlign: 'center', fontFamily: 'Georgia, serif', color: '#64748b', fontSize: '20px', fontWeight: 'bold', borderLeft: 'none', borderRight: 'none' }}>
                        ORDEN DE PRODUCCION
                      </td>
                      <td colSpan={3} style={{ textAlign: 'center', padding: '5px', borderLeft: 'none', verticalAlign: 'middle' }}>
                        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                          <QRCode value={o.id} size={42} style={{ height: 'auto', maxWidth: '100%', width: '42px' }} />
                        </div>
                      </td>
                    </tr>

                    {/* Fila 2: Subcabeceras */}
                    <tr className="subheaders">
                      <td>CLIENTE</td>
                      <td>REF</td>
                      <td>COLOR</td>
                      <td>PARES</td>
                      <td>SUELA</td>
                      {rangeInfo.sizes.map(sz => (
                        <td key={sz} className="sz">{sz}</td>
                      ))}
                      <td className="ord-title" style={{ color: 'red', fontWeight: 'bold' }}>N ORDEN</td>
                      <td className="obs-title" style={{ color: 'red', fontWeight: 'bold' }}>ESCANEAR QR</td>
                    </tr>

                    {/* Fila 3: Datos de la orden */}
                    <tr className="data-row">
                      <td>{o.client ? o.client.toUpperCase() : ''}</td>
                      <td>{o.reference}</td>
                      <td>{o.color ? o.color.toUpperCase() : ''}</td>
                      <td><strong style={{ fontSize: '1.2rem' }}>{o.totalQuantity}</strong></td>
                      <td>{o.sole ? o.sole.toUpperCase() : ''}</td>
                      {rangeInfo.sizes.map(sz => (
                        <td key={sz} className="sz-data">{sizeMap[sz]}</td>
                      ))}
                      <td className="ord-data" style={{ color: 'red', fontWeight: 'bold' }}>{o.id.split('-').pop()}</td>
                      <td style={{ textAlign: 'center', padding: '4px', verticalAlign: 'middle' }}>
                        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                          <QRCode value={c1Id} size={35} style={{ height: 'auto', maxWidth: '100%', width: '35px' }} />
                        </div>
                      </td>
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
                      {Array(rangeInfo.emptyCellsProcHeader).fill(null).map((_, idx) => (
                        <td key={idx}></td>
                      ))}
                      <td colSpan={2} rowSpan={2} className="obs-data" style={{ color: 'red', fontWeight: 'bold', fontSize: '20px', verticalAlign: 'middle', textAlign: 'center', textTransform: 'uppercase' }}>
                        {o.observations ? o.observations.toUpperCase() : ''}
                      </td>
                    </tr>

                    {/* Fila 5: Espacios de Procesos */}
                    <tr className="data-row proc-data">
                      <td className="marca-data" style={{ color: 'red', fontWeight: 'bold' }}>GRAZZIA</td>
                      <td className="bold" style={{ fontWeight: 'bold' }}>SB</td>
                      {Array(rangeInfo.emptyCellsProcData).fill(null).map((_, idx) => (
                        <td key={idx}></td>
                      ))}
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Tarjeta 2: Colilla 1 */}
              <div className="ticket-card" style={{ marginBottom: '0.2rem' }}>
                <table className="ticket-table">
                  <colgroup>
                    {rangeInfo.widths.map((w, idx) => <col key={idx} style={{ width: w }} />)}
                  </colgroup>
                  <tbody>
                    <tr className="subheaders">
                      <td>CLIENTE</td>
                      <td>REF</td>
                      <td>COLOR</td>
                      <td>PARES</td>
                      <td>SUELA</td>
                      {rangeInfo.sizes.map(sz => (
                        <td key={sz} className="sz">{sz}</td>
                      ))}
                      <td className="ord-title" style={{ color: 'red', fontWeight: 'bold' }}>N ORDEN</td>
                      <td className="obs-title" style={{ color: 'red', fontWeight: 'bold' }}>ESCANEAR QR</td>
                    </tr>
                    <tr className="data-row">
                      <td>{o.client ? o.client.toUpperCase() : ''}</td>
                      <td>{o.reference}</td>
                      <td>{o.color ? o.color.toUpperCase() : ''}</td>
                      <td><strong style={{ fontSize: '1.2rem' }}>{c1Qty}</strong></td>
                      <td>{o.sole ? o.sole.toUpperCase() : ''}</td>
                      {rangeInfo.sizes.map(sz => (
                        <td key={sz} className="sz-data">{sizeMap[sz]}</td>
                      ))}
                      <td className="ord-data" style={{ color: 'red', fontWeight: 'bold' }}>{o.id.split('-').pop()}</td>
                      <td style={{ textAlign: 'center', padding: '4px', verticalAlign: 'middle' }}>
                        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                          <QRCode value={c1Id} size={35} style={{ height: 'auto', maxWidth: '100%', width: '35px' }} />
                        </div>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Tarjeta 3: Colilla 2 */}
              <div className="ticket-card" style={{ marginBottom: '0.2rem' }}>
                <table className="ticket-table">
                  <colgroup>
                    {rangeInfo.widths.map((w, idx) => <col key={idx} style={{ width: w }} />)}
                  </colgroup>
                  <tbody>
                    <tr className="subheaders">
                      <td>CLIENTE</td>
                      <td>REF</td>
                      <td>COLOR</td>
                      <td>PARES</td>
                      <td>SUELA</td>
                      {rangeInfo.sizes.map(sz => (
                        <td key={sz} className="sz">{sz}</td>
                      ))}
                      <td className="ord-title" style={{ color: 'red', fontWeight: 'bold' }}>N ORDEN</td>
                      <td className="obs-title" style={{ color: 'red', fontWeight: 'bold' }}>ESCANEAR QR</td>
                    </tr>
                    <tr className="data-row">
                      <td>{o.client ? o.client.toUpperCase() : ''}</td>
                      <td>{o.reference}</td>
                      <td>{o.color ? o.color.toUpperCase() : ''}</td>
                      <td><strong style={{ fontSize: '1.2rem' }}>{c2Qty}</strong></td>
                      <td>{o.sole ? o.sole.toUpperCase() : ''}</td>
                      {rangeInfo.sizes.map(sz => (
                        <td key={sz} className="sz-data">{sizeMap[sz]}</td>
                      ))}
                      <td className="ord-data" style={{ color: 'red', fontWeight: 'bold' }}>{o.id.split('-').pop()}</td>
                      <td style={{ textAlign: 'center', padding: '4px', verticalAlign: 'middle' }}>
                        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                          <QRCode value={c2Id} size={35} style={{ height: 'auto', maxWidth: '100%', width: '35px' }} />
                        </div>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
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
