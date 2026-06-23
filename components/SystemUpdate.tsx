import React, { useState, useEffect, useMemo } from 'react';
import { MergedItem } from '../types';
import { Database, Download, ArrowRight, Clock, FileSpreadsheet, Trash2, RotateCcw, AlertTriangle, Wifi, WifiOff, ServerCrash, RefreshCw, X } from 'lucide-react';
import { downloadExcel } from '../services/excelService';
import { useAuth } from '../contexts/AuthContext';
import { StorageService } from '../services/storageService';
import { HistoryService } from '../services/historyService';
import { formatPrice } from '../utils/formatters';

interface FailedConfirmation {
  item: MergedItem;
  errorMsg: string;
  errorType: 'network' | 'server' | 'auth' | 'timeout' | 'odoo' | 'unknown';
  failedAt: string;
}

function classifyError(err: unknown): { errorMsg: string; errorType: FailedConfirmation['errorType'] } {
  const msg = err instanceof Error ? err.message : String(err);
  if (msg.includes('Failed to fetch') || msg.includes('NetworkError') || msg.includes('net::ERR'))
    return { errorMsg: 'Sin conexión a internet o servidor inaccesible', errorType: 'network' };
  if (msg.includes('ECONNREFUSED') || msg.includes('503') || msg.includes('502'))
    return { errorMsg: 'Servidor caído o VPS sin respuesta', errorType: 'server' };
  if (msg.includes('Auth failed') || msg.includes('401') || msg.includes('session'))
    return { errorMsg: 'Sesión expirada — requiere reconexión', errorType: 'auth' };
  if (msg.includes('timeout') || msg.includes('Timeout'))
    return { errorMsg: 'Tiempo de espera agotado (servidor lento)', errorType: 'timeout' };
  if (msg.includes('Odoo') || msg.includes('odoo') || msg.includes('RPC'))
    return { errorMsg: `Error en Odoo: ${msg.slice(0, 80)}`, errorType: 'odoo' };
  return { errorMsg: msg.slice(0, 100) || 'Error desconocido', errorType: 'unknown' };
}

const FAILED_KEY = (userId: string | null) => `priceflow_failed_confirmations_${userId || 'guest'}`;
function loadFailed(userId: string | null): FailedConfirmation[] {
  try { return JSON.parse(localStorage.getItem(FAILED_KEY(userId)) || '[]'); } catch { return []; }
}
function saveFailed(userId: string | null, items: FailedConfirmation[]) {
  localStorage.setItem(FAILED_KEY(userId), JSON.stringify(items));
}

interface Props {
  items: MergedItem[];
  odooProducts?: any[]; // Added to sync latest costs/prices
  onUpdateSystem: (id: string, item?: MergedItem) => Promise<boolean>;
  onSyncOdoo?: (onProgress?: (p: number, t: number) => void, forceFull?: boolean) => Promise<number>;
  onRemoteUpdate?: (id: string) => void;
  onDeleteItem: (id: string, item?: MergedItem) => void;
  onReturnItem?: (id: string, item?: MergedItem) => Promise<void>;
  addNotification?: (type: 'success' | 'error' | 'info', title: string, message: string) => void;
}

interface ExcelRow {
  barcode: string;
  description: string;
  provider: string;
  oldCost: number;
  newCost: number;
  costMargin: number;
  oldPrice: number;
  newPrice: number;
  priceMargin: number;
  timestamp: string;
}

const getUserExcelKey = (userId: string | null): string => {
  if (!userId) return 'priceflow_excel_data_guest';
  return `priceflow_excel_data_${userId}`;
};

