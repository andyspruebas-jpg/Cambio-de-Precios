import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  Activity, RefreshCw, Users, Clock, TrendingUp,
  ShoppingBag, Upload, Search, Zap, ArrowRight, CheckCircle
} from 'lucide-react';
import { HistoryService, HistoryEvent } from '../services/historyService';
import { useAuth } from '../contexts/AuthContext';

interface UserInfo { id: string; name: string; role: string; }

// Module-level cache — survives tab switches without showing spinner again
let _historyCache: HistoryEvent[] = [];
let _usersCache: UserInfo[] = [];

const ACTION_CONFIG: Record<string, { label: string; color: string; bg: string; border: string }> = {
  COST_APPROVAL:      { label: 'Costo Aprobado',    color: 'text-amber-700',  bg: 'bg-amber-100',  border: 'border-amber-200'  },
  PRICE_APPROVAL:     { label: 'Precio Aprobado',   color: 'text-green-700',  bg: 'bg-green-100',  border: 'border-green-200'  },
  PRICE_KEPT:         { label: 'Precio Mantenido',  color: 'text-gray-600',   bg: 'bg-gray-100',   border: 'border-gray-200'   },
  RETURNED:           { label: 'Devuelto',           color: 'text-orange-700', bg: 'bg-orange-100', border: 'border-orange-200' },
  RETURNED_TO_INBOX:  { label: 'A Bandeja',          color: 'text-orange-600', bg: 'bg-orange-50',  border: 'border-orange-100' },
  IMPORT:             { label: 'Importación',        color: 'text-blue-700',   bg: 'bg-blue-100',   border: 'border-blue-200'   },
  ITEM_DELETE:        { label: 'Eliminado',          color: 'text-red-700',    bg: 'bg-red-100',    border: 'border-red-200'    },
  LIST_CLEAR:         { label: 'Lista Limpiada',     color: 'text-red-600',    bg: 'bg-red-50',     border: 'border-red-100'    },
  PROVIDER_UPDATE:    { label: 'Cambio Confirmado',  color: 'text-indigo-700', bg: 'bg-indigo-100', border: 'border-indigo-200' },
  STORE_EXECUTION:    { label: 'Sala Ejecutada',     color: 'text-teal-700',   bg: 'bg-teal-100',   border: 'border-teal-200'   },
  PRICE_CHANGE:       { label: 'Act. Odoo Precio',   color: 'text-violet-700', bg: 'bg-violet-100', border: 'border-violet-200' },
  COST_CHANGE:        { label: 'Act. Odoo Costo',    color: 'text-violet-600', bg: 'bg-violet-50',  border: 'border-violet-100' },
  OTHER:              { label: 'Otro',               color: 'text-gray-500',   bg: 'bg-gray-50',    border: 'border-gray-100'   },
};

const ROLE_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  analista:  { label: 'Analista',  color: 'text-blue-700',   bg: 'bg-blue-100'   },
  ejecutor:  { label: 'Ejecutor',  color: 'text-indigo-700', bg: 'bg-indigo-100' },
  sala:      { label: 'Sala',      color: 'text-teal-700',   bg: 'bg-teal-100'   },
  proveedor: { label: 'Proveedor', color: 'text-purple-700', bg: 'bg-purple-100' },
  admin:     { label: 'Admin',     color: 'text-rose-700',   bg: 'bg-rose-100'   },
  gerente:   { label: 'Gerente',   color: 'text-rose-600',   bg: 'bg-rose-50'    },
};

function toBoliviaTime(iso: string) {
  return new Date(iso).toLocaleString('es-BO', { timeZone: 'America/La_Paz', hour: '2-digit', minute: '2-digit' });
}

