import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from dotenv import load_dotenv

# Cargar variables de entorno
load_dotenv()

# Origen: SQLite local
sqlite_url = "sqlite:///grazzia.db"
sqlite_engine = create_engine(sqlite_url)

# Destino: Supabase PostgreSQL
supabase_url = os.environ.get("DATABASE_URL")
if not supabase_url:
    print("ERROR: No se encontro la variable DATABASE_URL en el archivo backend/.env.")
    exit(1)

if supabase_url.startswith("postgres://"):
    supabase_url = supabase_url.replace("postgres://", "postgresql://", 1)

print(f"Connecting to Supabase Database...")
try:
    supabase_engine = create_engine(supabase_url)
    # Probar conexion
    with supabase_engine.connect() as conn:
        pass
    print("Connection to Supabase successful!")
except Exception as e:
    print(f"Connection to Supabase failed: {e}")
    exit(1)

# Importar modelos de datos
import models

# 1. Crear las tablas en Supabase si no existen
print("Creando tablas en Supabase...")
models.Base.metadata.create_all(bind=supabase_engine)

# 2. Iniciar sesiones de base de datos
SqliteSession = sessionmaker(bind=sqlite_engine)
SupabaseSession = sessionmaker(bind=supabase_engine)

sqlite_db = SqliteSession()
supabase_db = SupabaseSession()

# Funcion auxiliar para migrar una tabla
def migrar_tabla(model):
    nombre_tabla = model.__tablename__
    print(f"Migrando tabla '{nombre_tabla}'...")
    
    rows = sqlite_db.query(model).all()
    if not rows:
        print(f"La tabla '{nombre_tabla}' esta vacia. Saltando...")
        return
        
    count = 0
    for row in rows:
        # Verificar si el registro ya existe en el destino
        exists = supabase_db.query(model).filter(model.id == row.id).first()
        if not exists:
            # Desvincular de la sesion de SQLite
            sqlite_db.expunge(row)
            # Hacer transitorio para poder agregarlo a la nueva sesion
            from sqlalchemy.orm import make_transient
            make_transient(row)
            
            supabase_db.add(row)
            count += 1
            
    try:
        supabase_db.commit()
        print(f"Migrados {count}/{len(rows)} registros de la tabla '{nombre_tabla}'.")
    except Exception as e:
        supabase_db.rollback()
        print(f"Error al guardar datos en '{nombre_tabla}': {e}")
        raise e

try:
    # Migrar tablas en orden de dependencia
    migrar_tabla(models.Usuario)
    migrar_tabla(models.Orden)
    migrar_tabla(models.Lote)
    migrar_tabla(models.Produccion)
    migrar_tabla(models.RegistroJornada)
    migrar_tabla(models.Adelanto)
    migrar_tabla(models.PrecioLabor)
    migrar_tabla(models.TarifaReferencia)

    # Corregir secuencias de IDs en PostgreSQL
    if supabase_url.startswith("postgresql") or "supabase" in supabase_url:
        print("\nRestableciendo secuencias de IDs en PostgreSQL/Supabase...")
        from sqlalchemy import text
        tables_to_reset = [
            "usuarios",
            "precios_labor",
            "tarifas_referencia",
            "produccion",
            "registros_jornada",
            "adelantos"
        ]
        for table in tables_to_reset:
            try:
                supabase_db.execute(text(f"""
                    SELECT setval(
                        pg_get_serial_sequence('{table}', 'id'),
                        COALESCE(MAX(id), 1),
                        MAX(id) IS NOT NULL
                    ) FROM {table};
                """))
                print(f"Secuencia de '{table}' restablecida.")
            except Exception as seq_err:
                print(f"No se pudo restablecer secuencia de '{table}': {seq_err}")
        supabase_db.commit()

    print("\nFelicidades! La migracion a Supabase se completo con exito.")
except Exception as e:
    print(f"\nMigracion abortada debido a un error: {e}")
finally:
    sqlite_db.close()
    supabase_db.close()
