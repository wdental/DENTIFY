#!/bin/bash
# =====================================================================
# Dentify - Script de arranque para Mac
# World Dental - Quito, Ecuador
# =====================================================================
cd "$(dirname "$0")"

echo "================================================="
echo "  Dentify - World Dental"
echo "  Iniciando el sistema..."
echo "================================================="
echo ""

# Verificar que Node.js este instalado
if ! command -v node >/dev/null 2>&1; then
    echo "[ERROR] No se encontro Node.js instalado en este equipo."
    echo "Por favor instale Node.js LTS desde https://nodejs.org antes de continuar."
    read -p "Presione Enter para salir..."
    exit 1
fi

# Instalar dependencias si no existen
if [ ! -d "node_modules" ]; then
    echo "Instalando dependencias por primera vez, esto puede tardar unos minutos..."
    npm install
    if [ $? -ne 0 ]; then
        echo "[ERROR] Fallo la instalacion de dependencias."
        read -p "Presione Enter para salir..."
        exit 1
    fi
fi

echo "Iniciando el servidor Dentify..."
echo ""

# Abrir el navegador despues de un breve instante
( sleep 3 && open http://localhost:3000 ) &

node server.js
