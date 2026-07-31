from flask import Flask, request, jsonify
from flask_cors import CORS
from datetime import datetime, date, timezone, timedelta
from sqlalchemy.exc import IntegrityError
from sqlalchemy import func
from database import engine, get_db
from sqlalchemy.orm import joinedload
import models

def colombia_now():
    return datetime.now(timezone(timedelta(hours=-5))).replace(tzinfo=None)

models.Base.metadata.create_all(bind=engine)

app = Flask(__name__)
CORS(app)

# ── Helper: resolver tarifa ──────────────────────────────────────────────────
def resolver_tarifa(db, orden: models.Orden, operario: models.Usuario) -> float | None:
    """
    Jerarquía de resolución de tarifas (De mayor a menor prioridad):
    1. Tarifa específica por (Referencia, Rol)
    2. Tarifa global de la Referencia ("GLOBAL")
    3. Precio explícito de la Orden (Override)
    4. Precio individual configurado en el Operario
    5. Tarifa Global base por Rol en el sistema
    """
    especifica = db.query(models.TarifaReferencia).filter(
        func.lower(models.TarifaReferencia.referencia) == func.lower(orden.referencia),
        func.lower(models.TarifaReferencia.rol) == func.lower(operario.rol)
    ).first()
    if especifica:
        return especifica.precio_por_par

    # Tarifa Global para toda la referencia (TODOS los roles)
    global_ref = db.query(models.TarifaReferencia).filter(
        func.lower(models.TarifaReferencia.referencia) == func.lower(orden.referencia),
        func.lower(models.TarifaReferencia.rol) == "global"
    ).first()
    if global_ref:
        return global_ref.precio_por_par

    if orden.precio_referencia is not None:
        return orden.precio_referencia

    if operario.precio_por_par is not None:
        return operario.precio_por_par

    global_tarifa = db.query(models.PrecioLabor).filter(
        func.lower(models.PrecioLabor.rol) == func.lower(operario.rol)
    ).first()
    return global_tarifa.precio_por_par if global_tarifa else None


def registrar_bitacora(db, tipo: str, accion: str, descripcion: str, detalle: str = None):
    """Registra una acción en la bitácora del sistema."""
    try:
        entrada = models.Bitacora(
            tipo=tipo, accion=accion,
            descripcion=descripcion, detalle=detalle
        )
        db.add(entrada)
        # No hacemos commit aquí, se hace junto con la acción principal
    except Exception:
        pass  # No bloquear si falla el log


def calcular_resumen_operario(db, operario_id: int):
    """Calcula la producción del día y el acumulado de la nómina semanal para un operario."""
    operario = db.query(models.Usuario).filter(models.Usuario.id == operario_id).first()
    if not operario:
        return {}

    c_now = colombia_now()
    hoy_inicio = datetime(c_now.year, c_now.month, c_now.day)
    lunes_inicio = hoy_inicio - timedelta(days=hoy_inicio.weekday())

    if operario.tipo_pago == "por_produccion":
        prods_hoy = db.query(models.Produccion).filter(
            models.Produccion.id_operario == operario.id,
            models.Produccion.fecha_registro >= hoy_inicio
        ).all()
        pares_hoy = sum(p.pares_realizados for p in prods_hoy)
        ganado_hoy = sum(p.valor_pagar for p in prods_hoy)

        prods_semana = db.query(models.Produccion).filter(
            models.Produccion.id_operario == operario.id,
            models.Produccion.fecha_registro >= lunes_inicio
        ).all()
        pares_semana = sum(p.pares_realizados for p in prods_semana)
        ganado_semana = sum(p.valor_pagar for p in prods_semana)
    else:
        jornada_hoy = db.query(models.RegistroJornada).filter(
            models.RegistroJornada.id_operario == operario.id,
            models.RegistroJornada.fecha >= hoy_inicio
        ).first()
        pares_hoy = 0
        ganado_hoy = float(operario.salario_dia or 0.0) if jornada_hoy else 0.0

        jornadas_semana = db.query(models.RegistroJornada).filter(
            models.RegistroJornada.id_operario == operario.id,
            models.RegistroJornada.fecha >= lunes_inicio,
            models.RegistroJornada.tipo == "entrada"
        ).all()
        dias_unicos = len(set(j.fecha.date() for j in jornadas_semana))
        pares_semana = 0
        ganado_semana = float(dias_unicos * (operario.salario_dia or 0.0))

    adelantos_semana = db.query(models.Adelanto).filter(
        models.Adelanto.id_operario == operario.id,
        models.Adelanto.fecha >= lunes_inicio
    ).all()
    total_adelantos = sum(a.monto for a in adelantos_semana)

    return {
        "pares_hoy": pares_hoy,
        "ganado_hoy": ganado_hoy,
        "pares_semana": pares_semana,
        "ganado_semana": ganado_semana,
        "total_adelantos_semana": total_adelantos,
        "saldo_neto_semana": ganado_semana - total_adelantos
    }


# ── Datos de ejemplo ────────────────────────────────────────────────────────
with next(get_db()) as db:
    if not db.query(models.Proceso).first():
        default_procesos = ['Picado', 'Picador Auxiliar', 'Guarnizado', 'Recamado', 'Montado', 'Pegado', 'Forrado', 'Detallado', 'Despachado', 'Independiente']
        for p_name in default_procesos:
            db.add(models.Proceso(nombre=p_name))
        db.commit()

    if not db.query(models.Usuario).first():
        db.add(models.Usuario(nombre="Fabián", rol="Cortador",  es_admin=False, codigo_qr="EMP-001", tipo_pago="por_produccion"))
        db.add(models.Usuario(nombre="Carlos", rol="Pegador",   es_admin=False, codigo_qr="EMP-002", tipo_pago="por_produccion"))
        db.add(models.Usuario(nombre="Laura",  rol="Auxiliar",  es_admin=False, codigo_qr="EMP-003", tipo_pago="por_dia", salario_dia=45000))
        db.add(models.Usuario(nombre="Andrés", rol="Supervisor",es_admin=False, codigo_qr="EMP-004", tipo_pago="por_dia", salario_dia=65000))
        db.add(models.Usuario(nombre="Edwin",  rol="Admin",     es_admin=True,  tipo_pago="por_dia", salario_dia=0))

        # Tarifas globales por rol (fallback)
        db.add(models.PrecioLabor(rol="Cortador", precio_por_par=1200))
        db.add(models.PrecioLabor(rol="Pegador",  precio_por_par=1500))

        # Tarifas específicas por referencia
        db.add(models.TarifaReferencia(referencia="Tenis Urban",  rol="Cortador", precio_por_par=1100))
        db.add(models.TarifaReferencia(referencia="Tenis Urban",  rol="Pegador",  precio_por_par=1400))
        db.add(models.TarifaReferencia(referencia="Bota Casual",  rol="Cortador", precio_por_par=1800))
        db.add(models.TarifaReferencia(referencia="Bota Casual",  rol="Pegador",  precio_por_par=2100))

        db.add(models.Orden(
            id="OP-0462", cliente="GANGAZO", referencia="Tenis Urban", color="Blanco",
            total_pares=9, tallas='38:2, 39:5, 40:2'
        ))
        db.add(models.Lote(id="OP-0462-B001", id_orden="OP-0462", cantidad=9))
        db.commit()


