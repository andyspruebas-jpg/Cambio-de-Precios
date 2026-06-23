# Sistema de Notificaciones por Lotes para Salas

## Resumen de Cambios

Se ha implementado un sistema inteligente de notificaciones que **acumula** las actualizaciones de productos para las salas de ventas, evitando el spam de notificaciones individuales.

## Funcionamiento

### Para las Salas de Ventas (Role: 'sala')

1. **Acumulación de Cambios**: Cuando el ejecutor confirma productos en Odoo, en lugar de enviar una notificación por cada producto, el sistema los acumula.

2. **Timer de 30 Segundos**: 
   - Cuando llega el **primer** producto actualizado, se inicia un timer de 30 segundos
   - Durante esos 30 segundos, todos los productos que se actualicen se van **contando**
   - NO se envía ninguna notificación individual durante este período

3. **Notificación Única**: 
   - Después de 30 segundos, se envía **UNA SOLA** notificación que dice:
     - "Hay X productos actualizados disponibles"
   - Esta notificación aparece en el ícono de notificaciones con el contador

4. **Ejemplo**:
   - 16:00:00 - Producto 1 actualizado → Timer inicia (30s)
   - 16:00:10 - Producto 2 actualizado → Contador: 2
   - 16:00:15 - Producto 3 actualizado → Contador: 3
   - ...
   - 16:00:28 - Producto 10 actualizado → Contador: 10
   - 16:00:30 - ⏰ Timer termina → Se envía: "Hay 10 productos actualizados disponibles"

### Para Otros Roles (analista, ejecutor, admin)

- Las notificaciones se envían **inmediatamente** sin acumulación
- Funciona como antes

## Archivos Modificados

1. **`services/storageService.ts`**:
   - Modificada función `addSharedNotification()`
   - Detecta si el rol es 'sala' y redirige a endpoint de lotes
   - Otros roles usan el endpoint tradicional

2. **`server.mjs`**:
   - Nuevo endpoint: `POST /api/notifications/batch`
   - Implementa el sistema de acumulación con timer de 30 segundos
   - Mantiene contador global para todas las salas
   - Resetea automáticamente después de enviar la notificación

## Beneficios

✅ **Menos Ruido**: Las salas no reciben docenas de notificaciones cuando hay actualizaciones masivas
✅ **Más Claridad**: Una sola notificación con el total es más informativa
✅ **Mejor UX**: El icono de notificaciones muestra el número real de productos disponibles
✅ **Sin Spam**: Sistema de "debouncing" inteligente con espera de 30 segundos

## Testing

Para probar:
1. Como ejecutor, confirmar varios productos en Odoo (5-10 productos)
2. Observar los logs del servidor: debe decir "Timer iniciado para acumular..."
3. Esperar 30 segundos
4. Como sala, verificar que llegue UNA notificación con el total
5. El ícono de notificaciones debe mostrar el contador correcto
