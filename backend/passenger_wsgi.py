import sys, os

# Agregar la ruta actual al path de Python
sys.path.insert(0, os.path.dirname(__file__))

# Importar la aplicacion Flask desde main.py
from main import app as application