# ── Escaneo QR de operario ───────────────────────────────────────────────────
@app.route("/api/v1/qr/escanear", methods=["POST"])
def escanear_qr():
    datos = request.json
    qr_operario = datos.get("qr_operario")

    with next(get_db()) as db:
        operario = db.query(models.Usuario).filter(models.Usuario.codigo_qr == qr_operario).first()
        if not operario:
            return jsonify({"detail": "QR no reconocido. Operario no encontrado."}), 404

        resumen = calcular_resumen_operario(db, operario.id)

        # ── Por producción ────────────────────────────────────────────────
        if operario.tipo_pago == "por_produccion":
            return jsonify({
                "tipo_pago": "por_produccion",
                "operario": {"id": operario.id, "nombre": operario.nombre, "rol": operario.rol, "codigo_qr": operario.codigo_qr},
                "instruccion": "Escanea el QR de la Orden de Producción para ver tu tarifa específica.",
                "accion_requerida": "escanear_orden",
                "resumen": resumen
            }), 200

        # ── Por día ───────────────────────────────────────────────────────
        c_now = colombia_now()
        hoy = c_now.date()
        ultimo_registro = db.query(models.RegistroJornada).filter(
            models.RegistroJornada.id_operario == operario.id,
            models.RegistroJornada.fecha >= datetime(hoy.year, hoy.month, hoy.day)
        ).order_by(models.RegistroJornada.fecha.desc()).first()

        if ultimo_registro and ultimo_registro.tipo == "entrada":
            tipo_a_registrar = "salida"
        else:
            tipo_a_registrar = "entrada"
        db.add(models.RegistroJornada(
            id_operario=operario.id, fecha=c_now,
            tipo=tipo_a_registrar, valor_dia=operario.salario_dia or 0
        ))
        db.commit()

        # Recalcular resumen tras registrar jornada por día
        resumen = calcular_resumen_operario(db, operario.id)

        return jsonify({
            "tipo_pago": "por_dia",
            "operario": {"id": operario.id, "nombre": operario.nombre, "rol": operario.rol, "codigo_qr": operario.codigo_qr},
            "evento_registrado": tipo_a_registrar,
            "salario_dia": operario.salario_dia,
            "hora": c_now.strftime("%H:%M:%S"),
            "fecha": hoy.strftime("%Y-%m-%d"),
            "mensaje": f"{'Entrada' if tipo_a_registrar == 'entrada' else 'Salida'} registrada para {operario.nombre}. Valor del día: ${operario.salario_dia:,.0f}",
            "accion_requerida": "ninguna",
            "resumen": resumen
        }), 200


# ── Órdenes ────────────────────────────────────────────────────────────────
@app.route("/api/v1/ordenes", methods=["GET"])
def listar_ordenes():
    ids_param = request.args.get("ids")
    with next(get_db()) as db:
        query = db.query(models.Orden).options(joinedload(models.Orden.lotes))
        if ids_param:
            ids_list = ids_param.split(",")
            query = query.filter(models.Orden.id.in_(ids_list))
        ordenes = query.order_by(models.Orden.fecha_creacion.desc()).all()
        resultado = []
        for o in ordenes:
            batches = [{"id": l.id, "quantity": l.cantidad} for l in o.lotes]
            resultado.append({
                "id": o.id, "client": o.cliente or "", "reference": o.referencia,
                "color": o.color, "sole": o.suela or "", "marca": o.marca or "GRAZZIA", "totalQuantity": o.total_pares,
                "sizes": o.tallas, "observations": o.observaciones or "", "status": o.estado,
                "precio_referencia": o.precio_referencia,
                "batches": batches
            })
        return jsonify(resultado)

@app.route("/api/v1/ordenes", methods=["POST"])
def crear_orden():
    datos = request.json
    with next(get_db()) as db:
        if db.query(models.Orden).filter(models.Orden.id == datos["id"]).first():
            return jsonify({"detail": "La orden ya existe"}), 400

        precio_ref_raw = datos.get("precio_referencia")
        precio_ref = float(precio_ref_raw) if precio_ref_raw not in [None, ""] else None

        orden = models.Orden(
            id=datos["id"],
            cliente=datos.get("client", ""),
            referencia=datos["reference"],
            color=datos["color"],
            suela=datos.get("sole", ""),
            marca=str(datos.get("marca") or "GRAZZIA").strip() or "GRAZZIA",
            total_pares=int(datos["totalQuantity"]),
            tallas=datos.get("sizes", ""),
            observaciones=datos.get("observations", ""),
            precio_referencia=precio_ref
        )
        db.add(orden)
        
        batch_size = int(datos.get("batchSize", 12))
        total = int(datos["totalQuantity"])
        num_lotes = (total + batch_size - 1) // batch_size
        
        remaining = total
        for i in range(1, num_lotes + 1):
            qty = min(remaining, batch_size)
            lote_id = f"{orden.id}-B{i:03d}"
            db.add(models.Lote(id=lote_id, id_orden=orden.id, cantidad=qty))
            remaining -= qty
            
        db.commit()
        registrar_bitacora(db, "ORDEN", "CREAR", f"Orden '{orden.id}' creada para cliente '{orden.cliente}', referencia '{orden.referencia}', {orden.total_pares} pares")
        db.commit()
        return jsonify({"mensaje": "Orden y lotes creados"}), 201

# ── Editar orden ────────────────────────────────────────────────────────────
@app.route("/api/v1/ordenes/<orden_id>", methods=["PUT"])
def editar_orden(orden_id):
    datos = request.json
    with next(get_db()) as db:
        orden = db.query(models.Orden).filter(models.Orden.id == orden_id).first()
        if not orden:
            return jsonify({"detail": "La orden no existe"}), 404

        precio_ref_raw = datos.get("precio_referencia")
        precio_ref = float(precio_ref_raw) if precio_ref_raw not in [None, ""] else None

        nuevo_id = datos.get("id")
        if nuevo_id:
            nuevo_id = str(nuevo_id).strip()

        if nuevo_id and nuevo_id != orden_id:
            existe = db.query(models.Orden).filter(models.Orden.id == nuevo_id).first()
            if existe:
                return jsonify({"detail": f"El número de orden '{nuevo_id}' ya está en uso."}), 400

            nueva_orden = models.Orden(
                id=nuevo_id,
                cliente=datos.get("client", orden.cliente),
                referencia=datos.get("reference", orden.referencia),
                color=datos.get("color", orden.color),
                suela=datos.get("sole", orden.suela),
                marca=str(datos.get("marca", orden.marca) or "GRAZZIA").strip() or "GRAZZIA",
                total_pares=orden.total_pares,
                tallas=orden.tallas,
                observaciones=datos.get("observations", orden.observaciones),
                estado=orden.estado,
                precio_referencia=precio_ref,
                fecha_creacion=orden.fecha_creacion
            )

            if "totalQuantity" in datos:
                nuevo_total = int(datos["totalQuantity"])
                nueva_orden.total_pares = nuevo_total
                nueva_orden.tallas = datos.get("sizes", orden.tallas)
                
                db.add(nueva_orden)
                db.flush()

                nuevo_lote_id = f"{nuevo_id}-B001"
                nuevo_lote = models.Lote(
                    id=nuevo_lote_id,
                    id_orden=nuevo_id,
                    cantidad=nuevo_total
                )
                db.add(nuevo_lote)
                db.flush()

                lotes_viejos = db.query(models.Lote).filter(models.Lote.id_orden == orden_id).order_by(models.Lote.id.asc()).all()
                if lotes_viejos:
                    db.query(models.Produccion).filter(models.Produccion.id_lote == lotes_viejos[0].id).update(
                        {models.Produccion.id_lote: nuevo_lote_id},
                        synchronize_session=False
                    )
            else:
                db.add(nueva_orden)
                db.flush()

                lotes_viejos = db.query(models.Lote).filter(models.Lote.id_orden == orden_id).all()
                for lote in lotes_viejos:
                    lote_suffix = lote.id[len(orden_id):]
                    nuevo_lote_id = f"{nuevo_id}{lote_suffix}"

                    nuevo_lote = models.Lote(
                        id=nuevo_lote_id,
                        id_orden=nuevo_id,
                        cantidad=lote.cantidad,
                        fecha_creacion=lote.fecha_creacion
                    )
                    db.add(nuevo_lote)
                    db.flush()

                    db.query(models.Produccion).filter(models.Produccion.id_lote == lote.id).update(
                        {models.Produccion.id_lote: nuevo_lote_id},
                        synchronize_session=False
                    )

            db.delete(orden)
        else:
            orden.cliente = datos.get("client", orden.cliente)
            orden.referencia = datos.get("reference", orden.referencia)
            orden.color = datos.get("color", orden.color)
            orden.suela = datos.get("sole", orden.suela)
            orden.marca = str(datos.get("marca", orden.marca) or "GRAZZIA").strip() or "GRAZZIA"
            orden.observaciones = datos.get("observations", orden.observaciones)
            orden.precio_referencia = precio_ref

            if "totalQuantity" in datos:
                nuevo_total = int(datos["totalQuantity"])
                orden.total_pares = nuevo_total
                orden.tallas = datos.get("sizes", orden.tallas)

                lotes = db.query(models.Lote).filter(models.Lote.id_orden == orden_id).order_by(models.Lote.id).all()
                if lotes:
                    for i, lote in enumerate(lotes):
                        if i == 0:
                            lote.cantidad = nuevo_total
                        else:
                            db.delete(lote)
                else:
                    db.add(models.Lote(id=f"{orden.id}-B001", id_orden=orden.id, cantidad=nuevo_total))

        db.commit()
        return jsonify({"mensaje": "Orden actualizada exitosamente"}), 200

