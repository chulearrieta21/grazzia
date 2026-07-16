from sqlalchemy import Column, Integer, String, Boolean, Float, ForeignKey, DateTime
from sqlalchemy.orm import relationship
from datetime import datetime, timezone, timedelta
import json
from database import Base

def colombia_now():
    return datetime.now(timezone(timedelta(hours=-5))).replace(tzinfo=None)

class Usuario(Base):
    __tablename__ = "usuarios"

    id = Column(Integer, primary_key=True, index=True)
    nombre = Column(String(100), nullable=False)
    rol = Column(String(50), nullable=False)
    es_admin = Column(Boolean, default=False)
    codigo_qr = Column(String(255), unique=True, index=True, nullable=True)
    # 'por_produccion' | 'por_dia'
    tipo_pago = Column(String(20), default="por_produccion", nullable=False)
    # Solo aplica cuando tipo_pago == 'por_dia'
    salario_dia = Column(Float, nullable=True)
    # Precio por par individual del operario
    precio_por_par = Column(Float, nullable=True)

class Orden(Base):
    __tablename__ = "ordenes"

    id = Column(String(50), primary_key=True, index=True)
    cliente = Column(String(100), nullable=True)
    referencia = Column(String(100), nullable=False)
    color = Column(String(50), nullable=False)
    suela = Column(String(100), nullable=True)
    total_pares = Column(Integer, nullable=False)
    tallas = Column(String, nullable=False) # Guardado como JSON string en SQLite
    observaciones = Column(String, nullable=True)
    marca = Column(String(100), default="GRAZZIA", nullable=True)
    estado = Column(String(20), default="PENDING")
    precio_referencia = Column(Float, nullable=True) # Precio global opcional para la orden
    fecha_creacion = Column(DateTime, default=colombia_now)
    fecha_completado = Column(DateTime, nullable=True)  # Cuando todos los procesos terminan

    lotes = relationship("Lote", back_populates="orden", cascade="all, delete-orphan")

    @property
    def tallas_dict(self):
        return json.loads(self.tallas) if self.tallas else {}
        
    @tallas_dict.setter
    def tallas_dict(self, value):
        self.tallas = json.dumps(value)

class Lote(Base):
    __tablename__ = "lotes"

    id = Column(String(50), primary_key=True, index=True) # Ej: OP-2026-001-B001
    id_orden = Column(String(50), ForeignKey("ordenes.id"), nullable=False)
    cantidad = Column(Integer, nullable=False)
    fecha_creacion = Column(DateTime, default=colombia_now)

    orden = relationship("Orden", back_populates="lotes")
    producciones = relationship("Produccion", back_populates="lote")

class PrecioLabor(Base):
    """Tarifa global por rol (fallback cuando no hay tarifa específica por referencia)."""
    __tablename__ = "precios_labor"

    id = Column(Integer, primary_key=True, index=True)
    rol = Column(String(50), unique=True, nullable=False)
    precio_por_par = Column(Float, nullable=False)


class TarifaReferencia(Base):
    """Precio específico por combinación de referencia de calzado + proceso/rol.
    Tiene prioridad sobre PrecioLabor.
    Ejemplo: Bota Casual | Cortador → $1.800/par
             Tenis Urban | Cortador → $1.200/par
    """
    __tablename__ = "tarifas_referencia"

    id = Column(Integer, primary_key=True, index=True)
    referencia = Column(String(100), nullable=False, index=True)
    rol = Column(String(50), nullable=False, index=True)
    precio_por_par = Column(Float, nullable=False)
    # Constraint: una sola tarifa por (referencia, rol)
    __table_args__ = (
        __import__('sqlalchemy').UniqueConstraint('referencia', 'rol', name='uq_referencia_rol'),
    )

class Produccion(Base):
    __tablename__ = "produccion"

    id = Column(Integer, primary_key=True, index=True)
    id_lote = Column(String(50), ForeignKey("lotes.id"), nullable=False)
    id_operario = Column(Integer, ForeignKey("usuarios.id"), nullable=False)
    proceso_realizado = Column(String(50), nullable=False)
    pares_realizados = Column(Integer, nullable=False)
    valor_pagar = Column(Float, nullable=False)
    fecha_registro = Column(DateTime, default=colombia_now)

    lote = relationship("Lote", back_populates="producciones")
    operario = relationship("Usuario")


class RegistroJornada(Base):
    """Registro de asistencia / entrada para trabajadores por día."""
    __tablename__ = "registros_jornada"

    id = Column(Integer, primary_key=True, index=True)
    id_operario = Column(Integer, ForeignKey("usuarios.id"), nullable=False)
    fecha = Column(DateTime, default=colombia_now)
    # 'entrada' | 'salida'
    tipo = Column(String(10), default="entrada", nullable=False)
    valor_dia = Column(Float, nullable=False)

    operario = relationship("Usuario")


class Adelanto(Base):
    """Adelantos o préstamos de dinero entregados a los operarios."""
    __tablename__ = "adelantos"

    id = Column(Integer, primary_key=True, index=True)
    id_operario = Column(Integer, ForeignKey("usuarios.id"), nullable=False)
    monto = Column(Float, nullable=False)
    fecha = Column(DateTime, default=colombia_now)
    observacion = Column(String, nullable=True)

    operario = relationship("Usuario")


class Proceso(Base):
    """Procesos o roles configurables por el usuario, con orden de secuencia de producción."""
    __tablename__ = "procesos"

    id = Column(Integer, primary_key=True, index=True)
    nombre = Column(String(50), unique=True, nullable=False)
    orden = Column(Integer, default=0, nullable=False)  # Posición en la secuencia de producción


class Bitacora(Base):
    """Historial de acciones realizadas en el sistema."""
    __tablename__ = "bitacora"

    id = Column(Integer, primary_key=True, index=True)
    tipo = Column(String(50), nullable=False)          # ORDEN, PRODUCCION, OPERARIO, TARIFA, PROCESO, AVANCE
    accion = Column(String(20), nullable=False)         # CREAR, EDITAR, ELIMINAR, REGISTRAR
    descripcion = Column(String(500), nullable=False)   # Texto legible del evento
    detalle = Column(String(1000), nullable=True)       # JSON / texto adicional
    fecha = Column(DateTime, default=colombia_now)
