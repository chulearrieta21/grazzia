'use client'

import { useEffect, useState } from 'react'
import Barcode from 'react-barcode'

const API = 'https://grazzia-backend.onrender.com/api/v1'

// ── Types ────────────────────────────────────────────────────────────────────
interface Operario {
  id: number; nombre: string; rol: string; codigo_qr: string | null
  tipo_pago: 'por_produccion' | 'por_dia'; salario_dia: number | null; precio_por_par: number | null
}
interface Tarifa { id: number; rol: string; precio_por_par: number }
interface TarifaRef { id: number; referencia: string; rol: string; precio_por_par: number }

// ── Alerts ───────────────────────────────────────────────────────────────────
function Alert({ msg, type, onClose }: { msg: string; type: 'success' | 'error'; onClose: () => void }) {
  return (
    <div className={`alert ${type === 'success' ? 'alert-success' : 'alert-error'}`}
      style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <span>{type === 'success' ? '✅' : '⚠️'} {msg}</span>
      <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: '1.2rem' }}>×</button>
    </div>
  )
}

// ── Tabs ─────────────────────────────────────────────────────────────────────
const TABS = ['Órdenes', 'Operarios', 'Tarifas', 'Producción', 'Asistencia', 'Nómina', 'Avances'] as const
type Tab = typeof TABS[number]

