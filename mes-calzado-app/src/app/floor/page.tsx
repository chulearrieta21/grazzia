'use client'

import { useState, useRef, useEffect } from 'react'

const API = typeof window !== 'undefined' && window.location.hostname === 'localhost'
  ? 'http://localhost:8000/api/v1'
  : 'https://grazzia-backend.onrender.com/api/v1'

interface Operario {
  id: number
  nombre: string
  rol: string
  codigo_qr: string | null
  tipo_pago: 'por_produccion' | 'por_dia'
  salario_dia: number | null
  precio_por_par: number | null
}

interface ResumenOperario {
  pares_hoy: number
  ganado_hoy: number
  pares_semana: number
  ganado_semana: number
  total_adelantos_semana: number
  saldo_neto_semana: number
}

interface StatsNotification {
  operarioNombre: string
  operarioRol: string
  resumen: ResumenOperario
}

export default function FloorTerminal() {
  const [userQr, setUserQr] = useState('')
  const [batchId, setBatchId] = useState('')
  const [operator, setOperator] = useState<Operario | null>(null)
  const [operatorNomina, setOperatorNomina] = useState<any>(null)

  const [message, setMessage] = useState({ type: '', text: '' })
  const [loading, setLoading] = useState(false)
  const [stats, setStats] = useState<StatsNotification | null>(null)

  const userQrRef = useRef<HTMLInputElement>(null)
  const batchIdRef = useRef<HTMLInputElement>(null)
  const userQrTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const batchIdTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const statsTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  const triggerStats = (nombre: string, rol: string, resumen?: ResumenOperario) => {
    if (statsTimeoutRef.current) clearTimeout(statsTimeoutRef.current)
    if (!resumen) return
    setStats({
      operarioNombre: nombre,
      operarioRol: rol,
      resumen
    })
    statsTimeoutRef.current = setTimeout(() => {
      setStats(null)
    }, 20000) // 20 segundos de visibilidad flotante
  }

  // Keep focus on active input
  useEffect(() => {
    const focusActiveInput = () => {
      if (operator) {
        batchIdRef.current?.focus()
      } else {
        userQrRef.current?.focus()
      }
    }

    focusActiveInput()

    const handleGlobalClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (target.tagName !== 'INPUT' && target.tagName !== 'BUTTON' && !target.closest('button')) {
        focusActiveInput()
      }
    }

    const handleGlobalBlur = () => {
      setTimeout(() => {
        if (document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'BUTTON') {
          focusActiveInput()
        }
      }, 50)
    }

    document.addEventListener('click', handleGlobalClick)
    window.addEventListener('blur', handleGlobalBlur)
    return () => {
      document.removeEventListener('click', handleGlobalClick)
      window.removeEventListener('blur', handleGlobalBlur)
    }
  }, [operator])

  const procesarUserQr = async (qr: string) => {
    if (userQrTimeoutRef.current) clearTimeout(userQrTimeoutRef.current)
    setLoading(true)
    setMessage({ type: '', text: '' })
    try {
      const res = await fetch(`${API}/qr/escanear`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ qr_operario: qr })
      })
      const data = await res.json()

      if (!res.ok) {
        setMessage({ type: 'error', text: data.detail || 'Error al validar operario' })
        setTimeout(() => setMessage(prev => prev.type === 'error' ? { type: '', text: '' } : prev), 4000)
        setUserQr('')
        setTimeout(() => userQrRef.current?.focus(), 50)
      } else {
        if (data.resumen) {
          const opNombre = typeof data.operario === 'object' ? data.operario?.nombre : (typeof data.operario === 'string' ? data.operario : 'Operario')
          const opRol = typeof data.operario === 'object' ? data.operario?.rol : (data.proceso || 'Operario')
          triggerStats(opNombre, opRol, data.resumen)
        }

        try {
          const resNom = await fetch(`${API}/nomina`)
          const nominaData = await resNom.json()
          if (Array.isArray(nominaData)) {
            const opIdStr = data.operario?.id ? String(data.operario.id) : String(data.operario)
            const myNomina = nominaData.find(n => n.userId === opIdStr)
            setOperatorNomina(myNomina)
          }
        } catch { }

        if (data.tipo_pago === 'por_dia') {
          setMessage({ type: 'success', text: data.mensaje || 'Registro guardado exitosamente.' })
          setUserQr('')
          setTimeout(() => userQrRef.current?.focus(), 50)
        } else if (data.tipo_pago === 'por_produccion') {
          setOperator(data.operario)
          setMessage({ type: 'success', text: `Operario ${data.operario.nombre} (${data.operario.rol}) listo. Escanea la orden.` })
          setTimeout(() => batchIdRef.current?.focus(), 50)
        }
      }
    } catch {
      setMessage({ type: 'error', text: 'Error de conexión con el servidor.' })
      setUserQr('')
      setTimeout(() => userQrRef.current?.focus(), 50)
    } finally {
      setLoading(false)
    }
  }

  const procesarBatchId = async (batch: string) => {
    if (batchIdTimeoutRef.current) clearTimeout(batchIdTimeoutRef.current)
    setLoading(true)
    setMessage({ type: '', text: '' })
    try {
      const res = await fetch(`${API}/produccion/registrar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          qr_operario: operator?.codigo_qr,
          qr_orden: batch
        })
      })
      const data = await res.json()

      if (!res.ok) {
        setMessage({ type: 'error', text: data.detail || 'Error al registrar producción' })
        setTimeout(() => setMessage(prev => prev.type === 'error' ? { type: '', text: '' } : prev), 4000)
        setUserQr('')
        setBatchId('')
        setOperator(null)
        setTimeout(() => userQrRef.current?.focus(), 50)
      } else {
        if (data.resumen) {
          const opNombre = typeof data.operario === 'string' ? data.operario : (operator?.nombre || 'Operario')
          const opRol = data.proceso || operator?.rol || 'Producción'
          triggerStats(opNombre, opRol, data.resumen)
        }

        try {
          const resNom = await fetch(`${API}/nomina`)
          const nominaData = await resNom.json()
          if (Array.isArray(nominaData)) {
            const opIdStr = operator?.id ? String(operator.id) : ''
            const myNomina = nominaData.find(n => n.userId === opIdStr)
            setOperatorNomina(myNomina)
          }
        } catch { }

        setMessage({
          type: 'success',
          text: `¡Éxito! ${data.proceso} registrado por ${data.operario}. Valor: $${data.valor_ganado?.toLocaleString()}`
        })
        setUserQr('')
        setBatchId('')
        setOperator(null)
        setTimeout(() => userQrRef.current?.focus(), 50)
      }
    } catch {
      setMessage({ type: 'error', text: 'Error de conexión con el servidor.' })
      setUserQr('')
      setBatchId('')
      setOperator(null)
      setTimeout(() => userQrRef.current?.focus(), 50)
    } finally {
      setLoading(false)
    }
  }

  const handleUserQrKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      if (userQr.trim().length >= 4 && !operator && !loading) {
        procesarUserQr(userQr.trim())
      }
    }
  }

  const handleBatchIdKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      if (batchId.trim().length >= 4 && operator && !loading) {
        procesarBatchId(batchId.trim())
      }
    }
  }

  // Auto-submit QRs sin necesidad de presionar Enter
  useEffect(() => {
    if (!userQr || userQr.trim().length < 4 || operator || loading) return
    userQrTimeoutRef.current = setTimeout(() => {
      procesarUserQr(userQr.trim())
    }, 350)
    return () => {
      if (userQrTimeoutRef.current) clearTimeout(userQrTimeoutRef.current)
    }
  }, [userQr, operator, loading])

  useEffect(() => {
    if (!batchId || batchId.trim().length < 4 || !operator || loading) return
    batchIdTimeoutRef.current = setTimeout(() => {
      procesarBatchId(batchId.trim())
    }, 350)
    return () => {
      if (batchIdTimeoutRef.current) clearTimeout(batchIdTimeoutRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [batchId, operator, loading])

  const resetTerminal = () => {
    if (userQrTimeoutRef.current) clearTimeout(userQrTimeoutRef.current)
    if (batchIdTimeoutRef.current) clearTimeout(batchIdTimeoutRef.current)
    setUserQr('')
    setBatchId('')
    setOperator(null)
    setOperatorNomina(null)
    setMessage({ type: '', text: '' })
    setTimeout(() => userQrRef.current?.focus(), 50)
  }

  return (
    <div className="terminal-container">
      <div style={{ display: 'flex', flexDirection: 'row', gap: '2rem', alignItems: 'flex-start', flexWrap: 'wrap', justifyContent: 'center', width: '100%', maxWidth: '1200px' }}>

        {/* Panel izquierdo: Nómina del Operario (2 Tarjetas Compactas) */}
        {operator && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', flex: '1', minWidth: '340px', maxWidth: '440px' }}>

            {/* Cabecera / Identidad del Operario */}
            <div className="glass-card" style={{ padding: '15px 20px', borderColor: 'var(--accent-blue)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                <div style={{ fontSize: '2.2rem' }}>👤</div>
                <div>
                  <h2 style={{ margin: 0, color: 'white', fontSize: '1.15rem', textTransform: 'uppercase' }}>{stats?.operarioNombre || operator.nombre}</h2>
                  <span style={{ color: 'var(--accent-blue)', fontWeight: 'bold', fontSize: '0.95rem' }}>{stats?.operarioRol || operator.rol}</span>
                </div>
              </div>
            </div>

            {/* TARJETA 1: Semana Actual */}
            <div className="glass-card" style={{ padding: '16px', borderColor: 'var(--accent-blue)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <h3 style={{ margin: 0, color: 'white', fontSize: '1.05rem', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  🗓️ Semana Actual
                </h3>
                <span style={{ color: 'var(--accent-green)', fontWeight: 800, fontSize: '1.1rem' }}>
                  ${((stats?.resumen?.ganado_semana ?? 0)).toLocaleString()} COP
                </span>
              </div>

              {/* Indicadores Hoy vs Semana */}
              <div style={{ display: 'flex', gap: '10px', marginBottom: '12px' }}>
                <div style={{ flex: 1, background: 'rgba(0,0,0,0.3)', padding: '8px 12px', borderRadius: '8px', borderLeft: '3px solid var(--accent-blue)' }}>
                  <div style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', fontWeight: 600 }}>PRODUCCIÓN HOY</div>
                  <div style={{ color: 'white', fontSize: '1.1rem', fontWeight: 800 }}>
                    {stats?.resumen?.pares_hoy ?? 0} <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>prs</span>
                  </div>
                </div>

                <div style={{ flex: 1, background: 'rgba(0,0,0,0.3)', padding: '8px 12px', borderRadius: '8px', borderLeft: '3px solid var(--accent-green)' }}>
                  <div style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', fontWeight: 600 }}>PARES SEMANA</div>
                  <div style={{ color: 'white', fontSize: '1.1rem', fontWeight: 800 }}>
                    {stats?.resumen?.pares_semana ?? 0} <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>prs</span>
                  </div>
                </div>
              </div>

              {/* Contenedor compacto con scroll interno de la Semana Actual */}
              <div className="hide-scrollbar" style={{ maxHeight: '140px', overflowY: 'auto', paddingRight: '4px' }}>
                {operatorNomina?.detalleReferenciasSemanaActual && Object.keys(operatorNomina.detalleReferenciasSemanaActual).length > 0 ? (
                  Object.entries(operatorNomina.detalleReferenciasSemanaActual).map(([ref, det]: [string, any]) => (
                    <div key={ref} style={{ marginBottom: '6px', padding: '8px 12px', background: 'rgba(0,0,0,0.25)', borderRadius: '6px', borderLeft: '3px solid var(--accent-blue)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <span style={{ color: 'white', fontWeight: 600, fontSize: '0.9rem' }}>{ref}</span>
                        <span style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>{det.proceso}</span>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <span style={{ color: 'var(--accent-yellow)', display: 'block', fontSize: '0.8rem' }}>{det.pares} prs</span>
                        <span style={{ color: 'var(--accent-green)', fontWeight: 600, fontSize: '0.9rem' }}>${(Number(det.valor) || 0).toLocaleString()}</span>
                      </div>
                    </div>
                  ))
                ) : (
                  <div style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '0.8rem 0', fontSize: '0.85rem' }}>
                    Sin detalle de referencias en la semana actual.
                  </div>
                )}
              </div>
            </div>

            {/* TARJETA 2: Resumen del Mes */}
            <div className="glass-card" style={{ padding: '16px', borderColor: 'var(--accent-yellow)' }}>
              <h3 style={{ margin: 0, marginBottom: '12px', color: 'white', fontSize: '1.05rem', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '6px' }}>
                📊 Resumen del Mes
              </h3>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div style={{ background: 'rgba(0,0,0,0.3)', padding: '10px 12px', borderRadius: '8px', borderLeft: '3px solid var(--accent-yellow)' }}>
                  <div style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', fontWeight: 600 }}>TOTAL PARES MES</div>
                  <div style={{ color: 'white', fontSize: '1.2rem', fontWeight: 800 }}>
                    {operatorNomina?.totalPairs ?? 0} <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>prs</span>
                  </div>
                </div>

                <div style={{ background: 'rgba(0,0,0,0.3)', padding: '10px 12px', borderRadius: '8px', borderLeft: '3px solid var(--accent-green)' }}>
                  <div style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', fontWeight: 600 }}>GANADO MES</div>
                  <div style={{ color: 'var(--accent-green)', fontSize: '1.2rem', fontWeight: 800 }}>
                    ${(Number(operatorNomina?.totalEarned) || 0).toLocaleString()}
                  </div>
                </div>

                {operatorNomina?.totalAdvances ? (
                  <div style={{ background: 'rgba(0,0,0,0.3)', padding: '10px 12px', borderRadius: '8px', borderLeft: '3px solid #ef4444' }}>
                    <div style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', fontWeight: 600 }}>ADELANTOS / AVANCES</div>
                    <div style={{ color: '#ef4444', fontSize: '1.1rem', fontWeight: 800 }}>
                      -${(Number(operatorNomina.totalAdvances) || 0).toLocaleString()}
                    </div>
                  </div>
                ) : null}

                <div style={{ background: 'rgba(0,0,0,0.3)', padding: '10px 12px', borderRadius: '8px', borderLeft: '3px solid var(--accent-blue)', gridColumn: operatorNomina?.totalAdvances ? 'auto' : 'span 2' }}>
                  <div style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', fontWeight: 600 }}>NETO MES PROYECTADO</div>
                  <div style={{ color: 'white', fontSize: '1.2rem', fontWeight: 800 }}>
                    ${(Number(operatorNomina?.netEarned ?? operatorNomina?.totalEarned) || 0).toLocaleString()}
                  </div>
                </div>
              </div>
            </div>

          </div>
        )}

        {/* Panel derecho: Terminal Principal */}
        <div className="glass-card terminal-card" style={{ flex: '2', minWidth: '350px', maxWidth: '650px' }}>
          <div className="terminal-header">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt="GRAZZIA Logo" style={{ height: '60px', marginBottom: '1.5rem', filter: 'invert(1)', mixBlendMode: 'screen' }} />
            <h1>Terminal de Operario</h1>
            <p>Sistema de Escaneo Cero Digitación - GRAZZIA</p>
          </div>

          {message.text && (
            <div className={`alert ${message.type === 'error' ? 'alert-error' : 'alert-success'}`}>
              {message.type === 'error' ? '⚠️ ' : '✅ '}
              {message.text}
            </div>
          )}

          {loading && <p style={{ color: 'var(--accent-blue)', textAlign: 'center', marginBottom: '1rem' }}>Procesando...</p>}

          <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>

            <div style={{
              background: operator ? 'rgba(16, 185, 129, 0.1)' : 'rgba(0,0,0,0.2)',
              padding: '20px', borderRadius: '12px',
              border: operator ? '1px solid var(--accent-green)' : '1px solid rgba(255,255,255,0.1)',
              transition: 'all 0.3s'
            }}>
              <label className="modern-label" style={{ textAlign: 'center', fontSize: '1.2rem', color: 'white' }}>
                1. ESCANEA TU CÓDIGO DE OPERARIO (CARNET)
                <input
                  ref={userQrRef}
                  className="modern-input pin-input"
                  value={userQr}
                  onChange={(e) => setUserQr(e.target.value)}
                  onKeyDown={handleUserQrKeyDown}
                  placeholder="Ej: EMP-001"
                  disabled={operator !== null || loading}
                  style={{
                    marginTop: '10px',
                    opacity: operator ? 0.7 : 1,
                    borderColor: operator ? 'var(--accent-green)' : 'var(--border-color)'
                  }}
                />
              </label>
              {operator && (
                <p style={{ color: 'var(--accent-green)', textAlign: 'center', marginTop: '10px', fontWeight: 'bold' }}>
                  Operario detectado: {operator.nombre} ({operator.rol})
                </p>
              )}
            </div>

            <div style={{
              background: !operator ? 'rgba(0,0,0,0.4)' : 'rgba(0,0,0,0.2)',
              padding: '20px', borderRadius: '12px',
              border: '1px solid rgba(255,255,255,0.1)',
              opacity: !operator ? 0.5 : 1,
              pointerEvents: !operator ? 'none' : 'auto',
              transition: 'all 0.3s'
            }}>
              <label className="modern-label" style={{ textAlign: 'center', fontSize: '1.2rem', color: 'white' }}>
                2. ESCANEA EL CÓDIGO DE LA CANASTA (ORDEN)
                <input
                  ref={batchIdRef}
                  className="modern-input pin-input"
                  value={batchId}
                  onChange={(e) => setBatchId(e.target.value)}
                  onKeyDown={handleBatchIdKeyDown}
                  placeholder="Ej: OP-0462"
                  disabled={!operator || loading}
                  style={{ borderColor: 'var(--accent-blue)', marginTop: '10px' }}
                />
              </label>
            </div>

            {operator && (
              <button onClick={resetTerminal} className="btn-primary" style={{ marginTop: '1rem', background: 'transparent', border: '1px solid rgba(255,255,255,0.2)' }}>
                Cancelar Operación
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