# ── Eliminar orden ──────────────────────────────────────────────────────────
@app.route("/api/v1/ordenes/<orden_id>", methods=["DELETE"])
def eliminar_orden(orden_id):
    with next(get_db()) as db:
        orden = db.query(models.Orden).filter(models.Orden.id == orden_id).first()
        if not orden:
            return jsonify({"detail": "La orden no existe."}), 404
        try:
            db.delete(orden)
            db.commit()
            return jsonify({"mensaje": f"Orden '{orden_id}' eliminada correctamente."})
        except IntegrityError:
            db.rollback()
            return jsonify({"detail": "No se puede eliminar la orden porque ya tiene producción registrada."}), 400

# ── Registrar producción (destajo) ──────────────────────────────────────────
@app.route("/api/v1/produccion/registrar", methods=["POST"])
def registrar_produccion():
    datos = request.json
    qr_operario      = datos.get("qr_operario")
    qr_orden         = datos.get("qr_orden") # Esto ahora es el ID del Lote/Canasta
    pares_reportados = datos.get("pares_reportados")

    with next(get_db()) as db:
        operario = db.query(models.Usuario).filter(models.Usuario.codigo_qr == qr_operario).first()
        if not operario:
            return jsonify({"detail": "Operario no encontrado."}), 404
        if operario.tipo_pago != "por_produccion":
            return jsonify({"detail": f"{operario.nombre} trabaja por día, no por producción."}), 400

        lote = db.query(models.Lote).filter(models.Lote.id == qr_orden).first()
        if not lote:
            orden = db.query(models.Orden).filter(models.Orden.id == qr_orden).first()
            if orden:
                lote = db.query(models.Lote).filter(models.Lote.id_orden == orden.id).order_by(models.Lote.id.asc()).first()
                if not lote:
                    lote = models.Lote(id=f"{orden.id}-B001", id_orden=orden.id, cantidad=orden.total_pares)
                    db.add(lote)
                    db.flush()
            else:
                return jsonify({"detail": f"Lote/Canasta u Orden '{qr_orden}' no existe."}), 404
        else:
            orden = lote.orden
        
        # Si no se envía pares_reportados, se asume que se procesó el lote completo
        if pares_reportados is None:
            pares_reportados = lote.cantidad
            
        if pares_reportados > lote.cantidad:
            return jsonify({"detail": f"Fraude detectado: {pares_reportados} > {lote.cantidad} pares del lote."}), 400

        # Verificar si otro operario diferente ya registró este mismo proceso/rol para esta orden
        prod_otra = db.query(models.Produccion).join(models.Lote).filter(
            models.Lote.id_orden == orden.id,
            models.Produccion.proceso_realizado == operario.rol,
            models.Produccion.id_operario != operario.id
        ).first()
        if prod_otra:
            nombre_otro = prod_otra.operario.nombre if prod_otra.operario else f"ID: {prod_otra.id_operario}"
            return jsonify({"detail": f"Conflicto de Rol: El proceso '{operario.rol}' en esta orden ya fue registrado por {nombre_otro}."}), 400

        if db.query(models.Produccion).filter(
            models.Produccion.id_lote == lote.id,
            models.Produccion.proceso_realizado == operario.rol
        ).first():
            return jsonify({"detail": f"Doble cobro: '{operario.rol}' ya fue registrado en {lote.id}."}), 400

        # ── Validar orden de procesos ──────────────────────────────────────────
        proceso_actual = db.query(models.Proceso).filter(
            func.lower(models.Proceso.nombre) == func.lower(operario.rol)
        ).first()
        if proceso_actual:
            # Obtener el proceso anterior en secuencia
            proceso_anterior = db.query(models.Proceso).filter(
                models.Proceso.orden < proceso_actual.orden
            ).order_by(models.Proceso.orden.desc()).first()

            if proceso_anterior:
                # Verificar si el proceso anterior fue completado para esta orden
                completado_anterior = db.query(models.Produccion).join(models.Lote).filter(
                    models.Lote.id_orden == orden.id,
                    func.lower(models.Produccion.proceso_realizado) == func.lower(proceso_anterior.nombre)
                ).first()
                if not completado_anterior:
                    return jsonify({
                        "detail": f"Orden de proceso incumplida: el proceso anterior '{proceso_anterior.nombre}' aun no ha sido completado para la orden '{orden.id}'."
                    }), 400
        # ──────────────────────────────────────────────────────────────────────

        precio = resolver_tarifa(db, orden, operario)
        if precio is None:
            return jsonify({"detail": f"No hay tarifa configurada para '{operario.rol}' en '{orden.referencia}'."}), 400

        valor_total = precio * pares_reportados
        prod = models.Produccion(
            id_lote=lote.id, id_operario=operario.id,
            proceso_realizado=operario.rol, pares_realizados=pares_reportados,
            valor_pagar=valor_total, fecha_registro=colombia_now()
        )
        db.add(prod)
        registrar_bitacora(db, "PRODUCCION", "REGISTRAR",
            f"{operario.nombre} ({operario.rol}) registr\u00f3 {pares_reportados} pares de la orden '{orden.id}' (Ref: {orden.referencia}) a ${precio:,.0f}/par. Total: ${valor_total:,.0f}",
            f"lote={lote.id}, operario_id={operario.id}"
        )
        db.flush()  # Persist prod before checking completion

        # ── Verificar si todos los procesos están completos para marcar la orden ──
        todos_procesos = db.query(models.Proceso).order_by(models.Proceso.orden.asc()).all()
        nombres_todos = {p.nombre.lower() for p in todos_procesos}
        producciones_orden = db.query(models.Produccion).join(models.Lote).filter(
            models.Lote.id_orden == orden.id
        ).all()
        completados = {p.proceso_realizado.lower() for p in producciones_orden}
        if nombres_todos and nombres_todos.issubset(completados):
            orden.estado = "COMPLETADA"
            orden.fecha_completado = colombia_now()
            registrar_bitacora(db, "ORDEN", "COMPLETAR",
                f"Orden '{orden.id}' (Ref: {orden.referencia}) completada. Todos los procesos finalizados."
            )
        # ──────────────────────────────────────────────────────────────────────

        db.commit()
        resumen = calcular_resumen_operario(db, operario.id)
        return jsonify({
            "mensaje": "Producción registrada",
            "referencia": orden.referencia,
            "tarifa_aplicada": precio,
            "pares": pares_reportados,
            "valor_ganado": valor_total,
            "operario": operario.nombre,
            "proceso": operario.rol,
            "resumen": resumen
        })

