'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'

const API = typeof window !== 'undefined' && window.location.hostname === 'localhost'
  ? 'http://localhost:8000/api/v1'
  : 'https://grazzia-backend.onrender.com/api/v1'

interface OperarioData {
  id: number
  nombre: string
  rol: string
  codigo_qr: string
  tipo_pago: string
}

interface ResumenData {
  pares_hoy: number
  ganado_hoy: number
  pares_semana: number
  ganado_semana: number
  total_adelantos_semana: number
  saldo_neto_semana: number
}

interface HistorialEntry {
  id: number
  fecha: string
  fecha_formateada: string
  lote_id: string
  orden_id: string
  cliente: string
  referencia: string
  color: string
  proceso: string
  pares: number
  valor: number
}

export default function OperarioProduccionPage() {
  const [qrCode, setQrCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  const [operariosList, setOperariosList] = useState<OperarioData[]>([])
  const [selectedOperarioId, setSelectedOperarioId] = useState<string>('')
  const [showSelectorModal, setShowSelectorModal] = useState(false)

  const [data, setData] = useState<{
    operario: OperarioData
    resumen: ResumenData
    historial: HistorialEntry[]
    detalle_referencias: Record<string, { pares: number; valor: number; proceso: string }>
  } | null>(null)

  const [activeTab, setActiveTab] = useState<'historial' | 'referencias'>('historial')
  const [searchTerm, setSearchTerm] = useState('')

  // ── FILTROS DE FECHA ──
  const [dateFilterPreset, setDateFilterPreset] = useState<'todos' | 'hoy' | 'semana' | 'mes' | 'rango'>('semana')
  const [startDateFilter, setStartDateFilter] = useState('')
  const [endDateFilter, setEndDateFilter] = useState('')

  const inputRef = useRef<HTMLInputElement>(null)

  // Cargar lista de operarios
  useEffect(() => {
    fetch(`${API}/operarios`)
      .then(res => res.json())
      .then(d => {
        if (Array.isArray(d)) {
          setOperariosList(d)
        }
      })
      .catch(() => {})
  }, [])

  const consultarProduccion = async (qr: string, opId?: string) => {
    if (!qr && !opId) return
    setLoading(true)
    setErrorMsg('')
    try {
      let url = `${API}/operario/mi-produccion?`
      if (qr) url += `qr=${encodeURIComponent(qr)}`
      else if (opId) url += `operario_id=${encodeURIComponent(opId)}`

      const res = await fetch(url)
      const resData = await res.json()

      if (!res.ok) {
        setErrorMsg(resData.detail || 'No se encontró información del operario.')
      } else {
        setData(resData)
        setSelectedOperarioId(String(resData.operario.id))
        setQrCode('')
        setShowSelectorModal(false)
      }
    } catch {
      setErrorMsg('Error de conexión con el servidor local.')
    } finally {
      setLoading(false)
    }
  }

  const handleQrKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && qrCode.trim()) {
      consultarProduccion(qrCode.trim())
    }
  }

  const getInitials = (name: string) => {
    if (!name) return 'OP'
    const parts = name.split(' ')
    if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase()
    return name.substring(0, 2).toUpperCase()
  }

  // Helper date functions
  const getTodayStr = () => new Date().toISOString().split('T')[0]

  const getWeekRange = () => {
    const d = new Date()
    const day = d.getDay()
    const diffToMonday = d.getDate() - day + (day === 0 ? -6 : 1)
    const monday = new Date(d.setDate(diffToMonday))
    const sunday = new Date(monday)
    sunday.setDate(monday.getDate() + 6)
    return {
      start: monday.toISOString().split('T')[0],
      end: sunday.toISOString().split('T')[0]
    }
  }

  const getMonthRange = () => {
    const d = new Date()
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const lastDay = new Date(y, d.getMonth() + 1, 0).getDate()
    return {
      start: `${y}-${m}-01`,
      end: `${y}-${m}-${String(lastDay).padStart(2, '0')}`
    }
  }

  // Filtrar el historial por término de búsqueda Y rango de fecha seleccionado
  const filteredHistorial = data?.historial.filter(item => {
    // 1. Filtro de Búsqueda por Texto
    if (searchTerm) {
      const term = searchTerm.toLowerCase()
      const matchesText = (
        item.orden_id.toLowerCase().includes(term) ||
        item.referencia.toLowerCase().includes(term) ||
        item.color.toLowerCase().includes(term) ||
        item.proceso.toLowerCase().includes(term)
      )
      if (!matchesText) return false
    }

    // 2. Filtro de Fecha
    const itemDateStr = item.fecha.split('T')[0] // YYYY-MM-DD

    if (dateFilterPreset === 'hoy') {
      return itemDateStr === getTodayStr()
    }
    if (dateFilterPreset === 'semana') {
      const { start, end } = getWeekRange()
      return itemDateStr >= start && itemDateStr <= end
    }
    if (dateFilterPreset === 'mes') {
      const { start, end } = getMonthRange()
      return itemDateStr >= start && itemDateStr <= end
    }
    if (dateFilterPreset === 'rango') {
      if (startDateFilter && itemDateStr < startDateFilter) return false
      if (endDateFilter && itemDateStr > endDateFilter) return false
      return true
    }

    return true // 'todos'
  }) || []

  // Métricas dinámicas calculadas para el período filtrado
  const paresFiltrados = filteredHistorial.reduce((acc, i) => acc + i.pares, 0)
  const ganadoFiltrado = filteredHistorial.reduce((acc, i) => acc + i.valor, 0)

  return (
    <div style={{ minHeight: '100vh', background: '#090D16', color: '#F3F4F6', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      <style jsx global>{`
        ::-webkit-scrollbar { width: 6px; height: 6px; }
        ::-webkit-scrollbar-track { background: rgba(0,0,0,0.2); }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.15); borderRadius: 4px; }

        .glow-card {
          background: linear-gradient(135deg, rgba(17, 24, 39, 0.8) 0%, rgba(15, 23, 42, 0.9) 100%);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 16px;
          backdrop-filter: blur(12px);
          transition: all 0.25s ease;
        }
        .glow-card:hover {
          border-color: rgba(59, 130, 246, 0.25);
        }
        .pill-tab {
          padding: 8px 18px;
          border-radius: 20px;
          font-weight: 600;
          font-size: 0.85rem;
          cursor: pointer;
          transition: all 0.2s;
          border: none;
        }
        .pill-tab.active {
          background: #3B82F6;
          color: white;
          box-shadow: 0 4px 14px rgba(59, 130, 246, 0.35);
        }
        .pill-tab.inactive {
          background: rgba(255, 255, 255, 0.05);
          color: #9CA3AF;
        }
        .pill-tab.inactive:hover {
          background: rgba(255, 255, 255, 0.1);
          color: white;
        }
        .date-chip {
          padding: 6px 14px;
          border-radius: 12px;
          font-size: 0.8rem;
          font-weight: 600;
          cursor: pointer;
          border: 1px solid rgba(255, 255, 255, 0.1);
          background: rgba(255, 255, 255, 0.04);
          color: #9CA3AF;
          transition: all 0.2s;
        }
        .date-chip.selected {
          background: rgba(59, 130, 246, 0.2);
          border-color: #3B82F6;
          color: #60A5FA;
        }
        .activity-card {
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.06);
          border-radius: 12px;
          padding: 12px 16px;
          transition: transform 0.15s, border-color 0.15s;
        }
        .activity-card:hover {
          transform: translateY(-1px);
          border-color: rgba(59, 130, 246, 0.3);
        }
      `}</style>

      {/* ── BARRA SUPERIOR ELEGANTE ── */}
      <header style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.08)', background: 'rgba(11, 15, 23, 0.85)', backdropFilter: 'blur(12px)', position: 'sticky', top: 0, zIndex: 50, padding: '12px 16px' }}>
        <div style={{ maxWidth: '1100px', margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'linear-gradient(135deg, #3B82F6, #1D4ED8)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '1.1rem', color: 'white', boxShadow: '0 0 12px rgba(59, 130, 246, 0.4)' }}>
              G
            </div>
            <div>
              <div style={{ fontWeight: 800, fontSize: '1rem', letterSpacing: '0.5px', color: 'white' }}>
                GRAZZIA <span style={{ fontSize: '0.75rem', fontWeight: 500, color: '#3B82F6', background: 'rgba(59, 130, 246, 0.15)', padding: '2px 8px', borderRadius: '12px', marginLeft: '6px' }}>MES OPERARIO</span>
              </div>
              <div style={{ fontSize: '0.72rem', color: '#9CA3AF', display: 'flex', alignItems: 'center', gap: '5px' }}>
                <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#10B981', display: 'inline-block' }}></span> Planta Activa
              </div>
            </div>
          </div>

          <Link
            href="/floor"
            style={{
              background: 'rgba(255, 255, 255, 0.06)',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              color: '#E5E7EB',
              padding: '8px 14px',
              borderRadius: '20px',
              fontSize: '0.8rem',
              fontWeight: 600,
              textDecoration: 'none',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            ⚡ Escáner Planta
          </Link>
        </div>
      </header>

      {/* ── CONTENIDO PRINCIPAL ── */}
      <main style={{ maxWidth: '1100px', margin: '0 auto', padding: '16px' }}>

        {/* ── SECCIÓN HÉROE: PERFIL DEL OPERARIO Y CAMBIO RÁPIDO ── */}
        <section className="glow-card" style={{ padding: '20px', marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px', background: 'linear-gradient(135deg, rgba(30, 41, 59, 0.6) 0%, rgba(15, 23, 42, 0.8) 100%)' }}>
          {data ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <div style={{ width: '56px', height: '56px', borderRadius: '50%', background: 'linear-gradient(135deg, #10B981, #059669)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '1.4rem', color: 'white', border: '3px solid rgba(16, 185, 129, 0.3)', boxShadow: '0 0 20px rgba(16, 185, 129, 0.25)' }}>
                {getInitials(data.operario.nombre)}
              </div>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  <h1 style={{ fontSize: '1.4rem', fontWeight: 800, margin: 0, color: 'white' }}>
                    {data.operario.nombre}
                  </h1>
                  <span style={{ background: 'rgba(245, 158, 11, 0.2)', color: '#FBBF24', border: '1px solid rgba(245, 158, 11, 0.3)', padding: '2px 10px', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 700 }}>
                    {data.operario.rol}
                  </span>
                </div>
                <div style={{ fontSize: '0.82rem', color: '#9CA3AF', marginTop: '4px' }}>
                  Código: <strong style={{ color: '#E5E7EB' }}>{data.operario.codigo_qr}</strong> • Modalidad: <strong style={{ color: '#E5E7EB' }}>{data.operario.tipo_pago === 'por_produccion' ? 'Destajo (Por Par)' : 'Día (Jornal)'}</strong>
                </div>
              </div>
            </div>
          ) : (
            <div style={{ color: '#9CA3AF', fontSize: '0.9rem' }}>
              Selecciona o escanea tu carnet de operario para consultar tu producción...
            </div>
          )}

          <button
            onClick={() => setShowSelectorModal(true)}
            style={{
              background: 'rgba(59, 130, 246, 0.15)',
              border: '1px solid rgba(59, 130, 246, 0.4)',
              color: '#60A5FA',
              padding: '10px 18px',
              borderRadius: '12px',
              fontWeight: 700,
              fontSize: '0.85rem',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px'
            }}
          >
            👤 {data ? 'Cambiar Operario' : 'Ingresar Carnet'}
          </button>
        </section>

        {/* ── MODAL / BANNER DE BÚSQUEDA DE OPERARIO ── */}
        {(showSelectorModal || !data) && (
          <div className="glow-card" style={{ padding: '20px', marginBottom: '20px', borderColor: 'rgba(59, 130, 246, 0.4)', background: 'rgba(15, 23, 42, 0.95)' }}>
            <h3 style={{ margin: '0 0 12px 0', fontSize: '1rem', color: 'white', fontWeight: 700 }}>
              🔎 Identificación del Operario
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '14px' }}>
              <div>
                <label style={{ fontSize: '0.78rem', color: '#9CA3AF', display: 'block', marginBottom: '6px', fontWeight: 600 }}>
                  📱 ESCANEAR O DIGITAR CÓDIGO CARNET:
                </label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input
                    ref={inputRef}
                    type="text"
                    placeholder="Ej: EMP-034"
                    value={qrCode}
                    onChange={e => setQrCode(e.target.value.toUpperCase())}
                    onKeyDown={handleQrKeyDown}
                    style={{
                      flex: 1,
                      background: 'rgba(0,0,0,0.4)',
                      border: '1px solid rgba(255,255,255,0.15)',
                      borderRadius: '10px',
                      padding: '10px 14px',
                      color: 'white',
                      fontSize: '16px',
                      outline: 'none'
                    }}
                  />
                  <button
                    onClick={() => consultarProduccion(qrCode.trim())}
                    disabled={loading || !qrCode.trim()}
                    style={{ background: '#3B82F6', color: 'white', border: 'none', borderRadius: '10px', padding: '0 16px', fontWeight: 700, cursor: 'pointer' }}
                  >
                    {loading ? '...' : 'Buscar'}
                  </button>
                </div>
              </div>

              <div>
                <label style={{ fontSize: '0.78rem', color: '#9CA3AF', display: 'block', marginBottom: '6px', fontWeight: 600 }}>
                  👥 SELECCIONAR DE LA LISTA DE PLANTA:
                </label>
                <select
                  value={selectedOperarioId}
                  onChange={e => {
                    const val = e.target.value
                    setSelectedOperarioId(val)
                    if (val) consultarProduccion('', val)
                  }}
                  style={{
                    width: '100%',
                    background: 'rgba(0,0,0,0.4)',
                    border: '1px solid rgba(255,255,255,0.15)',
                    borderRadius: '10px',
                    padding: '10px 14px',
                    color: 'white',
                    fontSize: '16px',
                    outline: 'none'
                  }}
                >
                  <option value="">-- Buscar Operario por Nombre --</option>
                  {operariosList.map(op => (
                    <option key={op.id} value={op.id}>
                      {op.nombre} ({op.rol}) - {op.codigo_qr}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {errorMsg && (
              <div style={{ marginTop: '12px', padding: '10px', background: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239, 68, 68, 0.4)', borderRadius: '8px', color: '#FCA5A5', fontSize: '0.85rem' }}>
                ⚠️ {errorMsg}
              </div>
            )}
          </div>
        )}

        {/* ── DATOS FINANCIEROS Y KPI (SI HAY OPERARIO SELECCIONADO) ── */}
        {data && (
          <>
            {/* CARD PRINCIPAL: DESTACADO SALDO NETO A COBRAR */}
            <div
              className="glow-card"
              style={{
                padding: '24px',
                marginBottom: '20px',
                background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.12) 0%, rgba(6, 78, 59, 0.25) 100%)',
                border: '1px solid rgba(16, 185, 129, 0.35)',
                boxShadow: '0 8px 32px rgba(16, 185, 129, 0.1)'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px' }}>
                <div>
                  <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#34D399', textTransform: 'uppercase', letterSpacing: '1px' }}>
                    💰 Saldo Neto Proyectado (Semana Actual)
                  </span>
                  <div style={{ fontSize: '2.4rem', fontWeight: 900, color: '#10B981', marginTop: '4px', letterSpacing: '-1px' }}>
                    ${data.resumen.saldo_neto_semana.toLocaleString()} <span style={{ fontSize: '1rem', color: '#9CA3AF', fontWeight: 500 }}>COP</span>
                  </div>
                  <div style={{ fontSize: '0.85rem', color: '#9CA3AF', marginTop: '4px' }}>
                    Calculado: Ganado (${data.resumen.ganado_semana.toLocaleString()}) - Adelantos (-${data.resumen.total_adelantos_semana.toLocaleString()})
                  </div>
                </div>

                <button
                  onClick={() => consultarProduccion('', String(data.operario.id))}
                  style={{ background: 'rgba(255, 255, 255, 0.08)', color: 'white', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '10px', padding: '8px 14px', fontSize: '0.8rem', cursor: 'pointer', fontWeight: 600 }}
                >
                  🔄 Actualizar Saldo
                </button>
              </div>
            </div>

            {/* SECUNDARIOS: KPI GRID 3 TARJETAS */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px', marginBottom: '24px' }}>
              {/* Hoy */}
              <div className="glow-card" style={{ padding: '16px', borderLeft: '4px solid #3B82F6' }}>
                <div style={{ fontSize: '0.78rem', color: '#9CA3AF', fontWeight: 600 }}>
                  🗓️ PRODUCCIÓN DE HOY
                </div>
                <div style={{ fontSize: '1.6rem', fontWeight: 800, color: 'white', marginTop: '6px' }}>
                  {data.resumen.pares_hoy} <span style={{ fontSize: '0.85rem', color: '#9CA3AF', fontWeight: 400 }}>pares</span>
                </div>
                <div style={{ fontSize: '0.9rem', color: '#60A5FA', fontWeight: 700, marginTop: '2px' }}>
                  = ${data.resumen.ganado_hoy.toLocaleString()}
                </div>
              </div>

              {/* Acumulado Semana */}
              <div className="glow-card" style={{ padding: '16px', borderLeft: '4px solid #F59E0B' }}>
                <div style={{ fontSize: '0.78rem', color: '#9CA3AF', fontWeight: 600 }}>
                  📆 PARES SEMANA ACTUAL
                </div>
                <div style={{ fontSize: '1.6rem', fontWeight: 800, color: 'white', marginTop: '6px' }}>
                  {data.resumen.pares_semana} <span style={{ fontSize: '0.85rem', color: '#9CA3AF', fontWeight: 400 }}>pares</span>
                </div>
                <div style={{ fontSize: '0.9rem', color: '#FBBF24', fontWeight: 700, marginTop: '2px' }}>
                  = ${data.resumen.ganado_semana.toLocaleString()}
                </div>
              </div>

              {/* Adelantos */}
              <div className="glow-card" style={{ padding: '16px', borderLeft: '4px solid #EF4444' }}>
                <div style={{ fontSize: '0.78rem', color: '#9CA3AF', fontWeight: 600 }}>
                  💸 ADELANTOS SEMANALES
                </div>
                <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#EF4444', marginTop: '6px' }}>
                  -${data.resumen.total_adelantos_semana.toLocaleString()}
                </div>
                <div style={{ fontSize: '0.78rem', color: '#9CA3AF', marginTop: '2px' }}>
                  Descontados en nomina
                </div>
              </div>
            </div>

            {/* ── SECCIÓN DETALLADA CON PESTAÑAS Y FILTRO DE FECHAS ── */}
            <div className="glow-card" style={{ padding: '20px' }}>
              {/* Pestañas de Navegación */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', marginBottom: '16px', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '14px' }}>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    className={`pill-tab ${activeTab === 'historial' ? 'active' : 'inactive'}`}
                    onClick={() => setActiveTab('historial')}
                  >
                    📦 Canastas Escaneadas ({filteredHistorial.length})
                  </button>
                  <button
                    className={`pill-tab ${activeTab === 'referencias' ? 'active' : 'inactive'}`}
                    onClick={() => setActiveTab('referencias')}
                  >
                    📊 Por Referencia ({Object.keys(data.detalle_referencias).length})
                  </button>
                </div>

                {activeTab === 'historial' && (
                  <input
                    type="text"
                    placeholder="🔍 Buscar por orden o modelo..."
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    style={{
                      background: 'rgba(0,0,0,0.3)',
                      border: '1px solid rgba(255,255,255,0.12)',
                      borderRadius: '10px',
                      padding: '8px 14px',
                      color: 'white',
                      fontSize: '0.85rem',
                      outline: 'none',
                      minWidth: '220px'
                    }}
                  />
                )}
              </div>

              {/* ── SELECTOR UNIFICADO DE FILTROS DE FECHA ── */}
              <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '12px', padding: '12px 16px', marginBottom: '20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '0.78rem', color: '#9CA3AF', fontWeight: 700, marginRight: '4px' }}>
                      📅 FILTRAR POR PERÍODO:
                    </span>
                    <button
                      className={`date-chip ${dateFilterPreset === 'hoy' ? 'selected' : ''}`}
                      onClick={() => setDateFilterPreset('hoy')}
                    >
                      ⚡ Hoy
                    </button>
                    <button
                      className={`date-chip ${dateFilterPreset === 'semana' ? 'selected' : ''}`}
                      onClick={() => setDateFilterPreset('semana')}
                    >
                      📅 Esta Semana
                    </button>
                    <button
                      className={`date-chip ${dateFilterPreset === 'mes' ? 'selected' : ''}`}
                      onClick={() => setDateFilterPreset('mes')}
                    >
                      🗓️ Este Mes
                    </button>
                    <button
                      className={`date-chip ${dateFilterPreset === 'rango' ? 'selected' : ''}`}
                      onClick={() => setDateFilterPreset('rango')}
                    >
                      🎯 Rango Personalizado
                    </button>
                    <button
                      className={`date-chip ${dateFilterPreset === 'todos' ? 'selected' : ''}`}
                      onClick={() => setDateFilterPreset('todos')}
                    >
                      🌐 Todo
                    </button>
                  </div>

                  {/* Resumen del Período Filtrado */}
                  <div style={{ fontSize: '0.82rem', color: '#34D399', fontWeight: 700, background: 'rgba(16, 185, 129, 0.1)', padding: '4px 12px', borderRadius: '10px', border: '1px solid rgba(16, 185, 129, 0.2)' }}>
                    {paresFiltrados} pares • Total: ${ganadoFiltrado.toLocaleString()}
                  </div>
                </div>

                {/* SELECTOR DE RANGO PERSONALIZADO (Aparece si dateFilterPreset === 'rango') */}
                {dateFilterPreset === 'rango' && (
                  <div style={{ marginTop: '12px', paddingTop: '10px', borderTop: '1px dashed rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ fontSize: '0.78rem', color: '#9CA3AF' }}>Desde:</span>
                      <input
                        type="date"
                        value={startDateFilter}
                        onChange={e => setStartDateFilter(e.target.value)}
                        style={{
                          background: 'rgba(0,0,0,0.4)',
                          border: '1px solid rgba(255,255,255,0.15)',
                          borderRadius: '8px',
                          padding: '6px 10px',
                          color: 'white',
                          fontSize: '0.85rem',
                          outline: 'none'
                        }}
                      />
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ fontSize: '0.78rem', color: '#9CA3AF' }}>Hasta:</span>
                      <input
                        type="date"
                        value={endDateFilter}
                        onChange={e => setEndDateFilter(e.target.value)}
                        style={{
                          background: 'rgba(0,0,0,0.4)',
                          border: '1px solid rgba(255,255,255,0.15)',
                          borderRadius: '8px',
                          padding: '6px 10px',
                          color: 'white',
                          fontSize: '0.85rem',
                          outline: 'none'
                        }}
                      />
                    </div>

                    {(startDateFilter || endDateFilter) && (
                      <button
                        onClick={() => { setStartDateFilter(''); setEndDateFilter('') }}
                        style={{ background: 'transparent', border: 'none', color: '#EF4444', fontSize: '0.78rem', cursor: 'pointer', textDecoration: 'underline' }}
                      >
                        Limpiar Rango
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* CONTENIDO 1: FEED DE CANASTAS ESCANEADAS */}
              {activeTab === 'historial' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {filteredHistorial.length === 0 && (
                    <div style={{ textAlign: 'center', color: '#9CA3AF', padding: '40px 20px', fontSize: '0.9rem' }}>
                      No se encontraron registros de producción para el período seleccionado.
                    </div>
                  )}

                  {filteredHistorial.map(item => (
                    <div key={item.id} className="activity-card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                        <div style={{ width: '42px', height: '42px', borderRadius: '10px', background: 'rgba(59, 130, 246, 0.12)', border: '1px solid rgba(59, 130, 246, 0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem' }}>
                          👟
                        </div>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ fontWeight: 800, color: '#60A5FA', fontSize: '0.95rem', fontFamily: 'monospace' }}>
                              {item.orden_id || 'SIN-ORDEN'}
                            </span>
                            <span style={{ background: 'rgba(245, 158, 11, 0.15)', color: '#FBBF24', fontSize: '0.72rem', padding: '1px 8px', borderRadius: '10px', fontWeight: 700 }}>
                              {item.proceso}
                            </span>
                          </div>
                          <div style={{ color: 'white', fontWeight: 600, fontSize: '0.9rem', marginTop: '2px' }}>
                            {item.referencia} {item.color ? <span style={{ color: '#9CA3AF', fontWeight: 400 }}>({item.color})</span> : ''}
                          </div>
                          <div style={{ fontSize: '0.75rem', color: '#9CA3AF', marginTop: '2px' }}>
                            {item.fecha_formateada} {item.cliente ? `• Cliente: ${item.cliente}` : ''}
                          </div>
                        </div>
                      </div>

                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: '1.15rem', fontWeight: 900, color: '#10B981' }}>
                          +${item.valor.toLocaleString()}
                        </div>
                        <div style={{ fontSize: '0.78rem', color: '#9CA3AF', fontWeight: 600, marginTop: '2px' }}>
                          {item.pares} pares reportados
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* CONTENIDO 2: CONSOLIDADO POR REFERENCIA */}
              {activeTab === 'referencias' && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '12px' }}>
                  {Object.keys(data.detalle_referencias).length === 0 && (
                    <div style={{ textAlign: 'center', color: '#9CA3AF', gridColumn: '1/-1', padding: '40px' }}>
                      No hay desglose por referencias disponible.
                    </div>
                  )}

                  {Object.entries(data.detalle_referencias).map(([refName, info]) => (
                    <div key={refName} className="activity-card" style={{ padding: '16px' }}>
                      <div style={{ fontWeight: 700, color: 'white', fontSize: '1rem', marginBottom: '4px' }}>
                        {refName}
                      </div>
                      <div style={{ fontSize: '0.78rem', color: '#9CA3AF', marginBottom: '12px' }}>
                        Proceso: <span style={{ color: '#FBBF24', fontWeight: 600 }}>{info.proceso}</span>
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ background: 'rgba(59, 130, 246, 0.15)', color: '#60A5FA', padding: '3px 10px', borderRadius: '12px', fontSize: '0.78rem', fontWeight: 700 }}>
                          📦 {info.pares} pares
                        </span>
                        <span style={{ color: '#10B981', fontWeight: 800, fontSize: '1.1rem' }}>
                          ${info.valor.toLocaleString()}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  )
}