function toBoliviaDate(iso: string) {
  return new Date(iso).toLocaleDateString('es-BO', { timeZone: 'America/La_Paz', weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
}

function getDateKey(iso: string) {
  return new Date(iso).toLocaleDateString('es-BO', { timeZone: 'America/La_Paz', year: 'numeric', month: '2-digit', day: '2-digit' });
}

function getHourLabel(iso: string) {
  const h = parseInt(new Date(iso).toLocaleString('es-BO', { timeZone: 'America/La_Paz', hour: '2-digit', hour12: false }));
  return `${String(h).padStart(2, '0')}:00 – ${String(h + 1).padStart(2, '0')}:00`;
}

interface StatCardProps {
  label: string; value: number; icon: React.ReactNode;
  colorClass: string; bgClass: string;
}

const StatCard: React.FC<StatCardProps> = ({ label, value, icon, colorClass, bgClass }) => (
  <div className={`rounded-xl border p-4 ${bgClass}`}>
    <div className="flex items-start justify-between mb-2">
      {icon}
      <span className={`text-2xl font-bold ${colorClass}`}>{value}</span>
    </div>
    <p className="text-xs text-gray-500 font-medium">{label}</p>
  </div>
);

export const ActivityMonitor: React.FC = () => {
  const { user } = useAuth();
  const [history, setHistory] = useState<HistoryEvent[]>(_historyCache);
  const [users, setUsers] = useState<UserInfo[]>(_usersCache);
  const [loading, setLoading] = useState(_historyCache.length === 0);
  const [lastRefresh, setLastRefresh] = useState(new Date());
  const [newEntryCount, setNewEntryCount] = useState(0);
  const historyRef = useRef<HistoryEvent[]>([]);
  const usersRef = useRef<UserInfo[]>([]);

  const [filterRole, setFilterRole] = useState('all');
  const [filterUser, setFilterUser] = useState('all');
  const [filterAction, setFilterAction] = useState('all');
  const [filterDate, setFilterDate] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounce search — 500ms after user stops typing, fire server query
  const handleSearchChange = useCallback((val: string) => {
    setSearchTerm(val);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => setDebouncedSearch(val), 500);
  }, []);

  // Build URL with server-side filters
  const buildHistoryUrl = useCallback((opts: { search?: string; action?: string; date?: string } = {}) => {
    const params = new URLSearchParams();
    params.set('userId', user?.id || '');
    params.set('userRole', user?.role || '');
    params.set('limit', '500');
    if (opts.search) params.set('search', opts.search);
    if (opts.action && opts.action !== 'all') params.set('action', opts.action);
    // Date filtering on the server
    const dateFilter = opts.date ?? filterDate;
    if (dateFilter === 'today') {
      params.set('dateFrom', new Date().toISOString().slice(0, 10));
    } else if (dateFilter === 'yesterday') {
      const yd = new Date(); yd.setDate(yd.getDate() - 1);
      const yds = yd.toISOString().slice(0, 10);
      params.set('dateFrom', yds);
      params.set('dateTo', yds);
    } else if (dateFilter === 'week') {
      const wa = new Date(); wa.setDate(wa.getDate() - 7);
      params.set('dateFrom', wa.toISOString().slice(0, 10));
    }
    // 'all' → no date params → server returns all
    return `/api/history?${params.toString()}`;
  }, [user, filterDate]);

  // Initial full load — only shows spinner when no cached data exists
  const initialLoad = useCallback(async () => {
    if (_historyCache.length === 0) setLoading(true);
    const [histData, usersData] = await Promise.all([
      fetch(buildHistoryUrl()).then(r => r.json()).catch(() => []),
      fetch('/api/users/list').then(r => r.json()).catch(() => []),
    ]);
    _historyCache = histData;
    _usersCache = usersData;
    historyRef.current = histData;
    usersRef.current = usersData;
    setHistory(histData);
    setUsers(usersData);
    setLastRefresh(new Date());
    setLoading(false);
  }, [user, buildHistoryUrl]);

  // Silent background check — only updates state when there's new data
  const silentCheck = useCallback(async () => {
    const histData: HistoryEvent[] = await fetch(buildHistoryUrl()).then(r => r.json()).catch(() => []);
    const prev = historyRef.current;
    const prevId = prev[0]?.id;
    const newId = histData[0]?.id;
    if (newId && newId !== prevId) {
      const added = histData.length - prev.length;
      _historyCache = histData;
      historyRef.current = histData;
      setHistory(histData);
      setLastRefresh(new Date());
      if (added > 0) setNewEntryCount(n => n + added);
    }
  }, [user, buildHistoryUrl]);

  // Re-fetch when debounced search, action filter, or date filter changes
  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const data = await fetch(buildHistoryUrl({ search: debouncedSearch, action: filterAction, date: filterDate })).then(r => r.json()).catch(() => []);
      _historyCache = data;
      historyRef.current = data;
      setHistory(data);
      setLastRefresh(new Date());
      setLoading(false);
    };
    // Don't re-run on first render (initialLoad handles it)
    if (debouncedSearch !== '' || filterAction !== 'all' || filterDate !== 'all') load();
    else load(); // 'all' → reload without date restriction
  }, [debouncedSearch, filterAction, filterDate, buildHistoryUrl]);

  useEffect(() => { initialLoad(); }, [initialLoad]);

  // Poll every 12s silently — no loading state, no flicker
  useEffect(() => {
    const t = setInterval(silentCheck, 12000);
    return () => clearInterval(t);
  }, [silentCheck]);

  // Maps: userId → role, userName(lower) → role
  const { userRoleMap, userNameRoleMap } = useMemo(() => {
    const byId = new Map<string, string>();
    const byName = new Map<string, string>();
    users.forEach(u => {
      byId.set(String(u.id), u.role);
      byName.set(u.name.toLowerCase(), u.role);
    });
    return { userRoleMap: byId, userNameRoleMap: byName };
  }, [users]);

  const getUserRole = useCallback((item: HistoryEvent): string => {
    if (item.userId) {
      const r = userRoleMap.get(String(item.userId));
      if (r) return r;
    }
    if (item.user) {
      const r = userNameRoleMap.get(item.user.toLowerCase());
      if (r) return r;
    }
    // Minimal fallback — only use when user list truly unavailable
    if (item.action === 'STORE_EXECUTION') return 'sala';
    return 'admin';
  }, [userRoleMap, userNameRoleMap]);

  const todayKey = new Date().toLocaleDateString('es-BO', { timeZone: 'America/La_Paz' });

  const todayStats = useMemo(() => {
    const todayItems = history.filter(h => h.timestamp &&
      new Date(h.timestamp).toLocaleDateString('es-BO', { timeZone: 'America/La_Paz' }) === todayKey
    );
    const byRole: Record<string, number> = {};
    todayItems.forEach(h => {
      const r = getUserRole(h);
      byRole[r] = (byRole[r] || 0) + 1;
    });
    return {
      total: todayItems.length,
      analista: byRole['analista'] || 0,
      ejecutor: byRole['ejecutor'] || 0,
      sala: byRole['sala'] || 0,
      proveedor: byRole['proveedor'] || 0,
    };
  }, [history, getUserRole, todayKey]);

  const filtered = useMemo(() => {
    return history.filter(item => {
      if (!item.timestamp) return false;
      const itemRole = getUserRole(item);
      if (filterRole !== 'all' && itemRole !== filterRole) return false;
      if (filterUser !== 'all' && item.user !== filterUser) return false;
      return true;
    });
  }, [history, filterRole, filterUser, getUserRole]);

  const grouped = useMemo(() => {
    const groups: Record<string, { dateLabel: string; hourLabel: string; items: HistoryEvent[] }> = {};
    filtered.forEach(item => {
      if (!item.timestamp) return;
      const dk = getDateKey(item.timestamp);
      const hl = getHourLabel(item.timestamp);
      const key = `${dk}__${hl}`;
      if (!groups[key]) groups[key] = { dateLabel: toBoliviaDate(item.timestamp), hourLabel: hl, items: [] };
      groups[key].items.push(item);
    });
    return Object.entries(groups)
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([, v]) => v);
  }, [filtered]);

  const uniqueUsers = useMemo(() => Array.from(new Set(history.map(h => h.user).filter(Boolean))), [history]);
  const rolePills = ['all', 'analista', 'ejecutor', 'sala', 'proveedor', 'admin'];

  return (
    <div className="p-6 space-y-5 overflow-y-auto h-full bg-gray-50">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <Activity className="w-6 h-6 text-indigo-600" />
            Monitor de Actividad
          </h2>
          <p className="text-xs text-gray-400 mt-0.5">Detecta cambios cada 12s · sin recarga de página</p>
        </div>
        <div className="flex items-center gap-2">
          {newEntryCount > 0 && (
            <span className="text-[11px] bg-green-100 text-green-700 border border-green-200 px-2.5 py-1 rounded-full font-semibold animate-pulse">
              +{newEntryCount} nuevo{newEntryCount > 1 ? 's' : ''}
            </span>
          )}
          <span className="text-[11px] text-gray-400">
            {lastRefresh.toLocaleTimeString('es-BO', { timeZone: 'America/La_Paz', hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </span>
          <button
            onClick={() => { setNewEntryCount(0); _historyCache = []; initialLoad(); }}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors text-xs disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Actualizar
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-5 gap-3">
        <StatCard label="Hoy Total" value={todayStats.total}
          icon={<Zap className="w-4 h-4 text-gray-400" />}
          colorClass="text-gray-900" bgClass="bg-white border-gray-200" />
        <StatCard label="Analista" value={todayStats.analista}
          icon={<Users className="w-4 h-4 text-blue-400" />}
          colorClass="text-blue-900" bgClass="bg-blue-50 border-blue-200" />
        <StatCard label="Ejecutor" value={todayStats.ejecutor}
          icon={<TrendingUp className="w-4 h-4 text-indigo-400" />}
          colorClass="text-indigo-900" bgClass="bg-indigo-50 border-indigo-200" />
        <StatCard label="Sala" value={todayStats.sala}
          icon={<ShoppingBag className="w-4 h-4 text-teal-400" />}
          colorClass="text-teal-900" bgClass="bg-teal-50 border-teal-200" />
        <StatCard label="Proveedor" value={todayStats.proveedor}
          icon={<Upload className="w-4 h-4 text-purple-400" />}
          colorClass="text-purple-900" bgClass="bg-purple-50 border-purple-200" />
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Rol:</span>
          {rolePills.map(role => {
            const rc = ROLE_CONFIG[role];
            const active = filterRole === role;
            return (
              <button
                key={role}
                onClick={() => setFilterRole(role)}
                className={`px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors border ${
                  active
                    ? role === 'all'
                      ? 'bg-gray-800 text-white border-gray-800'
                      : `${rc?.bg} ${rc?.color} border-current`
                    : 'bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100'
                }`}
              >
                {role === 'all' ? 'Todos' : rc?.label || role}
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <select value={filterUser} onChange={e => setFilterUser(e.target.value)}
            className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-300">
            <option value="all">Todos los usuarios</option>
            {uniqueUsers.map(u => <option key={u} value={u}>{u}</option>)}
          </select>

          <select value={filterAction} onChange={e => setFilterAction(e.target.value)}
            className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-300">
            <option value="all">Todas las acciones</option>
            {Object.entries(ACTION_CONFIG).map(([k, v]) => (
              <option key={k} value={k}>{v.label}</option>
            ))}
          </select>

          <select value={filterDate} onChange={e => setFilterDate(e.target.value)}
            className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-300">
            <option value="today">Hoy</option>
            <option value="yesterday">Ayer</option>
            <option value="week">Última semana</option>
            <option value="all">Todo el historial</option>
          </select>

          <div className="relative flex-1 min-w-[180px]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
            <input type="text" placeholder="Buscar producto, proveedor, usuario..."
              value={searchTerm} onChange={e => handleSearchChange(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300" />
          </div>

          <span className="text-[11px] text-gray-400 whitespace-nowrap ml-auto">
            {filtered.length} {filtered.length === 1 ? 'registro' : 'registros'}
          </span>
        </div>
      </div>

      {/* Timeline */}
      <div className="space-y-3">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <RefreshCw className="w-7 h-7 text-indigo-300 animate-spin" />
            <span className="text-xs text-gray-400">Cargando actividad...</span>
          </div>
        ) : grouped.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
            <Activity className="w-10 h-10 text-gray-200 mx-auto mb-3" />
            <p className="text-sm text-gray-400 font-medium">Sin actividad</p>
            <p className="text-xs text-gray-300 mt-1">No hay registros para los filtros seleccionados</p>
          </div>
        ) : (
          grouped.map((group, gi) => (
            <div key={`${group.dateLabel}-${group.hourLabel}`} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="bg-gray-50 border-b border-gray-100 px-4 py-2 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Clock className="w-3.5 h-3.5 text-gray-400" />
                  <span className="text-[11px] font-semibold text-gray-600">{group.dateLabel}</span>
                  <span className="text-gray-300">·</span>
                  <span className="text-[11px] font-mono text-gray-700">{group.hourLabel}</span>
                </div>
                <span className="text-[10px] bg-gray-200 text-gray-600 px-2 py-0.5 rounded-full font-semibold">
                  {group.items.length} {group.items.length === 1 ? 'acción' : 'acciones'}
                </span>
              </div>

              <div className="divide-y divide-gray-50">
                {group.items.map((item, idx) => {
                  let ac = ACTION_CONFIG[item.action] || ACTION_CONFIG.OTHER;
                  if (item.action === 'PROVIDER_UPDATE') {
                    const pChanged = item.oldPrice !== undefined && item.newPrice !== undefined &&
                      Math.abs(Number(item.oldPrice) - Number(item.newPrice)) > 0.001;
                    const cChanged = item.oldCost !== undefined && item.newCost !== undefined &&
                      Math.abs(Number(item.oldCost) - Number(item.newCost)) > 0.001;
                    if (cChanged && !pChanged) ac = { ...ac, label: 'Costo ↑ · Precio Igual' };
                    else if (pChanged && !cChanged) ac = { ...ac, label: 'Precio ↑ · Costo Igual' };
                    else if (cChanged && pChanged) ac = { ...ac, label: 'Costo y Precio ↑' };
                  }
                  const itemRole = getUserRole(item);
                  const rc = ROLE_CONFIG[itemRole] || ROLE_CONFIG.admin;
                  const hasP = item.oldPrice !== undefined || item.newPrice !== undefined;
                  const hasC = item.oldCost !== undefined || item.newCost !== undefined;

                  return (
                    <div key={idx} className="px-4 py-2.5 flex items-center gap-4 hover:bg-gray-50/60 transition-colors">
                      {/* Time */}
                      <div className="w-10 shrink-0 text-right">
                        <span className="text-[10px] font-mono text-gray-400">
                          {item.timestamp ? toBoliviaTime(item.timestamp) : '—'}
                        </span>
                      </div>

                      {/* Role + User */}
                      <div className="w-28 shrink-0">
                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${rc.bg} ${rc.color}`}>
                          {rc.label}
                        </span>
                        <p className="text-[11px] text-gray-700 font-medium mt-0.5 truncate">{item.user || '—'}</p>
                      </div>

                      {/* Action badge */}
                      <div className="w-36 shrink-0">
                        <span className={`text-[9px] font-semibold px-2 py-0.5 rounded border ${ac.bg} ${ac.color} ${ac.border}`}>
                          {ac.label}
                        </span>
                      </div>

                      {/* Product + Provider */}
                      <div className="flex-1 min-w-0">
                        {item.productName
                          ? <p className="text-xs font-medium text-gray-800 truncate">{item.productName}</p>
                          : item.details
                            ? <p className="text-xs text-gray-500 truncate">{item.details}</p>
                            : null
                        }
                        {item.provider && (
                          <p className="text-[10px] text-gray-400 truncate">{item.provider}</p>
                        )}
                      </div>

                      {/* Price / Cost delta */}
                      <div className="shrink-0 text-right space-y-0.5 min-w-[110px]">
                        {hasP && (
                          <div className="flex items-center justify-end gap-1 text-[10px]">
                            <span className="text-gray-400">P:</span>
                            {item.oldPrice !== undefined && (
                              <span className="text-gray-400 line-through">Bs{Number(item.oldPrice).toFixed(2)}</span>
                            )}
                            {item.newPrice !== undefined && (
                              <>
                                <ArrowRight className="w-2.5 h-2.5 text-gray-300" />
                                <span className="text-green-600 font-semibold">Bs{Number(item.newPrice).toFixed(2)}</span>
                              </>
                            )}
                          </div>
                        )}
                        {hasC && (
                          <div className="flex items-center justify-end gap-1 text-[10px]">
                            <span className="text-gray-400">C:</span>
                            {item.oldCost !== undefined && (
                              <span className="text-gray-400 line-through">Bs{Number(item.oldCost).toFixed(2)}</span>
                            )}
                            {item.newCost !== undefined && (
                              <>
                                <ArrowRight className="w-2.5 h-2.5 text-gray-300" />
                                <span className="text-amber-600 font-semibold">Bs{Number(item.newCost).toFixed(2)}</span>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