# ── Eliminar producción ──────────────────────────────────────────────────────
@app.route("/api/v1/produccion/<int:produccion_id>", methods=["DELETE"])
def eliminar_produccion(produccion_id):
    with next(get_db()) as db:
        prod = db.query(models.Produccion).filter(models.Produccion.id == produccion_id).first()
        if not prod:
            return jsonify({"detail": "El registro de producción no existe."}), 404
        db.delete(prod)
        db.commit()
        return jsonify({"mensaje": "Registro de producción eliminado correctamente."})


# ── Consultar tarifa antes de registrar (preview) ───────────────────────────
@app.route("/api/v1/produccion/tarifa-preview", methods=["POST"])
def tarifa_preview():
    """Devuelve la tarifa que se aplicará para (qr_operario, qr_orden)."""
    datos = request.json
    with next(get_db()) as db:
        operario = db.query(models.Usuario).filter(models.Usuario.codigo_qr == datos.get("qr_operario")).first()
        orden    = db.query(models.Orden).filter(models.Orden.id == datos.get("qr_orden")).first()
        if not operario: return jsonify({"detail": "Operario no encontrado."}), 404
        if not orden:    return jsonify({"detail": "Orden no encontrada."}), 404

        precio = resolver_tarifa(db, orden, operario)
        
        fuente = "desconocido"
        if orden.precio_referencia is not None:
            fuente = "precio_orden"
        elif db.query(models.TarifaReferencia).filter(
            models.TarifaReferencia.referencia == orden.referencia,
            models.TarifaReferencia.rol == "GLOBAL"
        ).first():
            fuente = "referencia_global"
        elif db.query(models.TarifaReferencia).filter(
            models.TarifaReferencia.referencia == orden.referencia,
            models.TarifaReferencia.rol == operario.rol
        ).first():
            fuente = "por_referencia_rol"
        elif operario.precio_por_par is not None:
            fuente = "precio_trabajador"
        else:
            fuente = "global_rol"

        return jsonify({
            "operario": operario.nombre, "rol": operario.rol,
            "orden": orden.id, "referencia": orden.referencia,
            "precio_por_par": precio,
            "fuente": fuente
        })


# ── Reportes: Producción y Nómina ─────────────────────────────────────────────
@app.route("/api/v1/produccion", methods=["GET"])
def listar_produccion():
    with next(get_db()) as db:
        producciones = db.query(models.Produccion).options(
            joinedload(models.Produccion.lote).joinedload(models.Lote.orden),
            joinedload(models.Produccion.operario)
        ).order_by(models.Produccion.fecha_registro.desc()).limit(200).all()
        resultado = []
        for p in producciones:
            orden = p.lote.orden if p.lote else None
            resultado.append({
                "id": p.id,
                "userId": str(p.operario.id),
                "user": {"name": p.operario.nombre},
                "proceso": p.proceso_realizado,
                "process": {"name": p.proceso_realizado},
                "lote": p.id_lote,
                "pares": p.pares_realizados,
                "valor": p.valor_pagar,
                "batch": {
                    "id": p.id_lote,
                    "quantity": p.pares_realizados,
                    "order": {
                        "id": orden.id if orden else None,
                        "reference": orden.referencia if orden else None,
                        "color": orden.color if orden else None,
                        "cliente": orden.cliente if orden else None,
                    }
                },
                "orden": orden.id if orden else None,
                "referencia": orden.referencia if orden else None,
                "color": orden.color if orden else None,
                "cliente": orden.cliente if orden else None,
                "createdAt": p.fecha_registro.isoformat()
            })
        return jsonify(resultado)

@app.route("/api/v1/nomina", methods=["GET"])
def calcular_nomina():
    with next(get_db()) as db:
        # Obtener parámetro de consulta 'mes' (formato YYYY-MM)
        mes_param = request.args.get("mes")
        if mes_param:
            try:
                year, month = map(int, mes_param.split("-"))
            except ValueError:
                now = colombia_now()
                year, month = now.year, now.month
        else:
            now = colombia_now()
            year, month = now.year, now.month

        quincena_param = request.args.get("quincena", "MES")

        if month == 12:
            next_month_date = datetime(year + 1, 1, 1)
        else:
            next_month_date = datetime(year, month + 1, 1)

        start_date = datetime(year, month, 1)
        if quincena_param == "Q1":
            end_date = datetime(year, month, 16)
        elif quincena_param == "Q2":
            start_date = datetime(year, month, 16)
            end_date = next_month_date
        else:
            end_date = next_month_date

        # Inicializar nomina_dict para todos los operarios activos (no admins)
        operarios = db.query(models.Usuario).filter(models.Usuario.es_admin == False).all()
        nomina_dict = {}
        for o in operarios:
            user_id = str(o.id)
            nomina_dict[user_id] = {
                "userId": user_id, "name": o.nombre,
                "totalPairs": 0, "totalEarned": 0.0, "processesCount": {},
                "totalAdvances": 0.0, "netEarned": 0.0,
                "detalleReferenciasSemanaActual": {},
                "resumenSemanasAnteriores": {"pares": 0, "valor": 0.0}
            }

        # Calcular inicio de la semana actual en Colombia (Lunes)
        c_now = colombia_now()
        hoy_inicio = datetime(c_now.year, c_now.month, c_now.day)
        lunes_actual = hoy_inicio - timedelta(days=hoy_inicio.weekday())

        # 1. Destajo (Producción)
        producciones = db.query(models.Produccion).options(
            joinedload(models.Produccion.operario),
            joinedload(models.Produccion.lote).joinedload(models.Lote.orden)
        ).filter(
            models.Produccion.fecha_registro >= start_date,
            models.Produccion.fecha_registro < end_date
        ).all()
        
        for p in producciones:
            user_id = str(p.operario.id)
            if user_id in nomina_dict:
                record = nomina_dict[user_id]
                record["totalPairs"] += p.pares_realizados
                record["totalEarned"] += p.valor_pagar
                
                proceso = p.proceso_realizado
                record["processesCount"][proceso] = record["processesCount"].get(proceso, 0) + p.pares_realizados
                
                # Detalle por referencia (mes completo)
                orden = p.lote.orden if p.lote else None
                ref = orden.referencia if orden else "Sin referencia"
                color = orden.color if orden else ""
                orden_id = orden.id if orden else ""
                ref_key = f"{ref} ({color})" if color else ref

                if "detalleReferencias" not in record:
                    record["detalleReferencias"] = {}
                if ref_key not in record["detalleReferencias"]:
                    record["detalleReferencias"][ref_key] = {"pares": 0, "valor": 0.0, "ordenes": set(), "proceso": proceso}
                record["detalleReferencias"][ref_key]["pares"] += p.pares_realizados
                record["detalleReferencias"][ref_key]["valor"] += p.valor_pagar
                record["detalleReferencias"][ref_key]["ordenes"].add(orden_id)

                # Clasificación por Semana Actual vs Semanas Anteriores
                if p.fecha_registro >= lunes_actual:
                    if ref_key not in record["detalleReferenciasSemanaActual"]:
                        record["detalleReferenciasSemanaActual"][ref_key] = {"pares": 0, "valor": 0.0, "ordenes": set(), "proceso": proceso}
                    record["detalleReferenciasSemanaActual"][ref_key]["pares"] += p.pares_realizados
                    record["detalleReferenciasSemanaActual"][ref_key]["valor"] += p.valor_pagar
                    record["detalleReferenciasSemanaActual"][ref_key]["ordenes"].add(orden_id)
                else:
                    record["resumenSemanasAnteriores"]["pares"] += p.pares_realizados
                    record["resumenSemanasAnteriores"]["valor"] += p.valor_pagar

        # 2. Por día (Jornales)
        jornadas = db.query(models.RegistroJornada).filter(
            models.RegistroJornada.fecha >= start_date,
            models.RegistroJornada.fecha < end_date
        ).order_by(models.RegistroJornada.fecha.asc()).all()
        
        from collections import defaultdict
        jornadas_por_op = defaultdict(lambda: defaultdict(list))
        for j in jornadas:
            jornadas_por_op[j.id_operario][j.fecha.strftime("%Y-%m-%d")].append(j)
            
        for op_id, dias in jornadas_por_op.items():
            operario = db.query(models.Usuario).filter(models.Usuario.id == op_id).first()
            if not operario or operario.tipo_pago != "por_dia":
                continue
            
            user_id_str = str(op_id)
            if user_id_str in nomina_dict:
                record = nomina_dict[user_id_str]
                total_horas = 0
                
                for fecha, registros_dia in dias.items():
                    entrada_temp = None
                    for r in registros_dia:
                        if r.tipo == "entrada":
                            entrada_temp = r.fecha
                        elif r.tipo == "salida" and entrada_temp:
                            total_horas += (r.fecha - entrada_temp).total_seconds() / 3600.0
                            entrada_temp = None
                
                record["processesCount"]["Horas Trabajadas"] = round(record["processesCount"].get("Horas Trabajadas", 0) + total_horas, 2)
                salario_hora = (operario.salario_dia or 0) / 8.0
                record["totalEarned"] += total_horas * salario_hora

        # 3. Calcular Adelantos y Total Neto
        adelantos = db.query(models.Adelanto).filter(
            models.Adelanto.fecha >= start_date,
            models.Adelanto.fecha < end_date
        ).all()
        
        adelantos_por_op = defaultdict(float)
        for a in adelantos:
            adelantos_por_op[str(a.id_operario)] += a.monto
            
        resultado = []
        for user_id, record in nomina_dict.items():
            record["totalAdvances"] = adelantos_por_op.get(user_id, 0.0)
            record["netEarned"] = record["totalEarned"] - record["totalAdvances"]
            
            # Convertir sets a listas para que sean JSON-serializable
            if "detalleReferencias" in record:
                for ref_key, det in record["detalleReferencias"].items():
                    det["ordenes"] = list(det["ordenes"])
            if "detalleReferenciasSemanaActual" in record:
                for ref_key, det in record["detalleReferenciasSemanaActual"].items():
                    det["ordenes"] = list(det["ordenes"])
            
            # Solo incluir si hay actividad en el mes
            has_production = record["totalPairs"] > 0
            has_hours = record["processesCount"].get("Horas Trabajadas", 0) > 0
            has_advances = record["totalAdvances"] > 0
            
            if has_production or has_hours or has_advances:
                resultado.append(record)
                
        return jsonify(resultado)


