import React, { useState, useEffect, useMemo } from 'react';
import { Search, Calendar, User, ArrowUpRight, ArrowDownRight, Minus, FileText, RefreshCw, Trash2 } from 'lucide-react';
import { HistoryService, HistoryEvent } from '../services/historyService';
import { useAuth } from '../contexts/AuthContext';
import { OdooProduct } from '../types';

interface Props {
  odooProducts?: OdooProduct[];
}

export const History: React.FC<Props> = ({ odooProducts = [] }) => {
  const { user } = useAuth();
  const [history, setHistory] = useState<HistoryEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterProvider, setFilterProvider] = useState('all');
  const [filterDate, setFilterDate] = useState('all');
  const [filterUser, setFilterUser] = useState('all');

  const [debouncedSearch, setDebouncedSearch] = useState('');
  const searchTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchHistory = async () => {
    setLoading(true);
    const data = await HistoryService.getHistory(user?.id || null, user?.role, {
      search: debouncedSearch,
      date: filterDate,
      provider: filterProvider,
      limit: 2000 // Increase limit for the main history view
    });
    setHistory(data);
    setLoading(false);
  };

  const handleClearHistory = async () => {
    if (window.confirm('¿Estás seguro de que deseas eliminar todo el historial? Esta acción no se puede deshacer.')) {
      const success = await HistoryService.clearHistory(user?.id || null, user?.role);
      if (success) {
        setHistory([]);
        alert('Historial eliminado correctamente');
      } else {
        alert('Error al eliminar el historial');
      }
    }
  };

  // Debounce search input
  const handleSearchChange = (val: string) => {
    setSearchTerm(val);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => setDebouncedSearch(val), 500);
  };

  useEffect(() => {
    if (user) {
      fetchHistory();
    }
  }, [user, debouncedSearch, filterDate, filterProvider]); // Re-fetch when user or server-side filters change

  // Derive unique providers
  const providers = Array.from(new Set(history.map(h => h.provider).filter(Boolean)));

  // Derive unique users (for admin/gerente filter)
  const uniqueUsers = Array.from(new Set(history.map(h => h.user).filter(Boolean)));

  const filteredHistory = history.filter(item => {
    // For sala users, only show store executions
    if (user?.role === 'sala' && item.action !== 'STORE_EXECUTION') {
      return false;
    }

    // Non-privileged users should only see their own actions
    // Admin/Gerente see all, unless they filter by user
    if (user?.role !== 'admin' && user?.role !== 'gerente' && String(item.userId) !== String(user?.id)) {
      return false;
    }

    // Apply user filter for admins/gerentes
    if ((user?.role === 'admin' || user?.role === 'gerente') && filterUser !== 'all') {
      if (item.user !== filterUser) return false;
    }

    // Filter out intermediate status changes (Noise)
    const isIntermediate = item.action === 'PRICE_CHANGE' || item.action === 'COST_CHANGE';

    return !isIntermediate;
  });

  // UI dedupe: collapse repeated identical events that can be emitted multiple times
  const dedupedHistory = useMemo(() => {
    const seen = new Set<string>();
    const toMinute = (ts?: string) => (ts ? ts.slice(0, 16) : '');
    const norm = (v: any) => String(v ?? '').trim().toLowerCase();

    return filteredHistory.filter((item) => {
      const key = [
        norm(item.action),
        norm(item.productId || item.productCode),
        norm(item.productName),
        norm(item.provider),
        norm(item.userId || item.user),
        norm(item.details),
        norm(item.oldPrice),
        norm(item.newPrice),
        norm(item.oldCost),
        norm(item.newCost),
        toMinute(item.timestamp),
      ].join('|');

      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [filteredHistory]);

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    return date.toLocaleString('es-ES', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const translateAction = (action: string) => {
    const translations: Record<string, string> = {
      'IMPORT': 'Carga Inicial',
      'PRICE_CHANGE': 'Cambio de Precio',
      'PROVIDER_UPDATE': 'Actualización Sistema',
      'COST_CHANGE': 'Cambio de Costo',
      'PRICE_APPROVAL': 'Aprobado',
      'COST_APPROVAL': 'Costo Aprobado',
      'PRICE_KEPT': 'Precio Mantenido',
      'LIST_CLEAR': 'Limpieza Global',
      'ITEM_DELETE': 'Producto Eliminado',
      'STORE_EXECUTION': 'Ejecución en Sala',
      'OTHER': 'Otro'
    };
    return translations[action] || action;
  };
  const formatNum = (val: any) => {
    if (val === undefined || val === null || val === '') return '-';
    const num = typeof val === 'number' ? val : parseFloat(val);
    if (isNaN(num)) return '-';
    return num.toFixed(2);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
            <FileText className="w-6 h-6 text-gray-600" />
            Historial de Auditoría
          </h2>
          <p className="text-gray-500 text-sm">Registro completo de todas las acciones del sistema</p>
        </div>

        <div className="flex gap-2 items-center flex-wrap">
          <button
            onClick={fetchHistory}
            className="p-2 text-gray-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
            title="Actualizar historial"
          >
            <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
          </button>

          {user?.role === 'admin' && (
            <button
              onClick={handleClearHistory}
              className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
              title="Eliminar historial completo"
            >
              <Trash2 className="w-5 h-5" />
            </button>
          )}

          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar..."
              value={searchTerm}
              onChange={(e) => handleSearchChange(e.target.value)}
              className="pl-9 pr-4 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 w-48"
            />
          </div>

          <input
            type="date"
            value={filterDate === 'all' ? '' : filterDate}
            onChange={(e) => setFilterDate(e.target.value || 'all')}
            className="border rounded-lg text-sm px-3 py-2 bg-white"
            placeholder="Filtrar por fecha"
          />

          {(user?.role === 'admin' || user?.role === 'gerente') && (
            <select
              value={filterUser}
              onChange={(e) => setFilterUser(e.target.value)}
              className="border rounded-lg text-sm px-3 py-2 bg-white max-w-[150px]"
            >
              <option value="all">Todos los usuarios</option>
              {uniqueUsers.map(u => <option key={u} value={u}>{u}</option>)}
            </select>
          )}

          <select
            value={filterProvider}
            onChange={(e) => setFilterProvider(e.target.value)}
            className="border rounded-lg text-sm px-3 py-2 bg-white max-w-[200px]"
          >
            <option value="all">Todos los proveedores</option>
            {providers.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden border border-gray-200">
        <div className="overflow-x-auto">
          <table className="min-w-full w-max text-left text-sm whitespace-nowrap">
            <thead className="bg-gray-50 text-gray-600 font-semibold uppercase tracking-wider">
              <tr>
                <th className="p-3 border-b">Fecha / Usuario</th>
                <th className="p-3 border-b">Acción</th>
                <th className="p-3 border-b">Proveedor</th>
                <th className="p-3 border-b">Detalles del Producto</th>
                <th className="p-3 border-b text-center">Cambio</th>
                <th className="p-3 border-b">Notas</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {dedupedHistory.map((item, index) => {
                const priceDiff = (item.newPrice || 0) - (item.oldPrice || 0);
                const costDiff = (item.newCost || 0) - (item.oldCost || 0);
                return (
                  <tr key={item.id || index} className="hover:bg-gray-50">
                    <td className="p-4">
                      <div className="font-mono text-gray-600">{formatDate(item.timestamp)}</div>
                      <div className="flex items-center gap-1 text-xs text-gray-400 mt-1">
                        <User className="w-3 h-3" /> {item.user}
                      </div>
                    </td>

                    <td className="p-4">
                      <span className={`px-2 py-1 rounded-full text-xs font-bold
                            ${item.action === 'IMPORT' || item.action === 'PRICE_KEPT' ? 'bg-blue-100 text-blue-800' :
                          item.action === 'PRICE_CHANGE' || item.action === 'PRICE_APPROVAL' ? 'bg-yellow-100 text-yellow-800' :
                            item.action === 'COST_APPROVAL' ? 'bg-orange-100 text-orange-800' :
                              item.action === 'PROVIDER_UPDATE' ? 'bg-purple-100 text-purple-800' :
                                item.action === 'STORE_EXECUTION' ? 'bg-green-100 text-green-800' :
                                  item.action === 'LIST_CLEAR' || item.action === 'ITEM_DELETE' ? 'bg-red-100 text-red-800' :
                                    'bg-gray-100 text-gray-800'}`}>
                        {translateAction(item.action)}
                      </span>
                    </td>

                    <td className="p-4">
                      <span className="text-gray-700 font-medium">
                        {(() => {
                          if (item.provider === 'Provider File') {
                            const match = odooProducts.find(p => p.barcode === item.productId);
                            if (match?.provider && match.provider !== 'N/A' && match.provider !== 'Odoo') return match.provider;
                            if (match?.supplierName && match.supplierName !== 'N/A') return match.supplierName;
                          }
                          return item.provider || '-';
                        })()}
                      </span>
                    </td>

                    <td className="p-4 min-w-[500px] whitespace-normal">
                      <div className="font-bold text-gray-800 whitespace-normal break-words leading-tight">{item.productName || '-'}</div>
                      {item.productId && (
                        <div className="text-xs text-gray-500 font-mono mt-1">
                          ID: {item.productId}
                        </div>
                      )}
                    </td>

                    <td className="p-4 text-center">
                      <div className="flex flex-col items-center gap-2">
                        {/* Cost Change Section */}
                        {(item.oldCost !== undefined || item.newCost !== undefined) && (
                          <div className="flex flex-col items-center leading-tight">
                            <span className="text-[10px] uppercase font-bold text-gray-400">Costo</span>
                            {costDiff === 0 ? (
                              <span className="text-[10px] text-gray-500 italic">Sin cambios</span>
                            ) : (
                              <>
                                {item.oldCost !== undefined && <span className="text-[10px] text-gray-400 line-through">Bs{formatNum(item.oldCost)}</span>}
                                {item.newCost !== undefined && (
                                  <div className={`font-bold text-sm flex items-center gap-1 ${costDiff > 0 ? 'text-red-600' : 'text-green-600'}`}>
                                    Bs{formatNum(item.newCost)}
                                    {costDiff > 0 && <ArrowUpRight className="w-3 h-3 text-red-500" />}
                                    {costDiff < 0 && <ArrowDownRight className="w-3 h-3 text-green-500" />}
                                  </div>
                                )}
                              </>
                            )}
                          </div>
                        )}

                        {/* Price Change Section */}
                        {(item.oldPrice !== undefined || item.newPrice !== undefined) && (
                          <div className="flex flex-col items-center leading-tight">
                            <span className="text-[10px] uppercase font-bold text-gray-400">Precio</span>
                            {priceDiff === 0 ? (
                              <span className="text-[10px] text-gray-500 italic">Sin cambios</span>
                            ) : (
                              <>
                                {item.oldPrice !== undefined && <span className="text-[10px] text-gray-400 line-through">Bs{formatNum(item.oldPrice)}</span>}
                                {item.newPrice !== undefined && (
                                  <div className={`font-bold text-sm flex items-center gap-1 ${priceDiff > 0 ? 'text-green-600' : 'text-red-600'}`}>
                                    Bs{formatNum(item.newPrice)}
                                    {priceDiff > 0 && <ArrowUpRight className="w-3 h-3 text-green-500" />}
                                    {priceDiff < 0 && <ArrowDownRight className="w-3 h-3 text-red-500" />}
                                  </div>
                                )}
                              </>
                            )}
                          </div>
                        )}

                        {/* Fallback if no numbers at all */}
                        {item.oldCost === undefined && item.newCost === undefined && item.oldPrice === undefined && item.newPrice === undefined && (
                          <span className="text-gray-400 italic text-xs">-</span>
                        )}
                      </div>
                    </td>

                    <td className="p-4 text-gray-600 text-xs min-w-[500px] whitespace-normal" title={item.details}>
                      <div className="whitespace-normal break-words leading-tight">{item.details}</div>
                    </td>
                  </tr>
                );
              })}
              {filteredHistory.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-gray-400">
                    {loading ? 'Cargando historial...' : 'No se encontraron registros en el historial.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
