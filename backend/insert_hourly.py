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

# Data to insert (paid by day/hour)
hourly_users = [
    {
        "nombre": "ABEL JULIAN PEREZ LOAIZA",
        "salario_dia": 58333.0,
        "rol": "Auxiliar"
    },
    {
        "nombre": "FABIAN ENRIQUE PERES LOAIZA",
        "salario_dia": 40000.0,
        "rol": "Auxiliar"
    },
    {
        "nombre": "INES BENITEZ SIERRA",
        "salario_dia": 35000.0,
        "rol": "Auxiliar" # Stored with Auxiliar role for hourly tracking, separate from her production profile
    },
    {
        "nombre": "LUISA FERNANDA BARRIOS GOMEZ",
        "salario_dia": 10000.0,
        "rol": "Auxiliar"
    }
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
        for user_data in hourly_users:
            nombre = user_data["nombre"]
            salario = user_data["salario_dia"]
            rol = user_data["rol"]

            # For INES BENITEZ SIERRA, check if she already has a por_dia profile
            # For others, check if they exist under the same role and payment type
            existente = db.query(models.Usuario).filter(
                models.Usuario.nombre == nombre,
                models.Usuario.tipo_pago == "por_dia"
            ).first()

            if existente:
                # Update wage if it changed
                if existente.salario_dia != salario:
                    existente.salario_dia = salario
                    print(f"Actualizado salario diario de '{nombre}' ({rol}) a ${salario:,.0f}")
                else:
                    print(f"Operario '{nombre}' ({rol}) ya existe con el mismo salario diario (QR: {existente.codigo_qr})")
            else:
                # Get next QR code format EMP-xxx
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
                    tipo_pago="por_dia",
                    salario_dia=salario,
                    es_admin=False
                )
                db.add(nuevo)
                db.flush()
                print(f"Creado operario '{nombre}' ({rol}) con código QR: {codigo_generado} y salario diario: ${salario:,.0f}")

        db.commit()
        print(f"Base de datos {db_name} actualizada exitosamente.")

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
                db.commit()
                print("Secuencias de IDs de usuarios restablecidas.")
            except Exception as seq_err:
                print(f"No se pudo restablecer secuencias de IDs: {seq_err}")
                db.rollback()

    except Exception as ex:
        db.rollback()
        print(f"Error procesando la base de datos {db_name}: {ex}")
    finally:
        db.close()

print("\nProceso terminado.")
