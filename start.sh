#!/bin/bash

# ==============================================================================
# XCron Protocol — Master Start Script
# Este script inicia tanto el Keeper Bot como el Frontend en una sola terminal,
# combinando los logs de ambos de forma ordenada, sin importar los cambios que hagas.
# ==============================================================================

echo "====================================================="
echo "🚀 Iniciando el ecosistema de XCron Protocol..."
echo "====================================================="

# 1. Asegurar que las dependencias del Keeper están instaladas
echo -e "\n[1/3] 📦 Verificando dependencias del Keeper Bot..."
cd keeper
npm install > /dev/null 2>&1
cd ..

# 2. Asegurar que las dependencias del Frontend están instaladas
echo "[2/3] 📦 Verificando dependencias del Frontend..."
cd frontend
npm install > /dev/null 2>&1
cd ..

# 3. Lanzar ambos procesos usando 'npx concurrently'
# -k: mata todos los procesos si cierras uno (Ctrl+C)
# -n: nombres para los prefijos
# -c: colores para distinguir los logs
echo -e "\n[3/3] ⚡ Encendiendo motores (Frontend + Keeper)..."
echo "Presiona Ctrl+C en cualquier momento para detener ambos de forma segura."
echo "====================================================="

npx concurrently -k -n "KEEPER,FRONTEND" -c "bgBlue.bold,bgMagenta.bold" \
  "cd keeper && npm run start" \
  "cd frontend && npm run dev"
