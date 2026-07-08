from pydantic import BaseModel
from datetime import datetime
from typing import Optional, Dict, Literal

class EscaneoQR(BaseModel):
    qr_operario: str

class RegistroProduccion(BaseModel):
    qr_operario: str
    qr_orden: str
    pares_reportados: int

class RegistroJornadaCreate(BaseModel):
    qr_operario: str
    tipo: Literal["entrada", "salida"] = "entrada"

class UsuarioBase(BaseModel):
    nombre: str
    rol: str
    codigo_qr: Optional[str] = None
    es_admin: bool = False
    tipo_pago: Literal["por_produccion", "por_dia"] = "por_produccion"
    salario_dia: Optional[float] = None

class UsuarioCreate(UsuarioBase):
    pass

class OrdenBase(BaseModel):
    id: str
    referencia: str
    color: str
    total_pares: int
    tallas: str

class OrdenCreate(OrdenBase):
    pass