# ── Gestión de Operarios ─────────────────────────────────────────────────────
@app.route("/api/v1/operarios", methods=["GET"])
def listar_operarios():
    with next(get_db()) as db:
        operarios = db.query(models.Usuario).filter(models.Usuario.es_admin == False).all()
        result = []
        for o in operarios:
            result.append({
                "id": o.id, "nombre": o.nombre, "rol": o.rol, "codigo_qr": o.codigo_qr,
                "tipo_pago": o.tipo_pago, "salario_dia": o.salario_dia, "precio_por_par": o.precio_por_par,
            })
        return jsonify(result)

@app.route("/api/v1/operarios", methods=["POST"])
def crear_operario():
    datos = request.json
    nombre      = datos.get("nombre", "").strip()
    rol         = datos.get("rol", "").strip()
    codigo_qr   = datos.get("codigo_qr", "").strip() or None
    tipo_pago   = datos.get("tipo_pago", "por_produccion")
    salario_dia = datos.get("salario_dia")
    precio_par  = datos.get("precio_por_par")

    if not nombre or not rol:
        return jsonify({"detail": "Nombre y rol son obligatorios."}), 400

    try:
        precio_individual = float(precio_par) if tipo_pago == "por_produccion" and precio_par is not None and precio_par != "" else None
    except (ValueError, TypeError):
        return jsonify({"detail": "El precio por par debe ser un número válido."}), 400

    try:
        salario_diario = float(salario_dia) if tipo_pago == "por_dia" and salario_dia is not None and salario_dia != "" else None
    except (ValueError, TypeError):
        return jsonify({"detail": "El salario por día debe ser un número válido."}), 400

    try:
        with next(get_db()) as db:
            max_id_user = db.query(models.Usuario).order_by(models.Usuario.id.desc()).first()
            next_id = (max_id_user.id + 1) if max_id_user else 1
            codigo_generado = f"EMP-{next_id:03d}"

            while db.query(models.Usuario).filter(models.Usuario.codigo_qr == codigo_generado).first():
                next_id += 1
                codigo_generado = f"EMP-{next_id:03d}"

            nuevo = models.Usuario(
                nombre=nombre,
                rol=rol,
                codigo_qr=codigo_generado,
                tipo_pago=tipo_pago,
                salario_dia=salario_diario,
                precio_por_par=precio_individual,
                es_admin=False
            )
            db.add(nuevo)
            registrar_bitacora(db, "OPERARIO", "CREAR",
                f"Operario '{nombre}' creado con rol '{rol}' ({tipo_pago}). C\u00f3digo QR: {codigo_generado}"
            )
            db.commit()
            return jsonify({"mensaje": f"Operario '{nombre}' creado con c\u00f3digo {codigo_generado}.", "id": nuevo.id}), 201
    except IntegrityError as ie:
        return jsonify({"detail": f"Error de integridad en la base de datos: {str(ie.orig)}"}), 400
    except Exception as e:
        return jsonify({"detail": f"Error interno al crear el operario: {str(e)}"}), 500

@app.route("/api/v1/operarios/<int:operario_id>", methods=["PUT"])
def editar_operario(operario_id):
    datos = request.json
    nombre      = datos.get("nombre", "").strip()
    rol         = datos.get("rol", "").strip()
    tipo_pago   = datos.get("tipo_pago", "por_produccion")
    salario_dia = datos.get("salario_dia")
    precio_par  = datos.get("precio_por_par")

    if not nombre or not rol:
        return jsonify({"detail": "Nombre y rol son obligatorios."}), 400

    try:
        precio_individual = float(precio_par) if tipo_pago == "por_produccion" and precio_par is not None and precio_par != "" else None
    except (ValueError, TypeError):
        return jsonify({"detail": "El precio por par debe ser un número válido."}), 400

    try:
        salario_diario = float(salario_dia) if tipo_pago == "por_dia" and salario_dia is not None and salario_dia != "" else None
    except (ValueError, TypeError):
        return jsonify({"detail": "El salario por día debe ser un número válido."}), 400

    try:
        with next(get_db()) as db:
            operario = db.query(models.Usuario).filter(models.Usuario.id == operario_id).first()
            if not operario:
                return jsonify({"detail": "Operario no encontrado."}), 404

            operario.nombre = nombre
            operario.rol = rol
            operario.tipo_pago = tipo_pago
            operario.salario_dia = salario_diario
            operario.precio_por_par = precio_individual
            db.commit()
            return jsonify({"mensaje": f"Operario '{nombre}' actualizado exitosamente."}), 200
    except IntegrityError as ie:
        return jsonify({"detail": f"Error de integridad en la base de datos: {str(ie.orig)}"}), 400
    except Exception as e:
        return jsonify({"detail": f"Error interno al editar el operario: {str(e)}"}), 500

from sqlalchemy.exc import IntegrityError

@app.route("/api/v1/operarios/<int:operario_id>", methods=["DELETE"])
def eliminar_operario(operario_id):
    with next(get_db()) as db:
        operario = db.query(models.Usuario).filter(models.Usuario.id == operario_id).first()
        if not operario: return jsonify({"detail": "Operario no encontrado."}), 404
        if operario.es_admin: return jsonify({"detail": "No se puede eliminar un administrador."}), 403
        
        try:
            db.delete(operario)
            db.commit()
            return jsonify({"mensaje": f"Operario '{operario.nombre}' eliminado."})
        except IntegrityError:
            db.rollback()
            return jsonify({"detail": "No se puede eliminar el operario porque ya tiene registros de producción o asistencia vinculados."}), 400


