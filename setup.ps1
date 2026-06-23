# 🚀 Script de Configuración y Ejecución - PriceFlow

Write-Host "================================" -ForegroundColor Cyan
Write-Host "   PriceFlow - Setup Script" -ForegroundColor Cyan
Write-Host "================================" -ForegroundColor Cyan
Write-Host ""

# Verificar Node.js
Write-Host "✓ Verificando Node.js..." -ForegroundColor Green
node --version
Write-Host ""

# Instalar dependencias
Write-Host "📦 Instalando dependencias..." -ForegroundColor Yellow
npm install

Write-Host ""
Write-Host "================================" -ForegroundColor Cyan
Write-Host "   Configuración Completada!" -ForegroundColor Green
Write-Host "================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "📝 IMPORTANTE: Antes de ejecutar, necesitas:" -ForegroundColor Yellow
Write-Host "   1. Crear el archivo .env.local" -ForegroundColor White
Write-Host "   2. Agregar VITE_OPENAI_API_KEY y VITE_GEMINI_API_KEY" -ForegroundColor White
Write-Host "   3. Obtener API keys en: https://platform.openai.com/ y https://ai.google.dev/" -ForegroundColor White
Write-Host ""
Write-Host "🚀 Para ejecutar el proyecto:" -ForegroundColor Green
Write-Host "   npm run dev" -ForegroundColor Cyan
Write-Host ""
