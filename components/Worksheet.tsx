import React, { useState } from 'react';
import { MergedItem } from '../types';
import { analyzePriceBatch } from '../services/geminiService';
import { BrainCircuit, Check, DollarSign, Clock, Layers, Hourglass, ArrowRight, Trash2, CheckCircle, X, RotateCcw, Database } from 'lucide-react';
import { HistoryService } from '../services/historyService';
import { useAuth } from '../contexts/AuthContext';
import { formatPrice, getStep } from '../utils/formatters';

interface Props {
  batchId: string | null;
  items: MergedItem[];
  onApproveCost: (id: string, approved: boolean) => void;
  onApprovePrice: (id: string, approved: boolean) => void;
  onUpdateNewPrice: (id: string, price: number) => void;
  onUpdateNewCost: (id: string, cost: number) => void;
  onReturnToInbox: (id: string) => void;
  onOpenAnotherSheet?: () => void;
  onLoadProviderFile: (filename: string) => void;
  onDeleteProviderFile?: (filename: string) => Promise<boolean>;
  onFinish?: () => void;
  onSync?: () => Promise<void>;
  initialViewMode?: ViewMode;
  isLoading?: boolean;
}

type ViewMode = 'inbox' | 'pending_price' | 'pending_sheets';

export const Worksheet: React.FC<Props> = ({
  batchId, items, onApproveCost, onApprovePrice, onUpdateNewPrice, onUpdateNewCost,
  onReturnToInbox, onOpenAnotherSheet, onLoadProviderFile, onDeleteProviderFile, onFinish, onSync, initialViewMode = 'inbox', isLoading = false
}) => {
  const { user } = useAuth();

  const [aiAnalysis, setAiAnalysis] = useState<string | null>(null);
  const [loadingAi, setLoadingAi] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>(initialViewMode);
  const [pendingFiles, setPendingFiles] = useState<any[]>([]);

  // Update viewMode if initialViewMode changes (optional, but good for re-navigation)
  React.useEffect(() => {
    setViewMode(initialViewMode);
  }, [initialViewMode]);

  const fetchPendingFiles = () => {
    fetch('/api/list-provider-csv')
      .then(res => res.json())
      .then(data => setPendingFiles(data.files || []))
      .catch(err => console.error('Error loading pending files:', err));
  };

  // Load history/pending files
  React.useEffect(() => {
    if (viewMode === 'pending_sheets') {
      fetchPendingFiles();
    }
  }, [viewMode]);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortByDifference, setSortByDifference] = useState(false);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[400px]">
        <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-b-4 border-indigo-600 mb-6"></div>
        <h3 className="text-xl font-semibold text-gray-800">Cargando Hoja de Trabajo</h3>
        <p className="text-gray-500 mt-2">Procesando productos y comparando precios...</p>
      </div>
    );
  }

  // Logic to separate the lists
  // 1. Inbox: Items not yet updated in system, and Cost is NOT approved yet.
  const inboxItems = items.filter(i => !i.systemUpdated && !i.costApproved);

  // 2. Pending Price: Items not updated in system, Cost IS approved, but Price is NOT approved.
  const pendingPriceItems = items.filter(i => !i.systemUpdated && i.costApproved && !i.priceApproved);

  // Filter items based on search term (supports multiple words in any order)
  const filterItems = (items: MergedItem[]) => {
    let filtered = items;

    // Apply search filter
    if (searchTerm.trim()) {
      const searchWords = searchTerm.toLowerCase().trim().split(/\s+/);
      filtered = filtered.filter(item => {
        const barcode = item.barcode.toLowerCase();
        const description = item.description.toLowerCase();
        const combinedText = `${barcode} ${description}`;
        return searchWords.every(word => combinedText.includes(word));
      });
    }

    // Apply sorting by difference if enabled
    if (sortByDifference) {
      filtered = [...filtered].sort((a, b) => {
        // Calculate percentage difference based on view mode
        const getPctDiff = (item: MergedItem) => {
          if (viewMode === 'inbox') {
            return item.cost === 0 ? 0 : Math.abs(item.newCost - item.cost) / item.cost;
          } else {
            return item.price === 0 ? 0 : Math.abs(item.newPrice - item.price) / item.price;
          }
        };

        const diffA = getPctDiff(a);
        const diffB = getPctDiff(b);

        // Sort descending (highest percentage difference first - most red)
        return diffB - diffA;
      });
    }

    return filtered;
  };

  const activeItems = filterItems(viewMode === 'inbox' ? inboxItems : pendingPriceItems);

  // Derive supplier name from the first item (batch consistent)
  const allWorksheetItems = [...inboxItems, ...pendingPriceItems];

  // Helper to extract provider name from filename (e.g., PROVIDER_NAME_2025-01-01_10-00-00.csv)
  const extractProviderFromFilename = (filename: string): string => {
    if (!filename) return 'Hoja de Trabajo';
    // Remove .csv extension
    let name = filename.replace(/\.csv$/i, '');
    // Remove the timestamp (_YYYY-MM-DD_HH-MM-SS)
    const timestampRegex = /_\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}$/;
    name = name.replace(timestampRegex, '');
    // Replace underscores with spaces and capitalize
    return name.split('_').join(' ');
  };

  // Derive supplier name 
  const currentSupplier = allWorksheetItems.length > 0
    ? allWorksheetItems[0].batchSupplierName
    : (batchId && batchId !== 'active')
      ? extractProviderFromFilename(batchId)
      : viewMode === 'pending_sheets'
        ? 'Seleccionar Hoja de Trabajo'
        : 'Proveedor Desconocido';

  const handleAnalyze = async () => {
    setLoadingAi(true);
    const result = await analyzePriceBatch(activeItems);
    setAiAnalysis(result);
    setLoadingAi(false);
  };

  const calculateMargin = (cost: number, price: number) => {
    if (price === 0) return 0;
    return ((price - cost) / price) * 100;
  };

  const getTimePending = (dateString: string) => {
    const start = new Date(dateString).getTime();
    const now = new Date().getTime();
    const hours = Math.floor((now - start) / (1000 * 60 * 60));
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d`;
    if (hours > 0) return `${hours}h`;
    return 'Nuevo';
  };

  const getAgingColor = (dateString?: string) => {
    if (!dateString) return 'text-gray-400';
    const start = new Date(dateString).getTime();
    const now = new Date().getTime();
    const hours = Math.floor((now - start) / (1000 * 60 * 60));
    if (hours > 48) return 'text-red-600 font-bold';
    if (hours > 24) return 'text-orange-600';
    return 'text-green-600';
  };

  // Traffic light system based on cost difference (for Inbox view)
  const getCostDifferenceColor = (oldCost: number, newCost: number) => {
    if (!oldCost || oldCost === 0) return { bg: 'bg-white', text: 'text-gray-900' };
    const pctDiff = Math.abs((newCost - oldCost) / oldCost);

    if (pctDiff >= 0.1) {
      // 10%+ difference - Red
      return { bg: 'bg-red-600', text: 'text-white' };
    } else {
      // Less than 10% difference - No color
      return { bg: 'bg-white', text: 'text-gray-900' };
    }
  };

  // Traffic light system based on price difference (for Pending Price view)
  const getPriceDifferenceColor = (oldPrice: number, newPrice: number) => {
    if (!oldPrice || oldPrice === 0) return { bg: 'bg-white', text: 'text-gray-900' };
    const pctDiff = Math.abs((newPrice - oldPrice) / oldPrice);

    if (pctDiff >= 0.1) {
      // 10%+ difference - Red
      return { bg: 'bg-red-600', text: 'text-white' };
    } else {
      // Less than 10% difference - No color
      return { bg: 'bg-white', text: 'text-gray-900' };
    }
  };
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 border-b border-gray-200 pb-4">
        <div className="flex justify-between items-start">
          <div>
            <h2 className="text-2xl font-bold text-gray-800">{currentSupplier}</h2>
            <p className="text-sm text-gray-500">Hoja de Trabajo de Análisis de Precios</p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs font-mono bg-gray-100 text-gray-600 px-2 py-1 rounded">
              Total en proceso: {allWorksheetItems.length}
            </span>

            {/* Button to close sheet - ONLY visible when NOT in pending list mode */}
            {viewMode !== 'pending_sheets' && (
              <button
                onClick={() => {
                  if (onOpenAnotherSheet) {
                    onOpenAnotherSheet();
                  } else {
                    setViewMode('pending_sheets');
                  }
                }}
                className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors shadow-sm"
              >
                <X className="w-4 h-4" />
                Cerrar Hoja
              </button>
            )}
          </div>
        </div>

        {/* Navigation Tabs */}
        {viewMode === 'pending_sheets' ? (
          <div className="flex gap-2">
            {/* Context Back Button: Only show if we actually have an active sheet loaded (items exist) */}
            {allWorksheetItems.length > 0 && (
              <button
                onClick={() => setViewMode('inbox')}
                className="flex items-center gap-2 px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg transition-colors"
                title="Volver a los productos que estabas revisando"
              >
                <ArrowRight className="w-4 h-4 rotate-180" />
                Volver a Hoja Actual
              </button>
            )}
          </div>
        ) : (
          <div className="flex gap-2">
            <button
              onClick={() => setViewMode('inbox')}
              className={`flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-lg border transition-all ${viewMode === 'inbox'
                ? 'bg-white border-indigo-500 text-indigo-700 shadow-sm ring-1 ring-indigo-500'
                : 'bg-gray-50 border-gray-200 text-gray-500 hover:bg-gray-100'
                }`}
            >
              <Layers className="w-4 h-4" />
              <span className="font-medium">Bandeja Entrada (Costos)</span>
              {inboxItems.length > 0 && (
                <span className="bg-indigo-100 text-indigo-700 text-xs px-2 py-0.5 rounded-full font-bold">
                  {inboxItems.length}
                </span>
              )}
            </button>
            <button
              onClick={() => setViewMode('pending_price')}
              className={`flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-lg border transition-all ${viewMode === 'pending_price'
                ? 'bg-white border-orange-500 text-orange-700 shadow-sm ring-1 ring-orange-500'
                : 'bg-gray-50 border-gray-200 text-gray-500 hover:bg-gray-100'
                }`}
            >
              <Hourglass className="w-4 h-4" />
              <span className="font-medium">Pendientes de Precio</span>
              {pendingPriceItems.length > 0 && (
                <span className="bg-orange-100 text-orange-700 text-xs px-2 py-0.5 rounded-full font-bold">
                  {pendingPriceItems.length}
                </span>
              )}
            </button>
          </div>
        )}

        {/* Search Bar and Sort */}
        {allWorksheetItems.length > 0 && (
          <div className="flex gap-3">
            <button
              onClick={() => setSortByDifference(!sortByDifference)}
              className={`flex items-center gap-2 px-4 py-2 text-sm rounded-lg transition-all border-2 ${sortByDifference
                ? 'bg-purple-600 text-white border-purple-600 shadow-md'
                : 'bg-white text-gray-700 border-gray-300 hover:border-purple-400 hover:text-purple-600'
                }`}
              title={sortByDifference ? 'Ordenado por mayor diferencia' : 'Ordenar por mayor diferencia'}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4h13M3 8h9m-9 4h6m4 0l4-4m0 0l4 4m-4-4v12" />
              </svg>
              <span className="font-medium">
                {sortByDifference ? 'Mayor Diferencia ↓' : 'Ordenar por Diferencia'}
              </span>
            </button>

            {onSync && viewMode !== 'pending_sheets' && (
              <button
                onClick={async () => {
                  setIsSyncing(true);
                  await onSync();
                  setTimeout(() => setIsSyncing(false), 2000);
                }}
                disabled={isSyncing}
                className={`flex items-center gap-2 px-4 py-2 text-sm rounded-lg transition-all border-2 ${isSyncing
                  ? 'bg-green-50 text-green-600 border-green-200 cursor-not-allowed'
                  : 'bg-indigo-50 text-indigo-700 border-indigo-100 hover:bg-indigo-100 hover:border-indigo-300'
                  }`}
                title="Sincronizar todos los productos aprobados con el Ejecutor"
              >
                <Database className={`w-4 h-4 ${isSyncing ? 'animate-bounce' : ''}`} />
                <span className="font-medium">
                  {isSyncing ? '¡Sincronizado!' : 'Sincronizar con ERP'}
                </span>
              </button>
            )}

            <div className="relative flex-1">
              <input
                type="text"
                placeholder="Buscar por código de barras o nombre de producto..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full px-4 py-2 pl-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm"
              />
              <svg className="absolute left-3 top-2.5 w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm('')}
                  className="absolute right-3 top-2.5 text-gray-400 hover:text-gray-600"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Empty State */}
      {activeItems.length === 0 && viewMode !== 'pending_sheets' && (
        <div className="text-center p-12 bg-white rounded-lg border border-dashed border-gray-300">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-gray-100 mb-4">
            <Check className="w-6 h-6 text-gray-400" />
          </div>
          <h3 className="text-lg font-medium text-gray-900">
            {items.length > 0 && allWorksheetItems.length === 0
              ? 'Hoja Completada'
              : 'Todo limpio por aquí'}
          </h3>
          <p className="text-gray-500 mb-6">
            {items.length > 0 && allWorksheetItems.length === 0
              ? 'Todos los productos de esta hoja han sido procesados y enviados a Odoo o Sala de Ventas.'
              : viewMode === 'inbox'
                ? 'No hay costos pendientes de aprobación.'
                : 'No hay productos esperando definición de precio de venta.'}
          </p>

          {items.length > 0 && allWorksheetItems.length === 0 && (
            <div className="flex flex-col gap-4 items-center">
              {user?.role === 'admin' && (
                <p className="text-sm text-indigo-600 font-medium">Puedes ver el progreso en las pestañas "Actualizar Odoo" o "Sala de Ventas".</p>
              )}
              {onFinish && (
                <button
                  onClick={onFinish}
                  className="bg-green-600 hover:bg-green-700 text-white px-6 py-2 rounded-lg font-medium shadow transition-colors flex items-center gap-2 mx-auto"
                >
                  <CheckCircle className="w-5 h-5" />
                  Finalizar y Archivar Hoja
                </button>
              )}
            </div>
          )}

          {allWorksheetItems.length > 0 && activeItems.length === 0 && (
            <div className="p-4 bg-orange-50 rounded-lg border border-orange-100 mb-4">
              <p className="text-orange-700">
                {viewMode === 'inbox'
                  ? 'Todos los productos tienen el costo aprobado. Revisa la pestaña "Pendientes de Precio".'
                  : 'No hay productos pendientes de precio.'}
              </p>
            </div>
          )}
        </div>
      )}

      {/* AI Analysis Section (Only show if there are items) */}
      {activeItems.length > 0 && (
        <div className="bg-gradient-to-r from-indigo-50 to-purple-50 p-6 rounded-lg border border-indigo-100 shadow-sm">
          <div className="flex justify-between items-start mb-4">
            <div>
              <h3 className="text-lg font-bold text-indigo-900 flex items-center gap-2">
                <BrainCircuit className="w-5 h-5 text-indigo-600" />
                Asistente de Estrategia
              </h3>
              <p className="text-sm text-indigo-700">
                {viewMode === 'inbox'
                  ? 'Analiza variaciones de costos y sugiere alertas.'
                  : 'Analiza márgenes y sugiere precios de venta competitivos.'}
              </p>
            </div>
            <button
              onClick={handleAnalyze}
              disabled={loadingAi}
              className={`px-4 py-2 rounded-lg text-white font-medium shadow-md transition-all ${loadingAi ? 'bg-indigo-300 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-700'
                }`}
            >
              {loadingAi ? 'Analizando...' : 'Consultar IA'}
            </button>
          </div>

          {aiAnalysis && (
            <div className="bg-white p-4 rounded border border-indigo-100 text-gray-700 text-sm leading-relaxed whitespace-pre-wrap max-h-60 overflow-y-auto">
              {aiAnalysis}
            </div>
          )}
        </div>
      )}

      {/* Main Worksheet Table */}
      {activeItems.length > 0 && (
        <div className="bg-white rounded-xl shadow-lg border border-gray-100 mx-1 flex flex-col h-full">
          <div className="overflow-auto flex-1">
            <table className="min-w-full w-max text-left text-sm">
              <thead className="bg-gray-50/80 backdrop-blur-sm text-gray-500 font-bold text-xs uppercase tracking-wider sticky top-0 z-20 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-4 sticky left-0 bg-gray-50 z-30 shadow-[4px_0_8px_-4px_rgba(0,0,0,0.05)] whitespace-nowrap w-1">Código</th>
                  <th className="px-6 py-4 whitespace-nowrap">Producto</th>
                  <th className="px-6 py-4 text-center whitespace-nowrap">Stock</th>

                  {viewMode === 'inbox' ? (
                    <>
                      <th className="px-6 py-4 text-right whitespace-nowrap">PDC ODOO</th>
                      <th className="px-6 py-4 text-right bg-orange-50/50 text-orange-700 border-l border-orange-100 whitespace-nowrap">NUEVO PDC</th>
                      <th className="px-6 py-4 text-center whitespace-nowrap">Dif %</th>
                      <th className="px-6 py-4 text-right whitespace-nowrap">Dif Valor</th>
                      <th className="px-6 py-4 text-center bg-orange-50/50 border-1 border-orange-100 whitespace-nowrap">Aprobar</th>
                    </>
                  ) : (
                    <>
                      <th className="px-4 py-4 text-right whitespace-nowrap">PDC</th>
                      <th className="px-4 py-4 text-right whitespace-nowrap">PDV</th>
                      <th className="px-4 py-4 text-center whitespace-nowrap">Margen</th>
                      <th className="px-4 py-4 text-right font-medium text-gray-700 bg-gray-50 whitespace-nowrap">Nuevo PDC</th>
                      <th className="px-4 py-4 text-right whitespace-nowrap">T. Sugerido</th>
                      <th className="px-4 py-4 text-right bg-green-50/50 text-green-700 border-l border-green-100 whitespace-nowrap">Nuevo PDV</th>
                      <th className="px-4 py-4 text-center bg-green-50/50 text-green-700 whitespace-nowrap">Margen %</th>
                      <th className="px-4 py-4 text-right whitespace-nowrap">Ganancia</th>
                      <th className="px-4 py-4 text-center bg-purple-50 text-purple-700 whitespace-nowrap">Mg vs PDC</th>
                      <th className="px-4 py-4 text-center bg-green-50/50 border-l border-green-100 whitespace-nowrap">Aprobar</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {activeItems.map((item) => {
                  const currentMargin = calculateMargin(item.cost, item.price);
                  const newMargin = calculateMargin(item.newCost, item.newPrice);
                  const agingDate = viewMode === 'inbox' ? item.createdAt : item.costApprovedAt || item.createdAt;

                  // Modern Traffic Light Logic
                  const getRowStyle = () => {
                    // Check thresholds
                    const pctDiffCost = item.cost > 0 ? Math.abs((item.newCost - item.cost) / item.cost) : 0;
                    const pctDiffPrice = item.price > 0 ? Math.abs((item.newPrice - item.price) / item.price) : 0;

                    if (viewMode === 'inbox') {
                      if (pctDiffCost >= 0.1) return 'bg-red-50/60 hover:bg-red-50'; // Significant mismatch
                      if (pctDiffCost > 0) return 'hover:bg-gray-50';
                    } else {
                      if (pctDiffPrice >= 0.1) return 'bg-red-50/60 hover:bg-red-50'; // Significant mismatch
                      if (pctDiffPrice > 0) return 'hover:bg-gray-50';
                    }
                    return 'hover:bg-gray-50';
                  };

                  const rowClass = getRowStyle();

                  return (
                    <tr key={item.id} className={`transition-colors duration-200 ${rowClass}`}>
                      {/* Fixed ID Column with Shadow */}
                      <td className={`px-6 py-4 sticky left-0 z-10 bg-white shadow-[4px_0_8px_-4px_rgba(0,0,0,0.05)] whitespace-nowrap w-1 ${rowClass.includes('bg-red') ? 'bg-red-50/60' : ''}`}>
                        <div className="flex flex-col">
                          <span className="font-mono text-xs font-medium text-gray-500">{item.barcode}</span>
                        </div>
                      </td>

                      <td className="px-6 py-4 min-w-[700px]" title={item.description} style={{ whiteSpace: 'normal', wordWrap: 'break-word', overflow: 'visible', textOverflow: 'clip', maxWidth: 'none' }}>
                        <div className="font-medium text-gray-800 text-sm" style={{ whiteSpace: 'normal', wordWrap: 'break-word', overflow: 'visible', textOverflow: 'clip', display: 'block' }}>{item.description}</div>
                      </td>

                      <td className="px-6 py-4 text-center">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${item.stock <= 0 ? 'bg-red-100 text-red-800' : 'bg-blue-100 text-blue-800'
                          }`}>
                          {item.stock || 0}
                        </span>
                      </td>

                      {viewMode === 'inbox' ? (
                        <>
                          <td className="px-6 py-4 text-right font-mono text-gray-500">
                            Bs{formatPrice(item.cost, item.provider)}
                          </td>
                          <td className="px-6 py-4 text-right bg-orange-50/30">
                            <div className="flex items-center justify-end group">
                              <span className="text-gray-400 text-xs mr-1 opacity-50 group-hover:opacity-100">Bs</span>
                              <input
                                type="number"
                                value={item.newCost}
                                onChange={(e) => onUpdateNewCost(item.id, parseFloat(e.target.value))}
                                className="w-20 text-right font-bold text-gray-800 bg-transparent border-b border-transparent hover:border-orange-300 focus:border-orange-500 focus:outline-none transition-all p-0"
                                step={getStep(item.provider)}
                              />
                            </div>
                          </td>
                          <td className="px-6 py-4 text-center">
                            {(() => {
                              if (!item.cost || item.cost === 0) return <span className="text-gray-300">-</span>;
                              const diff = item.newCost - item.cost;
                              const pct = (diff / item.cost) * 100;
                              if (Math.abs(pct) < 0.05) return <span className="text-gray-300 text-xs">0%</span>;

                              return (
                                <span className={`text-xs font-bold px-2 py-1 rounded-md ${pct > 0 ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'
                                  }`}>
                                  {pct > 0 ? '+' : ''}{pct.toFixed(1)}%
                                </span>
                              );
                            })()}
                          </td>
                          <td className="px-6 py-4 text-right font-mono text-xs">
                            {(() => {
                              const diff = item.newCost - item.cost;
                              if (Math.abs(diff) < 0.005) return <span className="text-gray-300">-</span>;
                              return (
                                <span className={diff > 0 ? 'text-red-500' : 'text-green-500'}>
                                  {diff > 0 ? '+' : ''}{formatPrice(diff, item.provider)}
                                </span>
                              );
                            })()}
                          </td>
                          <td className="px-6 py-4 text-center bg-orange-50/30">
                            <button
                              onClick={() => onApproveCost(item.id, !item.costApproved)}
                              className={`p-2 rounded-full transition-all duration-200 transform active:scale-95 ${item.costApproved
                                ? 'bg-blue-600 text-white shadow-md shadow-blue-200 hover:bg-blue-700'
                                : 'bg-white border border-gray-200 text-gray-400 hover:border-blue-500 hover:text-blue-500'
                                }`}
                            >
                              <Check className="w-4 h-4" strokeWidth={3} />
                            </button>
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="px-4 py-4 text-right text-gray-500 font-mono text-xs">Bs{formatPrice(item.cost, item.provider)}</td>
                          <td className="px-4 py-4 text-right text-gray-500 font-mono text-xs">Bs{formatPrice(item.price, item.provider)}</td>
                          <td className="px-4 py-4 text-center">
                            <span className="text-xs text-gray-400">{calculateMargin(item.cost, item.price).toFixed(1)}%</span>
                          </td>
                          <td className="px-4 py-4 text-right font-mono font-medium text-gray-700 bg-gray-50">Bs{formatPrice(item.newCost, item.provider)}</td>
                          <td className="px-4 py-4 text-right text-xs text-gray-400">
                            {item.suggestedPrice ? `Bs${formatPrice(item.suggestedPrice, item.provider)}` : '-'}
                          </td>
                          <td className="px-4 py-4 text-right bg-green-50/30">
                            <div className="flex items-center justify-end group">
                              <span className="text-gray-400 text-xs mr-1 opacity-50 group-hover:opacity-100">Bs</span>
                              <input
                                type="number"
                                value={item.newPrice}
                                onChange={(e) => onUpdateNewPrice(item.id, parseFloat(e.target.value))}
                                className="w-20 text-right font-bold text-gray-800 bg-transparent border-b border-transparent hover:border-green-300 focus:border-green-500 focus:outline-none transition-all p-0"
                                step={getStep(item.provider)}
                              />
                            </div>
                          </td>
                          <td className="px-4 py-4 text-center">
                            <div className={`text-xs font-bold px-2 py-0.5 rounded-full inline-block ${newMargin < 5 ? 'bg-red-100 text-red-700' :
                              newMargin <= 15 ? 'bg-yellow-100 text-yellow-700' :
                                'bg-green-100 text-green-700'
                              }`}>
                              {newMargin.toFixed(1)}%
                            </div>
                          </td>
                          <td className="px-4 py-4 text-right font-bold font-mono">
                            {(() => {
                              const diff = (item.newPrice || item.price) - item.newCost; // Profit based on newCost
                              return <span className={diff >= 0 ? 'text-green-600' : 'text-red-600'}>Bs{formatPrice(diff, item.provider)}</span>;
                            })()}
                          </td>
                          <td className="px-4 py-4 text-center bg-purple-50">
                            {(() => {
                              // Margen real: (Nuevo PV - Costo ODOO) / Nuevo PV ?? Or whatever logical comparison
                              // As requested "Margen % Nuevo PDV vs PDC Odoo" -> (NewPrice - OldCost) / NewPrice
                              const margin = calculateMargin(item.cost, item.newPrice || item.price);
                              return <span className={`text-xs font-bold ${margin >= 15 ? 'text-green-700' : 'text-purple-700'}`}>{margin.toFixed(1)}%</span>;
                            })()}
                          </td>
                          <td className="px-4 py-4 text-center bg-green-50/30 border-l border-green-100">
                            <div className="flex items-center justify-center gap-2">
                              <button
                                onClick={() => onReturnToInbox(item.id)}
                                className="p-2 rounded-full bg-white border border-gray-200 text-orange-400 hover:text-orange-600 hover:border-orange-400 hover:bg-orange-50 transition-all duration-200 transform active:scale-95"
                                title="Devolver a Bandeja de Entrada (Costos)"
                              >
                                <RotateCcw className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => onApprovePrice(item.id, !item.priceApproved)}
                                disabled={!item.costApproved}
                                className={`p-2 rounded-full transition-all duration-200 transform active:scale-95 ${item.priceApproved
                                  ? 'bg-green-600 text-white shadow-md shadow-green-200 hover:bg-green-700'
                                  : 'bg-white border border-gray-200 text-gray-400 hover:border-green-500 hover:text-green-500'
                                  } ${!item.costApproved ? 'opacity-50 cursor-not-allowed' : ''}`}
                              >
                                <Check className="w-4 h-4" strokeWidth={3} />
                              </button>
                            </div>
                          </td>
                        </>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Pending Sheets List */}
      {viewMode === 'pending_sheets' && (
        <div className="bg-white rounded-lg shadow overflow-hidden border border-gray-200">
          <div className="p-4 border-b border-gray-100 bg-gray-50">
            <h3 className="font-semibold text-gray-700">Archivos Disponibles</h3>
          </div>
          {pendingFiles.length === 0 ? (
            <div className="p-8 text-center text-gray-500">No hay hojas pendientes</div>
          ) : (
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50 text-gray-600 font-semibold uppercase">
                <tr>
                  <th className="p-3 border-b">Archivo</th>
                  <th className="p-3 border-b">Fecha</th>
                  <th className="p-3 border-b text-right">Tamaño</th>
                  <th className="p-3 border-b text-center">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {pendingFiles.map((file, idx) => (
                  <tr key={idx} className="hover:bg-gray-50">
                    <td className="p-3 font-medium text-gray-700">{file.name}</td>
                    <td className="p-3 text-gray-500">{new Date(file.modified).toLocaleString()}</td>
                    <td className="p-3 text-right text-gray-500">{(file.size / 1024).toFixed(1)} KB</td>
                    <td className="p-3 text-center">
                      <div className="flex items-center justify-center gap-3">
                        <button
                          onClick={async () => {
                            if (onDeleteProviderFile) {
                              const success = await onDeleteProviderFile(file.name);
                              if (success) fetchPendingFiles();
                            }
                          }}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-600 rounded-lg transition-colors text-xs font-medium border border-red-100"
                          title="Eliminar Ho_ja"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          Eliminar
                        </button>
                        <button
                          onClick={() => {
                            onLoadProviderFile(file.name);
                            // Switch to inbox view after loading
                            setTimeout(() => setViewMode('inbox'), 100);
                          }}
                          className="flex items-center gap-1.5 bg-purple-600 hover:bg-purple-700 text-white px-4 py-1.5 rounded-lg text-xs font-semibold transition-all shadow-sm border border-purple-700"
                        >
                          <CheckCircle className="w-3.5 h-3.5" />
                          Confirmar
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
};