# ── Gestión de Procesos (Roles Dinámicos) ───────────────────────────────────
@app.route("/api/v1/procesos", methods=["GET"])
def listar_procesos():
    with next(get_db()) as db:
        procesos = db.query(models.Proceso).order_by(models.Proceso.orden.asc()).all()
        return jsonify([{"id": p.id, "nombre": p.nombre, "orden": p.orden} for p in procesos])

@app.route("/api/v1/procesos", methods=["POST"])
def crear_proceso():
    datos = request.json
    nombre = datos.get("nombre", "").strip()
    if not nombre:
        return jsonify({"detail": "El nombre del proceso es obligatorio."}), 400

    with next(get_db()) as db:
        existente = db.query(models.Proceso).filter(
            func.lower(models.Proceso.nombre) == func.lower(nombre)
        ).first()
        if existente:
            return jsonify({"detail": f"El proceso '{nombre}' ya existe."}), 400

        max_orden = db.query(func.max(models.Proceso.orden)).scalar() or 0
        nuevo = models.Proceso(nombre=nombre, orden=max_orden + 1)
        db.add(nuevo)
        db.commit()
        return jsonify({"mensaje": f"Proceso '{nombre}' creado exitosamente.", "id": nuevo.id}), 201

@app.route("/api/v1/procesos/<int:proceso_id>", methods=["PUT"])
def editar_proceso(proceso_id):
    datos = request.json
    nuevo_nombre = datos.get("nombre", "").strip()
    if not nuevo_nombre:
        return jsonify({"detail": "El nombre del proceso es obligatorio."}), 400

    with next(get_db()) as db:
        proceso = db.query(models.Proceso).filter(models.Proceso.id == proceso_id).first()
        if not proceso:
            return jsonify({"detail": "Proceso no encontrado."}), 404

        # Validar duplicados si cambia de nombre
        if func.lower(proceso.nombre) != func.lower(nuevo_nombre):
            existente = db.query(models.Proceso).filter(
                func.lower(models.Proceso.nombre) == func.lower(nuevo_nombre)
            ).first()
            if existente:
                return jsonify({"detail": f"El proceso '{nuevo_nombre}' ya existe."}), 400

        antiguo_nombre = proceso.nombre
        proceso.nombre = nuevo_nombre

        # Actualizar en cascada en las tablas que guardan el nombre como string
        try:
            # 1. Usuarios
            db.query(models.Usuario).filter(models.Usuario.rol == antiguo_nombre).update(
                {models.Usuario.rol: nuevo_nombre}, synchronize_session=False
            )
            # 2. Tarifas referencia
            db.query(models.TarifaReferencia).filter(models.TarifaReferencia.rol == antiguo_nombre).update(
                {models.TarifaReferencia.rol: nuevo_nombre}, synchronize_session=False
            )
            # 3. Precios labor
            db.query(models.PrecioLabor).filter(models.PrecioLabor.rol == antiguo_nombre).update(
                {models.PrecioLabor.rol: nuevo_nombre}, synchronize_session=False
            )
            # 4. Produccion
            db.query(models.Produccion).filter(models.Produccion.proceso_realizado == antiguo_nombre).update(
                {models.Produccion.proceso_realizado: nuevo_nombre}, synchronize_session=False
            )

            db.commit()
            return jsonify({"mensaje": f"Proceso '{antiguo_nombre}' renombrado a '{nuevo_nombre}' y registros actualizados."}), 200
        except Exception as e:
            db.rollback()
            return jsonify({"detail": f"Error al actualizar registros vinculados: {str(e)}"}), 500

@app.route("/api/v1/procesos/<int:proceso_id>", methods=["DELETE"])
def eliminar_proceso(proceso_id):
    with next(get_db()) as db:
        proceso = db.query(models.Proceso).filter(models.Proceso.id == proceso_id).first()
        if not proceso:
            return jsonify({"detail": "Proceso no encontrado."}), 404

        nombre_proceso = proceso.nombre

        # Restricciones de eliminación
        if db.query(models.Usuario).filter(models.Usuario.rol == nombre_proceso).first():
            return jsonify({"detail": f"No se puede eliminar porque el rol '{nombre_proceso}' está asignado a uno o más operarios."}), 400
        if db.query(models.TarifaReferencia).filter(models.TarifaReferencia.rol == nombre_proceso).first():
            return jsonify({"detail": f"No se puede eliminar porque el proceso '{nombre_proceso}' tiene tarifas específicas por referencia configuradas."}), 400
        if db.query(models.PrecioLabor).filter(models.PrecioLabor.rol == nombre_proceso).first():
            return jsonify({"detail": f"No se puede eliminar porque el proceso '{nombre_proceso}' tiene una tarifa global configurada."}), 400
        if db.query(models.Produccion).filter(models.Produccion.proceso_realizado == nombre_proceso).first():
            return jsonify({"detail": f"No se puede eliminar porque el proceso '{nombre_proceso}' ya tiene registros de producción guardados."}), 400

        try:
            db.delete(proceso)
            db.commit()
            return jsonify({"mensaje": f"Proceso '{nombre_proceso}' eliminado correctamente."}), 200
        except Exception as e:
            db.rollback()
            return jsonify({"detail": f"Error al eliminar el proceso: {str(e)}"}), 500


@app.route("/api/v1/procesos/reordenar", methods=["POST"])
def reordenar_procesos():
    """Recibe lista de IDs en el nuevo orden y reasigna el campo 'orden'."""
    datos = request.json
    ids_ordenados = datos.get("ids", [])
    if not ids_ordenados:
        return jsonify({"detail": "Se requiere la lista de IDs."}), 400
    with next(get_db()) as db:
        for posicion, proceso_id in enumerate(ids_ordenados, start=1):
            db.query(models.Proceso).filter(models.Proceso.id == proceso_id).update(
                {models.Proceso.orden: posicion}, synchronize_session=False
            )
        db.commit()
        return jsonify({"mensaje": "Orden actualizado correctamente."})


# ── Guía de Producción ───────────────────────────────────────────────────────
@app.route("/api/v1/guia-produccion", methods=["GET"])
def guia_produccion():
    """Devuelve tabla de seguimiento: cada orden con el estado de cada proceso."""
    filtro = request.args.get("estado", "activas")  # activas | completadas | todas
    with next(get_db()) as db:
        # Obtener todos los procesos ordenados
        procesos = db.query(models.Proceso).order_by(models.Proceso.orden.asc()).all()
        nombres_procesos = [p.nombre for p in procesos]

        # Obtener órdenes según filtro
        query = db.query(models.Orden)
        if filtro == "activas":
            query = query.filter(models.Orden.estado.notin_(["COMPLETADA", "CANCELLED"]))
        elif filtro == "completadas":
            query = query.filter(models.Orden.estado == "COMPLETADA")
        ordenes = query.order_by(models.Orden.fecha_creacion.desc()).all()

        resultado = []
        for orden in ordenes:
            # Obtener todos los registros de producción de esta orden
            producciones = db.query(models.Produccion).join(models.Lote).filter(
                models.Lote.id_orden == orden.id
            ).all()

            procesos_completados = {p.proceso_realizado for p in producciones}
            fila = {
                "orden_id": orden.id,
                "referencia": orden.referencia,
                "color": orden.color,
                "cliente": orden.cliente or "",
                "total_pares": orden.total_pares,
                "estado": orden.estado,
                "fecha_creacion": orden.fecha_creacion.isoformat(),
                "fecha_completado": orden.fecha_completado.isoformat() if orden.fecha_completado else None,
                "procesos": {
                    nombre: (nombre in procesos_completados)
                    for nombre in nombres_procesos
                }
            }
            resultado.append(fila)

        return jsonify({
            "columnas": nombres_procesos,
            "filas": resultado
        })

