'use client'

import Link from 'next/link'

export default function Home() {
  return (
    <div className="terminal-container">
      <div className="glass-card terminal-card" style={{ maxWidth: '800px', width: '100%' }}>
        <div className="terminal-header">
          <img 
            src="/logo.png" 
            alt="GRAZZIA Logo" 
            style={{ height: '80px', marginBottom: '1.5rem', filter: 'invert(1)', mixBlendMode: 'screen' }} 
          />
          <h1 style={{ fontSize: '2.5rem', letterSpacing: '1px' }}>Sistema de Producción</h1>
          <p>Selecciona el módulo al que deseas acceder</p>
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: '2rem',
          marginTop: '1rem'
        }}>
          {/* Card 1: Floor Terminal */}
          <Link href="/floor" style={{ textDecoration: 'none' }}>
            <div className="glass-card" style={{
              background: 'rgba(30, 41, 59, 0.4)',
              border: '1px solid rgba(255, 255, 255, 0.05)',
              padding: '2rem',
              borderRadius: '16px',
              cursor: 'pointer',
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              transition: 'all 0.3s ease',
              textAlign: 'center'
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.transform = 'translateY(-5px)';
              e.currentTarget.style.borderColor = 'var(--accent-blue)';
              e.currentTarget.style.boxShadow = '0 10px 20px rgba(59, 130, 246, 0.15)';
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.05)';
              e.currentTarget.style.boxShadow = 'none';
            }}
            >
              <div>
                <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🏭</div>
                <h2 style={{ fontSize: '1.4rem', color: 'white', marginBottom: '0.8rem' }}>Terminal de Operario</h2>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', lineHeight: '1.5' }}>
                  Escaneo rápido sin digitación para registrar avances de producción y pagos por día/pares.
                </p>
              </div>
              <div style={{
                marginTop: '1.5rem',
                color: 'var(--accent-blue)',
                fontWeight: '600',
                fontSize: '1rem'
              }}>
                Ingresar →
              </div>
            </div>
          </Link>

          {/* Card 2: Supervisor Dashboard */}
          <Link href="/supervisor" style={{ textDecoration: 'none' }}>
            <div className="glass-card" style={{
              background: 'rgba(30, 41, 59, 0.4)',
              border: '1px solid rgba(255, 255, 255, 0.05)',
              padding: '2rem',
              borderRadius: '16px',
              cursor: 'pointer',
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              transition: 'all 0.3s ease',
              textAlign: 'center'
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.transform = 'translateY(-5px)';
              e.currentTarget.style.borderColor = 'var(--accent-green)';
              e.currentTarget.style.boxShadow = '0 10px 20px rgba(16, 185, 129, 0.15)';
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.05)';
              e.currentTarget.style.boxShadow = 'none';
            }}
            >
              <div>
                <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📊</div>
                <h2 style={{ fontSize: '1.4rem', color: 'white', marginBottom: '0.8rem' }}>Panel de Supervisor</h2>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', lineHeight: '1.5' }}>
                  Creación de órdenes, administración de tarifas de producción, operarios y cálculo de nómina en tiempo real.
                </p>
              </div>
              <div style={{
                marginTop: '1.5rem',
                color: 'var(--accent-green)',
                fontWeight: '600',
                fontSize: '1rem'
              }}>
                Ingresar →
              </div>
            </div>
          </Link>
        </div>
      </div>
    </div>
  )
}
