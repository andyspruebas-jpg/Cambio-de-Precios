import React, { useState, useEffect, useMemo } from 'react';
import { StorageService } from '../services/storageService';
import { HistoryService } from '../services/historyService';
import { updateProductPrice } from '../services/odooService';
import { useAuth } from '../contexts/AuthContext';
import { RotateCcw, AlertTriangle, Search, CheckSquare, Square, Save, Loader2 } from 'lucide-react';

interface OdooProduct {
  barcode: string;
  price: number;
  cost: number;
  description?: string;
}

interface Props {
  addNotification: (type: 'success' | 'error' | 'info', title: string, message: string) => void;
  odooProducts?: OdooProduct[];
}

export const RevertChanges: React.FC<Props> = ({ addNotification, odooProducts = [] }) => {
  const { user } = useAuth();
  console.log('🎯 RevertChanges rendered, odooProducts prop Length:', odooProducts?.length || 0);
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterSupplier, setFilterSupplier] = useState('all');
  const [filterDate, setFilterDate] = useState('all');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [revertOptions, setRevertOptions] = useState({ revertPrice: true, revertCost: true });
  const [isReverting, setIsReverting] = useState(false);
  const [revertProgress, setRevertProgress] = useState<{current: number, total: number} | null>(null);

const loadData = async () => {
    setLoading(true);
    console.log('🔄 loadData started...');
    
    try {
      // Cargar productos directamente del servidor
      let odooProds: OdooProduct[] = [];
      try {
        const res = await fetch('/api/products');
        if (res.ok) {
          odooProds = await res.json();
          console.log('✅ /api/products returned:', odooProds.length);
        }
      } catch (e) {
        console.warn('⚠️ /api/products failed, using prop');
        odooProds = odooProducts;
      }
      
      // Fallback a prop si no hay datos del API
      if (odooProds.length === 0) {
        odooProds = odooProducts;
      }
      
      console.log('📊 Using products:', odooProds.length);
      
      const data = await StorageService.loadPendingStoreChanges();

      // Solo items aprobados desde hoy
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const approvedToday = data.filter((i: any) =>
        (i.priceApproved || i.costApproved) &&
        new Date(i.updatedAt || i.createdAt || 0) >= todayStart
      );

      // Ordenar por updatedAt desc para quedarse con el más reciente por barcode
      approvedToday.sort((a: any, b: any) => new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime());

      // Deduplicar: un solo registro por barcode (el más reciente)
      const seenBarcodes = new Set<string>();
      const changedItems = approvedToday.filter((i: any) => {
        const key = String(i.barcode).trim();
        if (seenBarcodes.has(key)) return false;
        seenBarcodes.add(key);
        return true;
      });
      
      const prods = odooProds || [];
      const productMap = new Map(prods.map(p => [String(p.barcode).trim(), p]));
      
      console.log('DEBUG productMap size:', productMap.size);
      console.log('DEBUG lookup 2701000005085:', productMap.get('2701000005085'));
      console.log('DEBUG lookup 2810001000002:', productMap.get('2810001000002'));
      
      const enrichedItems = changedItems.map((item: any) => {
        const itemBarcode = String(item.barcode).trim();
        const currentOdoo = productMap.get(itemBarcode) || productMap.get(item.barcode);
        return {
          ...item,
          currentPrice: currentOdoo?.price ?? item.newPrice,
          currentCost: currentOdoo?.cost ?? item.newCost,
          _debugBarcode: itemBarcode,
          _debugFound: !!currentOdoo
        };
      });
      
      setItems(enrichedItems);
    } catch (e) {
      console.error(e);
      addNotification('error', 'Error', 'No se pudo cargar el historial de cambios.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    console.log('🔄 useEffect triggered');
    loadData();
  }, []); // Only run once on mount

  const filteredItems = useMemo(() => {
    let filtered = items;
    
    // Filter by supplier
    if (filterSupplier !== 'all') {
      filtered = filtered.filter(item => item.batchSupplierName === filterSupplier);
    }
    
    // Filter by date
    if (filterDate !== 'all') {
      const now = new Date();
      const daysAgo = parseInt(filterDate);
      const cutoff = new Date(now.getTime() - daysAgo * 24 * 60 * 60 * 1000);
      filtered = filtered.filter(item => {
        const itemDate = new Date(item.updatedAt || item.createdAt || 0);
        return itemDate >= cutoff;
      });
    }
    
    // Filter by search term
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(item =>
        item.description?.toLowerCase().includes(term) ||
        item.barcode?.toLowerCase().includes(term) ||
        item.batchSupplierName?.toLowerCase().includes(term)
      );
    }
    
    return filtered;
  }, [items, searchTerm, filterSupplier, filterDate]);

  // Get unique suppliers for filter dropdown
  const suppliers = useMemo(() => {
    const sups = new Set(items.map(i => i.batchSupplierName).filter(Boolean));
    return Array.from(sups).sort();
  }, [items]);

  // Group by batch (Hoja de trabajo)
  const groupedItems = useMemo(() => {
    const groups: { [key: string]: any[] } = {};
    filteredItems.forEach(item => {
      const batch = item.batchSupplierName || 'Carga Individual';
      if (!groups[batch]) groups[batch] = [];
      groups[batch].push(item);
    });
    return Object.entries(groups).map(([batch, items]) => ({ batch, items }));
  }, [filteredItems]);

  const toggleSelectAll = (batchItems: any[]) => {
    const allSelected = batchItems.every(i => selectedIds.has(i.id));
    const newSelected = new Set(selectedIds);
    if (allSelected) {
      batchItems.forEach(i => newSelected.delete(i.id));
    } else {
      batchItems.forEach(i => newSelected.add(i.id));
    }
    setSelectedIds(newSelected);
  };

  const toggleSelect = (id: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) newSelected.delete(id);
    else newSelected.add(id);
    setSelectedIds(newSelected);
  };

  const handleRevert = async () => {
    const optionsText = [];
    if (revertOptions.revertPrice) optionsText.push('precio');
    if (revertOptions.revertCost) optionsText.push('costo');
    
    if (selectedIds.size === 0) return;
    if (!window.confirm(`¿Revertir ${optionsText.join(' y ')} de ${selectedIds.size} producto(s) a valores originales?`)) return;

    setIsReverting(true);
    setRevertProgress({ current: 0, total: selectedIds.size });

    const itemsToRevert = items.filter(i => selectedIds.has(i.id));
    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < itemsToRevert.length; i++) {
      const item = itemsToRevert[i];
      setRevertProgress({ current: i + 1, total: selectedIds.size });

      // Valores originales (los que se van a restaurar)
      const originalPrice = item.price;
      const originalCost = item.cost;
      // Valores actuales en Odoo (de donde se revierte)
      const currentPrice = item.currentPrice ?? item.newPrice ?? item.price;
      const currentCost = item.currentCost ?? item.newCost ?? item.cost;

      // Aplicar solo los cambios seleccionados
      const priceToSend = revertOptions.revertPrice ? originalPrice : currentPrice;
      const costToSend = revertOptions.revertCost ? originalCost : currentCost;

      try {
        const success = await updateProductPrice(item.barcode, priceToSend, costToSend, item.provider);
        if (success) {
          successCount++;
          // Log to history
          await HistoryService.logAction({
            action: 'OTHER',
            productId: item.id,
            productCode: item.barcode,
            productName: item.description,
            provider: item.provider,
            oldPrice: currentPrice,
            newPrice: originalPrice,
            oldCost: currentCost,
            newCost: originalCost,
            details: 'REVERSIÓN DE CAMBIOS a valores originales',
            user: user?.name,
            userId: user?.id
          }, user?.id || null, user?.role);
          
          // Remove from local state visually so it can't be clicked twice
          setItems(prev => prev.filter(p => p.id !== item.id));
          
          // Note: ideally we also remove it from store_changes.json completely, 
          // but for now we just remove it visually so they don't revert again.
        } else {
          failCount++;
        }
      } catch (err) {
        console.error(err);
        failCount++;
      }
      
      // Safety delay
      await new Promise(r => setTimeout(r, 400));
    }

    addNotification(
      failCount === 0 ? 'success' : 'info',
      'Reversión Completada',
      `Se revirtieron ${successCount} productos. ${failCount > 0 ? `Fallaron ${failCount}.` : ''}`
    );

    setSelectedIds(new Set());
    setIsReverting(false);
    setRevertProgress(null);
  };

  if (loading) {
    return (
      <div className="p-8 flex justify-center items-center h-full">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  return (
    <div className="p-6 h-full flex flex-col bg-gray-50">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-2xl font-bold text-red-700 flex items-center gap-2">
            <RotateCcw className="w-6 h-6" />
            🔴 REVERSIÓN v6 CON FILTROS
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            Selecciona los productos u hojas de trabajo completas para restaurar sus valores originales en Odoo.
          </p>
        </div>
      </div>
      
      <div className="bg-red-600 p-4 rounded-xl shadow-sm border-2 border-red-800 mb-4">
        <div className="flex items-center gap-6">
          <span className="font-bold text-white text-lg">🎛️ OPCIONES v4:</span>
          <label className="flex items-center gap-2 cursor-pointer bg-red-50 px-3 py-2 rounded-lg border border-red-200">
            <input
              type="checkbox"
              checked={revertOptions.revertPrice}
              onChange={(e) => setRevertOptions(prev => ({ ...prev, revertPrice: e.target.checked }))}
              className="w-5 h-5 text-red-600 rounded"
            />
            <span className="font-medium">Revertir Precio</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer bg-red-50 px-3 py-2 rounded-lg border border-red-200">
            <input
              type="checkbox"
              checked={revertOptions.revertCost}
              onChange={(e) => setRevertOptions(prev => ({ ...prev, revertCost: e.target.checked }))}
              className="w-5 h-5 text-red-600 rounded"
            />
            <span className="font-medium">Revertir Costo</span>
          </label>
          <button
            onClick={handleRevert}
            disabled={selectedIds.size === 0 || isReverting}
            className={`flex items-center gap-2 px-6 py-2 rounded-lg font-medium transition-colors shadow-sm ml-auto ${
              selectedIds.size > 0 && !isReverting
                ? 'bg-red-600 hover:bg-red-700 text-white'
                : 'bg-gray-300 text-gray-500 cursor-not-allowed'
            }`}
          >
            {isReverting ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <RotateCcw className="w-5 h-5" />
            )}
            {isReverting ? `Revirtiendo ${revertProgress?.current}/${revertProgress?.total}...` : `Revertir ${selectedIds.size}`}
          </button>
        </div>
      </div>

      <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 mb-6 flex gap-4">
        <div className="relative flex-1">
          <Search className="w-5 h-5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Buscar por nombre, código de barras..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none"
          />
        </div>
        
        <select
          value={filterSupplier}
          onChange={(e) => setFilterSupplier(e.target.value)}
          className="px-3 py-2 border border-gray-200 rounded-lg bg-white"
        >
          <option value="all">Todos los proveedores</option>
          {suppliers.map(s => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        
        <select
          value={filterDate}
          onChange={(e) => setFilterDate(e.target.value)}
          className="px-3 py-2 border border-gray-200 rounded-lg bg-white"
        >
          <option value="all">Todas las fechas</option>
          <option value="1">Últimas 24 horas</option>
          <option value="3">Últimos 3 días</option>
          <option value="7">Última semana</option>
          <option value="30">Último mes</option>
        </select>
      </div>

      <div className="flex-1 overflow-auto bg-white rounded-xl shadow-sm border border-gray-100">
        {groupedItems.length === 0 ? (
          <div className="p-12 text-center text-gray-500">
            <AlertTriangle className="w-12 h-12 mx-auto mb-3 text-gray-300" />
            <p>No se encontraron registros en el historial de cambios recientes.</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {groupedItems.map((group, idx) => {
              const allSelected = group.items.every(i => selectedIds.has(i.id));
              const someSelected = group.items.some(i => selectedIds.has(i.id)) && !allSelected;

              return (
                <div key={idx} className="p-6">
                  <div className="flex items-center justify-between mb-4 pb-2 border-b border-gray-100">
                    <div className="flex items-center gap-3">
                      <button onClick={() => toggleSelectAll(group.items)} className="text-gray-400 hover:text-red-500 transition-colors">
                        {allSelected ? <CheckSquare className="w-6 h-6 text-red-500" /> : someSelected ? <div className="w-6 h-6 bg-red-100 border-2 border-red-500 rounded flex items-center justify-center"><div className="w-3 h-0.5 bg-red-500 rounded-full" /></div> : <Square className="w-6 h-6" />}
                      </button>
                      <h3 className="text-lg font-semibold text-gray-800">{group.batch}</h3>
                      <span className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full text-xs font-medium">{group.items.length} ítems</span>
                      <span className="text-xs text-gray-400">
                        📅 {group.items[0]?.updatedAt ? new Date(group.items[0].updatedAt).toLocaleDateString('es-ES') : ''}
                      </span>
                    </div>
                  </div>

                  <div className="grid gap-3">
                    {group.items.map(item => {
                      const isSelected = selectedIds.has(item.id);
                      return (
                        <div
                          key={item.id}
                          onClick={() => toggleSelect(item.id)}
                          className={`flex items-center gap-4 p-4 rounded-lg border transition-all cursor-pointer ${
                            isSelected ? 'border-red-500 bg-red-50' : 'border-gray-200 hover:border-red-300 hover:bg-gray-50'
                          }`}
                        >
                          <div className={`text-gray-400 ${isSelected ? 'text-red-500' : ''}`}>
                            {isSelected ? <CheckSquare className="w-5 h-5" /> : <Square className="w-5 h-5" />}
                          </div>
                          
<div className="flex-1 min-w-0">
                              <h4 className="font-medium text-gray-900 truncate">{item.description}</h4>
                              <p className="text-sm text-gray-500">
                                {item.barcode} {item._debugFound ? '✅' : '❌'}
                                <span className="ml-2 text-xs text-gray-400">
                                  📅 {item.updatedAt ? new Date(item.updatedAt).toLocaleString('es-ES', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : ''}
                                </span>
                              </p>
                            </div>

                           <div className="flex gap-6 text-sm">
                             <div>
                               <p className="text-gray-500 mb-1">💰 PRECIO</p>
                               <div className="flex items-center gap-1">
                                 <span className="font-bold text-green-600">{(item.currentPrice ?? item.newPrice)?.toFixed(2)}</span>
                                 <span className="text-gray-400">→</span>
                                 <span className="text-red-500 line-through">{item.price?.toFixed(2)}</span>
                               </div>
                             </div>
                             <div>
                               <p className="text-gray-500 mb-1">📦 COSTO</p>
                               <div className="flex items-center gap-1">
                                 <span className="font-bold text-green-600">{(item.currentCost ?? item.newCost)?.toFixed(2)}</span>
                                 <span className="text-gray-400">→</span>
                                 <span className="text-red-500 line-through">{item.cost?.toFixed(2)}</span>
                               </div>
                             </div>
                           </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