# ── Gestión de Tarifas por Referencia ───────────────────────────────────────
@app.route("/api/v1/tarifas/referencia", methods=["GET"])
def listar_tarifas_referencia():
    with next(get_db()) as db:
        tarifas = db.query(models.TarifaReferencia).order_by(
            models.TarifaReferencia.referencia, models.TarifaReferencia.rol
        ).all()
        return jsonify([
            {"id": t.id, "referencia": t.referencia, "rol": t.rol, "precio_por_par": t.precio_por_par}
            for t in tarifas
        ])

@app.route("/api/v1/tarifas/referencia", methods=["POST"])
def crear_o_actualizar_tarifa_referencia():
    datos = request.json
    referencia = datos.get("referencia", "").strip()
    rol        = datos.get("rol", "").strip()
    precio     = datos.get("precio_por_par")

    if not referencia or not rol or precio is None:
        return jsonify({"detail": "referencia, rol y precio_por_par son obligatorios."}), 400

    with next(get_db()) as db:
        existente = db.query(models.TarifaReferencia).filter(
            models.TarifaReferencia.referencia == referencia,
            models.TarifaReferencia.rol == rol
        ).first()
        if existente:
            existente.precio_por_par = float(precio)
            db.commit()
            return jsonify({"mensaje": f"Tarifa actualizada: {referencia} | {rol} → ${float(precio):,.0f}/par"})
        else:
            db.add(models.TarifaReferencia(referencia=referencia, rol=rol, precio_por_par=float(precio)))
            db.commit()
            return jsonify({"mensaje": f"Tarifa creada: {referencia} | {rol} → ${float(precio):,.0f}/par"}), 201

@app.route("/api/v1/tarifas/referencia/batch", methods=["POST"])
def crear_o_actualizar_tarifa_referencia_batch():
    datos = request.json
    referencia = datos.get("referencia", "").strip()
    tarifas = datos.get("tarifas", []) # Lista de { "rol": "Picado", "precio": 800 }

    if not referencia or not isinstance(tarifas, list):
        return jsonify({"detail": "referencia y lista de tarifas son obligatorias."}), 400

    if len(tarifas) == 0:
        return jsonify({"detail": "Debe enviar al menos una tarifa."}), 400

    guardados = 0
    with next(get_db()) as db:
        for t in tarifas:
            rol = str(t.get("rol", "")).strip()
            precio = t.get("precio")
            
            if not rol or precio is None or str(precio).strip() == "":
                continue

            try:
                precio_float = float(precio)
            except ValueError:
                continue

            existente = db.query(models.TarifaReferencia).filter(
                models.TarifaReferencia.referencia == referencia,
                models.TarifaReferencia.rol == rol
            ).first()
            
            if existente:
                existente.precio_por_par = precio_float
            else:
                db.add(models.TarifaReferencia(referencia=referencia, rol=rol, precio_por_par=precio_float))
            
            guardados += 1
            
        db.commit()
        return jsonify({"mensaje": f"Se guardaron {guardados} tarifas para la referencia {referencia}."}), 201

@app.route("/api/v1/tarifas/referencia/<int:tarifa_id>", methods=["DELETE"])
def eliminar_tarifa_referencia(tarifa_id):
    with next(get_db()) as db:
        t = db.query(models.TarifaReferencia).filter(models.TarifaReferencia.id == tarifa_id).first()
        if not t: return jsonify({"detail": "Tarifa no encontrada."}), 404
        db.delete(t)
        db.commit()
        return jsonify({"mensaje": f"Tarifa eliminada: {t.referencia} | {t.rol}"})


@app.route("/api/v1/tarifas/referencia/delete-by-references", methods=["POST"])
def eliminar_tarifas_referencia_bulk():
    datos = request.json
    referencias = datos.get("references", [])
    if not isinstance(referencias, list) or len(referencias) == 0:
        return jsonify({"detail": "Se requiere una lista de referencias."}), 400
        
    with next(get_db()) as db:
        deleted = db.query(models.TarifaReferencia).filter(
            models.TarifaReferencia.referencia.in_(referencias)
        ).delete(synchronize_session=False)
        db.commit()
        registrar_bitacora(db, "TARIFA", "ELIMINAR_MASIVO", f"Eliminación masiva de tarifas para referencias: {', '.join(referencias)}. Total eliminadas: {deleted}")
        db.commit()
        
    return jsonify({"mensaje": f"Se eliminaron todas las tarifas de las referencias seleccionadas. Total registros borrados: {deleted}."}), 200


@app.route("/api/v1/tarifas/referencia/bulk-import", methods=["POST"])
def bulk_import_tarifas_referencia():
    datos = request.json
    if not isinstance(datos, list):
        return jsonify({"detail": "Se requiere una lista de tarifas."}), 400

    if len(datos) == 0:
        return jsonify({"detail": "La lista está vacía."}), 400

    creados = 0
    actualizados = 0
    with next(get_db()) as db:
        for item in datos:
            referencia = str(item.get("referencia", "")).strip()
            rol = str(item.get("rol", "")).strip()
            precio = item.get("precio")

            if not referencia or not rol or precio is None:
                continue

            try:
                precio_float = float(precio)
            except (ValueError, TypeError):
                continue

            existente = db.query(models.TarifaReferencia).filter(
                models.TarifaReferencia.referencia == referencia,
                models.TarifaReferencia.rol == rol
            ).first()

            if existente:
                if existente.precio_por_par != precio_float:
                    existente.precio_por_par = precio_float
                    actualizados += 1
            else:
                db.add(models.TarifaReferencia(referencia=referencia, rol=rol, precio_por_par=precio_float))
                creados += 1

        db.commit()
        registrar_bitacora(db, "TARIFA", "IMPORTAR", f"Importación masiva: {creados} creadas, {actualizados} actualizadas.")
        db.commit()

    return jsonify({
        "mensaje": f"Importación masiva completada. Creadas: {creados}, Actualizadas: {actualizados}.",
        "creados": creados,
        "actualizados": actualizados
    }), 200


# ── Tarifas globales por rol (fallback) ──────────────────────────────────────
@app.route("/api/v1/tarifas/global", methods=["GET"])
def listar_tarifas_global():
    with next(get_db()) as db:
        return jsonify([
            {"id": t.id, "rol": t.rol, "precio_por_par": t.precio_por_par}
            for t in db.query(models.PrecioLabor).all()
        ])

@app.route("/api/v1/tarifas/global", methods=["POST"])
def guardar_tarifa_global():
    datos = request.json
    rol    = datos.get("rol", "").strip()
    precio = datos.get("precio_por_par")
    if not rol or precio is None:
        return jsonify({"detail": "rol y precio_por_par son obligatorios."}), 400
    with next(get_db()) as db:
        t = db.query(models.PrecioLabor).filter(models.PrecioLabor.rol == rol).first()
        if t:
            t.precio_por_par = float(precio)
        else:
            db.add(models.PrecioLabor(rol=rol, precio_por_par=float(precio)))
        db.commit()
        return jsonify({"mensaje": f"Tarifa global '{rol}' → ${float(precio):,.0f}/par guardada."})

@app.route("/api/v1/tarifas/global/<int:tarifa_id>", methods=["DELETE"])
def eliminar_tarifa_global(tarifa_id):
    with next(get_db()) as db:
        t = db.query(models.PrecioLabor).filter(models.PrecioLabor.id == tarifa_id).first()
        if not t: return jsonify({"detail": "Tarifa no encontrada."}), 404
        db.delete(t); db.commit()
        return jsonify({"mensaje": f"Tarifa global '{t.rol}' eliminada."})


# ── Referencias únicas conocidas ─────────────────────────────────────────────
@app.route("/api/v1/referencias", methods=["GET"])
def listar_referencias():
    with next(get_db()) as db:
        desde_ordenes   = [r[0] for r in db.query(models.Orden.referencia).distinct().all()]
        desde_tarifas   = [r[0] for r in db.query(models.TarifaReferencia.referencia).distinct().all()]
        return jsonify(sorted(set(desde_ordenes + desde_tarifas)))

