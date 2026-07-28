'use client'

import { useEffect, useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import '../print.css'

const API = typeof window !== 'undefined' && window.location.hostname === 'localhost'
  ? 'http://localhost:8000/api/v1'
  : 'https://grazzia-backend.onrender.com/api/v1'

function ImprimirNominaContent() {
  const searchParams = useSearchParams()
  const mes = searchParams.get('mes')
  const quincena = searchParams.get('quincena') || 'MES'
  const [payrollData, setPayrollData] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Activa la clase print-mode
    document.body.classList.add('print-mode')

    if (mes) {
      fetch(`${API}/nomina?mes=${mes}&quincena=${quincena}`)
        .then(res => res.json())
        .then(data => {
          if (Array.isArray(data)) {
            setPayrollData(data)
          }
          setLoading(false)
          // Dispara el diálogo de impresión automáticamente
          setTimeout(() => {
            window.print()
          }, 1000)
        })
        .catch(() => setLoading(false))
    } else {
      setLoading(false)
    }

    return () => document.body.classList.remove('print-mode')
  }, [mes])

  const formatMonth = (mesStr: string | null) => {
    if (!mesStr) return ''
    try {
      const parts = mesStr.split('-')
      if (parts.length !== 2) return mesStr
      const year = parts[0]
      const month = parseInt(parts[1], 10)
      const meses = [
        'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
        'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
      ]
      return `${meses[month - 1] || ''} ${year}`
    } catch {
      return mesStr
    }
  }

  // Calcular sumatorias totales
  const totals = payrollData.reduce((acc, curr) => {
    return {
      pairs: acc.pairs + (curr.totalPairs || 0),
      earned: acc.earned + (curr.totalEarned || 0),
      advances: acc.advances + (curr.totalAdvances || 0),
      net: acc.net + (curr.netEarned || 0)
    }
  }, { pairs: 0, earned: 0, advances: 0, net: 0 })

  if (loading) {
    return (
      <div style={{ padding: '3rem', textAlign: 'center', fontFamily: 'Arial, sans-serif' }}>
        <h2>Cargando reporte de nómina...</h2>
        <p>Por favor espera un momento.</p>
      </div>
    )
  }

  if (payrollData.length === 0) {
    return (
      <div style={{ padding: '3rem', textAlign: 'center', fontFamily: 'Arial, sans-serif' }}>
        <h2>No hay datos de nómina para el mes: {formatMonth(mes)}</h2>
        <p>Asegúrate de tener registros de producción o adelantos en este mes.</p>
      </div>
    )
  }

  return (
    <div className="print-container">
      {/* Botón flotante para impresión manual (se oculta al imprimir con .no-print) */}
      <div className="no-print" style={{
        padding: '1rem',
        textAlign: 'center',
        background: '#f8fafc',
        borderBottom: '1px solid #e2e8f0',
        marginBottom: '2rem',
        borderRadius: '8px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
        fontFamily: 'Arial, sans-serif'
      }}>
        <p style={{ color: '#475569', marginBottom: '0.75rem', fontSize: '0.95rem' }}>
          Para guardar como PDF: En el cuadro de diálogo de impresión del navegador, cambia el destino a <strong>"Guardar como PDF"</strong>.
        </p>
        <button
          onClick={() => window.print()}
          style={{
            padding: '10px 20px',
            background: '#10b981',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '1rem',
            fontWeight: 'bold',
            boxShadow: '0 2px 4px rgba(16, 185, 129, 0.2)'
          }}
        >
          🖨️ Imprimir / Guardar PDF
        </button>
      </div>

      <div style={{ maxWidth: '1000px', margin: '0 auto', background: 'white', padding: '10px', fontFamily: 'Arial, sans-serif' }}>
        {/* Cabecera del Reporte */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          borderBottom: '3px double #0f172a',
          paddingBottom: '1.5rem',
          marginBottom: '2rem'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <img src="/logo.png" alt="GRAZZIA" style={{ maxHeight: '65px', objectFit: 'contain' }} />
            <div>
              <h1 style={{ margin: 0, fontSize: '1.8rem', fontWeight: 'bold', color: '#0f172a', fontFamily: 'Georgia, serif' }}>CALZADO GRAZZIA</h1>
              <p style={{ margin: 0, fontSize: '0.9rem', color: '#64748b', fontWeight: 500 }}>Reporte de Nómina Automatizada</p>
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <h2 style={{ margin: 0, fontSize: '1.4rem', color: '#0f172a', fontWeight: 'bold' }}>NÓMINA {quincena === 'Q1' ? '1RA QUINCENA' : quincena === 'Q2' ? '2DA QUINCENA' : 'MENSUAL'}</h2>
            <p style={{ margin: '0.25rem 0 0 0', fontSize: '1.1rem', color: '#10b981', fontWeight: 'bold', textTransform: 'uppercase' }}>
              Mes: {formatMonth(mes)}
            </p>
            <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.8rem', color: '#64748b' }}>
              Generado: {new Date().toLocaleDateString()} {new Date().toLocaleTimeString()}
            </p>
          </div>
        </div>

        {/* Tabla de Datos */}
        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '3.5rem', fontSize: '0.95rem' }}>
          <thead>
            <tr style={{ borderBottom: '2px solid #0f172a', background: '#f8fafc' }}>
              <th style={{ textAlign: 'left', padding: '12px 8px', fontWeight: 'bold', color: '#0f172a' }}>Operario</th>
              <th style={{ textAlign: 'left', padding: '12px 8px', fontWeight: 'bold', color: '#0f172a' }}>Detalle de Actividad</th>
              <th style={{ textAlign: 'center', padding: '12px 8px', fontWeight: 'bold', color: '#0f172a' }}>Pares</th>
              <th style={{ textAlign: 'right', padding: '12px 8px', fontWeight: 'bold', color: '#0f172a' }}>Total Ganado</th>
              <th style={{ textAlign: 'right', padding: '12px 8px', fontWeight: 'bold', color: '#0f172a' }}>Adelantos</th>
              <th style={{ textAlign: 'right', padding: '12px 8px', fontWeight: 'bold', color: '#0f172a' }}>Neto a Pagar</th>
            </tr>
          </thead>
          <tbody>
            {payrollData.map((p, idx) => {
              const processesStr = Object.entries(p.processesCount || {})
                .map(([proc, qty]) => `${proc}: ${qty}`)
                .join(', ')
              return (
                <tr key={p.userId || idx} style={{ borderBottom: '1px solid #e2e8f0' }}>
                  <td style={{ padding: '12px 8px', fontWeight: 600, color: '#0f172a' }}>{p.name}</td>
                  <td style={{ padding: '12px 8px', color: '#475569', fontSize: '0.85rem' }}>{processesStr || '—'}</td>
                  <td style={{ padding: '12px 8px', textAlign: 'center' }}>{p.totalPairs || 0}</td>
                  <td style={{ padding: '12px 8px', textAlign: 'right', fontWeight: 500 }}>${p.totalEarned?.toLocaleString() || '0'}</td>
                  <td style={{ padding: '12px 8px', textAlign: 'right', color: '#e11d48' }}>${p.totalAdvances?.toLocaleString() || '0'}</td>
                  <td style={{ padding: '12px 8px', textAlign: 'right', fontWeight: 'bold', color: '#10b981' }}>${p.netEarned?.toLocaleString() || '0'}</td>
                </tr>
              )
            })}

            {/* Fila de Totales */}
            <tr style={{ borderTop: '2px solid #0f172a', borderBottom: '2px solid #0f172a', fontWeight: 'bold', background: '#f8fafc' }}>
              <td colSpan={2} style={{ padding: '14px 8px', color: '#0f172a' }}>TOTALES DEL MES</td>
              <td style={{ padding: '14px 8px', textAlign: 'center' }}>{totals.pairs}</td>
              <td style={{ padding: '14px 8px', textAlign: 'right' }}>${totals.earned.toLocaleString()}</td>
              <td style={{ padding: '14px 8px', textAlign: 'right', color: '#e11d48' }}>${totals.advances.toLocaleString()}</td>
              <td style={{ padding: '14px 8px', textAlign: 'right', color: '#10b981' }}>${totals.net.toLocaleString()}</td>
            </tr>
          </tbody>
        </table>

        {/* Sección de Firmas */}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '6rem', pageBreakInside: 'avoid' }}>
          <div style={{ width: '45%', borderTop: '1px solid #94a3b8', textAlign: 'center', paddingTop: '0.75rem' }}>
            <p style={{ margin: 0, fontWeight: 'bold', fontSize: '0.95rem', color: '#0f172a' }}>Elaborado por</p>
            <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.85rem', color: '#64748b' }}>Firma del Administrador / Supervisor</p>
          </div>
          <div style={{ width: '45%', borderTop: '1px solid #94a3b8', textAlign: 'center', paddingTop: '0.75rem' }}>
            <p style={{ margin: 0, fontWeight: 'bold', fontSize: '0.95rem', color: '#0f172a' }}>Revisado y Aprobado</p>
            <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.85rem', color: '#64748b' }}>Firma Autorizada / Contabilidad</p>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function ImprimirNomina() {
  return (
    <Suspense fallback={<div style={{ padding: '3rem', textAlign: 'center', fontFamily: 'Arial, sans-serif' }}><h2>Cargando reporte de nómina...</h2></div>}>
      <ImprimirNominaContent />
    </Suspense>
  )
}
