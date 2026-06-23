import React, { useState, useEffect } from 'react';
import { MergedItem, ProviderFile } from '../types';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { TrendingUp, CheckCircle, AlertOctagon, ShoppingCart, Trash2, Clock, Layers } from 'lucide-react';
import { HistoryService, HistoryEvent } from '../services/historyService';
import { StorageService } from '../services/storageService';
import { ProductListModal } from './ProductListModal';
import { PendingSheetsModal } from './PendingSheetsModal';
import { useAuth } from '../contexts/AuthContext';


const SALAS = [
  { id: '5', name: 'Achumani' },
  { id: '6', name: 'Obrajes' },
  { id: '7', name: 'San Miguel' },
  { id: '8', name: 'YY Potosi' },
  { id: '9', name: 'YY Sopocachi' }
];

interface Props {
  items: MergedItem[];
  onNavigateToPendingSheets: () => void;
  onLoadSheet: (filename: string) => void;
}

export const Dashboard: React.FC<Props> = ({ items, onNavigateToPendingSheets, onLoadSheet }) => {
  const { user } = useAuth();
  const [history, setHistory] = useState<HistoryEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalTitle, setModalTitle] = useState('');
  const [modalItems, setModalItems] = useState<MergedItem[]>([]);

  // Global shared state for Admin Dashboard
  const [sharedOdooUpdates, setSharedOdooUpdates] = useState<MergedItem[]>([]);
  const [sharedStoreChanges, setSharedStoreChanges] = useState<MergedItem[]>([]);
  // Store global worksheet items for Admin visibility
  const [analystWorksheetItems, setAnalystWorksheetItems] = useState<MergedItem[]>([]);

  // Pending sheets state
  const [pendingSheetsOpen, setPendingSheetsOpen] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<ProviderFile[]>([]);
  const [pendingFilesCount, setPendingFilesCount] = useState(0);

  const [dateFilter, setDateFilter] = useState<'all' | 'today' | 'yesterday'>('all');

  // Filter history by date
  const filteredHistory = history.filter(h => {
    if (dateFilter === 'all') return true;
    const hDate = new Date(h.timestamp || '');
    hDate.setHours(0, 0, 0, 0);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (dateFilter === 'today') {
      return hDate.getTime() === today.getTime();
    } else if (dateFilter === 'yesterday') {
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      return hDate.getTime() === yesterday.getTime();
    }
    return true;
  });

  useEffect(() => {
    const fetchHistory = async () => {
      // Load ALL history events (from all users) plus shared pending lists for admin dashboard
      try {
        const [historyData, filesRes, odooUpdates, storeChanges, globalWorksheet] = await Promise.all([
          HistoryService.getHistory(user?.id || null, user?.role),
          fetch('/api/list-provider-csv').catch(() => null),
          StorageService.loadPendingOdooUpdates(),
          StorageService.loadPendingStoreChanges(),
          StorageService.loadGlobalWorksheetItems()
        ]);

        setHistory(historyData);
        setSharedOdooUpdates(odooUpdates || []);
        setSharedStoreChanges(storeChanges || []);
        setAnalystWorksheetItems(globalWorksheet || []);

        if (filesRes && filesRes.ok) {
          const data = await filesRes.json();
          setPendingFiles(data.files || []);
          setPendingFilesCount((data.files || []).length);
        }
      } catch (err) {
        console.error("Error loading dashboard data", err);
      }
      setLoading(false);
    };

    fetchHistory();

    // Auto-refresh every 5 seconds to show real-time updates from other users
    const interval = setInterval(fetchHistory, 30000); // 30s is enough for dashboard

    return () => clearInterval(interval);
  }, [user]);

  const handleClearHistory = async () => {
    if (window.confirm('¿Estás seguro de que deseas eliminar TODO EL SISTEMA (historial, items, Excel, CSVs, progreso)? NO SE PUEDE DESHACER.')) {
      try {
        console.log('🧹 ELIMINANDO TODO EL SISTEMA...');

        // Save user session to preserve login
        const currentUser = localStorage.getItem('priceflow_current_user');

        // 1. Clear backend - NOW DELETES EVERYTHING (history, progress, CSVs, providers)
        try {
          const response = await fetch('/api/clear-all-data', {
            method: 'DELETE'
          });
          if (response.ok) {
            console.log('✅ Servidor limpiado completamente');
          }
        } catch (e) {
          console.warn('⚠️ Error limpiando servidor:', e);
        }

        // Server already deleted everything, no need for individual calls

        // 2. Clear ALL localStorage EXCEPT user session
        const keysToRemove: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && key.startsWith('priceflow_') && key !== 'priceflow_current_user') {
            keysToRemove.push(key);
          }
        }

        keysToRemove.forEach(key => localStorage.removeItem(key));

        // Restore user session
        if (currentUser) {
          localStorage.setItem('priceflow_current_user', currentUser);
        }
        console.log(`✅ Limpiados ${keysToRemove.length} localStorage keys (sesión preservada)`);

        // 3. Clear IndexedDB
        try {
          const dbs = await indexedDB.databases();
          for (const db of dbs) {
            if (db.name && db.name.includes('PriceFlow')) {
              indexedDB.deleteDatabase(db.name);
              console.log(`✅ IndexedDB eliminado: ${db.name}`);
            }
          }
        } catch (e) {
          console.warn('⚠️ IndexedDB no soportado:', e);
        }

        console.log('✅ SISTEMA COMPLETAMENTE LIMPIO');
        setHistory([]);

        alert('✅ TODO ha sido eliminado. La sesión se mantiene activa. Recargando...');

        // Wait a bit to ensure all operations are complete
        await new Promise(resolve => setTimeout(resolve, 500));

        // Reload page
        window.location.reload();
      } catch (error) {
        console.error('❌ Error durante limpieza:', error);
        alert('⚠️ Hubo un error durante la limpieza. Recargando de todas formas...');
        window.location.reload();
      }
    }
  };


  const handleShowAllItems = () => {
    setModalTitle('Productos en Hoja de Trabajo (Pendientes)');

    // Choose which items to show:
    // If Admin: show Shared Analyst items
    // If Analyst/Other: show Local items
    const activeItems = user?.role === 'admin' ? analystWorksheetItems : items;

    setModalItems(activeItems.filter(i => !i.systemUpdated && !i.priceApproved));
    setModalOpen(true);
  };

  const handleShowApproved = () => {
    setModalTitle('Aprobados (Pendiente Actualizar Sistema)');
    setModalItems(sharedOdooUpdates);
    setModalOpen(true);
  };

  const handleShowConfirmed = () => {
    setModalTitle('Pendientes en Sala (En Sala)');
    setModalItems(confirmedChangesList);
    setModalOpen(true);
  };

  // Calculate executed per sala from history
  const getExecutedCount = (salaId: string) => {
    return filteredHistory.filter(h => h.action === 'STORE_EXECUTION' && h.userId === salaId).length;
  };

  const handleShowExecuted = (salaId?: string) => {
    const salaName = salaId ? SALAS.find(s => s.id === salaId)?.name : 'Tienda';
    setModalTitle(`Ejecutados en ${salaName}`);

    let filteredHistoryList = filteredHistory.filter(h => h.action === 'STORE_EXECUTION');
    if (salaId) {
      filteredHistoryList = filteredHistoryList.filter(h => h.userId === salaId);
    }

    // Build items from history events with complete data
    const executedFromHistory = filteredHistoryList.map(h => ({
      id: h.id || Math.random().toString(),
      barcode: h.productId || h.productCode || '',
      description: h.productName || '',
      provider: h.provider,
      batchSupplierName: h.provider,
      price: Number(h.oldPrice) || 0,
      newPrice: Number(h.newPrice) || 0,
      cost: Number(h.oldCost) || 0,
      newCost: Number(h.newCost) || 0,
      priceApproved: true,
      costApproved: true,
      systemUpdated: true,
      storeExecuted: true,
      storeExecutedAt: h.timestamp,
      createdBy: h.userName || h.user || 'N/A',
      createdAt: h.timestamp || new Date().toISOString(),
      updatedAt: h.timestamp || new Date().toISOString()
    } as MergedItem));

    setModalItems(executedFromHistory);
    setModalOpen(true);
  };

  const handlePendingSheetsClick = () => {
    setPendingSheetsOpen(true);
  };

  const handleSheetSelect = (filename: string) => {
    onLoadSheet(filename);
    setPendingSheetsOpen(false);
  };

  // KPI Calculations using GLOBAL shared state (ignoring local 'items' prop for counts)

  // Aprobados: Waiting for Odoo Update (Global)
  const approvedPrice = sharedOdooUpdates.length;

  // Pendientes en Sala: Waiting for Store Execution (Global)
  // Stop deduplicating and removed price filters to show all 356 confirmed items
  const confirmedChangesList = sharedStoreChanges.filter(i =>
    i.systemUpdated &&
    !i.storeExecuted
  );
  const confirmedChanges = confirmedChangesList.length;

  // Solicitudes Totales: Active Pipeline (Approved + Confirmed) -> NOW: Current Worksheet Items (Pending Only)
  // Logic: for Admin, show Analyst's Pending Items. For Analyst, show Local Pending Items.
  const activeItemsToCount = user?.role === 'admin' ? analystWorksheetItems : items;
  const worksheetPendingItems = activeItemsToCount.filter(i => !i.systemUpdated && !i.priceApproved);
  const totalItems = worksheetPendingItems.length;

  // Count UNIQUE executed products globally for the chart
  const storeExecutionsFromHistory = new Set(
    filteredHistory
      .filter(h => h.action === 'STORE_EXECUTION')
      .map(h => `${h.productId}_${h.newPrice || 0}`)
  ).size;

  // Calcular tiempo promedio en cola (desde actualización en sistema hasta ejecución en sala)
  const executedEvents = filteredHistory.filter(h =>
    h.action === 'STORE_EXECUTION' && h.systemUpdatedAt && h.timestamp
  );

  const avgQueueTime = executedEvents.length > 0
    ? executedEvents.reduce((sum, event) => {
      const systemUpdateTime = new Date(event.systemUpdatedAt!).getTime();
      const executionTime = new Date(event.timestamp!).getTime();
      const diffHours = (executionTime - systemUpdateTime) / (1000 * 60 * 60);
      return sum + diffHours;
    }, 0) / executedEvents.length
    : 0;

  // Formatear tiempo promedio
  const formatAvgTime = (hours: number) => {
    if (hours < 1) return `${Math.round(hours * 60)}m`;
    if (hours >= 24) {
      const d = Math.floor(hours / 24);
      const h = Math.round(hours % 24);
      return `${d}d ${h}h`;
    }
    return `${hours.toFixed(1)}h`;
  };

  // Pie chart data from current items state
  const dataStatus = [
    { name: 'En Proceso (Odoo)', value: approvedPrice, color: '#3b82f6' }, // Azul
    { name: 'En Sala (Confirmados)', value: confirmedChanges, color: '#f97316' }, // Naranja
    { name: 'Ejecutados', value: storeExecutionsFromHistory, color: '#10b981' }, // Verde
  ].filter(item => item.value > 0);

  // If no data, show a placeholder
  const chartData = dataStatus.length > 0 ? dataStatus : [{ name: 'Sin Actividad Reciente', value: 1, color: '#e5e7eb' }];

  // Price Impact Data from history - Filter for definitive actions only
  const priceChanges = filteredHistory.filter(h =>
    (h.action === 'STORE_EXECUTION' || (h.action === 'PROVIDER_UPDATE' && h.details?.includes('Confirmado'))) &&
    h.oldPrice !== undefined && h.newPrice !== undefined
  );
  const impactData = [
    { name: 'Sin Cambios', count: priceChanges.filter(h => h.newPrice === h.oldPrice).length },
    { name: 'Aumento < 5%', count: priceChanges.filter(h => h.newPrice! > h.oldPrice! && h.newPrice! <= h.oldPrice! * 1.05).length },
    { name: 'Aumento > 5%', count: priceChanges.filter(h => h.newPrice! > h.oldPrice! * 1.05).length },
    { name: 'Bajada', count: priceChanges.filter(h => h.newPrice! < h.oldPrice!).length },
  ];

  return (
    <>
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-2xl font-bold text-gray-800">Resumen General</h2>
            <p className="text-gray-500 text-sm">Métricas y estadísticas del sistema</p>
          </div>
          <div className="flex items-center gap-3">
            <select
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value as 'all' | 'today' | 'yesterday')}
              className="border border-gray-300 rounded-lg px-4 py-2 text-sm bg-white hover:border-gray-400 transition-colors"
            >
              <option value="all">Todas las fechas</option>
              <option value="today">Hoy</option>
              <option value="yesterday">Ayer</option>
            </select>
            <button
              onClick={handleClearHistory}
              className="flex items-center gap-2 px-4 py-2 text-red-600 hover:bg-red-50 border border-red-300 rounded-lg transition-colors"
              title="Eliminar historial"
            >
              <Trash2 className="w-4 h-4" />
              <span className="text-sm font-medium">Limpiar Todo</span>
            </button>
          </div>
        </div>

        {/* Row 1: General Pipeline Metrics */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          <div
            onClick={handlePendingSheetsClick}
            className="bg-white p-4 rounded-lg shadow border-l-4 border-purple-500 flex items-center justify-between cursor-pointer hover:shadow-lg transition-shadow"
          >
            <div>
              <p className="text-gray-500 text-sm">Hojas Pendientes</p>
              <h3 className="text-2xl font-bold text-purple-600">{pendingFilesCount}</h3>
              <p className="text-xs text-gray-400 mt-1">Archivos sin procesar</p>
            </div>
            <Layers className="text-purple-200 w-8 h-8" />
          </div>
          <div onClick={handleShowAllItems} className="bg-white p-4 rounded-lg shadow border-l-4 border-gray-400 flex items-center justify-between cursor-pointer hover:shadow-lg transition-shadow">
            <div>
              <p className="text-gray-500 text-sm">Solicitudes Totales</p>
              <h3 className="text-2xl font-bold text-gray-800">{totalItems}</h3>
            </div>
            <TrendingUp className="text-gray-300 w-8 h-8" />
          </div>
          <div onClick={handleShowApproved} className="bg-white p-4 rounded-lg shadow border-l-4 border-blue-500 flex items-center justify-between cursor-pointer hover:shadow-lg transition-shadow">
            <div>
              <p className="text-gray-500 text-sm">Aprobados</p>
              <h3 className="text-2xl font-bold text-blue-600">{approvedPrice}</h3>
            </div>
            <CheckCircle className="text-blue-200 w-8 h-8" />
          </div>
          <div onClick={handleShowConfirmed} className="bg-white p-4 rounded-lg shadow border-l-4 border-orange-500 flex items-center justify-between cursor-pointer hover:shadow-lg transition-shadow">
            <div>
              <p className="text-gray-500 text-sm">Pendientes en Sala</p>
              <h3 className="text-2xl font-bold text-orange-600">{confirmedChanges}</h3>
            </div>
            <ShoppingCart className="text-orange-200 w-8 h-8" />
          </div>
          <div className="bg-white p-4 rounded-lg shadow border-l-4 border-indigo-500 flex items-center justify-between hover:shadow-lg transition-shadow">
            <div>
              <p className="text-gray-500 text-sm">Tiempo Promedio</p>
              <h3 className="text-2xl font-bold text-indigo-600">{formatAvgTime(avgQueueTime)}</h3>
              <p className="text-xs text-gray-400 mt-1">En cola de ejecución</p>
            </div>
            <Clock className="text-indigo-200 w-8 h-8" />
          </div>
        </div>

        {/* Row 2: Per-Sala Execution Metrics */}
        <h3 className="text-lg font-semibold text-gray-700 mt-2">Ejecución en Salas</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          {SALAS.map(sala => (
            <div
              key={sala.id}
              onClick={() => handleShowExecuted(sala.id)}
              className="bg-white p-4 rounded-lg shadow border-l-4 border-green-500 flex items-center justify-between cursor-pointer hover:shadow-lg transition-shadow"
            >
              <div>
                <p className="text-gray-500 text-xs font-semibold uppercase tracking-wide">{sala.name}</p>
                <h3 className="text-2xl font-bold text-green-600">{getExecutedCount(sala.id)}</h3>
              </div>
              <CheckCircle className="text-green-200 w-6 h-6" />
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white p-6 rounded-lg shadow overflow-hidden" style={{ height: '350px' }}>
            <h3 className="text-lg font-bold text-gray-800 mb-4">Estado del Flujo de Trabajo</h3>
            <div style={{ width: '100%', height: 'calc(100% - 40px)' }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={chartData}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={70}
                    fill="#8884d8"
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {chartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-white p-6 rounded-lg shadow overflow-hidden" style={{ height: '350px' }}>
            <h3 className="text-lg font-bold text-gray-800 mb-4">Impacto en Precios</h3>
            <div style={{ width: '100%', height: 'calc(100% - 40px)' }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={impactData}
                  margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="count" fill="#4f46e5" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </div>

      <ProductListModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={modalTitle}
        items={modalItems}
      />

      <PendingSheetsModal
        isOpen={pendingSheetsOpen}
        onClose={() => setPendingSheetsOpen(false)}
        files={pendingFiles}
        onSelect={handleSheetSelect}
      />
    </>
  );
};