import os
import sys
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

# Add current path to python path to import models
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
import models

# We will run this script on the databases configured below.
# 1. SQLite database
sqlite_url = "sqlite:///grazzia.db"
# 2. Supabase database (from environment variable DATABASE_URL in .env)
# Read .env file manually to load DATABASE_URL
dotenv_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env")
supabase_url = None
if os.path.exists(dotenv_path):
    with open(dotenv_path, "r") as f:
        for line in f:
            if line.startswith("DATABASE_URL="):
                supabase_url = line.strip().split("DATABASE_URL=", 1)[1]
                break

if supabase_url and supabase_url.startswith("postgres://"):
    supabase_url = supabase_url.replace("postgres://", "postgresql://", 1)

databases = [("SQLite", sqlite_url)]
if supabase_url:
    databases.append(("Supabase", supabase_url))

# Data to insert
operario_nombre = "INES BENITEZ SIERRA"
operario_rol = "Detallado"  # matches the allowed process 'Detallado' (for DETALLADOR)
operario_tipo_pago = "por_produccion"

tarifas_data = [
    # plana
    ("26030", 350.0), ("26031", 350.0), ("26032", 350.0), ("26033", 350.0), ("26034", 350.0),
    ("26035", 350.0), ("26036", 350.0), ("26037", 350.0), ("26038", 350.0), ("26039", 350.0),
    ("26040", 350.0), ("26041", 350.0), ("26042", 350.0), ("26043", 350.0), ("26044", 350.0),
    ("26045", 350.0), ("26046", 350.0), ("26047", 350.0), ("26048", 350.0), ("26049", 350.0),
    # Niña
    ("26150", 350.0), ("26151", 350.0), ("26152", 350.0), ("26153", 350.0), ("26154", 350.0),
    ("26155", 350.0), ("26156", 350.0), ("26157", 350.0), ("26158", 350.0), ("26159", 350.0),
    # Tacon
    ("26320", 350.0), ("26321", 350.0), ("26322", 350.0), ("26323", 350.0), ("26324", 350.0),
    ("26325", 350.0), ("26326", 350.0), ("26327", 350.0), ("26328", 350.0), ("26329", 350.0),
    # Plataforma
    ("26500", 350.0), ("26501", 350.0), ("26502", 350.0), ("26503", 350.0), ("26504", 350.0),
    ("26505", 350.0), ("26506", 350.0), ("26507", 350.0), ("26508", 350.0), ("26509", 350.0),
    ("26510", 350.0), ("26511", 350.0), ("26512", 350.0), ("26513", 350.0), ("26514", 350.0),
    ("26515", 350.0), ("26516", 350.0), ("26517", 350.0), ("26518", 350.0), ("26519", 350.0)
]

for db_name, db_url in databases:
    print(f"\nConectando a base de datos {db_name}...")
    try:
        engine = create_engine(db_url)
        # Verify connection
        with engine.connect() as conn:
            pass
    except Exception as e:
        print(f"No se pudo conectar a {db_name}: {e}")
        continue

    Session = sessionmaker(bind=engine)
    db = Session()

    try:
        # 1. Crear/Verificar operario
        operario = db.query(models.Usuario).filter(
            models.Usuario.nombre == operario_nombre,
            models.Usuario.rol == operario_rol
        ).first()

        if not operario:
            # Obtener el siguiente código QR format EMP-xxx
            max_id_user = db.query(models.Usuario).order_by(models.Usuario.id.desc()).first()
            next_id = (max_id_user.id + 1) if max_id_user else 1
            codigo_generado = f"EMP-{next_id:03d}"

            while db.query(models.Usuario).filter(models.Usuario.codigo_qr == codigo_generado).first():
                next_id += 1
                codigo_generado = f"EMP-{next_id:03d}"

            operario = models.Usuario(
                nombre=operario_nombre,
                rol=operario_rol,
                codigo_qr=codigo_generado,
                tipo_pago=operario_tipo_pago,
                es_admin=False
            )
            db.add(operario)
            db.flush() # Para obtener el ID del operario
            print(f"Creado operario '{operario_nombre}' con código QR: {codigo_generado}")
        else:
            print(f"Operario '{operario_nombre}' ya existe (ID: {operario.id}, Código QR: {operario.codigo_qr})")

        # 2. Crear/Actualizar tarifas de referencia
        tarifas_creadas = 0
        tarifas_actualizadas = 0
        for ref, precio in tarifas_data:
            tarifa = db.query(models.TarifaReferencia).filter(
                models.TarifaReferencia.referencia == ref,
                models.TarifaReferencia.rol == operario_rol
            ).first()

            if tarifa:
                if tarifa.precio_por_par != precio:
                    tarifa.precio_por_par = precio
                    tarifas_actualizadas += 1
            else:
                nueva_tarifa = models.TarifaReferencia(
                    referencia=ref,
                    rol=operario_rol,
                    precio_por_par=precio
                )
                db.add(nueva_tarifa)
                tarifas_creadas += 1

        db.commit()
        print(f"Base de datos {db_name} actualizada exitosamente:")
        print(f"  - Tarifas creadas: {tarifas_creadas}")
        print(f"  - Tarifas actualizadas: {tarifas_actualizadas}")

        # Restablecer secuencia si es PostgreSQL/Supabase
        if "postgresql" in db_url or "supabase" in db_url:
            try:
                db.execute(text("""
                    SELECT setval(
                        pg_get_serial_sequence('usuarios', 'id'),
                        COALESCE(MAX(id), 1),
                        MAX(id) IS NOT NULL
                    ) FROM usuarios;
                """))
                db.execute(text("""
                    SELECT setval(
                        pg_get_serial_sequence('tarifas_referencia', 'id'),
                        COALESCE(MAX(id), 1),
                        MAX(id) IS NOT NULL
                    ) FROM tarifas_referencia;
                """))
                db.commit()
                print("Secuencias de IDs de usuarios y tarifas_referencia restablecidas.")
            except Exception as seq_err:
                print(f"No se pudo restablecer secuencias de IDs: {seq_err}")
                db.rollback()

    except Exception as ex:
        db.rollback()
        print(f"Error procesando la base de datos {db_name}: {ex}")
    finally:
        db.close()

print("\nProceso terminado.")
