# 📖 Guía de Instalación y Ejecución - PriceFlow

## 🎯 ¿Qué es PriceFlow?

**PriceFlow** es una aplicación web profesional para gestionar precios de productos, diseñada para automatizar el flujo de trabajo entre proveedores y tu sistema ERP (Odoo).

### Características principales:
- 📊 **Dashboard interactivo** con métricas en tiempo real
- 📥 **Importación de datos** desde proveedores y Odoo
- 📝 **Workflow de aprobación** de costos y precios
- 💾 **Sincronización con Odoo** ERP
- 🏪 **Gestión de ejecución** en sala de ventas
- 📜 **Historial completo** de auditoría

---

## 🛠️ Tecnologías Utilizadas

- ⚛️ React 19 + TypeScript
- ⚡ Vite (build tool)
- 🎨 CSS moderno
- 📊 Recharts (gráficos)
- 🤖 Google Gemini AI
- 🎯 Lucide React (iconos)

---

## 🚀 Instalación Rápida

### Opción 1: Script Automático (Recomendado)

Ejecuta el script de instalación:

```powershell
.\setup.ps1
```

### Opción 2: Instalación Manual

1. **Instalar dependencias:**
   ```bash
   npm install
   ```

2. **Configurar API Key:**
   
   Crea un archivo `.env.local` en la raíz del proyecto:
   ```env
   VITE_OPENAI_API_KEY=tu-api-key-openai-aqui
   VITE_GEMINI_API_KEY=tu-api-key-gemini-aqui
   ```
   
   > 🔑 Obtén tus API keys en: https://platform.openai.com/ y https://ai.google.dev/

3. **Ejecutar en modo desarrollo:**
   ```bash
   npm run dev
   ```

4. **Abrir en el navegador:**
   
   La aplicación se ejecutará en: `http://localhost:5173`

---

## 📂 Estructura del Proyecto

```
Priceflow/
├── components/          # Componentes de React
│   ├── Dashboard.tsx    # Panel de control
│   ├── Ingestion.tsx    # Importación de datos
│   ├── Worksheet.tsx    # Hoja de trabajo
│   ├── SystemUpdate.tsx # Actualización Odoo
│   ├── StoreExecution.tsx # Ejecución en tienda
│   └── History.tsx      # Historial
├── services/            # Servicios y API
├── App.tsx              # Componente principal
├── types.ts             # Definiciones TypeScript
├── constants.ts         # Constantes y datos mock
└── package.json         # Dependencias del proyecto
```

---

## 🎮 Cómo Usar la Aplicación

### 1️⃣ **Panel de Control (Dashboard)**
- Vista general de estadísticas
- Gráficos de cambios de precios
- Métricas en tiempo real

### 2️⃣ **Importar Datos (Ingestion)**
- **Cargar productos de Odoo**: Sincroniza la base de datos
- **Cargar archivo de proveedor**: Importa CSV/Excel con nuevos precios

### 3️⃣ **Hoja de Trabajo (Worksheet)**
- Revisa los cambios propuestos
- Aprueba o rechaza costos
- Aprueba o ajusta precios manualmente
- Visualiza comparaciones lado a lado

### 4️⃣ **Actualizar Odoo (System Update)**
- Actualiza los productos aprobados en Odoo
- Sincronización automática

### 5️⃣ **Sala de Ventas (Store Execution)**
- Ejecuta cambios de precios en los puntos de venta
- Imprime etiquetas de precios

### 6️⃣ **Historial (History)**
- Consulta todos los cambios realizados
- Exporta reportes
- Auditoría completa

---

## 📝 Comandos Disponibles

```bash
# Instalar dependencias
npm install

# Ejecutar en modo desarrollo
npm run dev

# Compilar para producción
npm build

# Vista previa de producción
npm run preview
```

---

## 🔧 Requisitos del Sistema

- ✅ **Node.js**: v18 o superior (tienes v22.18.0 ✓)
- ✅ **npm**: v7 o superior
- ✅ **Navegador**: Chrome, Firefox, Safari, Edge (versiones recientes)

---

## 🐛 Solución de Problemas

### Error: "Cannot find module"
```bash
# Elimina node_modules y reinstala
rm -rf node_modules
npm install
```

### Puerto 5173 ocupado
```bash
# Vite usará automáticamente el siguiente puerto disponible
# O especifica uno manualmente en vite.config.ts
```

### API Key no funciona
- Verifica que el archivo `.env.local` esté en la raíz
- Asegúrate de usar el prefijo `VITE_`
- Reinicia el servidor de desarrollo

---

## 📞 Soporte

Para más información sobre:
- **Google Gemini API**: https://ai.google.dev/
- **React**: https://react.dev/
- **Vite**: https://vitejs.dev/

---

## 📄 Licencia

Proyecto privado - PriceFlow v1.0
