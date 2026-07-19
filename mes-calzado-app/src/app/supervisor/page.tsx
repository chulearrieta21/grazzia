'use client'

import { useEffect, useState } from 'react'
import Barcode from 'react-barcode'
import * as XLSX from 'xlsx'

const API = typeof window !== 'undefined' && window.location.hostname === 'localhost'
  ? 'http://localhost:8000/api/v1'
  : 'https://grazzia-backend.onrender.com/api/v1'

// ── Types ────────────────────────────────────────────────────────────────────
interface Operario {
  id: number; nombre: string; rol: string; codigo_qr: string | null
  tipo_pago: 'por_produccion' | 'por_dia'; salario_dia: number | null; precio_por_par: number | null
}
interface Tarifa { id: number; rol: string; precio_por_par: number }
interface TarifaRef { id: number; referencia: string; rol: string; precio_por_par: number }
interface JornadaResumen {
  id: string
  operario: string
  rol: string
  fecha: string
  horas: number
  estado: string
  eventos: string
}
interface Proceso { id: number; nombre: string }
interface BitacoraEntry { id: number; tipo: string; accion: string; descripcion: string; detalle: string | null; fecha: string }

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

const ALL_SIZES: string[] = []
for (let i = 21; i <= 43; i++) {
  ALL_SIZES.push(i.toString())
}

const INITIAL_SIZES: Record<string, string> = {}
for (let i = 21; i <= 43; i++) {
  INITIAL_SIZES[i.toString()] = ''
}

// ── Tabs ─────────────────────────────────────────────────────────────────────
const TABS = ['Órdenes', 'Operarios', 'Procesos', 'Tarifas', 'Producción', 'Guía de Producción', 'Asistencia', 'Nómina', 'Avances', 'Historial'] as const
type Tab = typeof TABS[number]

const getCurrMonthStr = () => {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  return `${y}-${m}`
}

