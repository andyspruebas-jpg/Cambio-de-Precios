import React, { useState, useEffect } from 'react';
import { MergedItem } from '../types';
import { CheckCircle, Tag, Clock, Trash2, Bell, Store, ArrowLeft, Download } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { StorageService } from '../services/storageService';
import { HistoryService } from '../services/historyService';
import { downloadExcel } from '../services/excelService';
import { formatPrice } from '../utils/formatters';

interface Props {
  items: MergedItem[];
  onExecute: (id: string) => void;
  onDeleteItem: (id: string) => void;
  onClearShared?: () => void;
  onNotify: (type: 'success' | 'error' | 'info', title: string, message: string) => void;
}

const SALAS = [
  { id: '5', name: 'Achumani' },
  { id: '6', name: 'Obrajes' },
  { id: '7', name: 'San Miguel' },
  { id: '8', name: 'YY Potosi' },
  { id: '9', name: 'YY Sopocachi' }
];

export const StoreExecution: React.FC<Props> = ({ items, onExecute, onDeleteItem, onClearShared, onNotify }) => {
  const { user } = useAuth();
  const [sharedPendingChanges, setSharedPendingChanges] = useState<MergedItem[]>([]);
  const [executedBarcodes, setExecutedBarcodes] = useState<Set<string>>(new Set());
  const [selectedSala, setSelectedSala] = useState<string | null>(null);
  const [salaHistory, setSalaHistory] = useState<any[]>([]);
  const [salaHistoryPage, setSalaHistoryPage] = useState(1);
  const [showSalaHistory, setShowSalaHistory] = useState(false);
  // Initialize with local YYYY-MM-DD
  const [reportDate, setReportDate] = useState(() => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  });


  // Load history to get locally executed items for CURRENT USER
  useEffect(() => {
    const loadExecutedItems = async () => {
      const history = await HistoryService.getHistory(user?.id || null, user?.role);

      // Filter history to ONLY include executions by the current user
      // This ensures that executions by 'Achumani' do not hide items for 'Obrajes'
      const executed = new Set(
        history
          .filter(h => h.action === 'STORE_EXECUTION' && h.userId === user?.id)
          .map(h => h.productId)
          .filter(Boolean)
      );
      setExecutedBarcodes(executed);
    };
    if (user) {
      loadExecutedItems();
    }
  }, [selectedSala, user]); // Reload when user or view changes

  // Load sala specific history
  useEffect(() => {
    if (selectedSala) {
      const loadSalaHistory = async () => {
        const history = await HistoryService.getHistory(user?.id || null, user?.role);
        const filtered = history.filter(h => h.userId === selectedSala && h.action === 'STORE_EXECUTION');
        setSalaHistory(filtered);
      };
      loadSalaHistory();
    }
  }, [selectedSala]);

  // Load shared pending changes for ALL users (not just sala)
  useEffect(() => {
    const loadChanges = async () => {
      const changes = await StorageService.loadPendingStoreChanges();
      setSharedPendingChanges(changes);
      console.log(`📥 Cargados ${changes.length} cambios pendientes compartidos`);
    };

    // Load immediately
    loadChanges();

    // Reload every 3 seconds to catch new changes
    const interval = setInterval(loadChanges, 15000); // 15s is sufficient

    return () => clearInterval(interval);
    // Run for all users

    // AUTO-FIX: Check for pricing discrepancies (Bug Recovery)
    // This repairs items where the price change was lost during System Update due to the 'cost-overrides-price-approval' bug.
    const repairPricingDiscrepancies = async () => {
      const storeChanges = await StorageService.loadPendingStoreChanges();
      const odooUpdates = await StorageService.loadPendingOdooUpdates();

      let fixedCount = 0;
      const repairedChanges = storeChanges.map(storeItem => {
        // Only target items that look "unchanged" in the store list
        if (Math.abs(storeItem.newPrice - storeItem.price) < 0.01) {
          // Find original source of truth
          const sourceItem = odooUpdates.find(o => o.barcode === storeItem.barcode);

          // If source had a real price change
          if (sourceItem && Math.abs(sourceItem.newPrice - sourceItem.price) > 0.01) {
            console.log(`🔧 REPAIRING Item: ${storeItem.description}. Fixing Price ${storeItem.newPrice} -> ${sourceItem.newPrice}`);
            fixedCount++;
            return {
              ...storeItem,
              newPrice: sourceItem.newPrice
            };
          }
        }
        return storeItem;
      });

      // AUTO-CLEANUP: Remove items that genuinely have NO price change (Pure Cost Updates)
      const validStoreChanges = repairedChanges.filter(item => Math.abs(item.newPrice - item.price) > 0.005);
      const deletedCount = repairedChanges.length - validStoreChanges.length;

      if (fixedCount > 0 || deletedCount > 0) {
        await StorageService.savePendingStoreChanges(validStoreChanges);
        setSharedPendingChanges(validStoreChanges);
        if (fixedCount > 0) onNotify('success', 'Corrección Automática', `Se corrigieron los precios de ${fixedCount} productos.`);
        if (deletedCount > 0) onNotify('info', 'Limpieza de Sala', `Se eliminaron ${deletedCount} actualizaciones internas de costo.`);
      }
    };

    // Run repair check once on mount (with a small delay to ensure loads are ready)
    setTimeout(repairPricingDiscrepancies, 2000);

  }, []); // Run for all users

  // Handler for Sala to execute changes from shared list
  const handleExecuteInSala = async (id: string) => {
    if (user?.role === 'sala') {
      // Find the item
      const item = sharedPendingChanges.find(i => i.id === id);
      if (item) {
        // Record in history with complete product data
        HistoryService.addEvent({
          action: 'STORE_EXECUTION',
          productId: item.barcode,
          productName: item.description,
          provider: item.batchSupplierName || item.supplierName || item.provider,
          oldPrice: item.price,
          newPrice: item.newPrice,
          oldCost: item.cost,
          newCost: item.newCost,
          details: `Ejecutado en sala de ventas - Precio: Bs${formatPrice(item.newPrice, item.provider || item.batchSupplierName || item.supplierName)}`,
          userId: user.id,
          userName: user.name,
          systemUpdatedAt: item.systemUpdatedAt || new Date().toISOString()
        });

        // Reload executed barcodes to update filter
        const history = await HistoryService.getHistory(user?.id || null, user?.role);
        const executed = new Set(
          history
            .filter(h => h.action === 'STORE_EXECUTION')
            .map(h => h.productId)
            .filter(Boolean)
        );
        setExecutedBarcodes(executed);

        // Mark as executed in ALL user workflow items (so it doesn't reappear for admins)
        Object.keys(localStorage).forEach(key => {
          if (key.startsWith('priceflow_workflow_items_')) {
            try {
              const items = JSON.parse(localStorage.getItem(key) || '[]');
              const updated = items.map((i: any) =>
                i.id === id ? { ...i, storeExecuted: true, storeExecutedAt: new Date().toISOString() } : i
              );
              localStorage.setItem(key, JSON.stringify(updated));
            } catch (error) {
              console.error(`Error updating ${key}:`, error);
            }
          }
        });

        // Mark as executed for THIS sala only (independent)
        // DEDUPLICATION LOGIC: Mark ALL pending items with same barcode and price change as executed
        const matchingItems = sharedPendingChanges.filter(i =>
          i.barcode === item.barcode &&
          i.price === item.price &&
          i.newPrice === item.newPrice
        );

        console.log(`🧹 Deduplicating execution: Marking ${matchingItems.length} matching items as executed for ${user.id}`);

        for (const mItem of matchingItems) {
          await StorageService.markChangeAsExecuted(mItem.id, user.id);
        }

        // Reload the list
        const changes = await StorageService.loadPendingStoreChanges();
        setSharedPendingChanges(changes);
        onNotify('success', 'Ejecutado en Sala', 'Cambio confirmado y registrado.');
      }
    } else {
      onDeleteItem(id);
    }
  };

  const handleDownloadDailyReport = async () => {
    if (!user) return;

    // Use selected date instead of calculation
    const targetDate = reportDate;

    // 1. Get Pending Items that arrived on Target Date
    const pendingToday = sharedPendingChanges.filter(i => {
      if (!i.systemUpdatedAt) return false;
      const date = new Date(i.systemUpdatedAt).toLocaleDateString('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit' });
      return date === targetDate;
    });

    // 2. Get Executed Items on Target Date (from history)
    const history = await HistoryService.getHistory(user?.id || null, user?.role);
    const executedToday = history.filter(h => {
      if (h.userId !== user.id || h.action !== 'STORE_EXECUTION') return false;
      const arrivalTime = h.systemUpdatedAt || h.timestamp;
      const date = new Date(arrivalTime).toLocaleDateString('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit' });
      return date === targetDate;
    });

    // 3. Merge lists (Prioritize executed history as it's the final state)
    const mergedMap = new Map();

    // Add pending first
    pendingToday.forEach(item => {
      mergedMap.set(item.barcode, {
        barcode: item.barcode,
        description: item.description,
        provider: item.provider || item.supplierName,
        oldPrice: item.price,
        newPrice: item.newPrice,
        timestamp: item.systemUpdatedAt
      });
    });

    // Overwrite/Add executed (they might be duplicates if I just executed them and they are still in pending list for others, but for me they are done)
    executedToday.forEach(h => {
      mergedMap.set(h.productId, {
        barcode: h.productId,
        description: h.productName,
        provider: h.provider,
        oldPrice: Number(h.oldPrice),
        newPrice: Number(h.newPrice),
        timestamp: h.timestamp
      });
    });

    const reportData = Array.from(mergedMap.values());
    console.log(`Generating daily report for ${targetDate} with ${reportData.length} items`);

    await downloadExcel(reportData, 'sala_daily', `sala_report_${targetDate}`);
  };

  const handleDeleteInSala = (id: string) => {
    onDeleteItem(id);
  };

  // Filter items: Must be updated in system, but not yet executed in store
  // ALL users now see the same shared pending changes from server
  // ALSO exclude items that are already in history as STORE_EXECUTION
  // NEW: Filter out items if current user has already executed them (via executedBy array)
  const filteredItems = sharedPendingChanges.filter(i =>
    i.systemUpdated &&
    !i.storeExecuted &&
    // For Admin/Analyst, show everything pending globally. For Sala, show only what THEY haven't executed.
    (user?.role !== 'sala' ? true : (!i.executedBy || !i.executedBy.includes(user?.id)))
  );

  // Removed deduplication to show ALL items and match the dashboard count (356)
  const pendingExecution = filteredItems;

  const getTimeSinceSystemUpdate = (item: MergedItem) => {
    const updateTime = item.systemUpdatedAt;
    if (!updateTime) return 'N/A';

    const diff = new Date().getTime() - new Date(updateTime).getTime();
    const minutes = Math.floor(diff / (1000 * 60));
    const hours = Math.floor(minutes / 60);

    if (hours >= 24) {
      const days = Math.floor(hours / 24);
      const remainingHours = hours % 24;
      return (
        <span className="font-bold text-red-600">
          {days}d {remainingHours}h
        </span>
      );
    }

    if (hours > 0) {
      return <span className={`font-bold ${hours > 4 ? 'text-red-600' : 'text-orange-600'}`}>{hours}h</span>;
    }
    return <span className="text-green-600 font-bold">{minutes}m</span>;
  };

  return (
    <div className="space-y-6">
      {/* View Controls (Admin Only) */}
      {user?.role !== 'sala' && (
        <div className="flex flex-wrap gap-2 mb-6 p-3 md:p-4 bg-gray-50 rounded-lg border border-gray-100">
          <div className="hidden md:flex items-center gap-2 mr-4">
            <Store className="w-5 h-5 text-gray-500" />
            <span className="text-sm font-semibold text-gray-700">Seleccionar Sala o Sucursal:</span>
          </div>
          {SALAS.map(sala => {
            // Fixed filter to include ALL items confirmed in Odoo
            const pendingItemsForSala = sharedPendingChanges.filter(i =>
              i.systemUpdated &&
              !i.storeExecuted &&
              (!i.executedBy || !i.executedBy.includes(sala.id))
            );

            const pendingCount = pendingItemsForSala.length;

            return (
              <button
                key={sala.id}
                onClick={() => setSelectedSala(selectedSala === sala.id ? null : sala.id)}
                className={`flex items-center gap-1 md:gap-2 px-2 md:px-4 py-2 rounded-lg text-sm md:text-base font-medium transition-all ${selectedSala === sala.id
                  ? 'bg-blue-600 text-white shadow-md ring-2 ring-blue-200'
                  : 'bg-white text-gray-600 hover:bg-blue-50 hover:text-blue-600 border border-gray-200'
                  }`}
              >
                <span className="whitespace-nowrap">{sala.name}</span>
                {pendingCount > 0 && (
                  <span className={`px-1.5 md:px-2 py-0.5 rounded-full text-xs ${selectedSala === sala.id ? 'bg-blue-500 text-white' : 'bg-red-100 text-red-600'
                    }`}>
                    {pendingCount}
                  </span>
                )}
              </button>
            );
          })}

          {/* Historial Button */}
          {selectedSala && (
            <button
              onClick={() => {
                const newState = !showSalaHistory;
                setShowSalaHistory(newState);
                if (newState) {
                  setSalaHistoryPage(1);
                  // Scroll to history section
                  setTimeout(() => {
                    const historyElement = document.getElementById('sala-history-section');
                    if (historyElement) {
                      historyElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }
                  }, 100);
                }
              }}
              className={`flex items-center gap-1 md:gap-2 px-2 md:px-4 py-2 rounded-lg text-sm md:text-base font-medium transition-all w-full md:w-auto md:ml-auto ${showSalaHistory
                ? 'bg-purple-600 text-white shadow-md ring-2 ring-purple-200'
                : 'bg-white text-gray-600 hover:bg-purple-50 hover:text-purple-600 border border-gray-200'
                }`}
            >
              <Clock className="w-4 md:w-5 h-4 md:h-5" />
              <span className="whitespace-nowrap">{showSalaHistory ? 'Ocultar Historial' : 'Ver Historial'}</span>
              {salaHistory.length > 0 && (
                <span className={`px-1.5 md:px-2 py-0.5 rounded-full text-xs ${showSalaHistory ? 'bg-purple-500 text-white' : 'bg-purple-100 text-purple-600'
                  }`}>
                  {salaHistory.length}
                </span>
              )}
            </button>
          )}
        </div>
      )}

      {/* Main Content Area */}
      {selectedSala ? (
        <div className="space-y-8">
          {/* 1. Pending Items for Selected Sala */}
          <div className="bg-white rounded-lg shadow-lg overflow-hidden border-t-4 border-orange-500">
            <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-orange-50">
              <div>
                <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                  <Tag className="w-6 h-6 text-orange-600" />
                  Pendientes: {SALAS.find(s => s.id === selectedSala)?.name}
                </h2>
                <p className="text-sm text-gray-600 mt-1">
                  Productos que esta sala debe actualizar.
                </p>
              </div>
            </div>
            {/* Calculate pending specifically for this sala */}
            {(() => {
              // Simplified filter (Fixes 40 vs 356)
              const pendingForSala = sharedPendingChanges.filter(i =>
                i.systemUpdated && !i.storeExecuted &&
                (!i.executedBy || !i.executedBy.includes(selectedSala))
              );

              return pendingForSala.length === 0 ? (
                <div className="p-8 text-center text-gray-500 flex flex-col items-center">
                  <CheckCircle className="w-12 h-12 text-green-300 mb-2" />
                  <p>No hay cambios pendientes para {SALAS.find(s => s.id === selectedSala)?.name}</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full w-max text-left border-collapse">
                    <thead>
                      <tr className="bg-gray-50 text-gray-600 text-sm uppercase tracking-wider">
                        <th className="p-4 border-b">Código</th>
                        <th className="p-4 border-b">Producto</th>
                        <th className="p-4 border-b text-right">Precio Actual</th>
                        <th className="p-4 border-b text-right">Nuevo Precio</th>
                        <th className="p-4 border-b text-center">Acción</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {pendingForSala.map(item => (
                        <tr key={item.id} className="hover:bg-gray-50">
                          <td className="p-4 font-mono text-sm">{item.barcode}</td>
                          <td className="p-4 min-w-[500px] whitespace-normal">
                            <div className="font-medium text-gray-800 whitespace-normal break-words leading-tight">{item.description}</div>
                          </td>
                          <td className="p-4 text-right text-gray-500 line-through whitespace-nowrap">Bs{formatPrice(item.price, item.provider || item.batchSupplierName || item.supplierName)}</td>
                          <td className="p-4 text-right font-bold text-orange-600 whitespace-nowrap">Bs{formatPrice(item.newPrice, item.provider || item.batchSupplierName || item.supplierName)}</td>
                          <td className="p-4 text-center">
                            <div className="flex flex-col items-center gap-1">
                              {getTimeSinceSystemUpdate(item)}
                              <button
                                onClick={() => handleDeleteInSala(item.id)}
                                className="text-red-600 hover:text-red-800 text-xs mt-1"
                                title="Eliminar Globalmente"
                              >
                                <Trash2 className="w-4 h-4 inline" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              );
            })()}
          </div>


          {/* 2. Execution History for Selected Sala */}
          <div id="sala-history-section" className="bg-white rounded-lg shadow-lg overflow-hidden border-t-4 border-purple-500">
            <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-purple-50">
              <div>
                <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                  <Clock className="w-6 h-6 text-purple-600" />
                  Historial Ejecutado: {SALAS.find(s => s.id === selectedSala)?.name}
                </h2>
              </div>
              <div className="flex items-center gap-3">
                <div className="bg-purple-100 text-purple-800 px-3 py-1 rounded-full text-sm font-medium">
                  Total: {salaHistory.length}
                </div>
                <button
                  onClick={() => {
                    const newState = !showSalaHistory;
                    setShowSalaHistory(newState);
                    if (newState) {
                      setSalaHistoryPage(1); // Reset to first page when opening
                    }
                  }}
                  className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors text-sm font-medium"
                >
                  {showSalaHistory ? 'Ocultar' : 'Ver Historial'}
                </button>
              </div>
            </div>
            {showSalaHistory && (
              <div className="overflow-x-auto">
                {salaHistory.length === 0 ? (
                  <div className="p-8 text-center text-gray-500">
                    No hay registros de ejecución para esta sala.
                  </div>
                ) : (
                  <>
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-gray-50 text-gray-600 text-sm uppercase tracking-wider">
                          <th className="p-4 border-b">Hora</th>
                          <th className="p-4 border-b">Código</th>
                          <th className="p-4 border-b">Producto</th>
                          <th className="p-4 border-b text-right">Precio Nuevo</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {(() => {
                          // Sort by most recent first
                          const sortedHistory = [...salaHistory].sort((a, b) =>
                            new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
                          );

                          // Pagination
                          const itemsPerPage = 10;
                          const startIdx = (salaHistoryPage - 1) * itemsPerPage;
                          const endIdx = startIdx + itemsPerPage;
                          const paginatedHistory = sortedHistory.slice(startIdx, endIdx);

                          return paginatedHistory.map((h, idx) => (
                            <tr key={idx} className="hover:bg-gray-50">
                              <td className="p-4 text-gray-500 text-sm">
                                {new Date(h.timestamp).toLocaleString()}
                              </td>
                              <td className="p-4 font-mono text-sm">{h.productId}</td>
                              <td className="p-4 font-medium text-gray-800">{h.productName}</td>
                              <td className="p-4 text-right font-bold text-green-600">
                                Bs{formatPrice(h.newPrice || 0, h.provider)}
                              </td>
                            </tr>
                          ));
                        })()}
                      </tbody>
                    </table>

                    {/* Pagination Controls */}
                    {salaHistory.length > 10 && (
                      <div className="p-4 border-t border-gray-100 flex justify-between items-center bg-gray-50">
                        <div className="text-sm text-gray-600">
                          Mostrando {((salaHistoryPage - 1) * 10) + 1} - {Math.min(salaHistoryPage * 10, salaHistory.length)} de {salaHistory.length}
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => setSalaHistoryPage(Math.max(1, salaHistoryPage - 1))}
                            disabled={salaHistoryPage === 1}
                            className={`px-3 py-1 rounded text-sm font-medium ${salaHistoryPage === 1
                              ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                              : 'bg-purple-600 text-white hover:bg-purple-700'
                              }`}
                          >
                            Anterior
                          </button>
                          <span className="px-3 py-1 text-sm text-gray-600">
                            Página {salaHistoryPage} de {Math.ceil(salaHistory.length / 10)}
                          </span>
                          <button
                            onClick={() => setSalaHistoryPage(Math.min(Math.ceil(salaHistory.length / 10), salaHistoryPage + 1))}
                            disabled={salaHistoryPage >= Math.ceil(salaHistory.length / 10)}
                            className={`px-3 py-1 rounded text-sm font-medium ${salaHistoryPage >= Math.ceil(salaHistory.length / 10)
                              ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                              : 'bg-purple-600 text-white hover:bg-purple-700'
                              }`}
                          >
                            Siguiente
                          </button>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      ) : (
        /* No Sala Selected (Summary or User View) */
        user?.role !== 'sala' ? (
          // Admin Summary View
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <div className="col-span-full bg-blue-50 p-8 rounded-lg text-center border border-blue-100">
              <Store className="w-16 h-16 text-blue-400 mx-auto mb-4" />
              <h2 className="text-2xl font-bold text-gray-800">Panel de Control de Salas</h2>
              <p className="text-gray-600 mt-2">Seleccione una sala arriba para ver sus pendientes y su historial de ejecución independiente.</p>
            </div>

            {/* Quick cards for pending counts */}
            {SALAS.map(sala => {
              const pendingItemsForSala = sharedPendingChanges.filter(i =>
                i.systemUpdated && !i.storeExecuted &&
                (!i.executedBy || !i.executedBy.includes(sala.id))
              );

              const pendingCount = pendingItemsForSala.length;

              return (
                <div key={sala.id} onClick={() => setSelectedSala(sala.id)} className="bg-white p-6 rounded-lg shadow cursor-pointer hover:shadow-lg transition-all border-t-4 border-blue-500">
                  <h3 className="font-bold text-gray-800 text-lg mb-2">{sala.name}</h3>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-500 text-sm">Pendientes por confirmar</span>
                    <span className={`text-2xl font-bold ${pendingCount > 0 ? 'text-red-500' : 'text-green-500'}`}>{pendingCount}</span>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* User (Sala) View - "Mis Pendientes" */
          <div className="bg-white rounded-lg shadow-lg overflow-hidden">
            {filteredItems.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-64 text-gray-500 bg-white p-8">
                <CheckCircle className="w-16 h-16 text-green-500 mb-4" />
                <h2 className="text-xl font-semibold">¡Todo al día!</h2>
                <p>No tienes cambios pendientes en tu sala.</p>
              </div>
            ) : (
              <>
                <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-green-50">
                  <div>
                    <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                      <Tag className="w-6 h-6 text-green-600" />
                      Mis Pendientes ({user?.name || 'Sala'})
                    </h2>
                    <p className="text-sm text-gray-600 mt-1">
                      Debes actualizar estas etiquetas en tu sala.
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <input
                      type="date"
                      value={reportDate}
                      max={new Date().toLocaleDateString('en-CA')}
                      onChange={(e) => setReportDate(e.target.value)}
                      className="px-2 py-1.5 border border-green-200 rounded-lg text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-green-500 bg-white"
                    />
                    <button
                      onClick={handleDownloadDailyReport}
                      className="flex items-center gap-2 px-3 py-1.5 bg-white text-green-700 border border-green-200 rounded-lg hover:bg-green-100 transition-colors text-sm font-medium shadow-sm"
                      title="Descargar Reporte del Día Seleccionado"
                    >
                      <Download className="w-4 h-4" />
                      Reporte
                    </button>
                    <span className="bg-green-100 text-green-800 px-3 py-1 rounded-full text-sm font-medium">
                      {filteredItems.length} Pendientes
                    </span>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-gray-50 text-gray-600 text-sm uppercase tracking-wider">
                        <th className="p-4 border-b">Producto</th>
                        <th className="p-4 border-b text-right">Precio Ant.</th>
                        <th className="p-4 border-b text-right">Nuevo Precio</th>
                        <th className="p-4 border-b text-center">Acción</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {pendingExecution.map(item => (
                        <tr key={item.id} className="hover:bg-gray-50">
                          <td className="p-4 font-medium text-gray-800">
                            <div className="font-bold">{item.description}</div>
                            <div className="text-xs text-gray-400 font-mono">{item.barcode}</div>
                          </td>
                          <td className="p-4 text-right text-gray-500 line-through">Bs{formatPrice(item.price, item.provider || item.batchSupplierName || item.supplierName)}</td>
                          <td className="p-4 text-right">
                            <span className="text-lg font-bold text-green-600 bg-green-50 px-2 py-1 rounded">Bs{formatPrice(item.newPrice, item.provider || item.batchSupplierName || item.supplierName)}</span>
                          </td>
                          <td className="p-4 text-center">
                            <button
                              onClick={() => handleExecuteInSala(item.id)}
                              className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-md shadow-sm transition-all flex items-center gap-2 mx-auto"
                            >
                              <CheckCircle className="w-4 h-4" />
                              Confirmar
                            </button>
                            <div className="mt-1 text-xs">
                              {getTimeSinceSystemUpdate(item)}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        )
      )}
    </div>
  );
};
