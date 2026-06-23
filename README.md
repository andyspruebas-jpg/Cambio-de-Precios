# PriceFlow

Sistema de gestión de cambios de precios para retail, integrado con Odoo ERP.

## Stack Tecnológico

- **Frontend:** React 19 + TypeScript + Vite + Tailwind v4 (puerto 3002)
- **Backend:** Express.js (puerto 3005)
- **Base de datos:** Odoo (configurada por variables de entorno)

## Requisitos Previos

- Node.js
- API Keys de OpenAI/Gemini (ver sección de configuración)

## Instalación

```bash
npm install
```

## Configuración

1. Copia el archivo de ejemplo:
   ```bash
   cp .env.template .env.local
   ```

2. Edita `.env.local` y agrega tus API keys:
   ```
   VITE_OPENAI_API_KEY=tu_api_key
   VITE_GEMINI_API_KEY=tu_api_key
   ```

## Ejecutar en Desarrollo

```bash
npm run dev        # Solo frontend (puerto 3002)
npm run server     # Solo backend (puerto 3005)
npm run dev:all    # Ambos simultáneamente (modo desarrollo estándar)
```

## Producción

```bash
npm run build      # Build de producción → dist/
npm run start:prod # Build + preview + servidor
```

## Roles de Usuario

| Rol | Descripción |
|-----|-------------|
| `admin` | Acceso completo a todas las funcionalidades |
| `analista` | Ingesta de productos y gestión de worksheets |
| `ejecutor` | Actualización de precios en Odoo |
| `sala` | Ejecución en punto de venta |
| `proveedor` | Carga de hojas de precios de proveedores |

## Pipeline de Trabajo

1. **Ingesta** → Carga productos de Odoo e importa CSV/Excel de proveedores
2. **Worksheet** → Aprueba/rechaza cambios de costos y precios
3. **Actualización Sistema** → Envía cambios aprobados a Odoo
4. **Ejecución en Sala** → Marca cambios ejecutados en punto de venta
5. **Carga Proveedores** → Importa hojas de precios de proveedores

## Seguridad

- Contraseñas almacenadas con bcrypt
- Sesiones de Odoo gestionadas por el backend
- Aislamiento de datos por usuario (IndexedDB + localStorage)
- Variables de entorno para credenciales sensibles
