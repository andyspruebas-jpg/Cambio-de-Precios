# Sistema Multi-Usuario Implementado

## Resumen de Cambios

Se ha implementado un sistema completo de **almacenamiento por usuario** en PriceFlow, donde **cada usuario tiene su propio espacio de datos completamente independiente**. Los datos persisten al cerrar sesión y se restauran al volver a iniciar.

## Características Principales

### 1. **Almacenamiento Independiente por Usuario**
- **TODOS los usuarios son completamente independientes**, incluyendo usuarios de sala
- Cada usuario tiene sus propios:
  - Productos sincronizados de Odoo
  - Items de trabajo (workflow)
  - Historial de acciones
  - Referencias a archivos CSV

### 2. **Sin Excepciones - Todos Independientes**
- **No hay datos compartidos** entre usuarios
- Cada usuario de "sala" tiene su propio conjunto de datos
- Cada usuario de "admin" tiene su propio conjunto de datos
- Cada usuario de "proveedor" tiene su propio conjunto de datos

### 3. **Persistencia de Datos**
- Los datos se guardan automáticamente al:
  - Sincronizar con Odoo
  - Modificar items de trabajo
  - Realizar acciones (cambios de precio, aprobaciones, etc.)
- Los datos se restauran automáticamente al iniciar sesión

## Archivos Modificados

### Frontend

#### `services/storageService.ts`
- **Función**: `getUserStorageKey()` - Genera claves de almacenamiento específicas por usuario
- **Sin excepciones**: Todos los usuarios usan `priceflow_{userId}`
- **Todas las funciones actualizadas** para aceptar `userId` y `userRole`:
  - `saveProducts(products, userId, userRole)`
  - `loadProducts(userId, userRole)`
  - `saveHistory(items, userId, userRole)`
  - `loadHistory(userId, userRole)`
  - `saveWorkflowItems(items, userId, userRole)`
  - `loadWorkflowItems(userId, userRole)`
  - `getLastSync(userId, userRole)`
  - `clearProducts(userId, userRole)`
  - `saveProductsAsCSV(products, userId, userRole)`
  - `loadProductsFromLatestCSV(userId, userRole)`

#### `services/historyService.ts`
- **Todas las funciones actualizadas** para aceptar `userId` y `userRole`:
  - `logAction(event, userId, userRole)` - Envía userId al backend
  - `getHistory(userId, userRole)` - Filtra por userId
  - `clearHistory(userId, userRole)` - Limpia solo el historial del usuario

#### `App.tsx`
- **useEffect de carga de datos** actualizado para usar `user.id` y `user.role`
- **Todas las funciones de manejo** actualizadas:
  - `handleLoadOdoo()` - Guarda productos con userId
  - `handleUpdateNewPrice()` - Registra acciones con userId
  - `handleUpdateNewCost()` - Registra acciones con userId
  - `handleUpdateSystem()` - Registra acciones con userId
  - `handleExecuteStore()` - Registra acciones con userId
- **Dependencia de useEffect** cambiada a `[user]` para recargar datos al cambiar de usuario

#### `components/History.tsx`
- Importa `useAuth` para obtener el usuario actual
- Pasa `user.id` y `user.role` a todas las llamadas de `HistoryService`
- Se recarga automáticamente al cambiar de usuario

### Backend

#### `server.mjs`
- **Nueva función**: `getUserHistoryPath(userId)` - Genera rutas de archivos de historial por usuario
- **Endpoint `/api/history/append`** actualizado:
  - Extrae `userId` del evento
  - Guarda en archivo específico del usuario: `historial/history_{userId}.csv`
  
- **Endpoint `/api/history` (GET)** actualizado:
  - Acepta parámetro `?userId=xxx`
  - Lee solo el archivo de historial del usuario especificado
  
- **Endpoint `/api/history` (DELETE)** actualizado:
  - Acepta parámetro `?userId=xxx`
  - Limpia solo el archivo de historial del usuario especificado

## Estructura de Almacenamiento

### LocalStorage (Frontend)
Cada usuario tiene claves únicas basadas en su ID:
```
priceflow_{userId}_products       // En IndexedDB
priceflow_{userId}_history         // En localStorage
priceflow_{userId}_workflow_items  // En localStorage
priceflow_{userId}_last_sync       // En localStorage
priceflow_{userId}_last_csv        // En localStorage
priceflow_{userId}_last_csv_path   // En localStorage
```