export default function SupervisorDashboard() {
  const [tab, setTab] = useState<Tab>('Órdenes')
  const [alert, setAlert] = useState<{ msg: string; type: 'success' | 'error' } | null>(null)

  // Shared data
  const [orders, setOrders] = useState<any[]>([])
  const [movements, setMovements] = useState<any[]>([])
  const [payroll, setPayroll] = useState<any[]>([])
  const [operarios, setOperarios] = useState<Operario[]>([])
  const [tarifas, setTarifas] = useState<Tarifa[]>([])
  const [tarifasRef, setTarifasRef] = useState<TarifaRef[]>([])
  const [referencias, setReferencias] = useState<string[]>([])
  const [jornadas, setJornadas] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedForPrint, setSelectedForPrint] = useState<Set<string>>(new Set())

  // Order form
  const [orderId, setOrderId] = useState('')
  const [client, setClient] = useState('')
  const [reference, setReference] = useState('')
  const [precioReferencia, setPrecioReferencia] = useState('')
  const [color, setColor] = useState('')
  const [sole, setSole] = useState('')
  const [sizeMap, setSizeMap] = useState<Record<string, string>>({'34': '', '35': '', '36': '', '37': '', '38': '', '39': '', '40': '', '41': '', '42': '', '43': ''})
  const [observations, setObservations] = useState('')
  const [selectedOrder, setSelectedOrder] = useState<any>(null)
  
  const [isEditingOrder, setIsEditingOrder] = useState(false)
  const [editOrderId, setEditOrderId] = useState('')

  const totalQuantity = Object.values(sizeMap).reduce((acc, val) => acc + (parseInt(val) || 0), 0).toString()

  // Operario form
  const ROLES_PERMITIDOS = ['Picado', 'Guarnizado', 'Recamado', 'Montado', 'Pegado', 'Detallado', 'Despachado', 'Independiente']
  const [opNombre, setOpNombre] = useState('')
  const [opRol, setOpRol] = useState(ROLES_PERMITIDOS[0])
  const [opTipoPago, setOpTipoPago] = useState<'por_produccion' | 'por_dia'>('por_produccion')
  const [opSalarioDia, setOpSalarioDia] = useState('')
  const [opPrecioPar, setOpPrecioPar] = useState('')

  // Tarifa por referencia form
  const [tRef, setTRef] = useState('')
  const [tPreciosRol, setTPreciosRol] = useState<{[key: string]: string}>({})
  // Tarifa global form
  const [tGRol, setTGRol] = useState(ROLES_PERMITIDOS[0])
  const [tGPrecio, setTGPrecio] = useState('')
  // Adelantos
  const [adelantos, setAdelantos] = useState<any[]>([])
  const [aOperario, setAOperario] = useState('')
  const [aMonto, setAMonto] = useState('')
  const [aObservacion, setAObservacion] = useState('')

  const showAlert = (msg: string, type: 'success' | 'error') => {
    setAlert({ msg, type })
    setTimeout(() => setAlert(null), 5000)
  }

  // ── Fetchers ───────────────────────────────────────────────────────────────
  const fetchAll = () => {
    fetchOrders(); fetchMovements(); fetchPayroll(); fetchOperarios(); fetchTarifas(); fetchTarifasRef(); fetchReferencias(); fetchJornadas(); fetchAdelantos()
  }

  const fetchOrders = async () => {
    try { const r = await fetch(`${API}/ordenes`); setOrders(await r.json()) }
    catch { } finally { setLoading(false) }
  }
  const fetchMovements = async () => {
    try { const r = await fetch(`${API}/produccion`); const d = await r.json(); if (Array.isArray(d)) setMovements(d) }
    catch { }
  }
  const fetchPayroll = async () => {
    try { const r = await fetch(`${API}/nomina`); const d = await r.json(); if (Array.isArray(d)) setPayroll(d) }
    catch { }
  }
  const fetchOperarios = async () => {
    try { const r = await fetch(`${API}/operarios`); setOperarios(await r.json()) }
    catch { }
  }
  const fetchTarifas = async () => {
    try { const r = await fetch(`${API}/tarifas/global`); setTarifas(await r.json()) }
    catch { }
  }
  const fetchTarifasRef = async () => {
    try { const r = await fetch(`${API}/tarifas/referencia`); setTarifasRef(await r.json()) }
    catch { }
  }
  const fetchReferencias = async () => {
    try { const r = await fetch(`${API}/referencias`); setReferencias(await r.json()) }
    catch { }
  }
  const fetchJornadas = async () => {
    try { const r = await fetch(`${API}/jornadas/resumen`); setJornadas(await r.json()) }
    catch { }
  }
  const fetchAdelantos = async () => {
    try { const r = await fetch(`${API}/adelantos`); setAdelantos(await r.json()) }
    catch { }
  }

  useEffect(() => {
    fetchAll()
    const interval = setInterval(fetchAll, 8000)
    return () => clearInterval(interval)
  }, [])

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleCreateOrder = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      const sizesStr = Object.entries(sizeMap)
        .filter(([_, v]) => v !== '')
        .map(([k, v]) => `${k}:${v}`).join(', ')

      const url = isEditingOrder ? `${API}/ordenes/${editOrderId}` : `${API}/ordenes`
      const method = isEditingOrder ? 'PUT' : 'POST'
      const payloadId = isEditingOrder ? editOrderId : orderId

      const r = await fetch(url, {
        method: method, headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: payloadId, client, reference, color, sole, sizes: sizesStr, observations, totalQuantity, batchSize: totalQuantity, precio_referencia: precioReferencia })
      })
      const d = await r.json()
      if (!r.ok) { showAlert(d.detail, 'error'); return }

      setOrderId(''); setClient(''); setReference(''); setColor(''); setSole(''); setPrecioReferencia('');
      setSizeMap({'34': '', '35': '', '36': '', '37': '', '38': '', '39': '', '40': '', '41': '', '42': '', '43': ''}); 
      setObservations(''); setIsEditingOrder(false); setEditOrderId('');
      fetchOrders()
      showAlert(d.mensaje, 'success')
    } catch { showAlert('Error al guardar la orden.', 'error') }
  }

  const cancelEditOrder = () => {
    setOrderId(''); setClient(''); setReference(''); setColor(''); setSole(''); setPrecioReferencia('');
    setSizeMap({'34': '', '35': '', '36': '', '37': '', '38': '', '39': '', '40': '', '41': '', '42': '', '43': ''}); 
    setObservations(''); setIsEditingOrder(false); setEditOrderId('');
  }

  const handleEditOrder = (o: any) => {
    setIsEditingOrder(true)
    setEditOrderId(o.id)
    setOrderId(o.id)
    setClient(o.client)
    setReference(o.reference)
    setColor(o.color)
    setSole(o.sole)
    setObservations(o.observations)
    setPrecioReferencia(o.precio_referencia !== null ? String(o.precio_referencia) : '')
    
    const newSizeMap: Record<string, string> = {'34': '', '35': '', '36': '', '37': '', '38': '', '39': '', '40': '', '41': '', '42': '', '43': ''}
    if (o.sizes) {
      o.sizes.split(',').forEach((part: string) => {
        const [sz, qty] = part.trim().split(':')
        if (sz && qty) newSizeMap[sz] = qty
      })
    }
    setSizeMap(newSizeMap)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleCrearOperario = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      const body: any = { nombre: opNombre, rol: opRol, tipo_pago: opTipoPago }
      if (opTipoPago === 'por_dia') body.salario_dia = parseFloat(opSalarioDia)
      if (opTipoPago === 'por_produccion') body.precio_por_par = parseFloat(opPrecioPar)

      const r = await fetch(`${API}/operarios`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
      })
      const d = await r.json()
      if (!r.ok) { showAlert(d.detail, 'error'); return }
      showAlert(d.mensaje, 'success')
      setOpNombre(''); setOpRol(ROLES_PERMITIDOS[0]); setOpSalarioDia(''); setOpPrecioPar('')
      fetchOperarios(); fetchTarifas()
    } catch { showAlert('Error al crear operario.', 'error') }
  }

  const handleEliminarOperario = async (id: number, nombre: string) => {
    if (!confirm(`¿Eliminar a ${nombre}?`)) return
    try {
      const r = await fetch(`${API}/operarios/${id}`, { method: 'DELETE' })
      const d = await r.json()
      if (!r.ok) { showAlert(d.detail, 'error'); return }
      showAlert(d.mensaje, 'success')
      fetchOperarios()
    } catch { showAlert('Error al eliminar operario.', 'error') }
  }

  const handleGuardarTarifaRef = async (e: React.FormEvent) => {
    e.preventDefault()
    
    const tarifasBatch = []
    if (tPreciosRol['GLOBAL'] && tPreciosRol['GLOBAL'].trim() !== '') {
       tarifasBatch.push({ rol: 'GLOBAL', precio: parseFloat(tPreciosRol['GLOBAL']) })
    }
    
    ROLES_PERMITIDOS.forEach(rol => {
      if (tPreciosRol[rol] && tPreciosRol[rol].trim() !== '') {
        tarifasBatch.push({ rol, precio: parseFloat(tPreciosRol[rol]) })
      }
    })
    
    if (tarifasBatch.length === 0) {
      showAlert('Debe ingresar al menos un precio para la matriz.', 'error')
      return
    }

    try {
      const r = await fetch(`${API}/tarifas/referencia/batch`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ referencia: tRef, tarifas: tarifasBatch })
      })
      const d = await r.json()
      if (!r.ok) { showAlert(d.detail, 'error'); return }
      showAlert(d.mensaje, 'success')
      setTRef(''); setTPreciosRol({})
      fetchTarifasRef()
    } catch { showAlert('Error al guardar la matriz de tarifas.', 'error') }
  }

  const handleEliminarTarifaRef = async (id: number, ref: string, rol: string) => {
    if (!confirm(`¿Eliminar tarifa ${ref} | ${rol}?`)) return
    try {
      const r = await fetch(`${API}/tarifas/referencia/${id}`, { method: 'DELETE' })
      const d = await r.json()
      if (!r.ok) { showAlert(d.detail, 'error'); return }
      showAlert(d.mensaje, 'success')
      fetchTarifasRef()
    } catch { showAlert('Error al eliminar tarifa.', 'error') }
  }

  const handleGuardarTarifaGlobal = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      const r = await fetch(`${API}/tarifas/global`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rol: tGRol, precio_por_par: parseFloat(tGPrecio) })
      })
      const d = await r.json()
      if (!r.ok) { showAlert(d.detail, 'error'); return }
      showAlert(d.mensaje, 'success')
      setTGRol(ROLES_PERMITIDOS[0]); setTGPrecio('')
      fetchTarifas()
    } catch { showAlert('Error al guardar tarifa global.', 'error') }
  }

  const handleEliminarTarifaGlobal = async (id: number, rol: string) => {
    if (!confirm(`¿Eliminar tarifa global del rol "${rol}"?`)) return
    try {
      const r = await fetch(`${API}/tarifas/global/${id}`, { method: 'DELETE' })
      const d = await r.json()
      if (!r.ok) { showAlert(d.detail, 'error'); return }
      showAlert(d.mensaje, 'success')
      fetchTarifas()
    } catch { showAlert('Error al eliminar tarifa.', 'error') }
  }

  const handleGuardarAdelanto = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      const r = await fetch(`${API}/adelantos`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id_operario: aOperario, monto: parseFloat(aMonto), observacion: aObservacion })
      })
      const d = await r.json()
      if (!r.ok) { showAlert(d.detail, 'error'); return }
      showAlert(d.mensaje, 'success')
      setAOperario(''); setAMonto(''); setAObservacion('')
      fetchAdelantos(); fetchPayroll()
    } catch { showAlert('Error al registrar adelanto.', 'error') }
  }

  const handleEliminarAdelanto = async (id: number) => {
    if (!confirm('¿Eliminar este adelanto?')) return
    try {
      const r = await fetch(`${API}/adelantos/${id}`, { method: 'DELETE' })
      const d = await r.json()
      if (!r.ok) { showAlert(d.detail, 'error'); return }
      showAlert(d.mensaje, 'success')
      fetchAdelantos(); fetchPayroll()
    } catch { showAlert('Error al eliminar adelanto.', 'error') }
  }

  // ── Shared styles ─────────────────────────────────────────────────────────
  const btnDanger: React.CSSProperties = {
    background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.4)',
    color: '#f87171', padding: '6px 14px', borderRadius: '8px', cursor: 'pointer',
    fontSize: '0.85rem', fontWeight: 600, transition: 'all .2s'
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="dashboard-container">
      {/* Header */}
      <div className="dashboard-header">
        <img src="/logo.png" alt="GRAZZIA Logo" style={{ height: '50px', marginBottom: '1.5rem', filter: 'invert(1)', mixBlendMode: 'screen' }} />
        <h1>Dashboard de Supervisor</h1>
        <p style={{ color: 'var(--text-secondary)', marginTop: '0.5rem', fontSize: '1.1rem' }}>
          Monitoreo y control de la producción · Calzado GRAZZIA
        </p>
      </div>

      {/* Alert */}
      {alert && <Alert msg={alert.msg} type={alert.type} onClose={() => setAlert(null)} />}

      {/* Tab Nav */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '2.5rem', flexWrap: 'wrap' }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding: '10px 22px', borderRadius: '10px', border: 'none', cursor: 'pointer',
            fontFamily: 'var(--font-main)', fontWeight: 600, fontSize: '0.95rem', transition: 'all .2s',
            background: tab === t ? 'var(--accent-blue)' : 'rgba(255,255,255,0.05)',
            color: tab === t ? 'white' : 'var(--text-secondary)',
            boxShadow: tab === t ? '0 4px 14px rgba(59,130,246,.4)' : 'none'
          }}>{t}</button>
        ))}
      </div>

      {/* ── TAB: Órdenes ── */}
      {tab === 'Órdenes' && (
        <div className="grid-layout">
          <div className="glass-card">
            <h2>{isEditingOrder ? '✏️ Editar Orden' : 'Crear Nueva Orden'}</h2>
            <form onSubmit={handleCreateOrder}>
              <div className="flex-row" style={{ marginBottom: '1rem' }}>
                <label className="modern-label" style={{ flex: 1 }}>Nº de Orden (QR)
                  <input className="modern-input" value={orderId} onChange={e => setOrderId(e.target.value)} required placeholder="Ej. OP-2026-001" disabled={isEditingOrder} />
                </label>
                <label className="modern-label" style={{ flex: 1 }}>Cliente
                  <input className="modern-input" value={client} onChange={e => setClient(e.target.value)} required placeholder="Ej. Zapatos S.A." />
                </label>
              </div>
              <div className="flex-row" style={{ marginBottom: '1rem' }}>
                <label className="modern-label" style={{ flex: 1 }}>Referencia
                  <input className="modern-input" value={reference} onChange={e => setReference(e.target.value.replace(/\D/g, ''))} pattern="[0-9]*" inputMode="numeric" required placeholder="Ej. 0202" />
                </label>
                <label className="modern-label" style={{ flex: 1 }}>Color
                  <input className="modern-input" value={color} onChange={e => setColor(e.target.value)} required placeholder="Ej. Miel" />
                </label>
              </div>
              <div className="flex-row" style={{ marginBottom: '1rem' }}>
                <label className="modern-label" style={{ flex: 1 }}>Suela
                  <input className="modern-input" value={sole} onChange={e => setSole(e.target.value)} required placeholder="Ej. Goma" />
                </label>
              </div>

              <label className="modern-label" style={{ marginBottom: '0.5rem' }}>Curva de Tallas (Ingresa la cantidad por talla)</label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(10, 1fr)', gap: '5px', marginBottom: '1rem' }}>
                {Object.keys(sizeMap).map(sz => (
                  <div key={sz} style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>{sz}</div>
                    <input 
                      type="number" min="0" className="modern-input" 
                      style={{ padding: '8px 2px', textAlign: 'center', fontSize: '1rem' }} 
                      value={sizeMap[sz]} 
                      onChange={e => setSizeMap({...sizeMap, [sz]: e.target.value})} 
                    />
                  </div>
                ))}
              </div>

              <div className="flex-row" style={{ marginBottom: '1rem' }}>
                <label className="modern-label" style={{ flex: 1 }}>Cant. Total (Pares)
                  <input type="number" className="modern-input" value={totalQuantity} disabled style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--accent-green)', fontWeight: 'bold' }} />
                </label>
                <label className="modern-label" style={{ flex: 2 }}>Observaciones
                  <input className="modern-input" value={observations} onChange={e => setObservations(e.target.value)} placeholder="Opcional" />
                </label>
              </div>
              <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
                <button type="submit" className="btn-primary" style={{ flex: 1 }}>{isEditingOrder ? 'Guardar Cambios' : 'Generar Orden y QRs'}</button>
                {isEditingOrder && (
                  <button type="button" className="btn-primary" style={{ background: '#ef4444', flex: 1 }} onClick={cancelEditOrder}>Cancelar</button>
                )}
              </div>
            </form>
          </div>

          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h2>Órdenes Activas</h2>
              <button 
                className="btn-primary" 
                disabled={selectedForPrint.size === 0}
                style={{ opacity: selectedForPrint.size === 0 ? 0.5 : 1, padding: '8px 16px', fontSize: '0.9rem' }}
                onClick={() => {
                  window.open('/imprimir?ids=' + Array.from(selectedForPrint).join(','), '_blank')
                }}
              >
                🖨️ Imprimir Hojas de Ruta ({selectedForPrint.size})
              </button>
            </div>
            {loading ? <p style={{ color: 'var(--text-secondary)' }}>Cargando...</p> : (
              <div style={{ overflowX: 'auto' }}>
                <table className="modern-table">
                  <thead>
                    <tr>
                      <th style={{ width: '40px', textAlign: 'center' }}>
                        <input 
                          type="checkbox" 
                          checked={orders.length > 0 && selectedForPrint.size === orders.length}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedForPrint(new Set(orders.map(o => o.id)))
                            } else {
                              setSelectedForPrint(new Set())
                            }
                          }}
                        />
                      </th>
                      <th>ID Orden</th><th>Referencia</th><th>Cantidad</th><th>Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orders.length === 0 && <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>Sin órdenes activas.</td></tr>}
                    {orders.map((o: any) => (
                      <tr key={o.id}>
                        <td style={{ textAlign: 'center' }}>
                          <input 
                            type="checkbox" 
                            checked={selectedForPrint.has(o.id)}
                            onChange={(e) => {
                              const newSet = new Set(selectedForPrint)
                              if (e.target.checked) newSet.add(o.id)
                              else newSet.delete(o.id)
                              setSelectedForPrint(newSet)
                            }}
                          />
                        </td>
                        <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{o.id}</td>
                        <td>{o.reference} - {o.color}</td>
                        <td style={{ fontFamily: 'monospace' }}>{o.totalQuantity}</td>
                        <td style={{ display: 'flex', gap: '0.5rem' }}>
                          <button onClick={() => handleEditOrder(o)} style={{
                            background: '#eab308', color: 'black', border: 'none',
                            padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '0.85rem'
                          }}>
                            ✏️ Editar
                          </button>
                          <button onClick={() => setSelectedOrder(o)} style={{
                            background: 'var(--accent-blue)', color: 'white', border: 'none',
                            padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '0.85rem'
                          }}>
                            Códigos
                          </button>
                          <button onClick={() => window.open(`/imprimir?ids=${o.id}`, '_blank')} style={{
                            background: 'var(--accent-green)', color: 'white', border: 'none',
                            padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '0.85rem'
                          }}>
                            PDF
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── TAB: Operarios ── */}
      {tab === 'Operarios' && (
        <div className="grid-layout">
          {/* Formulario */}
          <div className="glass-card">
            <h2>➕ Agregar Operario</h2>
            <form onSubmit={handleCrearOperario}>
              <label className="modern-label">Nombre completo
                <input className="modern-input" value={opNombre} onChange={e => setOpNombre(e.target.value)} required placeholder="Ej. Luis Martínez" />
              </label>
              <label className="modern-label">Rol / Proceso
                <select className="modern-input" value={opRol} onChange={e => setOpRol(e.target.value)} required>
                  {ROLES_PERMITIDOS.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </label>
              <label className="modern-label">Tipo de pago
                <select className="modern-input" value={opTipoPago} onChange={e => setOpTipoPago(e.target.value as any)}>
                  <option value="por_produccion">Por producción (destajo)</option>
                  <option value="por_dia">Por día (jornal)</option>
                </select>
              </label>

              {opTipoPago === 'por_produccion' && (
                <label className="modern-label">Precio por par ($)
                  <input type="number" className="modern-input" value={opPrecioPar} onChange={e => setOpPrecioPar(e.target.value)}
                    required placeholder="Ej. 1500" min={0} />
                </label>
              )}
              {opTipoPago === 'por_dia' && (
                <label className="modern-label">Salario por día ($)
                  <input type="number" className="modern-input" value={opSalarioDia} onChange={e => setOpSalarioDia(e.target.value)}
                    required placeholder="Ej. 45000" min={0} />
                </label>
              )}

              <button type="submit" className="btn-primary" style={{ marginTop: '1rem' }}>Guardar Operario</button>
            </form>
          </div>

          {/* Tabla de operarios */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h2 style={{ margin: 0 }}>Operarios Registrados</h2>
              <button onClick={() => window.open('/imprimir/carnets', '_blank')} style={{
                background: 'var(--accent-blue)', color: 'white', border: 'none',
                padding: '8px 16px', borderRadius: '8px', cursor: 'pointer', fontSize: '0.95rem', fontWeight: 'bold'
              }}>
                🖨️ Imprimir Carnets
              </button>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table className="modern-table">
                <thead>
                  <tr>
                    <th>Nombre</th><th>Rol</th><th>QR</th><th>Tipo Pago</th><th>Valor</th><th></th>
                  </tr>
                </thead>
                <tbody>
                  {operarios.length === 0 && <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>Sin operarios registrados.</td></tr>}
                  {operarios.map(o => (
                    <tr key={o.id}>
                      <td style={{ fontWeight: 600, color: 'white' }}>{o.nombre}</td>
                      <td>{o.rol}</td>
                      <td style={{ fontFamily: 'monospace', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{o.codigo_qr || '—'}</td>
                      <td>
                        <span className={`badge ${o.tipo_pago === 'por_produccion' ? 'badge-pending' : 'badge-completed'}`}>
                          {o.tipo_pago === 'por_produccion' ? 'Destajo' : 'Jornal'}
                        </span>
                      </td>
                      <td style={{ fontWeight: 600, color: 'var(--accent-green)' }}>
                        {o.tipo_pago === 'por_produccion'
                          ? `$${(o.precio_por_par ?? 0).toLocaleString()}/par`
                          : `$${(o.salario_dia ?? 0).toLocaleString()}/día`}
                      </td>
                      <td>
                        <button style={btnDanger} onClick={() => handleEliminarOperario(o.id, o.nombre)}>Eliminar</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── TAB: Tarifas ── */}
      {tab === 'Tarifas' && (
        <div>
          {/* ── Tarifas por Referencia ── */}
          <div className="grid-layout" style={{ marginBottom: '3rem' }}>
            <div className="glass-card">
              <h2>💰 Precio por Referencia</h2>
              <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem', fontSize: '0.95rem', lineHeight: 1.6 }}>
                Cada referencia de calzado puede tener un precio diferente por proceso.
                Esta tarifa tiene <strong style={{color:'white'}}>prioridad</strong> sobre la tarifa global.
              </p>
              <form onSubmit={handleGuardarTarifaRef}>
                <label className="modern-label">Referencia de calzado
                  <input className="modern-input" list="refs-list" value={tRef} onChange={e => setTRef(e.target.value.replace(/\D/g, ''))} pattern="[0-9]*" inputMode="numeric"
                    required placeholder="Ej. 0202" />
                  <datalist id="refs-list">
                    {referencias.map(r => <option key={r} value={r} />)}
                  </datalist>
                </label>

                <div style={{ marginTop: '1.5rem', marginBottom: '0.5rem', fontWeight: 600, color: 'var(--accent-blue)' }}>Matriz de Precios por Proceso</div>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1.2rem' }}>Deja en blanco los que no apliquen o ingresa un precio GLOBAL.</p>
                
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '12px' }}>
                  <label className="modern-label" style={{ background: 'rgba(255,255,255,0.03)', padding: '10px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
                    <span style={{color: 'var(--accent-green)'}}>GLOBAL</span>
                    <input type="number" className="modern-input" value={tPreciosRol['GLOBAL'] || ''} 
                           onChange={e => setTPreciosRol(prev => ({...prev, 'GLOBAL': e.target.value}))}
                           placeholder="$ 0" min={0} step={50} style={{ marginTop: '5px', padding: '6px' }} />
                  </label>
                  {ROLES_PERMITIDOS.map(rol => (
                    <label key={rol} className="modern-label" style={{ background: 'rgba(255,255,255,0.03)', padding: '10px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
                      {rol}
                      <input type="number" className="modern-input" value={tPreciosRol[rol] || ''} 
                             onChange={e => setTPreciosRol(prev => ({...prev, [rol]: e.target.value}))}
                             placeholder="$ 0" min={0} step={50} style={{ marginTop: '5px', padding: '6px' }} />
                    </label>
                  ))}
                </div>

                <button type="submit" className="btn-primary" style={{ marginTop: '2rem', width: '100%', padding: '12px', fontSize: '1.1rem' }}>💾 Guardar Matriz de Precios</button>
              </form>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
              <h2>Tarifas por Referencia (Agrupadas)</h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', maxHeight: '600px', overflowY: 'auto', paddingRight: '10px' }} className="custom-scrollbar">
                {tarifasRef.length === 0 && <div style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '2rem', border: '1px dashed rgba(255,255,255,0.1)', borderRadius: '12px' }}>Sin tarifas por referencia.</div>}
                
                {Object.entries(tarifasRef.reduce((acc: any, t: TarifaRef) => {
                  if (!acc[t.referencia]) acc[t.referencia] = [];
                  acc[t.referencia].push(t);
                  return acc;
                }, {})).sort(([a], [b]) => a.localeCompare(b)).map(([ref, tarifas]: [string, any]) => (
                  <div key={ref} className="glass-card" style={{ 
                    padding: '1.2rem', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '1.5rem', 
                    background: 'rgba(255,255,255,0.02)', borderColor: 'rgba(255,255,255,0.05)',
                    transition: 'all 0.3s', cursor: 'default'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.borderColor = 'rgba(59,130,246,0.3)'}
                  onMouseLeave={(e) => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.05)'}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', minWidth: '150px' }}>
                      <div style={{ background: 'linear-gradient(135deg, var(--accent-blue), #2563eb)', color: 'white', fontWeight: 'bold', padding: '8px 16px', borderRadius: '8px', fontSize: '1.1rem', boxShadow: '0 4px 10px rgba(59,130,246,0.3)' }}>
                        {ref}
                      </div>
                      <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', background: 'rgba(255,255,255,0.1)', padding: '4px 10px', borderRadius: '20px' }}>
                        {tarifas.length} proceso{tarifas.length !== 1 ? 's' : ''}
                      </div>
                    </div>
                    
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.8rem', flex: 1 }}>
                      {tarifas.sort((a: any, b: any) => a.rol.localeCompare(b.rol)).map((t: any) => (
                        <div key={t.id} style={{ 
                          display: 'flex', alignItems: 'center', background: 'rgba(0,0,0,0.4)', 
                          borderRadius: '20px', padding: '4px 6px 4px 14px', border: '1px solid rgba(255,255,255,0.08)' 
                        }}>
                          <span style={{ color: 'var(--text-secondary)', marginRight: '8px', fontSize: '0.85rem', fontWeight: 500 }}>{t.rol}</span>
                          <strong style={{ color: 'var(--accent-green)', marginRight: '10px' }}>${t.precio_por_par.toLocaleString()}</strong>
                          <button onClick={() => handleEliminarTarifaRef(t.id, t.referencia, t.rol)} 
                            style={{ 
                              background: 'rgba(239,68,68,0.15)', border: 'none', color: '#f87171', width: '26px', height: '26px', 
                              borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', 
                              fontSize: '1.1rem', transition: 'all 0.2s' 
                            }} 
                            onMouseEnter={(e) => { e.currentTarget.style.background = '#ef4444'; e.currentTarget.style.color = 'white' }}
                            onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(239,68,68,0.15)'; e.currentTarget.style.color = '#f87171' }}
                            title={`Eliminar ${t.rol} de ${ref}`}>×</button>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* ── Tarifas Globales por Rol (fallback) ── */}
          <div className="grid-layout">
            <div className="glass-card" style={{ borderColor: 'rgba(245,158,11,0.2)' }}>
              <h2>🌐 Tarifa Global por Rol</h2>
              <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem', fontSize: '0.95rem', lineHeight: 1.6 }}>
                Se aplica cuando <strong style={{color:'white'}}>no existe</strong> una tarifa específica para la referencia.
              </p>
              <form onSubmit={handleGuardarTarifaGlobal}>
                <label className="modern-label">Rol / Proceso
                  <select className="modern-input" value={tGRol} onChange={e => setTGRol(e.target.value)} required>
                    {ROLES_PERMITIDOS.map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                </label>
                <label className="modern-label">Precio por par ($)
                  <input type="number" className="modern-input" value={tGPrecio} onChange={e => setTGPrecio(e.target.value)}
                    required placeholder="Ej. 1200" min={0} step={50} />
                </label>
                <button type="submit" className="btn-primary" style={{ marginTop: '1rem' }}>Guardar Tarifa Global</button>
              </form>
            </div>

            <div>
              <h2>Tarifas Globales</h2>
              <div style={{ overflowX: 'auto' }}>
                <table className="modern-table">
                  <thead><tr><th>Rol</th><th>$/par (fallback)</th><th></th></tr></thead>
                  <tbody>
                    {tarifas.length === 0 && <tr><td colSpan={3} style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>Sin tarifas globales.</td></tr>}
                    {tarifas.map(t => (
                      <tr key={t.id}>
                        <td style={{ fontWeight: 600, color: 'white' }}>{t.rol}</td>
                        <td style={{ color: 'var(--accent-yellow)', fontWeight: 700 }}>${t.precio_por_par.toLocaleString()}</td>
                        <td><button style={btnDanger} onClick={() => handleEliminarTarifaGlobal(t.id, t.rol)}>×</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── TAB: Producción ── */}
      {tab === 'Producción' && (
        <div>
          <h2>Historial de Producción en Tiempo Real</h2>
          <div className="glass-card" style={{ padding: '1.5rem' }}>
            <div style={{ overflowX: 'auto' }}>
              <table className="modern-table">
                <thead><tr><th>Hora</th><th>Operario</th><th>Orden</th><th>Proceso</th></tr></thead>
                <tbody>
                  {movements.length === 0 && <tr><td colSpan={4} style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>Sin movimientos registrados.</td></tr>}
                  {movements.map((m: any) => {
                    const dateObj = m.createdAt ? new Date(m.createdAt) : m.timestamp ? new Date(m.timestamp) : null;
                    const dateFormatted = dateObj && !isNaN(dateObj.getTime())
                      ? `${dateObj.toLocaleDateString([], { day: '2-digit', month: '2-digit' })} ${dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                      : '—';
                    
                    return (
                      <tr key={m.id}>
                        <td style={{ color: 'var(--text-secondary)' }}>
                          {dateFormatted}
                        </td>
                        <td style={{ fontWeight: 600, color: 'var(--accent-blue)' }}>{m.user?.name || `ID: ${m.userId}`}</td>
                        <td>
                          {m.batch?.order?.reference ? `${m.batch.order.reference} - ${m.batch.order.color || ''}` : '—'} 
                          <span className="badge badge-pending" style={{ marginLeft: '8px' }}>{m.batch?.id || m.batchId}</span>
                        </td>
                        <td style={{ fontWeight: 'bold', color: '#34d399' }}>{m.process?.name}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── TAB: Asistencia ── */}
      {tab === 'Asistencia' && (
        <div>
          <h2>Reloj Control de Asistencia (Jornales)</h2>
          <div className="glass-card" style={{ padding: '1.5rem' }}>
            <div style={{ overflowX: 'auto' }}>
              <table className="modern-table">
                <thead><tr><th>Fecha</th><th>Operario</th><th>Rol</th><th>Resumen Eventos</th><th>Horas Trabajadas</th><th>Estado</th></tr></thead>
                <tbody>
                  {jornadas.length === 0 && <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>Sin registros de asistencia.</td></tr>}
                  {jornadas.map((j: any) => (
                    <tr key={j.id}>
                      <td style={{ color: 'var(--text-secondary)' }}>{j.fecha}</td>
                      <td style={{ fontWeight: 600, color: 'white' }}>{j.operario}</td>
                      <td style={{ color: 'var(--text-secondary)' }}>{j.rol}</td>
                      <td style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{j.eventos}</td>
                      <td style={{ fontWeight: 'bold', color: 'var(--accent-yellow)' }}>{j.horas} h</td>
                      <td>
                        <span className={`badge ${j.estado === 'Completada' ? 'badge-completed' : 'badge-pending'}`}>
                          {j.estado.toUpperCase()}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── TAB: Avances ── */}
      {tab === 'Avances' && (
        <div className="grid-layout">
          <div className="glass-card">
            <h2>💸 Registrar Nuevo Avance</h2>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem', fontSize: '0.95rem' }}>Registra dinero prestado para descontar en la próxima nómina.</p>
            <form onSubmit={handleGuardarAdelanto}>
              <label className="modern-label">Operario
                <select className="modern-input" value={aOperario} onChange={e => setAOperario(e.target.value)} required>
                  <option value="">Seleccione operario...</option>
                  {operarios.map(o => (
                    <option key={o.id} value={o.id}>{o.nombre} ({o.rol})</option>
                  ))}
                </select>
              </label>
              <label className="modern-label">Monto ($)
                <input type="number" className="modern-input" value={aMonto} onChange={e => setAMonto(e.target.value)}
                  required placeholder="Ej. 20000" min={1} step={1000} />
              </label>
              <label className="modern-label">Observación / Nota
                <input type="text" className="modern-input" value={aObservacion} onChange={e => setAObservacion(e.target.value)}
                  placeholder="Ej. Para almuerzo..." />
              </label>
              <button type="submit" className="btn-primary" style={{ marginTop: '1rem', background: 'var(--accent-orange)' }}>Guardar Avance</button>
            </form>
          </div>

          <div>
            <h2>Historial de Avances</h2>
            <div style={{ overflowX: 'auto' }}>
              <table className="modern-table">
                <thead><tr><th>Fecha</th><th>Operario</th><th>Monto</th><th>Observación</th><th></th></tr></thead>
                <tbody>
                  {adelantos.length === 0 && <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>Sin avances registrados.</td></tr>}
                  {adelantos.map(a => (
                    <tr key={a.id}>
                      <td style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>{new Date(a.fecha).toLocaleString()}</td>
                      <td style={{ fontWeight: 600, color: 'white' }}>{a.operario}</td>
                      <td style={{ color: 'var(--accent-orange)', fontWeight: 'bold' }}>${a.monto.toLocaleString()}</td>
                      <td style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>{a.observacion || '—'}</td>
                      <td><button style={btnDanger} onClick={() => handleEliminarAdelanto(a.id)}>×</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── TAB: Nómina ── */}
      {tab === 'Nómina' && (
        <div>
          <h2>Reporte de Nómina Automatizada</h2>
          <div className="glass-card" style={{ padding: '1.5rem', borderColor: 'rgba(16,185,129,0.3)' }}>
            <div style={{ overflowX: 'auto' }}>
              <table className="modern-table">
                <thead><tr><th>Operario</th><th>Detalle Trabajo</th><th>Total Ganado</th><th>Avances</th><th>Neto a Pagar</th></tr></thead>
                <tbody>
                  {payroll.length === 0 && <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>Sin datos de nómina.</td></tr>}
                  {payroll.map((p: any) => (
                    <tr key={p.userId}>
                      <td style={{ fontWeight: 600, color: 'white' }}>{p.name}</td>
                      <td style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                        {p.totalPairs > 0 ? `${p.totalPairs} pares` : ''}
                        {p.processesCount?.['Horas Trabajadas'] ? (p.totalPairs > 0 ? ` | ` : '') + `${p.processesCount['Horas Trabajadas']} horas` : ''}
                      </td>
                      <td style={{ color: 'var(--text-secondary)' }}>
                        ${(p.totalEarned || 0).toLocaleString()}
                      </td>
                      <td style={{ color: 'var(--accent-orange)' }}>
                        {p.totalAdvances > 0 ? `-$${p.totalAdvances.toLocaleString()}` : '—'}
                      </td>
                      <td style={{ color: 'var(--accent-green)', fontWeight: 'bold', fontSize: '1.2rem' }}>
                        ${(p.netEarned || 0).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* QR Modal */}
      {selectedOrder && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(5px)',
          display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000, padding: '2rem'
        }}>
          <div className="glass-card" style={{ width: '100%', maxWidth: '800px', maxHeight: '90vh', overflowY: 'auto', position: 'relative' }}>
            <button onClick={() => setSelectedOrder(null)}
              style={{ position: 'absolute', top: '15px', right: '20px', background: 'transparent', border: 'none', color: 'white', fontSize: '2rem', cursor: 'pointer' }}>×</button>
            <h2>Códigos de Barras · {selectedOrder.id}</h2>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '2rem' }}>
              {selectedOrder.client} · {selectedOrder.reference} ({selectedOrder.color}) · Total: {selectedOrder.totalQuantity} pares
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2rem', justifyContent: 'center' }}>
              {selectedOrder.batches?.map((batch: any) => (
                <div key={batch.id} style={{ background: 'white', padding: '1rem', borderRadius: '12px', textAlign: 'center', color: '#000', width: '300px' }}>
                  <Barcode value={batch.id} height={60} width={2} fontSize={16} background="transparent" margin={10} />
                  <div style={{ fontSize: '0.95rem', color: '#666', marginTop: '5px', fontWeight: 'bold' }}>{batch.quantity} Pares</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