export default function SupervisorDashboard() {
  const [tab, setTab] = useState<Tab>('Órdenes')
  const [alert, setAlert] = useState<{ msg: string; type: 'success' | 'error' } | null>(null)
  const [selectedMonth, setSelectedMonth] = useState(getCurrMonthStr())

  // Shared data
  const [orders, setOrders] = useState<any[]>([])
  const [movements, setMovements] = useState<any[]>([])
  const [payroll, setPayroll] = useState<any[]>([])
  const [operarios, setOperarios] = useState<Operario[]>([])
  const [tarifas, setTarifas] = useState<Tarifa[]>([])
  const [tarifasRef, setTarifasRef] = useState<TarifaRef[]>([])
  const [referencias, setReferencias] = useState<string[]>([])
  const [jornadas, setJornadas] = useState<JornadaResumen[]>([])
  const [procesos, setProcesos] = useState<Proceso[]>([])
  const [bitacora, setBitacora] = useState<BitacoraEntry[]>([])
  const [bitacoraFiltroTipo, setBitacoraFiltroTipo] = useState('')
  const [guia, setGuia] = useState<{ columnas: string[]; filas: any[] }>({ columnas: [], filas: [] })
  const [guiaFiltroEstado, setGuiaFiltroEstado] = useState<'activas' | 'completadas' | 'todas'>('activas')
  const [dragProcesoIdx, setDragProcesoIdx] = useState<number | null>(null)
  const [dragOverProcesoIdx, setDragOverProcesoIdx] = useState<number | null>(null)
  // Asistencia Filters
  const [asistenciaFilterType, setAsistenciaFilterType] = useState<'todos' | 'dia' | 'semana' | 'mes' | 'año'>('todos')
  const [asistenciaFilterDia, setAsistenciaFilterDia] = useState(() => {
    const d = new Date()
    return d.toISOString().split('T')[0]
  })
  const [asistenciaFilterSemana, setAsistenciaFilterSemana] = useState('')
  const [asistenciaFilterMes, setAsistenciaFilterMes] = useState(getCurrMonthStr())
  const [asistenciaFilterAño, setAsistenciaFilterAño] = useState(() => String(new Date().getFullYear()))
  const [loading, setLoading] = useState(true)
  const [selectedForPrint, setSelectedForPrint] = useState<Set<string>>(new Set())
  const [selectedOperarios, setSelectedOperarios] = useState<Set<number>>(new Set())

  // Order form
  const [orderId, setOrderId] = useState('')
  const [client, setClient] = useState('')
  const [reference, setReference] = useState('')
  const [precioReferencia, setPrecioReferencia] = useState('')
  const [color, setColor] = useState('')
  const [sole, setSole] = useState('')
  const [marca, setMarca] = useState('GRAZZIA')
  const [sizeMap, setSizeMap] = useState<Record<string, string>>(INITIAL_SIZES)
  const [observations, setObservations] = useState('')
  const [selectedOrder, setSelectedOrder] = useState<any>(null)
  
  const [tallaInicio, setTallaInicio] = useState('21')
  const [tallaFin, setTallaFin] = useState('43')

  const handleTallaInicioChange = (val: string) => {
    setTallaInicio(val)
    const valNum = parseInt(val)
    const currentFin = parseInt(tallaFin)
    let newFin = tallaFin
    if (valNum > currentFin) {
      setTallaFin(val)
      newFin = val
    }
    
    const limitFin = parseInt(newFin)
    const newSizeMap = { ...sizeMap }
    Object.keys(newSizeMap).forEach(sz => {
      const szNum = parseInt(sz)
      if (szNum < valNum || szNum > limitFin) {
        newSizeMap[sz] = ''
      }
    })
    setSizeMap(newSizeMap)
  }

  const handleTallaFinChange = (val: string) => {
    setTallaFin(val)
    const valNum = parseInt(val)
    const currentInicio = parseInt(tallaInicio)
    let newInicio = tallaInicio
    if (valNum < currentInicio) {
      setTallaInicio(val)
      newInicio = val
    }
    
    const limitInicio = parseInt(newInicio)
    const newSizeMap = { ...sizeMap }
    Object.keys(newSizeMap).forEach(sz => {
      const szNum = parseInt(sz)
      if (szNum < limitInicio || szNum > valNum) {
        newSizeMap[sz] = ''
      }
    })
    setSizeMap(newSizeMap)
  }
  
  const [isEditingOrder, setIsEditingOrder] = useState(false)
  const [editOrderId, setEditOrderId] = useState('')

  const totalQuantity = Object.values(sizeMap).reduce((acc, val) => acc + (parseInt(val) || 0), 0).toString()

  // Operario form
  const ROLES_PERMITIDOS = procesos.map(p => p.nombre)
  const [opNombre, setOpNombre] = useState('')
  const [opRol, setOpRol] = useState('')
  const [opTipoPago, setOpTipoPago] = useState<'por_produccion' | 'por_dia'>('por_produccion')
  const [opSalarioDia, setOpSalarioDia] = useState('')
  const [opPrecioPar, setOpPrecioPar] = useState('')
  const [isEditingOperario, setIsEditingOperario] = useState(false)
  const [editOperarioId, setEditOperarioId] = useState<number | null>(null)
  // Procesos form
  const [procesoNombre, setProcesoNombre] = useState('')
  const [isEditingProceso, setIsEditingProceso] = useState(false)
  const [editProcesoId, setEditProcesoId] = useState<number | null>(null)

  // Tarifa por referencia form
  const [tRef, setTRef] = useState('')
  const [tPreciosRol, setTPreciosRol] = useState<{[key: string]: string}>({})
  // Tarifa global form
  const [tGRol, setTGRol] = useState('')
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
    fetchOrders(); fetchMovements(); fetchPayroll(selectedMonth); fetchOperarios(); fetchTarifas(); fetchTarifasRef(); fetchReferencias(); fetchJornadas(); fetchAdelantos(); fetchProcesos(); fetchBitacora(); fetchGuia(guiaFiltroEstado)
  }

  const fetchOrders = async () => {
    try { const r = await fetch(`${API}/ordenes`); setOrders(await r.json()) }
    catch { } finally { setLoading(false) }
  }
  const fetchMovements = async () => {
    try { const r = await fetch(`${API}/produccion`); const d = await r.json(); if (Array.isArray(d)) setMovements(d) }
    catch { }
  }
  const fetchPayroll = async (monthStr?: string) => {
    const targetMonth = monthStr || selectedMonth
    try { const r = await fetch(`${API}/nomina?mes=${targetMonth}`); const d = await r.json(); if (Array.isArray(d)) setPayroll(d) }
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
  const fetchProcesos = async () => {
    try { const r = await fetch(`${API}/procesos`); setProcesos(await r.json()) }
    catch { }
  }
  const fetchBitacora = async () => {
    try { const r = await fetch(`${API}/bitacora?limit=300`); setBitacora(await r.json()) }
    catch { }
  }
  const fetchGuia = async (estado: string = 'activas') => {
    try { const r = await fetch(`${API}/guia-produccion?estado=${estado}`); setGuia(await r.json()) }
    catch { }
  }

  const handleMoverProceso = async (index: number, direccion: 'up' | 'down') => {
    const nuevos = [...procesos]
    const swapIdx = direccion === 'up' ? index - 1 : index + 1
    if (swapIdx < 0 || swapIdx >= nuevos.length) return
    ;[nuevos[index], nuevos[swapIdx]] = [nuevos[swapIdx], nuevos[index]]
    const ids = nuevos.map(p => p.id)
    try {
      const r = await fetch(`${API}/procesos/reordenar`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids })
      })
      const d = await r.json()
      if (!r.ok) { showAlert(d.detail, 'error'); return }
      fetchProcesos(); fetchGuia(guiaFiltroEstado)
    } catch { showAlert('Error al reordenar los procesos.', 'error') }
  }

  const getISOWeekAndYear = (dateStr: string) => {
    const d = new Date(dateStr + 'T00:00:00')
    const dayNum = d.getDay() || 7
    d.setDate(d.getDate() + 4 - dayNum)
    const yearStart = new Date(d.getFullYear(), 0, 1)
    const weekNo = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7)
    return `${d.getFullYear()}-W${String(weekNo).padStart(2, '0')}`
  }

  const filteredJornadas = jornadas.filter((j: JornadaResumen) => {
    if (asistenciaFilterType === 'todos') return true
    if (asistenciaFilterType === 'dia') return j.fecha === asistenciaFilterDia
    if (asistenciaFilterType === 'mes') return j.fecha.startsWith(asistenciaFilterMes)
    if (asistenciaFilterType === 'año') return j.fecha.startsWith(asistenciaFilterAño)
    if (asistenciaFilterType === 'semana') {
      if (!asistenciaFilterSemana) return true
      return getISOWeekAndYear(j.fecha) === asistenciaFilterSemana
    }
    return true
  })

  const handleEliminarJornada = async (id: string, operario: string, fecha: string) => {
    if (!confirm(`¿Eliminar todos los registros de asistencia de ${operario} del día ${fecha}?`)) return
    const dashIdx = id.indexOf('-')
    if (dashIdx === -1) return
    const operarioId = id.substring(0, dashIdx)
    try {
      const r = await fetch(`${API}/jornadas?operario_id=${operarioId}&fecha=${fecha}`, {
        method: 'DELETE'
      })
      const d = await r.json()
      if (!r.ok) { showAlert(d.detail || 'Error al eliminar asistencia', 'error'); return }
      showAlert(d.mensaje || 'Asistencia eliminada', 'success')
      fetchJornadas()
    } catch {
      showAlert('Error al eliminar asistencia', 'error')
    }
  }

  const handleExportAsistenciaExcel = () => {
    if (!filteredJornadas || filteredJornadas.length === 0) {
      showAlert('No hay datos de asistencia para exportar.', 'error')
      return
    }

    const headers = [
      'Fecha',
      'Operario',
      'Rol',
      'Resumen Eventos',
      'Horas Trabajadas',
      'Estado'
    ]

    const rows = filteredJornadas.map((j: JornadaResumen) => [
      j.fecha,
      j.operario,
      j.rol,
      j.eventos,
      j.horas,
      j.estado.toUpperCase()
    ])

    const totalHoras = filteredJornadas.reduce((sum: number, j: JornadaResumen) => sum + (j.horas || 0), 0)

    rows.push([
      'TOTALES',
      '',
      '',
      '',
      totalHoras,
      ''
    ])

    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows])
    ws['!cols'] = [
      { wch: 15 },
      { wch: 25 },
      { wch: 20 },
      { wch: 35 },
      { wch: 18 },
      { wch: 15 }
    ]

    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Asistencias')

    let fileSuffix: string = asistenciaFilterType
    if (asistenciaFilterType === 'dia') fileSuffix = asistenciaFilterDia
    if (asistenciaFilterType === 'semana') fileSuffix = asistenciaFilterSemana
    if (asistenciaFilterType === 'mes') fileSuffix = asistenciaFilterMes
    if (asistenciaFilterType === 'año') fileSuffix = asistenciaFilterAño

    XLSX.writeFile(wb, `Asistencias_${fileSuffix}.xlsx`)
    showAlert('Archivo de asistencia exportado con éxito.', 'success')
  }

  useEffect(() => {
    fetchAll()
    const interval = setInterval(fetchAll, 8000)
    return () => clearInterval(interval)
  }, [selectedMonth])

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleExportExcel = () => {
    if (!payroll || payroll.length === 0) {
      showAlert('No hay datos en la nómina para exportar.', 'error')
      return
    }

    const headers = [
      'Operario',
      'Detalle Trabajo',
      'Pares Realizados',
      'Total Ganado',
      'Adelantos',
      'Neto a Pagar'
    ]

    const rows = payroll.map((p: any) => {
      const detailStr = Object.entries(p.processesCount || {})
        .map(([proc, qty]) => `${proc}: ${qty}`)
        .join(', ')
      return [
        p.name || '',
        detailStr,
        p.totalPairs || 0,
        p.totalEarned || 0,
        p.totalAdvances || 0,
        p.netEarned || 0
      ]
    })

    const totalPairs = payroll.reduce((sum: number, p: any) => sum + (p.totalPairs || 0), 0)
    const totalEarned = payroll.reduce((sum: number, p: any) => sum + (p.totalEarned || 0), 0)
    const totalAdvances = payroll.reduce((sum: number, p: any) => sum + (p.totalAdvances || 0), 0)
    const totalNet = payroll.reduce((sum: number, p: any) => sum + (p.netEarned || 0), 0)

    rows.push([
      'TOTALES',
      '',
      totalPairs,
      totalEarned,
      totalAdvances,
      totalNet
    ])

    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows])
    ws['!cols'] = [
      { wch: 25 },
      { wch: 45 },
      { wch: 15 },
      { wch: 15 },
      { wch: 15 },
      { wch: 15 }
    ]

    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Nomina')

    const fileName = `Nomina_Grazzia_${selectedMonth}.xlsx`
    XLSX.writeFile(wb, fileName)
  }

  const handleCreateOrder = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      const sizesStr = Object.entries(sizeMap)
        .filter(([_, v]) => v !== '')
        .map(([k, v]) => `${k}:${v}`).join(', ')

      const url = isEditingOrder ? `${API}/ordenes/${editOrderId}` : `${API}/ordenes`
      const method = isEditingOrder ? 'PUT' : 'POST'

      const r = await fetch(url, {
        method: method, headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: orderId, client, reference, color, sole, marca, sizes: sizesStr, observations, totalQuantity, batchSize: totalQuantity, precio_referencia: precioReferencia })
      })
      const d = await r.json()
      if (!r.ok) { showAlert(d.detail, 'error'); return }

      setOrderId(''); setClient(''); setReference(''); setColor(''); setSole(''); setMarca('GRAZZIA'); setPrecioReferencia('');
      setSizeMap(INITIAL_SIZES); 
      setObservations(''); setIsEditingOrder(false); setEditOrderId('');
      setTallaInicio('21'); setTallaFin('43');
      fetchOrders()
      showAlert(d.mensaje, 'success')
    } catch { showAlert('Error al guardar la orden.', 'error') }
  }

  const cancelEditOrder = () => {
    setOrderId(''); setClient(''); setReference(''); setColor(''); setSole(''); setMarca('GRAZZIA'); setPrecioReferencia('');
    setSizeMap(INITIAL_SIZES); 
    setObservations(''); setIsEditingOrder(false); setEditOrderId('');
    setTallaInicio('21'); setTallaFin('43');
  }

  const handleEditOrder = (o: any) => {
    setIsEditingOrder(true)
    setEditOrderId(o.id)
    setOrderId(o.id)
    setClient(o.client)
    setReference(o.reference)
    setColor(o.color)
    setSole(o.sole)
    setMarca(o.marca || '')
    setObservations(o.observations)
    setPrecioReferencia(o.precio_referencia !== null ? String(o.precio_referencia) : '')
    
    const newSizeMap = { ...INITIAL_SIZES }
    let minSz = 43
    let maxSz = 21
    let hasSizesObj = false
    if (o.sizes) {
      o.sizes.split(',').forEach((part: string) => {
        const [sz, qty] = part.trim().split(':')
        if (sz && qty) {
          newSizeMap[sz] = qty
          if (parseInt(qty) > 0) {
            const szNum = parseInt(sz)
            if (szNum < minSz) minSz = szNum
            if (szNum > maxSz) maxSz = szNum
            hasSizesObj = true
          }
        }
      })
    }
    setSizeMap(newSizeMap)
    setTallaInicio(hasSizesObj ? String(minSz) : '21')
    setTallaFin(hasSizesObj ? String(maxSz) : '43')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleCrearOperario = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      const body: any = { nombre: opNombre, rol: opRol, tipo_pago: opTipoPago }
      if (opTipoPago === 'por_dia') body.salario_dia = parseFloat(opSalarioDia)
      if (opTipoPago === 'por_produccion' && opPrecioPar.trim() !== '') body.precio_por_par = parseFloat(opPrecioPar)

      const url = isEditingOperario ? `${API}/operarios/${editOperarioId}` : `${API}/operarios`
      const method = isEditingOperario ? 'PUT' : 'POST'

      const r = await fetch(url, {
        method: method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
      })
      const d = await r.json()
      if (!r.ok) { showAlert(d.detail, 'error'); return }
      showAlert(d.mensaje, 'success')
      cancelEditOperario()
      fetchOperarios(); fetchTarifas()
    } catch { showAlert(isEditingOperario ? 'Error al actualizar operario.' : 'Error al crear operario.', 'error') }
  }

  const handleEditOperarioClick = (o: Operario) => {
    setIsEditingOperario(true)
    setEditOperarioId(o.id)
    setOpNombre(o.nombre)
    setOpRol(o.rol)
    setOpTipoPago(o.tipo_pago)
    setOpSalarioDia(o.salario_dia !== null ? String(o.salario_dia) : '')
    setOpPrecioPar(o.precio_por_par !== null ? String(o.precio_por_par) : '')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const cancelEditOperario = () => {
    setIsEditingOperario(false)
    setEditOperarioId(null)
    setOpNombre('')
    setOpRol('')
    setOpTipoPago('por_produccion')
    setOpSalarioDia('')
    setOpPrecioPar('')
  }

  const handleEditTarifaRefGroup = (ref: string, items: TarifaRef[]) => {
    setTRef(ref)
    const precios: {[key: string]: string} = {}
    
    precios['GLOBAL'] = ''
    ROLES_PERMITIDOS.forEach(rol => {
      precios[rol] = ''
    })
    
    items.forEach(t => {
      precios[t.rol] = String(t.precio_por_par)
    })
    setTPreciosRol(precios)
    
    const formEl = document.querySelector('form[onSubmit*="handleGuardarTarifaRef"]')
    if (formEl) {
      formEl.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }

  const handleEliminarOperario = async (id: number, nombre: string) => {
    if (!confirm(`¿Eliminar a ${nombre}?`)) return
    try {
      const r = await fetch(`${API}/operarios/${id}`, { method: 'DELETE' })
      const d = await r.json()
      if (!r.ok) { showAlert(d.detail, 'error'); return }
      showAlert(d.mensaje, 'success')
      const newSet = new Set(selectedOperarios)
      newSet.delete(id)
      setSelectedOperarios(newSet)
      fetchOperarios()
    } catch { showAlert('Error al eliminar operario.', 'error') }
  }

  const handleBulkDeleteOperarios = async () => {
    const ids = Array.from(selectedOperarios)
    if (ids.length === 0) return
    if (!confirm(`¿Eliminar a los ${ids.length} operarios seleccionados? Esta acción no se puede deshacer.`)) return

    let successCount = 0
    const errors: string[] = []

    for (const id of ids) {
      const operario = operarios.find(o => o.id === id)
      const nombre = operario ? operario.nombre : `ID: ${id}`
      try {
        const r = await fetch(`${API}/operarios/${id}`, { method: 'DELETE' })
        const d = await r.json()
        if (r.ok) {
          successCount++
        } else {
          errors.push(`${nombre}: ${d.detail || 'Error al eliminar'}`)
        }
      } catch {
        errors.push(`${nombre}: Error de red`)
      }
    }

    if (successCount > 0) {
      showAlert(`Se eliminaron ${successCount} operarios correctamente.`, 'success')
      setSelectedOperarios(new Set())
      fetchOperarios()
    }
    
    if (errors.length > 0) {
      showAlert(`No se pudieron eliminar algunos operarios:\n${errors.join('\n')}`, 'error')
    }
  }

  const handleDeleteOrder = async (id: string) => {
    if (!confirm(`¿Eliminar la orden ${id}? Esta acción no se puede deshacer.`)) return
    try {
      const r = await fetch(`${API}/ordenes/${id}`, { method: 'DELETE' })
      const d = await r.json()
      if (!r.ok) { showAlert(d.detail, 'error'); return }
      showAlert(d.mensaje, 'success')
      const newSet = new Set(selectedForPrint)
      newSet.delete(id)
      setSelectedForPrint(newSet)
      fetchOrders()
    } catch { showAlert('Error al eliminar la orden.', 'error') }
  }

  const handleBulkDelete = async () => {
    const ids = Array.from(selectedForPrint)
    if (ids.length === 0) return
    if (!confirm(`¿Eliminar las ${ids.length} órdenes seleccionadas? Esta acción no se puede deshacer.`)) return

    let successCount = 0
    const errors: string[] = []

    for (const id of ids) {
      try {
        const r = await fetch(`${API}/ordenes/${id}`, { method: 'DELETE' })
        const d = await r.json()
        if (r.ok) {
          successCount++
        } else {
          errors.push(`${id}: ${d.detail || 'Error al eliminar'}`)
        }
      } catch {
        errors.push(`${id}: Error de red`)
      }
    }

    if (successCount > 0) {
      showAlert(`Se eliminaron ${successCount} órdenes correctamente.`, 'success')
      setSelectedForPrint(new Set())
      fetchOrders()
    }
    
    if (errors.length > 0) {
      showAlert(`No se pudieron eliminar algunas órdenes:\n${errors.join('\n')}`, 'error')
    }
  }

  const handleDeleteProduccion = async (id: number) => {
    if (!confirm('¿Eliminar este registro de producción?')) return
    try {
      const r = await fetch(`${API}/produccion/${id}`, { method: 'DELETE' })
      const d = await r.json()
      if (!r.ok) { showAlert(d.detail, 'error'); return }
      showAlert(d.mensaje, 'success')
      fetchMovements()
      fetchPayroll()
    } catch { showAlert('Error al eliminar el registro de producción.', 'error') }
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

  const handleImportExcelTarifas = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = async (evt) => {
      try {
        const data = new Uint8Array(evt.target?.result as ArrayBuffer)
        const workbook = XLSX.read(data, { type: 'array' })
        const sheetName = workbook.SheetNames[0]
        const worksheet = workbook.Sheets[sheetName]
        
        const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][]
        if (rows.length < 2) {
          showAlert('El archivo Excel está vacío o no contiene suficientes filas.', 'error')
          return
        }

        const headers = rows[0].map(h => String(h || '').trim())
        const refIdx = headers.findIndex(h => h.toLowerCase() === 'referencia')
        if (refIdx === -1) {
          showAlert('No se encontró la columna "Referencia" en la cabecera del Excel.', 'error')
          return
        }

        const rateColumns: { colName: string, idx: number }[] = []
        headers.forEach((h, idx) => {
          if (idx !== refIdx && h) {
            rateColumns.push({ colName: h, idx })
          }
        })

        if (rateColumns.length === 0) {
          showAlert('No se encontraron columnas de procesos/tarifas.', 'error')
          return
        }

        const payload: { referencia: string, rol: string, precio: number }[] = []
        for (let i = 1; i < rows.length; i++) {
          const row = rows[i]
          if (!row || row.length === 0) continue
          
          const rawRef = row[refIdx]
          if (rawRef === undefined || rawRef === null) continue
          const referencia = String(rawRef).trim()
          if (!referencia) continue

          rateColumns.forEach(col => {
            const rawVal = row[col.idx]
            if (rawVal !== undefined && rawVal !== null && String(rawVal).trim() !== '') {
              const precio = parseFloat(String(rawVal).replace(/[$,\s]/g, ''))
              if (!isNaN(precio)) {
                payload.push({
                  referencia,
                  rol: col.colName,
                  precio
                })
              }
            }
          })
        }

        if (payload.length === 0) {
          showAlert('No se encontraron tarifas válidas para importar.', 'error')
          return
        }

        const res = await fetch(`${API}/tarifas/referencia/bulk-import`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        })
        const d = await res.json()
        if (!res.ok) {
          showAlert(d.detail || 'Error al importar tarifas.', 'error')
        } else {
          showAlert(d.mensaje, 'success')
          fetchTarifas()
          fetchTarifasRef()
          fetchReferencias()
        }
      } catch (err) {
        showAlert('Error al procesar el archivo Excel.', 'error')
        console.error(err)
      } finally {
        e.target.value = ''
      }
    }
    reader.readAsArrayBuffer(file)
  }

  const handleDownloadTemplateExcel = () => {
    const headers = ['Referencia', ...ROLES_PERMITIDOS]
    const row1 = ['0202']
    const row2 = ['1010']
    ROLES_PERMITIDOS.forEach((_, idx) => {
      row1.push(String(1200 + (idx * 100)))
      row2.push(String(1500 - (idx * 50)))
    })
    
    const data = [headers, row1, row2]
    const ws = XLSX.utils.aoa_to_sheet(data)
    ws['!cols'] = [
      { wch: 15 },
      ...ROLES_PERMITIDOS.map(r => ({ wch: Math.max(12, r.length + 2) }))
    ]
    
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Plantilla Tarifas')
    XLSX.writeFile(wb, 'Plantilla_Tarifas_Matriz.xlsx')
    showAlert('Plantilla de tarifas descargada con éxito.', 'success')
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
      setTGRol(''); setTGPrecio('')
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

  // ── Handlers: Procesos ─────────────────────────────────────────────────────
  const handleGuardarProceso = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!procesoNombre.trim()) { showAlert('El nombre del proceso es obligatorio.', 'error'); return }
    try {
      const url = isEditingProceso ? `${API}/procesos/${editProcesoId}` : `${API}/procesos`
      const method = isEditingProceso ? 'PUT' : 'POST'
      const r = await fetch(url, {
        method, headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombre: procesoNombre })
      })
      const d = await r.json()
      if (!r.ok) { showAlert(d.detail, 'error'); return }
      showAlert(d.mensaje, 'success')
      setProcesoNombre(''); setIsEditingProceso(false); setEditProcesoId(null)
      fetchProcesos()
    } catch { showAlert('Error al guardar el proceso.', 'error') }
  }

  const handleEditProcesoClick = (p: Proceso) => {
    setIsEditingProceso(true)
    setEditProcesoId(p.id)
    setProcesoNombre(p.nombre)
  }

  const cancelEditProceso = () => {
    setIsEditingProceso(false)
    setEditProcesoId(null)
    setProcesoNombre('')
  }

  const handleEliminarProceso = async (id: number, nombre: string) => {
    if (!confirm(`¿Eliminar el proceso "${nombre}"?\nSolo se puede eliminar si no está asignado a ningún operario, tarifa o registro de producción.`)) return
    try {
      const r = await fetch(`${API}/procesos/${id}`, { method: 'DELETE' })
      const d = await r.json()
      if (!r.ok) { showAlert(d.detail, 'error'); return }
      showAlert(d.mensaje, 'success')
      fetchProcesos()
    } catch { showAlert('Error al eliminar el proceso.', 'error') }
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
                  <input className="modern-input" value={orderId} onChange={e => setOrderId(e.target.value)} required placeholder="Ej. OP-2026-001" />
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
                <label className="modern-label" style={{ flex: 1 }}>Marca
                  <input className="modern-input" value={marca} onChange={e => setMarca(e.target.value)} placeholder="Ej. GRAZZIA" />
                </label>
              </div>

              <div className="flex-row" style={{ marginBottom: '1.2rem' }}>
                <label className="modern-label" style={{ flex: 1, marginBottom: 0 }}>Desde Talla
                  <select className="modern-input" value={tallaInicio} onChange={e => handleTallaInicioChange(e.target.value)}>
                    {ALL_SIZES.map(sz => (
                      <option key={sz} value={sz}>{sz}</option>
                    ))}
                  </select>
                </label>
                <label className="modern-label" style={{ flex: 1, marginBottom: 0 }}>Hasta Talla
                  <select className="modern-input" value={tallaFin} onChange={e => handleTallaFinChange(e.target.value)}>
                    {ALL_SIZES.map(sz => (
                      <option key={sz} value={sz}>{sz}</option>
                    ))}
                  </select>
                </label>
              </div>

              <label className="modern-label" style={{ marginBottom: '0.5rem' }}>Curva de Tallas (Ingresa la cantidad por talla)</label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(55px, 1fr))', gap: '5px', marginBottom: '1rem' }}>
                {Object.keys(sizeMap)
                  .filter(sz => parseInt(sz) >= parseInt(tallaInicio) && parseInt(sz) <= parseInt(tallaFin))
                  .map(sz => (
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
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '1rem' }}>
              <h2>Órdenes Activas</h2>
              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <button 
                  className="btn-primary" 
                  disabled={selectedForPrint.size === 0}
                  style={{ 
                    opacity: selectedForPrint.size === 0 ? 0.5 : 1, 
                    padding: '8px 16px', 
                    fontSize: '0.9rem',
                    cursor: selectedForPrint.size === 0 ? 'not-allowed' : 'pointer'
                  }}
                  onClick={() => {
                    window.open('/imprimir?ids=' + Array.from(selectedForPrint).join(','), '_blank')
                  }}
                >
                  🖨️ Imprimir Hojas de Ruta ({selectedForPrint.size})
                </button>
                <button 
                  className="btn-primary" 
                  disabled={selectedForPrint.size === 0}
                  style={{ 
                    opacity: selectedForPrint.size === 0 ? 0.5 : 1, 
                    padding: '8px 16px', 
                    fontSize: '0.9rem',
                    background: 'rgba(239, 68, 68, 0.15)',
                    border: '1px solid rgba(239, 68, 68, 0.4)',
                    color: '#f87171',
                    cursor: selectedForPrint.size === 0 ? 'not-allowed' : 'pointer',
                    transition: 'all 0.2s'
                  }}
                  onClick={handleBulkDelete}
                >
                  🗑️ Eliminar Seleccionadas ({selectedForPrint.size})
                </button>
              </div>
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
                        <td>
                          <div style={{ display: 'flex', gap: '0.5rem' }}>
                            <button onClick={() => handleEditOrder(o)} className="action-btn action-btn-edit">
                              ✏️ Editar
                            </button>
                            <button onClick={() => setSelectedOrder(o)} className="action-btn action-btn-codes">
                              🏷️ Códigos
                            </button>
                            <button onClick={() => window.open(`/imprimir?ids=${o.id}`, '_blank')} className="action-btn action-btn-pdf">
                              📄 PDF
                            </button>
                            <button onClick={() => handleDeleteOrder(o.id)} className="action-btn action-btn-delete">
                              🗑️ Eliminar
                            </button>
                          </div>
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
            <h2>{isEditingOperario ? '✏️ Editar Operario' : '➕ Agregar Operario'}</h2>
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
                <label className="modern-label">Precio por par ($) · Opcional
                  <input type="number" className="modern-input" value={opPrecioPar} onChange={e => setOpPrecioPar(e.target.value)}
                    placeholder="Opcional (Ej. 1500)" min={0} />
                </label>
              )}
              {opTipoPago === 'por_dia' && (
                <label className="modern-label">Salario por día ($)
                  <input type="number" className="modern-input" value={opSalarioDia} onChange={e => setOpSalarioDia(e.target.value)}
                    required placeholder="Ej. 45000" min={0} />
                </label>
              )}

              <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
                <button type="submit" className="btn-primary" style={{ flex: 1 }}>{isEditingOperario ? 'Guardar Cambios' : 'Guardar Operario'}</button>
                {isEditingOperario && (
                  <button type="button" className="btn-primary" style={{ background: '#ef4444', flex: 1 }} onClick={cancelEditOperario}>Cancelar</button>
                )}
              </div>
            </form>
          </div>

          {/* Tabla de operarios */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '1rem' }}>
              <h2 style={{ margin: 0 }}>Operarios Registrados</h2>
              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <button onClick={() => window.open('/imprimir/carnets', '_blank')} style={{
                  background: 'var(--accent-blue)', color: 'white', border: 'none',
                  padding: '8px 16px', borderRadius: '8px', cursor: 'pointer', fontSize: '0.95rem', fontWeight: 'bold'
                }}>
                  🖨️ Imprimir Carnets
                </button>
                <button 
                  className="btn-primary" 
                  disabled={selectedOperarios.size === 0}
                  style={{ 
                    opacity: selectedOperarios.size === 0 ? 0.5 : 1, 
                    padding: '8px 16px', 
                    fontSize: '0.9rem',
                    background: 'rgba(239, 68, 68, 0.15)',
                    border: '1px solid rgba(239, 68, 68, 0.4)',
                    color: '#f87171',
                    cursor: selectedOperarios.size === 0 ? 'not-allowed' : 'pointer',
                    transition: 'all 0.2s'
                  }}
                  onClick={handleBulkDeleteOperarios}
                >
                  🗑️ Eliminar Seleccionados ({selectedOperarios.size})
                </button>
              </div>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table className="modern-table">
                <thead>
                  <tr>
                    <th style={{ width: '40px', textAlign: 'center' }}>
                      <input 
                        type="checkbox" 
                        checked={operarios.length > 0 && selectedOperarios.size === operarios.length}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedOperarios(new Set(operarios.map(o => o.id)))
                          } else {
                            setSelectedOperarios(new Set())
                          }
                        }}
                      />
                    </th>
                    <th>Nombre</th><th>Rol</th><th>QR</th><th>Tipo Pago</th><th>Valor</th><th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {operarios.length === 0 && <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>Sin operarios registrados.</td></tr>}
                  {operarios.map(o => (
                    <tr key={o.id}>
                      <td style={{ textAlign: 'center' }}>
                        <input 
                          type="checkbox" 
                          checked={selectedOperarios.has(o.id)}
                          onChange={(e) => {
                            const newSet = new Set(selectedOperarios)
                            if (e.target.checked) newSet.add(o.id)
                            else newSet.delete(o.id)
                            setSelectedOperarios(newSet)
                          }}
                        />
                      </td>
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
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                          <button onClick={() => handleEditOperarioClick(o)} className="action-btn action-btn-edit" style={{ background: 'rgba(59,130,246,0.15)', border: '1px solid rgba(59,130,246,0.4)', color: '#60a5fa' }}>
                            ✏️ Editar
                          </button>
                          <button onClick={() => handleEliminarOperario(o.id, o.nombre)} className="action-btn action-btn-delete">
                            🗑️ Eliminar
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── TAB: Procesos ── */}
      {tab === 'Procesos' && (
        <div className="grid-layout">
          {/* Formulario */}
          <div className="glass-card">
            <h2>{isEditingProceso ? '✏️ Editar Proceso' : '➕ Agregar Proceso'}</h2>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem', fontSize: '0.95rem', lineHeight: 1.6 }}>
              Los procesos son las etapas del flujo de producción. Puedes crear nuevos roles, editarlos o eliminarlos si no están en uso.
            </p>
            <form onSubmit={handleGuardarProceso}>
              <label className="modern-label">Nombre del Proceso / Rol
                <input
                  className="modern-input"
                  value={procesoNombre}
                  onChange={e => setProcesoNombre(e.target.value)}
                  required
                  placeholder="Ej. Cortado, Pintado, etc."
                />
              </label>
              <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
                <button type="submit" className="btn-primary" style={{ flex: 1 }}>
                  {isEditingProceso ? '💾 Guardar Cambios' : '➕ Crear Proceso'}
                </button>
                {isEditingProceso && (
                  <button type="button" className="btn-primary" style={{ background: '#ef4444', flex: 1 }} onClick={cancelEditProceso}>
                    Cancelar
                  </button>
                )}
              </div>
            </form>
          </div>

          {/* Lista de procesos con drag & drop */}
          <div>
            <h2>Procesos Registrados</h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', marginBottom: '1rem' }}>
              🔄 Arrastra el icono <strong style={{ color: 'white' }}>⠿</strong> para reordenar los procesos. El orden aquí define la secuencia obligatoria de producción.
            </p>
            <div style={{ overflowX: 'auto' }}>
              <table className="modern-table">
                <thead>
                  <tr>
                    <th style={{ width: '40px' }}></th>
                    <th style={{ width: '50px' }}>#</th>
                    <th>Nombre del Proceso</th>
                    <th style={{ width: '180px' }}>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {procesos.length === 0 && (
                    <tr><td colSpan={4} style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>Sin procesos registrados.</td></tr>
                  )}
                  {procesos.map((p, idx) => (
                    <tr
                      key={p.id}
                      draggable
                      onDragStart={() => setDragProcesoIdx(idx)}
                      onDragOver={e => { e.preventDefault(); setDragOverProcesoIdx(idx) }}
                      onDragLeave={() => setDragOverProcesoIdx(null)}
                      onDrop={async () => {
                        if (dragProcesoIdx === null || dragProcesoIdx === idx) {
                          setDragProcesoIdx(null); setDragOverProcesoIdx(null); return
                        }
                        const nuevos = [...procesos]
                        const [movido] = nuevos.splice(dragProcesoIdx, 1)
                        nuevos.splice(idx, 0, movido)
                        const ids = nuevos.map(p => p.id)
                        setDragProcesoIdx(null); setDragOverProcesoIdx(null)
                        try {
                          const r = await fetch(`${API}/procesos/reordenar`, {
                            method: 'POST', headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ ids })
                          })
                          const d = await r.json()
                          if (!r.ok) { showAlert(d.detail, 'error'); return }
                          fetchProcesos(); fetchGuia(guiaFiltroEstado)
                        } catch { showAlert('Error al reordenar.', 'error') }
                      }}
                      onDragEnd={() => { setDragProcesoIdx(null); setDragOverProcesoIdx(null) }}
                      style={{
                        transition: 'all 0.15s ease',
                        background: dragOverProcesoIdx === idx && dragProcesoIdx !== idx
                          ? 'rgba(59,130,246,0.15)'
                          : dragProcesoIdx === idx
                          ? 'rgba(255,255,255,0.04)'
                          : undefined,
                        borderTop: dragOverProcesoIdx === idx && dragProcesoIdx !== idx && dragProcesoIdx !== null && dragProcesoIdx > idx
                          ? '2px solid #3b82f6'
                          : undefined,
                        borderBottom: dragOverProcesoIdx === idx && dragProcesoIdx !== idx && dragProcesoIdx !== null && dragProcesoIdx < idx
                          ? '2px solid #3b82f6'
                          : undefined,
                        opacity: dragProcesoIdx === idx ? 0.45 : 1,
                      }}
                    >
                      <td style={{ textAlign: 'center', cursor: 'grab', color: 'rgba(255,255,255,0.35)', fontSize: '1.1rem', userSelect: 'none' }} title="Arrastrar para reordenar">
                        ⠿
                      </td>
                      <td style={{ color: 'var(--text-secondary)', fontFamily: 'monospace', textAlign: 'center' }}>{idx + 1}</td>
                      <td style={{ fontWeight: 600, color: 'white' }}>{p.nombre}</td>
                      <td>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                          <button
                            onClick={() => handleEditProcesoClick(p)}
                            className="action-btn action-btn-edit"
                            style={{ background: 'rgba(59,130,246,0.15)', border: '1px solid rgba(59,130,246,0.4)', color: '#60a5fa' }}
                          >
                            ✏️ Editar
                          </button>
                          <button
                            onClick={() => handleEliminarProceso(p.id, p.nombre)}
                            className="action-btn action-btn-delete"
                          >
                            🗑️
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ marginTop: '1.5rem', padding: '1rem', background: 'rgba(245,158,11,0.07)', borderRadius: '10px', border: '1px solid rgba(245,158,11,0.2)' }}>
              <p style={{ color: 'var(--accent-yellow)', fontSize: '0.88rem', margin: 0 }}>
                ⚠️ <strong>Restricciones:</strong> No puedes eliminar un proceso que esté asignado a operarios, con tarifas configuradas, o con registros de producción históricos. Debes reasignar o limpiar primero esos datos.
              </p>
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
                           placeholder="$ 0" min={0} step={1} style={{ marginTop: '5px', padding: '6px' }} />
                  </label>
                  {ROLES_PERMITIDOS.map(rol => (
                    <label key={rol} className="modern-label" style={{ background: 'rgba(255,255,255,0.03)', padding: '10px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
                      {rol}
                      <input type="number" className="modern-input" value={tPreciosRol[rol] || ''} 
                             onChange={e => setTPreciosRol(prev => ({...prev, [rol]: e.target.value}))}
                             placeholder="$ 0" min={0} step={1} style={{ marginTop: '5px', padding: '6px' }} />
                    </label>
                  ))}
                </div>

                <button type="submit" className="btn-primary" style={{ marginTop: '2rem', width: '100%', padding: '12px', fontSize: '1.1rem' }}>💾 Guardar Matriz de Precios</button>
              </form>

              <div style={{
                marginTop: '2.5rem', padding: '1.5rem', border: '2px dashed rgba(255,255,255,0.12)',
                borderRadius: '12px', background: 'rgba(255,255,255,0.01)', textAlign: 'center'
              }}>
                <div style={{ fontSize: '1.8rem', marginBottom: '8px' }}>📥</div>
                <div style={{ fontWeight: 'bold', fontSize: '0.98rem', marginBottom: '6px', color: 'white' }}>Importar Tarifas Masivamente</div>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', marginBottom: '16px', lineHeight: '1.5', maxWidth: '380px', margin: '0 auto 16px' }}>
                  Carga un archivo Excel (.xlsx, .xls) con formato de matriz: columna A <strong style={{color:'white'}}>&quot;Referencia&quot;</strong> y columnas siguientes con los nombres de procesos (ej. Picado, Montado, etc.).
                </p>
                <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
                  <input type="file" accept=".xlsx, .xls" onChange={handleImportExcelTarifas} style={{ display: 'none' }} id="excel-import-tarifas-input" />
                  <label htmlFor="excel-import-tarifas-input" className="btn-primary" style={{
                    display: 'inline-block', cursor: 'pointer', background: 'var(--accent-blue)',
                    padding: '10px 20px', fontSize: '0.9rem', borderRadius: '8px', fontWeight: 600,
                    transition: 'all 0.2s'
                  }}>
                    📁 Seleccionar Excel
                  </label>
                  <button type="button" onClick={handleDownloadTemplateExcel} className="btn-primary" style={{
                    background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)',
                    color: 'white', padding: '10px 20px', fontSize: '0.9rem', borderRadius: '8px', fontWeight: 600,
                    transition: 'all 0.2s', cursor: 'pointer'
                  }}>
                    📋 Descargar Plantilla
                  </button>
                </div>
              </div>
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
                      <button onClick={() => handleEditTarifaRefGroup(ref, tarifas)}
                        style={{
                          background: 'rgba(59,130,246,0.15)', border: '1px solid rgba(59,130,246,0.3)', color: '#60a5fa',
                          padding: '4px 10px', borderRadius: '6px', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600,
                          transition: 'all 0.2s', fontFamily: 'var(--font-main)'
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.background = 'var(--accent-blue)'}
                        onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(59,130,246,0.15)'}
                      >
                        ✏️ Editar
                      </button>
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
                    required placeholder="Ej. 1200" min={0} step={1} />
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
                <thead>
                  <tr>
                    <th>Fecha / Hora</th>
                    <th>Operario</th>
                    <th>Orden</th>
                    <th>Referencia</th>
                    <th>Color</th>
                    <th>Proceso</th>
                    <th>Pares</th>
                    <th>Valor</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {movements.length === 0 && <tr><td colSpan={9} style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>Sin movimientos registrados.</td></tr>}
                  {movements.map((m: any) => {
                    const dateObj = m.createdAt ? new Date(m.createdAt) : null
                    const dateFormatted = dateObj && !isNaN(dateObj.getTime())
                      ? `${dateObj.toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: '2-digit' })} ${dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                      : '—'
                    return (
                      <tr key={m.id}>
                        <td style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', whiteSpace: 'nowrap' }}>{dateFormatted}</td>
                        <td style={{ fontWeight: 600, color: 'var(--accent-blue)' }}>{m.user?.name || `ID: ${m.userId}`}</td>
                        <td style={{ fontFamily: 'monospace', fontSize: '0.85rem' }}>
                          <span className="badge badge-pending">{m.orden || m.batch?.order?.id || m.batch?.id || '—'}</span>
                        </td>
                        <td style={{ fontWeight: 600, color: 'white' }}>{m.referencia || m.batch?.order?.reference || '—'}</td>
                        <td style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>{m.color || m.batch?.order?.color || '—'}</td>
                        <td style={{ fontWeight: 'bold', color: '#34d399' }}>{m.proceso || m.process?.name || '—'}</td>
                        <td style={{ color: 'var(--accent-yellow)', fontWeight: 700 }}>{m.pares ?? m.batch?.quantity ?? '—'}</td>
                        <td style={{ color: 'var(--accent-green)', fontWeight: 700 }}>
                          {m.valor != null ? `$${Number(m.valor).toLocaleString()}` : '—'}
                        </td>
                        <td>
                          <button style={btnDanger} onClick={() => handleDeleteProduccion(m.id)}>×</button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── TAB: Guía de Producción ── */}
      {tab === 'Guía de Producción' && (() => {
        const handleExportGuiaExcel = () => {
          if (!guia.filas.length) { showAlert('No hay datos para exportar.', 'error'); return }
          const LABEL: Record<string, string> = { activas: 'En Progreso', completadas: 'Completadas', todas: 'Todas' }
          const filas = guia.filas.map((f: any) => {
            const row: Record<string, any> = {
              'Orden': f.orden_id,
              'Referencia': f.referencia,
              'Color': f.color,
              'Cliente': f.cliente,
              'Pares': f.total_pares,
              'Estado': f.estado,
              'Fecha Creación': f.fecha_creacion ? new Date(f.fecha_creacion).toLocaleString('es-CO') : '',
              'Fecha Completado': f.fecha_completado ? new Date(f.fecha_completado).toLocaleString('es-CO') : '',
            }
            guia.columnas.forEach(col => { row[col] = f.procesos?.[col] ? '✅' : '—' })
            return row
          })
          const ws = XLSX.utils.json_to_sheet(filas)
          const wb = XLSX.utils.book_new()
          XLSX.utils.book_append_sheet(wb, ws, 'Guía')
          XLSX.writeFile(wb, `guia_produccion_${guiaFiltroEstado}_${new Date().toISOString().slice(0,10)}.xlsx`)
        }

        return (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
            <h2 style={{ margin: 0 }}>📋 Guía de Producción por Orden</h2>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <select
                className="modern-input" style={{ width: 'auto', padding: '8px 12px' }}
                value={guiaFiltroEstado}
                onChange={e => {
                  const v = e.target.value as 'activas' | 'completadas' | 'todas'
                  setGuiaFiltroEstado(v); fetchGuia(v)
                }}
              >
                <option value="activas">En progreso</option>
                <option value="completadas">Completadas</option>
                <option value="todas">Todas</option>
              </select>
              <button onClick={() => fetchGuia(guiaFiltroEstado)} className="btn-primary" style={{ background: 'rgba(255,255,255,0.1)', fontSize: '0.9rem' }}>🔄</button>
              <button
                onClick={handleExportGuiaExcel}
                className="btn-primary"
                style={{ background: 'var(--accent-green)', border: 'none', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
              >
                📊 Excel
              </button>
            </div>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table className="modern-table" style={{ minWidth: '800px' }}>
              <thead>
                <tr>
                  <th style={{ position: 'sticky', left: 0, background: 'var(--surface)', zIndex: 2, minWidth: '80px' }}>Orden</th>
                  <th style={{ minWidth: '90px' }}>Referencia</th>
                  <th style={{ minWidth: '80px' }}>Color</th>
                  <th style={{ minWidth: '60px' }}>Pares</th>
                  {guia.columnas.map(col => (
                    <th key={col} style={{ minWidth: '90px', textAlign: 'center', fontSize: '0.78rem', whiteSpace: 'nowrap', padding: '10px 8px' }}>{col}</th>
                  ))}
                  <th style={{ minWidth: '120px', textAlign: 'center' }}>Completada</th>
                </tr>
              </thead>
              <tbody>
                {guia.filas.length === 0 && (
                  <tr><td colSpan={5 + guia.columnas.length} style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '3rem' }}>Sin órdenes para mostrar.</td></tr>
                )}
                {guia.filas.map((fila: any) => {
                  const totalProcesos = guia.columnas.length
                  const completados = guia.columnas.filter(c => fila.procesos?.[c]).length
                  const porcentaje = totalProcesos > 0 ? Math.round((completados / totalProcesos) * 100) : 0
                  return (
                    <tr key={fila.orden_id}>
                      <td style={{ position: 'sticky', left: 0, background: 'var(--surface)', fontFamily: 'monospace', fontWeight: 700, color: 'var(--accent-blue)' }}>
                        {fila.orden_id}
                      </td>
                      <td style={{ fontWeight: 600, color: 'white' }}>{fila.referencia}</td>
                      <td style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>{fila.color}</td>
                      <td style={{ color: 'var(--accent-yellow)', fontWeight: 600 }}>{fila.total_pares}</td>
                      {guia.columnas.map(col => (
                        <td key={col} style={{ textAlign: 'center' }}>
                          {fila.procesos?.[col]
                            ? <span style={{ fontSize: '1.3rem' }} title={col}>✅</span>
                            : <span style={{ fontSize: '1rem', color: 'rgba(255,255,255,0.15)' }}>—</span>
                          }
                        </td>
                      ))}
                      <td style={{ textAlign: 'center' }}>
                        {fila.fecha_completado ? (
                          <div>
                            <div style={{ color: 'var(--accent-green)', fontWeight: 700, fontSize: '0.8rem' }}>
                              ✅ {new Date(fila.fecha_completado).toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: '2-digit' })}
                            </div>
                            <div style={{ color: 'var(--text-secondary)', fontSize: '0.72rem' }}>
                              {new Date(fila.fecha_completado).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </div>
                          </div>
                        ) : (
                          <div>
                            <div style={{ fontSize: '0.8rem', color: 'var(--accent-yellow)', fontWeight: 600 }}>{porcentaje}%</div>
                            <div style={{ background: 'rgba(255,255,255,0.08)', borderRadius: '4px', height: '4px', marginTop: '4px', overflow: 'hidden' }}>
                              <div style={{ height: '100%', width: `${porcentaje}%`, background: 'var(--accent-blue)', borderRadius: '4px', transition: 'width 0.4s ease' }} />
                            </div>
                          </div>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <div style={{ marginTop: '1.5rem', display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
            <div style={{ padding: '8px 16px', background: 'rgba(16,185,129,0.1)', borderRadius: '8px', border: '1px solid rgba(16,185,129,0.2)', fontSize: '0.85rem', color: 'var(--accent-green)' }}>
              ✅ = Proceso completado
            </div>
            <div style={{ padding: '8px 16px', background: 'rgba(255,255,255,0.04)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.08)', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              — = Pendiente
            </div>
            <div style={{ padding: '8px 16px', background: 'rgba(59,130,246,0.1)', borderRadius: '8px', border: '1px solid rgba(59,130,246,0.2)', fontSize: '0.85rem', color: 'var(--accent-blue)' }}>
              Las columnas se actualizan automáticamente al agregar procesos desde la pestaña Procesos.
            </div>
          </div>
        </div>
        )
      })()}

      {/* ── TAB: Asistencia ── */}
      {tab === 'Asistencia' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '1rem' }}>
            <h2>Reloj Control de Asistencia (Jornales)</h2>
            <button onClick={handleExportAsistenciaExcel} className="btn-primary" style={{ background: 'var(--accent-green)', display: 'flex', alignItems: 'center', gap: '0.5rem', border: 'none' }}>
              📊 Exportar a Excel
            </button>
          </div>

          {/* Filtros de Asistencia */}
          <div className="glass-card" style={{ padding: '1.2rem', marginBottom: '1.5rem', display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <label className="modern-label" style={{ marginBottom: 0 }}>Filtrar por:
              <select className="modern-input" value={asistenciaFilterType} onChange={e => setAsistenciaFilterType(e.target.value as any)} style={{ marginTop: '0.3rem' }}>
                <option value="todos">Todos los registros</option>
                <option value="dia">Por Día</option>
                <option value="semana">Por Semana</option>
                <option value="mes">Por Mes</option>
                <option value="año">Por Año</option>
              </select>
            </label>

            {asistenciaFilterType === 'dia' && (
              <label className="modern-label" style={{ marginBottom: 0 }}>Seleccionar Día:
                <input type="date" className="modern-input" value={asistenciaFilterDia} onChange={e => setAsistenciaFilterDia(e.target.value)} style={{ marginTop: '0.3rem' }} />
              </label>
            )}

            {asistenciaFilterType === 'semana' && (
              <label className="modern-label" style={{ marginBottom: 0 }}>Seleccionar Semana:
                <input type="week" className="modern-input" value={asistenciaFilterSemana} onChange={e => setAsistenciaFilterSemana(e.target.value)} style={{ marginTop: '0.3rem' }} />
              </label>
            )}

            {asistenciaFilterType === 'mes' && (
              <label className="modern-label" style={{ marginBottom: 0 }}>Seleccionar Mes:
                <input type="month" className="modern-input" value={asistenciaFilterMes} onChange={e => setAsistenciaFilterMes(e.target.value)} style={{ marginTop: '0.3rem' }} />
              </label>
            )}

            {asistenciaFilterType === 'año' && (
              <label className="modern-label" style={{ marginBottom: 0 }}>Seleccionar Año:
                <select className="modern-input" value={asistenciaFilterAño} onChange={e => setAsistenciaFilterAño(e.target.value)} style={{ marginTop: '0.3rem' }}>
                  {Array.from({ length: 5 }, (_, i) => String(new Date().getFullYear() - 2 + i)).map(y => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
              </label>
            )}
          </div>

          <div className="glass-card" style={{ padding: '1.5rem' }}>
            <div style={{ overflowX: 'auto' }}>
              <table className="modern-table">
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Operario</th>
                    <th>Rol</th>
                    <th>Resumen Eventos</th>
                    <th>Horas Trabajadas</th>
                    <th>Estado</th>
                    <th style={{ width: '80px', textAlign: 'center' }}>Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredJornadas.length === 0 && (
                    <tr>
                      <td colSpan={7} style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>
                        Sin registros de asistencia que coincidan con el filtro.
                      </td>
                    </tr>
                  )}
                  {filteredJornadas.map((j: JornadaResumen) => (
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
                      <td style={{ textAlign: 'center' }}>
                        <button
                          onClick={() => handleEliminarJornada(j.id, j.operario, j.fecha)}
                          style={{
                            background: 'transparent',
                            border: 'none',
                            color: 'var(--accent-red)',
                            cursor: 'pointer',
                            fontSize: '1.1rem',
                            padding: '4px'
                          }}
                          title="Eliminar asistencia del día"
                        >
                          🗑️
                        </button>
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
                  required placeholder="Ej. 20000" min={1} step={1} />
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
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
            <h2 style={{ margin: 0 }}>Reporte de Nómina Automatizada</h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <label htmlFor="payroll-month" style={{ color: 'var(--text-secondary)', fontWeight: 500, fontSize: '0.95rem' }}>Mes de Nómina:</label>
              <input
                id="payroll-month"
                type="month"
                className="modern-input"
                style={{ width: 'auto', padding: '8px 12px', minWidth: '180px' }}
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
              />
              <button
                onClick={() => window.open(`/imprimir/nomina?mes=${selectedMonth}`, '_blank')}
                className="btn-export-pdf"
              >
                Exportar PDF
              </button>
              <button
                onClick={handleExportExcel}
                className="btn-export-excel"
              >
                Exportar Excel
              </button>
            </div>
          </div>
          <div className="glass-card" style={{ padding: '1.5rem', borderColor: 'rgba(16,185,129,0.3)' }}>
            <div style={{ overflowX: 'auto' }}>
              <table className="modern-table">
                <thead>
                  <tr>
                    <th>Operario</th>
                    <th>Detalle por Referencia</th>
                    <th>Total Pares</th>
                    <th>Total Ganado</th>
                    <th>Avances</th>
                    <th>Neto a Pagar</th>
                  </tr>
                </thead>
                <tbody>
                  {payroll.length === 0 && <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>Sin datos de nómina.</td></tr>}
                  {payroll.map((p: any) => (
                    <tr key={p.userId}>
                      <td style={{ fontWeight: 600, color: 'white', verticalAlign: 'top' }}>{p.name}</td>
                      <td style={{ fontSize: '0.85rem', verticalAlign: 'top' }}>
                        {p.detalleReferencias && Object.entries(p.detalleReferencias).map(([ref, det]: [string, any]) => (
                          <div key={ref} style={{ marginBottom: '6px', padding: '4px 8px', background: 'rgba(255,255,255,0.04)', borderRadius: '6px', borderLeft: '3px solid var(--accent-blue)' }}>
                            <span style={{ color: 'white', fontWeight: 600 }}>{ref}</span>
                            <span style={{ color: 'var(--text-secondary)', marginLeft: '8px' }}>{det.proceso}</span>
                            <span style={{ color: 'var(--accent-yellow)', marginLeft: '8px' }}>{det.pares} pares</span>
                            <span style={{ color: 'var(--accent-green)', marginLeft: '8px', fontWeight: 600 }}>= ${Number(det.valor).toLocaleString()}</span>
                          </div>
                        ))}
                        {p.processesCount?.['Horas Trabajadas'] ? (
                          <div style={{ padding: '4px 8px', background: 'rgba(255,255,255,0.04)', borderRadius: '6px', borderLeft: '3px solid var(--accent-yellow)' }}>
                            <span style={{ color: 'var(--accent-yellow)', fontWeight: 600 }}>Jornales</span>
                            <span style={{ color: 'var(--text-secondary)', marginLeft: '8px' }}>{p.processesCount['Horas Trabajadas']}h trabajadas</span>
                          </div>
                        ) : null}
                      </td>
                      <td style={{ color: 'var(--accent-yellow)', fontWeight: 700, verticalAlign: 'top' }}>{p.totalPairs > 0 ? p.totalPairs : '—'}</td>
                      <td style={{ color: 'var(--text-secondary)', verticalAlign: 'top' }}>${(p.totalEarned || 0).toLocaleString()}</td>
                      <td style={{ color: 'var(--accent-orange)', verticalAlign: 'top' }}>
                        {p.totalAdvances > 0 ? `-$${p.totalAdvances.toLocaleString()}` : '—'}
                      </td>
                      <td style={{ color: 'var(--accent-green)', fontWeight: 'bold', fontSize: '1.2rem', verticalAlign: 'top' }}>
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

      {/* ── TAB: Historial ── */}
      {tab === 'Historial' && (() => {
        const TIPO_COLORS: Record<string, string> = {
          ORDEN: '#3b82f6',
          PRODUCCION: '#10b981',
          OPERARIO: '#8b5cf6',
          TARIFA: '#f59e0b',
          PROCESO: '#06b6d4',
          AVANCE: '#ef4444',
        }
        const TIPO_ICONS: Record<string, string> = {
          ORDEN: '📋', PRODUCCION: '🏭', OPERARIO: '👤', TARIFA: '💰', PROCESO: '⚙️', AVANCE: '💸'
        }
        const filteredBitacora = bitacoraFiltroTipo
          ? bitacora.filter(e => e.tipo === bitacoraFiltroTipo)
          : bitacora
        return (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
              <h2 style={{ margin: 0 }}>📋 Historial del Sistema</h2>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                <button onClick={fetchBitacora} className="btn-primary" style={{ background: 'rgba(255,255,255,0.1)', fontSize: '0.9rem' }}>🔄 Actualizar</button>
                <select className="modern-input" style={{ width: 'auto', padding: '8px 12px' }}
                  value={bitacoraFiltroTipo} onChange={e => setBitacoraFiltroTipo(e.target.value)}>
                  <option value="">Todos los eventos</option>
                  {['ORDEN','PRODUCCION','OPERARIO','TARIFA','PROCESO','AVANCE'].map(t => (
                    <option key={t} value={t}>{TIPO_ICONS[t]} {t}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="glass-card" style={{ padding: '1.5rem' }}>
              {filteredBitacora.length === 0 && (
                <div style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '3rem' }}>Sin eventos registrados.</div>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', maxHeight: '70vh', overflowY: 'auto', paddingRight: '8px' }} className="custom-scrollbar">
                {filteredBitacora.map((e: BitacoraEntry) => {
                  const fecha = new Date(e.fecha)
                  const color = TIPO_COLORS[e.tipo] || '#6b7280'
                  return (
                    <div key={e.id} style={{
                      display: 'flex', gap: '1rem', alignItems: 'flex-start',
                      padding: '12px 16px', borderRadius: '10px',
                      background: 'rgba(255,255,255,0.03)',
                      borderLeft: `4px solid ${color}`,
                    }}>
                      <div style={{ fontSize: '1.3rem', lineHeight: 1, flexShrink: 0 }}>{TIPO_ICONS[e.tipo] || '🔧'}</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap', marginBottom: '4px' }}>
                          <span style={{ background: color, color: 'white', padding: '2px 8px', borderRadius: '12px', fontSize: '0.72rem', fontWeight: 700 }}>
                            {e.tipo}
                          </span>
                          <span style={{ background: 'rgba(255,255,255,0.08)', color: 'var(--text-secondary)', padding: '2px 8px', borderRadius: '12px', fontSize: '0.72rem' }}>
                            {e.accion}
                          </span>
                          <span style={{ color: 'var(--text-secondary)', fontSize: '0.78rem', marginLeft: 'auto' }}>
                            {fecha.toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: '2-digit' })} {fecha.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                        <p style={{ margin: 0, color: 'white', fontSize: '0.9rem', lineHeight: 1.5 }}>{e.descripcion}</p>
                        {e.detalle && (
                          <p style={{ margin: '4px 0 0', color: 'var(--text-secondary)', fontSize: '0.78rem' }}>{e.detalle}</p>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        )
      })()}

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
