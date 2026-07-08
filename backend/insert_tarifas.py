import sys
import os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from database import SessionLocal
from models import TarifaReferencia

datos = """
26000	300
26001	300
26002	300
26003	300
26004	300
26005	300
26006	300
26007	300
26008	300
26009	300
26010	300
26016	300
26017	300
26018	300
26019	300
26100	300
26101	300
26102	300
26103	300
26104	300
26105	300
26106	300
26107	300
26108	300
26109	300
26110	300
26111	300
26112	300
26113	300
26114	300
26115	300
26200	300
26201	300
26202	300
26203	300
26204	300
26205	300
26206	300
26207	300
26208	300
26300	300
26301	300
26302	300
26303	300
26304	300
26305	300
26306	300
26307	300
26309	300
"""

db = SessionLocal()
lineas = datos.strip().split('\n')
agregadas = 0
rol = "Detallado"

for linea in lineas:
    partes = linea.split('\t')
    if len(partes) != 2:
        continue
    
    ref, valor = partes[0].strip(), partes[1].strip()
    
    if valor == "ANULADO":
        t = db.query(TarifaReferencia).filter(TarifaReferencia.referencia == ref, TarifaReferencia.rol == rol).first()
        if t:
            db.delete(t)
        continue
    
    try:
        precio = float(valor)
    except ValueError:
        continue
    
    t = db.query(TarifaReferencia).filter(TarifaReferencia.referencia == ref, TarifaReferencia.rol == rol).first()
    if t:
        t.precio_por_par = precio
    else:
        nueva = TarifaReferencia(referencia=ref, rol=rol, precio_por_par=precio)
        db.add(nueva)
    agregadas += 1

db.commit()
print(f"Completado. Se actualizaron/insertaron {agregadas} referencias para el rol {rol}.")