@app.route("/api/v1/roles", methods=["GET"])
def listar_roles():
    with next(get_db()) as db:
        roles_u = [r[0] for r in db.query(models.Usuario.rol).distinct().all()]
        roles_t = [r[0] for r in db.query(models.PrecioLabor.rol).distinct().all()]
        roles_r = [r[0] for r in db.query(models.TarifaReferencia.rol).distinct().all()]
        return jsonify(sorted(set(roles_u + roles_t + roles_r)))


# ── Historial de jornadas ────────────────────────────────────────────────────
@app.route("/api/v1/jornada/<string:qr_operario>", methods=["GET"])
def historial_jornada(qr_operario):
    with next(get_db()) as db:
        operario = db.query(models.Usuario).filter(models.Usuario.codigo_qr == qr_operario).first()
        if not operario: return jsonify({"detail": "Operario no encontrado."}), 404
        registros = db.query(models.RegistroJornada).filter(
            models.RegistroJornada.id_operario == operario.id
        ).order_by(models.RegistroJornada.fecha.desc()).all()
        return jsonify({
            "operario": {"nombre": operario.nombre, "rol": operario.rol},
            "tipo_pago": operario.tipo_pago,
            "salario_dia": operario.salario_dia,
            "registros": [{"id": r.id, "tipo": r.tipo, "fecha": r.fecha.strftime("%Y-%m-%d"),
                           "hora": r.fecha.strftime("%H:%M:%S"), "valor_dia": r.valor_dia} for r in registros]
        })

@app.route("/api/v1/jornadas/resumen", methods=["GET"])
def resumen_jornadas():
    with next(get_db()) as db:
        jornadas = db.query(models.RegistroJornada).order_by(models.RegistroJornada.fecha.asc()).all()
        from collections import defaultdict
        jornadas_por_op = defaultdict(lambda: defaultdict(list))
        for j in jornadas:
            jornadas_por_op[j.id_operario][j.fecha.strftime("%Y-%m-%d")].append(j)
            
        resultado = []
        for op_id, dias in jornadas_por_op.items():
            operario = db.query(models.Usuario).filter(models.Usuario.id == op_id).first()
            if not operario: continue
            
            for fecha, registros_dia in dias.items():
                horas_dia = 0
                entrada_temp = None
                eventos = []
                for r in registros_dia:
                    eventos.append(f"{r.tipo.upper()[:3]} {r.fecha.strftime('%H:%M')}")
                    if r.tipo == "entrada":
                        entrada_temp = r.fecha
                    elif r.tipo == "salida" and entrada_temp:
                        horas_dia += (r.fecha - entrada_temp).total_seconds() / 3600.0
                        entrada_temp = None
                
                estado = "Completada"
                if entrada_temp:
                    # En curso (calcula hasta la hora actual)
                    horas_dia += (colombia_now() - entrada_temp).total_seconds() / 3600.0
                    estado = "En curso"
                    
                resultado.append({
                    "id": f"{op_id}-{fecha}",
                    "operario": operario.nombre,
                    "rol": operario.rol,
                    "fecha": fecha,
                    "horas": round(horas_dia, 2),
                    "estado": estado,
                    "eventos": " | ".join(eventos)
                })
        
        resultado.sort(key=lambda x: x["fecha"], reverse=True)
        return jsonify(resultado)

@app.route("/api/v1/jornadas", methods=["DELETE"])
def eliminar_jornada():
    operario_id = request.args.get("operario_id")
    fecha_str = request.args.get("fecha")  # Esperado en formato YYYY-MM-DD
    
    if not operario_id or not fecha_str:
        return jsonify({"detail": "Faltan parámetros obligatorios: operario_id y fecha."}), 400
        
    try:
        operario_id = int(operario_id)
        # Validar formato fecha
        start_date = datetime.strptime(fecha_str, "%Y-%m-%d")
        end_date = start_date + timedelta(days=1)
    except ValueError:
        return jsonify({"detail": "Parámetros inválidos. La fecha debe estar en formato YYYY-MM-DD."}), 400
        
    with next(get_db()) as db:
        registros = db.query(models.RegistroJornada).filter(
            models.RegistroJornada.id_operario == operario_id,
            models.RegistroJornada.fecha >= start_date,
            models.RegistroJornada.fecha < end_date
        ).all()
        
        if not registros:
            return jsonify({"detail": "No se encontraron registros de asistencia para ese operario en esa fecha."}), 404
            
        for r in registros:
            db.delete(r)
        db.commit()
        return jsonify({"mensaje": f"Registros de asistencia eliminados para la fecha {fecha_str}."})

# ── Adelantos (Préstamos) ────────────────────────────────────────────────────
@app.route("/api/v1/adelantos", methods=["GET"])
def listar_adelantos():
    with next(get_db()) as db:
        adelantos = db.query(models.Adelanto).order_by(models.Adelanto.fecha.desc()).all()
        return jsonify([
            {
                "id": a.id, "id_operario": a.id_operario, "operario": a.operario.nombre,
                "monto": a.monto, "fecha": a.fecha.isoformat(), "observacion": a.observacion
            }
            for a in adelantos
        ])

@app.route("/api/v1/adelantos", methods=["POST"])
def registrar_adelanto():
    datos = request.json
    id_operario = datos.get("id_operario")
    monto = datos.get("monto")
    observacion = datos.get("observacion", "")

    if not id_operario or not monto:
        return jsonify({"detail": "Operario y monto son obligatorios."}), 400

    try:
        monto_float = float(monto)
        if monto_float <= 0:
            return jsonify({"detail": "El monto debe ser mayor a 0."}), 400
    except ValueError:
        return jsonify({"detail": "Monto inválido."}), 400

    with next(get_db()) as db:
        operario = db.query(models.Usuario).filter(models.Usuario.id == id_operario).first()
        if not operario:
            return jsonify({"detail": "Operario no encontrado."}), 404

        nuevo_adelanto = models.Adelanto(id_operario=operario.id, monto=monto_float, observacion=observacion)
        db.add(nuevo_adelanto)
        registrar_bitacora(db, "AVANCE", "REGISTRAR",
            f"Avance de ${monto_float:,.0f} registrado a {operario.nombre}. Obs: {observacion or 'Sin observaci\u00f3n'}"
        )
        db.commit()
        return jsonify({"mensaje": f"Adelanto de ${monto_float:,.0f} registrado a {operario.nombre}."}), 201

@app.route("/api/v1/adelantos/<int:adelanto_id>", methods=["DELETE"])
def eliminar_adelanto(adelanto_id):
    with next(get_db()) as db:
        adelanto = db.query(models.Adelanto).filter(models.Adelanto.id == adelanto_id).first()
        if not adelanto:
            return jsonify({"detail": "Adelanto no encontrado."}), 404
        db.delete(adelanto)
        db.commit()
        return jsonify({"mensaje": "Adelanto eliminado correctamente."})


# ── Bitácora del Sistema ─────────────────────────────────────────────────────
@app.route("/api/v1/bitacora", methods=["GET"])
def listar_bitacora():
    with next(get_db()) as db:
        limit = int(request.args.get("limit", 200))
        tipo = request.args.get("tipo")  # Filtro opcional por tipo
        query = db.query(models.Bitacora)
        if tipo:
            query = query.filter(models.Bitacora.tipo == tipo.upper())
        entradas = query.order_by(models.Bitacora.fecha.desc()).limit(limit).all()
        return jsonify([
            {
                "id": e.id,
                "tipo": e.tipo,
                "accion": e.accion,
                "descripcion": e.descripcion,
                "detalle": e.detalle,
                "fecha": e.fecha.isoformat()
            }
            for e in entradas
        ])


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8000, debug=True)
