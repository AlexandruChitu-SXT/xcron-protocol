#!/bin/bash

# ==============================================================================
# XCron Protocol — Frontend Start Script
# Keeper bot is now in a separate private repository (xcron-keeper).
# ==============================================================================

echo "====================================================="
echo "🚀 Iniciando XCron Protocol Frontend..."
echo "====================================================="

# 1. Asegurar que las dependencias del Frontend están instaladas
echo -e "\n[1/2] 📦 Verificando dependencias del Frontend..."
cd frontend
npm install > /dev/null 2>&1

# 2. Lanzar el frontend
echo -e "\n[2/2] ⚡ Encendiendo frontend..."
echo "Presiona Ctrl+C para detener."
echo "====================================================="

npm run dev