**Ejemplos:**
```
priceflow_1_products              // Usuario Gabriel (ID: 1)
priceflow_2_products              // Usuario Juan Carlos (ID: 2)
priceflow_3_products              // Usuario Proveedor (ID: 3)
priceflow_4_products              // Usuario Sala (ID: 4)
```

### Archivos del Backend
```
historial/
  ├── history_1.csv         # Usuario con ID "1" (Gabriel)
  ├── history_2.csv         # Usuario con ID "2" (Juan Carlos)
  ├── history_3.csv         # Usuario con ID "3" (Proveedor)
  ├── history_4.csv         # Usuario con ID "4" (Sala de Ventas)
  └── history_guest.csv     # Usuario sin autenticar
```

## Migración de Datos Antiguos

El sistema incluye **migración automática** de datos antiguos:
- Al cargar datos, primero busca en las claves legacy (`priceflow_products`, `priceflow_history`, etc.)
- Si encuentra datos, los migra automáticamente a las nuevas claves específicas del usuario
- Elimina las claves legacy después de la migración

## Flujo de Trabajo

### Al Iniciar Sesión
1. El usuario inicia sesión
2. `AuthContext` guarda el usuario en `localStorage` con clave `priceflow_user`
3. `App.tsx` detecta el cambio de usuario (useEffect con dependencia `[user]`)
4. Se cargan los datos específicos del usuario:
   - Productos desde IndexedDB o CSV
   - Items de trabajo desde localStorage
   - Historial desde el backend

### Durante el Uso
1. Cualquier cambio se guarda automáticamente con el `userId` del usuario actual
2. Cada usuario trabaja en su propio espacio aislado
3. Las acciones se registran en el historial con el nombre del usuario (`user.name`)

### Al Cerrar Sesión
1. Los datos permanecen guardados en localStorage/IndexedDB
2. El usuario es removido de `localStorage`
3. Al volver a iniciar sesión, los datos se restauran automáticamente

## Casos de Uso

### Múltiples Usuarios Trabajando Simultáneamente
- **Gabriel** puede sincronizar Odoo y trabajar con sus productos
- **Juan Carlos** puede tener su propia sincronización diferente
- **Sala de Ventas** tiene su propio conjunto de productos
- **Proveedor** solo ve sus propios productos cargados

### Cambio de Usuario
- Al cerrar sesión de Gabriel e iniciar con Juan Carlos:
  - Se limpian los datos de Gabriel de la memoria
  - Se cargan los datos de Juan Carlos desde su almacenamiento
  - Cada uno mantiene su propio estado

### Usuario sin Autenticar
- Si por alguna razón no hay usuario autenticado, se usa el ID `"guest"`
- Esto previene errores y permite que la aplicación funcione en modo degradado

## Pruebas Recomendadas

1. **Iniciar sesión con Gabriel** → Sincronizar Odoo → Cerrar sesión
2. **Iniciar sesión con Juan Carlos** → Verificar que NO ve los datos de Gabriel
3. **Sincronizar Odoo con Juan Carlos** → Cerrar sesión
4. **Volver a iniciar con Gabriel** → Verificar que sus datos persisten
5. **Iniciar con Sala de Ventas** → Sincronizar → Cerrar sesión
6. **Iniciar con otro usuario Sala** → Verificar que NO ve los datos del usuario anterior

## Notas Técnicas

- **IndexedDB** se usa para productos (grandes volúmenes de datos)
- **localStorage** se usa para metadatos, historial e items de trabajo
- **Backend CSV** se usa para persistencia de historial entre sesiones
- **Cada usuario es completamente independiente** - no hay excepciones

## Beneficios

✅ Cada usuario trabaja de forma completamente independiente  
✅ Los datos persisten entre sesiones  
✅ Sin conflictos entre usuarios  
✅ Historial separado por usuario  
✅ Migración automática de datos antiguos  
✅ Fácil de depurar (archivos separados en backend)  
✅ Privacidad total - ningún usuario ve datos de otros  
✅ Escalable - agregar nuevos usuarios no afecta a los existentes  

## Diferencias con la Versión Anterior

En la versión anterior, los usuarios "sala" compartían datos. Esto se ha eliminado completamente:

**Antes:**
```typescript
if (userRole === 'sala') {
    return `priceflow_sala_de_ventas`; // Todos los sala compartían
}
```

**Ahora:**
```typescript
// Todos los usuarios son independientes
return `priceflow_${userId}`;
```

Esto significa que cada usuario de sala tiene su propio conjunto de datos y trabaja de forma completamente independiente.