export const SystemUpdate: React.FC<Props> = ({ items, odooProducts = [], onUpdateSystem, onSyncOdoo, onDeleteItem, onReturnItem, onRemoteUpdate, addNotification }) => {
  const { user } = useAuth();
  const [excelData, setExcelData] = useState<ExcelRow[]>([]);
  const [excelType, setExcelType] = useState<'full' | 'cost' | 'price'>('full');
  const [allUsersItems, setAllUsersItems] = useState<MergedItem[]>([]);
  const [isConfirming, setIsConfirming] = useState(false);
  const [confirmProgress, setConfirmProgress] = useState<{ current: number; total: number } | null>(null);
  const [hiddenConfirmedIds, setHiddenConfirmedIds] = useState<string[]>([]);
  const [hiddenConfirmedBarcodes, setHiddenConfirmedBarcodes] = useState<string[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [hasDownloaded, setHasDownloaded] = useState(false);
  const [failedConfirmations, setFailedConfirmations] = useState<FailedConfirmation[]>(() => loadFailed(user?.id || null));
  const [isRetryingAll, setIsRetryingAll] = useState(false);
  const lastConfirmTime = React.useRef(0);
  const downloadedCountKey = `priceflow_downloaded_count_${user?.id || 'guest'}`;

  // Persist failed confirmations whenever they change
  useEffect(() => { saveFailed(user?.id || null, failedConfirmations); }, [failedConfirmations, user?.id]);

  const calculateMargin = (cost: number, price: number): number => {
    if (price === 0) return 0;
    return ((price - cost) / price) * 100;
  };

  // 1. SYNC
  const syncedItems = useMemo(() => {
    if (odooProducts.length === 0) return allUsersItems;
    const normalizeBarcode = (b: string) => b.trim().replace(/^0+/, '');
    return allUsersItems.map(item => {
      const itemB = normalizeBarcode(item.barcode);
      const match = odooProducts.find(p => normalizeBarcode(p.barcode) === itemB);
      if (match) return { ...item, cost: match.cost, price: match.price };
      return item;
    });
  }, [allUsersItems, odooProducts]);

  // 2. Filter Actionable
  const pendingSystemUpdate = useMemo(() => {
    return syncedItems.filter(i => {
      if (i.systemUpdated) return false;
      const hP = i.priceApproved; const hC = i.costApproved;
      // Trust the backend list: If it's in the list and approved, show it.
      // Don't filter by numeric difference against live Odoo data, 
      // as that hides items that were manually updated or synced previously
      // but still need their status updated in our workflow.
      return (hP || hC);
    });
  }, [syncedItems]);

  // 3. Filter Visible
  const visibleTableItems = useMemo(() => {
    return syncedItems.filter(i => {
      if (i.systemUpdated) return true;
      const hP = i.priceApproved; const hC = i.costApproved;
      return (hP || hC);
    });
  }, [syncedItems]);

  // Excel Memo
  const displayExcelData = useMemo(() => {
    // Usar un Mapa para asegurar que solo haya una entrada por código de barras (el último)
    const barcodeMap = new Map<string, ExcelRow>();

    // 1. Procesar datos del acumulador (excelData)
    excelData.forEach(row => {
      const existing = barcodeMap.get(row.barcode);
      // Mantener el más reciente si hay duplicados internos
      if (!existing || new Date(row.timestamp) > new Date(existing.timestamp)) {
        barcodeMap.set(row.barcode, row);
      }
    });

    // 2. Procesar cambios pendientes (estos siempre deben sobrescribir ya que son lo más actual)
    pendingSystemUpdate.forEach(item => {
      const hP = item.priceApproved; const hC = item.costApproved;
      const cP = item.price; const cC = item.cost;
      const tP = hP ? (item.newPrice || cP) : cP; const tC = hC ? (item.newCost || cC) : cC;
      const fm = calculateMargin(tC, tP);

      const newRow: ExcelRow = {
        barcode: item.barcode,
        description: item.description,
        provider: item.supplierName || item.provider || item.batchSupplierName || 'N/A',
        oldCost: cC,
        newCost: tC,
        costMargin: fm,
        oldPrice: cP,
        newPrice: tP,
        priceMargin: fm,
        timestamp: item.priceApprovedAt || item.costApprovedAt || item.updatedAt || new Date().toISOString()
      };
      barcodeMap.set(item.barcode, newRow);
    });

    // 3. Sincronizar valores finales con syncedItems (Odoo real-time match)
    return Array.from(barcodeMap.values()).map(row => {
      const freshItem = syncedItems.find(p => p.barcode === row.barcode);
      if (freshItem) {
        const hP = freshItem.priceApproved; const hC = freshItem.costApproved;
        const cP = freshItem.price; const cC = freshItem.cost;
        const tP = hP ? (freshItem.newPrice || cP) : cP; const tC = hC ? (freshItem.newCost || cC) : cC;
        const fm = calculateMargin(tC, tP);
        return {
          ...row,
          description: freshItem.description || row.description,
          provider: freshItem.provider || freshItem.supplierName || freshItem.batchSupplierName || row.provider,
          oldCost: cC,
          oldPrice: cP,
          newCost: tC,
          newPrice: tP,
          costMargin: fm,
          priceMargin: fm
        };
      }
      return row;
    });
  }, [excelData, pendingSystemUpdate, syncedItems]);

  const prevPendingLength = React.useRef(0);

  useEffect(() => {
    const savedCount = parseInt(localStorage.getItem(downloadedCountKey) || '0');
    if (pendingSystemUpdate.length === 0) { setHasDownloaded(false); localStorage.setItem(downloadedCountKey, '0'); }
    else if (pendingSystemUpdate.length > savedCount) { setHasDownloaded(false); localStorage.setItem(downloadedCountKey, '0'); }
    else if (savedCount > 0) setHasDownloaded(true);
  }, [pendingSystemUpdate.length, downloadedCountKey]);

  useEffect(() => {
    if (pendingSystemUpdate.length === 0 && prevPendingLength.current > 0) {
      setExcelData([]); setHasDownloaded(false);
      localStorage.setItem(getUserExcelKey(user?.id || null), '[]');
      if (user?.role === 'ejecutor') StorageService.saveSharedExcelAccumulator([]);
    }
    prevPendingLength.current = pendingSystemUpdate.length;
  }, [pendingSystemUpdate.length, user?.id]);

  useEffect(() => {
    const loadExcelData = async () => {
      if (user?.role === 'ejecutor') setExcelData(await StorageService.loadSharedExcelAccumulator());
      else {
        const saved = localStorage.getItem(getUserExcelKey(user?.id || null));
        if (saved) try { setExcelData(JSON.parse(saved)); } catch (e) { setExcelData([]); }
      }
    };
    loadExcelData();
    if (user?.role === 'ejecutor') { const int = setInterval(loadExcelData, 15000); return () => clearInterval(int); }
  }, [user?.id, user?.role]);

  useEffect(() => {
    const loadShared = async () => setAllUsersItems(await StorageService.loadPendingOdooUpdates());
    loadShared(); const int = setInterval(loadShared, 15000); return () => clearInterval(int);
  }, []);

  const removeConfirmedItemLocally = (item: MergedItem) => {
    setHiddenConfirmedIds(prev => prev.includes(item.id) ? prev : [...prev, item.id]);
    setHiddenConfirmedBarcodes(prev => prev.includes(item.barcode) ? prev : [...prev, item.barcode]);
    setAllUsersItems(prev => prev.filter(existing => existing.id !== item.id));
    setExcelData(prev => prev.filter(row => row.barcode !== item.barcode));
  };

  useEffect(() => {
    if (user?.role === 'admin' || user?.role === 'analista') {
      const check = async () => {
        const changes = await StorageService.loadPendingStoreChanges();
        items.filter(i => i.priceApproved && !i.systemUpdated).forEach(p => {
          if (changes.some((sc: any) => sc.id === p.id && (sc.systemUpdated === true || sc.status === 'SYSTEM_UPDATED'))) onRemoteUpdate?.(p.id);
        });
      };
      check(); const int = setInterval(check, 15000); return () => clearInterval(int);
    }
  }, [user?.role, items, onRemoteUpdate]);

  const handleConfirmAll = async () => {
    if (isConfirming) return;
    setIsConfirming(true);
    const itemsToConfirm = [...pendingSystemUpdate];
    const total = itemsToConfirm.length;
    let successCount = 0;
    const firstRoundFailed: Array<{ item: MergedItem; err: unknown }> = [];
    setConfirmProgress({ current: 0, total });

    const BATCH_SIZE = 5;

    try {
      for (let i = 0; i < itemsToConfirm.length; i += BATCH_SIZE) {
        const batch = itemsToConfirm.slice(i, i + BATCH_SIZE);
        const results = await Promise.allSettled(batch.map(item => onUpdateSystem(item.id, item)));

        results.forEach((result, idx) => {
          const item = batch[idx];
          setConfirmProgress({ current: Math.min(i + idx + 1, total), total });
          if (result.status === 'fulfilled' && result.value) {
            removeConfirmedItemLocally(item);
            successCount++;
          } else {
            const err = result.status === 'rejected' ? result.reason : new Error('Odoo no confirmó el cambio');
            firstRoundFailed.push({ item, err });
          }
        });

        if (i + BATCH_SIZE < itemsToConfirm.length) await new Promise(r => setTimeout(r, 150));
      }

      // Retry pass
      const stillFailed: Array<{ item: MergedItem; err: unknown }> = [];
      if (firstRoundFailed.length > 0) {
        await new Promise(r => setTimeout(r, 800));
        for (const { item, err: firstErr } of firstRoundFailed) {
          try {
            const confirmed = await onUpdateSystem(item.id, item);
            if (confirmed) { removeConfirmedItemLocally(item); successCount++; }
            else stillFailed.push({ item, err: firstErr });
          } catch (retryErr) {
            stillFailed.push({ item, err: retryErr });
          }
        }
      }

      // Save persistently only items that failed BOTH attempts
      if (stillFailed.length > 0) {
        const newFailed: FailedConfirmation[] = stillFailed.map(({ item, err }) => ({
          item,
          ...classifyError(err),
          failedAt: new Date().toISOString()
        }));
        setFailedConfirmations(prev => {
          const merged = [...prev.filter(f => !newFailed.find(n => n.item.id === f.item.id)), ...newFailed];
          return merged;
        });
        addNotification?.('error', 'Confirmación Parcial',
          `${successCount} de ${total} confirmados. ${stillFailed.length} fallaron — ver sección "Fallos".`);
      } else if (successCount > 0) {
        addNotification?.('success', 'Todos Confirmados', `${successCount} productos actualizados en Odoo.`);
      }
    } finally {
      setIsConfirming(false);
      setConfirmProgress(null);
    }
  };

  const handleRetryOne = async (failed: FailedConfirmation) => {
    try {
      const confirmed = await onUpdateSystem(failed.item.id, failed.item);
      if (confirmed) {
        removeConfirmedItemLocally(failed.item);
        setFailedConfirmations(prev => prev.filter(f => f.item.id !== failed.item.id));
        addNotification?.('success', 'Confirmado', `${failed.item.description} actualizado en Odoo.`);
      } else {
        const updated = { ...failed, ...classifyError(new Error('Odoo no confirmó el cambio')), failedAt: new Date().toISOString() };
        setFailedConfirmations(prev => prev.map(f => f.item.id === failed.item.id ? updated : f));
        addNotification?.('error', 'Fallo de nuevo', `No se pudo confirmar ${failed.item.description}`);
      }
    } catch (err) {
      const updated = { ...failed, ...classifyError(err), failedAt: new Date().toISOString() };
      setFailedConfirmations(prev => prev.map(f => f.item.id === failed.item.id ? updated : f));
      addNotification?.('error', 'Error', `${failed.item.description}: ${classifyError(err).errorMsg}`);
    }
  };

  const handleRetryAll = async () => {
    if (isRetryingAll || failedConfirmations.length === 0) return;
    setIsRetryingAll(true);
    const toRetry = [...failedConfirmations];
    for (const failed of toRetry) {
      await handleRetryOne(failed);
      await new Promise(r => setTimeout(r, 200));
    }
    setIsRetryingAll(false);
  };

  const handleDismissFailed = (id: string) => setFailedConfirmations(prev => prev.filter(f => f.item.id !== id));
  const handleDismissAllFailed = () => setFailedConfirmations([]);

  // Auto-cleanup: Remove items that are already updated in Odoo
  // This prevents duplicate confirmations
  useEffect(() => {
    if (odooProducts.length === 0 || allUsersItems.length === 0 || isSyncing || isConfirming) return;

    const cleanup = async () => {
      const idsToRemove: string[] = [];
      const norm = (b: string) => b.trim().replace(/^0+/, '');

      console.log('🔍 Running auto-cleanup check...');

      allUsersItems.forEach(item => {
        // Skip items already marked as updated locally (though they should be eventually removed)
        if (item.systemUpdated) {
          // We can also remove systemUpdated items if they match Odoo now
        }

        // Find matching product in Odoo
        const match = odooProducts.find(p => norm(p.barcode) === norm(item.barcode));
        if (!match) {
          return;
        }

        // Calculate target values (what we WANT the value to be)
        // If approved, use new value. If not, use current value.
        const targetPrice = item.priceApproved ? (item.newPrice || item.price) : item.price;
        const targetCost = item.costApproved ? (item.newCost || item.cost) : item.cost;

        // Check if values already match in Odoo (using strict epsilon)
        const priceMatches = Math.abs(targetPrice - match.price) < 0.000001;
        const costMatches = Math.abs(targetCost - match.cost) < 0.000001;

        // Condition to remove:
        // The item is "Pending" (has an approval), but Odoo ALREADY has those values.
        // This means it's already done (by us or someone else).
        if ((item.priceApproved || item.costApproved) && priceMatches && costMatches) {
          console.log(`🗑️ Auto-cleanup: ${item.description} matches Odoo exactly. Removing.`);
          idsToRemove.push(item.id);
        }
      });

      if (idsToRemove.length > 0) {
        console.log(`🧹 Removing ${idsToRemove.length} items that match Odoo values.`);
        // We use a small delay between deletes or batch them if possible, 
        // but onDeleteItem is per item. 
        // To avoid UI jank, we can just call them.
        idsToRemove.forEach(id => onDeleteItem(id));

        if (addNotification && idsToRemove.length > 0) {
          // Optional: Notify user
          // addNotification('info', 'Limpieza Automática', `Se eliminaron ${idsToRemove.length} items ya sincronizados.`);
        }
      } else {
        console.log('✅ No items to auto-cleanup.');
      }
    };

    // Run cleanup slightly after render/update to allow state to settle
    const timer = setTimeout(cleanup, 1000);
    return () => clearTimeout(timer);
  }, [allUsersItems, odooProducts, isSyncing, isConfirming, onDeleteItem]);


  const handleManualSync = async () => {
    if (!onSyncOdoo || isSyncing) return; setIsSyncing(true);
    try {
      addNotification?.('info', 'Sincronizando', 'Espere...');
      await onSyncOdoo(undefined, false);
      addNotification?.('success', 'Éxito', 'Sincronizado');
    } finally { setIsSyncing(false); }
  };

  const getTimeSinceApproval = (item: MergedItem) => {
    const at = item.priceApprovedAt || item.costApprovedAt || item.createdAt;
    if (!at) return 'N/A';
    const date = new Date(at); const diff = new Date().getTime() - date.getTime();
    const mins = Math.floor(diff / 60000); const hours = Math.floor(mins / 60);
    const rel = hours > 24 ? `${Math.floor(hours / 24)}d` : hours > 0 ? `${hours}h` : `${mins}m`;
    return (
      <div className="flex flex-col items-center">
        <span className="font-bold text-gray-700">{date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
        <span className={`text-[10px] font-bold uppercase ${hours > 24 ? 'text-red-500' : hours > 0 ? 'text-orange-500' : 'text-green-500'}`}>Hace {rel}</span>
      </div>
    );
  };

  return (
    <div className="space-y-6">

      {/* === PENDING SECTION === */}
      {pendingSystemUpdate.length === 0 && excelData.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-64 text-gray-500 bg-white rounded-lg border border-gray-100 p-8 shadow-sm">
          <Database className="w-16 h-16 text-blue-500 mb-4 opacity-50" />
          <h2 className="text-xl font-bold">No hay cambios pendientes</h2>
          <p>El sistema está actualizado.</p>
        </div>
      ) : pendingSystemUpdate.length > 0 && !hasDownloaded ? (
        <>
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-3">
                <div className="bg-green-100 p-2 rounded-lg"><FileSpreadsheet className="w-6 h-6 text-green-600" /></div>
                <div>
                  <h3 className="text-lg font-bold text-gray-800">Datos de Excel Acumulados</h3>
                  <p className="text-sm text-gray-500">{pendingSystemUpdate.length} registros pendientes.</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <select value={excelType} onChange={(e) => setExcelType(e.target.value as any)} className="border border-gray-300 rounded-lg px-4 py-3 text-sm bg-white">
                  <option value="full">Costo y Precio</option>
                  <option value="cost">Solo Costos</option>
                  <option value="price">Solo Precios</option>
                </select>
                <button onClick={async () => { await downloadExcel(displayExcelData, excelType); setHasDownloaded(true); localStorage.setItem(downloadedCountKey, pendingSystemUpdate.length.toString()); }} className="bg-green-600 hover:bg-green-700 text-white px-6 py-3 rounded-lg shadow-sm flex items-center gap-2 font-bold transition-all">
                  <Download className="w-5 h-5" /> Descargar Excel
                </button>
              </div>
            </div>
          </div>
          <div className="bg-gray-50 border border-gray-200 border-dashed p-10 rounded-lg flex flex-col items-center text-gray-400">
            <Database className="w-10 h-10 mb-2 opacity-30" />
            <p className="font-medium">Descarga el Excel para habilitar la confirmación.</p>
          </div>
        </>
      ) : (
        <>
          {/* Excel Stats Bar */}
          <div className="bg-white border border-gray-200 rounded-lg p-5 shadow-sm flex justify-between items-center">
            <div className="flex items-center gap-3">
              <FileSpreadsheet className="w-6 h-6 text-green-600" />
              <div>
                <span className="text-sm text-gray-500 font-bold uppercase tracking-wider">Excel Acumulado:</span>
                <span className="ml-2 font-black text-gray-800">{displayExcelData.length} registros</span>
              </div>
            </div>
            <div className="flex gap-3">
              <button onClick={() => { if (window.confirm('¿Vaciar Excel?')) { setExcelData([]); setHasDownloaded(false); localStorage.setItem(getUserExcelKey(user?.id || null), '[]'); StorageService.saveSharedExcelAccumulator([]); StorageService.savePendingOdooUpdates([]); } }} className="text-red-600 hover:bg-red-50 px-4 py-2 rounded-lg font-bold text-sm transition-colors border border-red-100">
                Vaciar Excel
              </button>
              <button onClick={async () => { await downloadExcel(displayExcelData, excelType); setHasDownloaded(true); }} className="bg-green-600 text-white px-5 py-2 rounded-lg font-bold shadow-sm hover:bg-green-700 transition-all flex items-center gap-2">
                <Download className="w-4 h-4" /> Bajar Excel
              </button>
            </div>
          </div>

          {/* Main Table */}
          <div className="bg-white border-x border-t border-gray-200 rounded-t-lg shadow-sm overflow-hidden">
            <div className="p-6 border-b border-gray-200 flex justify-between items-center bg-gray-50/50">
              <div className="flex items-center gap-3">
                <div className="bg-blue-600 p-2 rounded-lg shadow-md"><Database className="w-5 h-5 text-white" /></div>
                <h2 className="text-xl font-black text-gray-800 tracking-tight">Confirmación de Cambios</h2>
              </div>
              <div className="flex gap-2">
                <button onClick={handleManualSync} disabled={isSyncing} className="bg-white border border-gray-300 text-gray-700 px-4 py-2 rounded-lg font-bold hover:bg-gray-50 transition-all flex items-center gap-2 disabled:opacity-50">
                  {isSyncing ? <div className="animate-spin h-4 w-4 border-2 border-blue-600 border-t-transparent rounded-full" /> : <RotateCcw className="w-4 h-4" />}
                  Sincronizar ERP
                </button>
                <button onClick={handleConfirmAll} disabled={isConfirming} className="bg-blue-600 text-white px-6 py-2 rounded-lg font-black shadow-md hover:bg-blue-700 transition-all disabled:opacity-50 flex items-center gap-2">
                  {isConfirming && confirmProgress ? (
                    <>
                      <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
                      Confirmando {confirmProgress.current}/{confirmProgress.total}
                    </>
                  ) : (
                    <>Confirmar Todo ({pendingSystemUpdate.length})</>
                  )}
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full text-left border-collapse">
                <thead>
                  <tr className="bg-white text-slate-400 text-[11px] font-black uppercase tracking-wider border-b border-gray-200">
                    <th className="px-6 py-4">Producto</th>
                    <th className="px-6 py-4">Usuario</th>
                    <th className="px-6 py-4">Detalle de Cambios</th>
                    <th className="px-6 py-4 text-center">Tiempo Aprobado</th>
                    <th className="px-6 py-4 text-center">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {visibleTableItems.map((item) => {
                    const isUpd = item.systemUpdated;
                    const cC = item.cost || 0; const cP = item.price || 0;
                    const tC = item.costApproved ? (item.newCost || cC) : cC;
                    const tP = item.priceApproved ? (item.newPrice || cP) : cP;
                    const cCh = item.costApproved && Math.abs(tC - cC) >= 0.000001;
                    const pCh = item.priceApproved && Math.abs(tP - cP) >= 0.000001;
                    return (
                      <tr key={item.id} className={`${isUpd ? 'bg-green-50/20' : 'hover:bg-gray-50/50'} transition-colors`}>
                        <td className="px-6 py-5 max-w-[450px]">
                          <div className={`font-bold text-gray-900 leading-tight mb-1 ${isUpd ? 'text-gray-400' : ''}`}>{item.description}</div>
                          <div className="text-[10px] text-gray-400 font-mono">
                            BAR: {item.barcode} | <span className="text-blue-500 font-bold">{(item.provider && item.provider !== 'Provider File' ? item.provider : null) || item.supplierName || item.batchSupplierName || 'PENDIENTE'}</span>
                          </div>
                        </td>
                        <td className="px-6 py-5">
                          <span className={`font-bold text-indigo-600 ${isUpd ? 'text-gray-400' : ''}`}>{item.createdBy || 'N/A'}</span>
                        </td>
                        <td className="px-6 py-5">
                          <div className="space-y-1.5">
                            {cCh && (
                              <div className={`text-xs px-2 py-1 rounded border ${isUpd ? 'bg-gray-50 text-gray-400 border-gray-100' : 'bg-orange-50 text-orange-700 border-orange-100'} w-fit font-medium flex items-center gap-2`}>
                                Costo: <span className="line-through opacity-50">Bs{cC.toFixed(2)}</span> <ArrowRight className="w-3 h-3" /> <span className="font-bold">Bs{tC.toFixed(2)}</span>
                              </div>
                            )}
                            {pCh ? (
                              <div className={`text-sm px-2 py-1 rounded border ${isUpd ? 'bg-gray-50 text-gray-400 border-gray-100' : 'bg-green-50 text-green-700 border-green-100'} w-fit font-bold flex items-center gap-2`}>
                                Venta: <span className="line-through opacity-50">Bs{cP.toFixed(2)}</span> <ArrowRight className="w-3 h-3" /> <span className="font-bold">Bs{tP.toFixed(2)}</span>
                              </div>
                            ) : (
                              <div className="text-[10px] text-gray-400 font-black uppercase ml-1 tracking-tighter">
                                {item.priceApproved ? 'Precio mantenido' : 'Actualización de Costo'}
                              </div>
                            )}
                            {item.priceApproved && <div className="text-[10px] text-gray-400 ml-1">Margen: <span className="text-blue-600 font-bold">{calculateMargin(tC, tP).toFixed(2)}%</span></div>}
                          </div>
                        </td>
                        <td className="px-6 py-5 text-center">{getTimeSinceApproval(item)}</td>
                        <td className="px-6 py-5 text-center">
                          <div className="flex gap-2 justify-center">
                            {isUpd ? (
                              <div className="text-green-600 bg-green-50 border border-green-100 px-4 py-1.5 rounded-lg font-bold text-xs">Confirmado</div>
                            ) : (
                              <>
                                <button onClick={() => onUpdateSystem(item.id, item)} className="bg-white border border-blue-200 text-blue-600 px-4 py-1.5 rounded-lg font-bold text-xs hover:bg-blue-600 hover:text-white hover:border-blue-600 transition-all shadow-sm">Confirmar</button>
                                <button onClick={() => onDeleteItem(item.id, item)} className="p-2 text-red-400 hover:bg-red-50 border border-red-50 rounded-lg hover:text-red-600 transition-colors"><Trash2 className="w-4 h-4" /></button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

    </div>
  );
};
