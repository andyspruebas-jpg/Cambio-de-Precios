import React, { useState, useEffect } from 'react';
import { MergedItem } from '../types';
import { AlertTriangle, WifiOff, ServerCrash, Clock, RefreshCw, Trash2, X, ArrowRight } from 'lucide-react';
import { updateProductPrice, invalidateSession } from '../services/odooService';
import { useAuth } from '../contexts/AuthContext';

interface FailedConfirmation {
  item: MergedItem;
  errorMsg: string;
  errorType: 'network' | 'server' | 'auth' | 'timeout' | 'odoo' | 'unknown';
  failedAt: string;
}

const FAILED_KEY = (userId: string | null) => `priceflow_failed_confirmations_${userId || 'guest'}`;

function loadFailed(userId: string | null): FailedConfirmation[] {
  try { return JSON.parse(localStorage.getItem(FAILED_KEY(userId)) || '[]'); } catch { return []; }
}
function saveFailed(userId: string | null, items: FailedConfirmation[]) {
  localStorage.setItem(FAILED_KEY(userId), JSON.stringify(items));
}

function classifyError(err: unknown): { errorMsg: string; errorType: FailedConfirmation['errorType'] } {
  const msg = err instanceof Error ? err.message : String(err);
  if (msg.includes('Failed to fetch') || msg.includes('NetworkError'))
    return { errorMsg: 'Sin conexión a internet o servidor inaccesible', errorType: 'network' };
  if (msg.includes('ECONNREFUSED') || msg.includes('503') || msg.includes('502'))
    return { errorMsg: 'Servidor caído o VPS sin respuesta', errorType: 'server' };
  if (msg.includes('Auth failed') || msg.includes('401'))
    return { errorMsg: 'Sesión expirada — requiere reconexión', errorType: 'auth' };
  if (msg.includes('timeout'))
    return { errorMsg: 'Tiempo de espera agotado', errorType: 'timeout' };
  if (msg.includes('Odoo') || msg.includes('RPC'))
    return { errorMsg: `Error en Odoo: ${msg.slice(0, 80)}`, errorType: 'odoo' };
  return { errorMsg: msg.slice(0, 100) || 'Error desconocido', errorType: 'unknown' };
}

interface Props {
  addNotification: (type: 'success' | 'error' | 'warning' | 'info', title: string, message: string) => void;
  onCountChange?: (count: number) => void;
}

export const FailedConfirmationsPage: React.FC<Props> = ({ addNotification, onCountChange }) => {
  const { user } = useAuth();
  const [failed, setFailed] = useState<FailedConfirmation[]>(() => loadFailed(user?.id || null));
  const [isRetryingAll, setIsRetryingAll] = useState(false);

  useEffect(() => {
    saveFailed(user?.id || null, failed);
    onCountChange?.(failed.length);
  }, [failed, user?.id]);

  const retryOne = async (fc: FailedConfirmation): Promise<boolean> => {
    const { item } = fc;
    const cC = item.cost || 0; const cP = item.price || 0;
    const tC = item.costApproved ? (item.newCost || cC) : cC;
    const tP = item.priceApproved ? (item.newPrice || cP) : cP;
    try {
      await updateProductPrice(item.barcode, tC, tP, item.costApproved || false, item.priceApproved || false);
      return true;
    } catch (err) {
      const { errorMsg, errorType } = classifyError(err);
      if (errorType === 'auth') invalidateSession();
      setFailed(prev => prev.map(f =>
        f.item.id === item.id ? { ...f, errorMsg, errorType, failedAt: new Date().toISOString() } : f
      ));
      return false;
    }
  };

  const handleRetryOne = async (fc: FailedConfirmation) => {
    const ok = await retryOne(fc);
    if (ok) {
      setFailed(prev => prev.filter(f => f.item.id !== fc.item.id));
      addNotification('success', 'Confirmado', `${fc.item.description} actualizado en Odoo.`);
    } else {
      addNotification('error', 'Error', `No se pudo confirmar ${fc.item.description}.`);
    }
  };

  const handleRetryAll = async () => {
    if (isRetryingAll || failed.length === 0) return;
    setIsRetryingAll(true);
    const toRetry = [...failed];
    const stillFailed: FailedConfirmation[] = [];
    for (const fc of toRetry) {
      const ok = await retryOne(fc);
      if (!ok) stillFailed.push(fc);
    }
    setFailed(stillFailed);
    const ok = toRetry.length - stillFailed.length;
    if (ok > 0) addNotification('success', 'Reintento completado', `${ok} confirmados, ${stillFailed.length} fallaron.`);
    else addNotification('error', 'Sin cambios', 'Todos los reintentos fallaron. Verifica la conexión.');
    setIsRetryingAll(false);
  };

  const handleDismissOne = (id: string) => setFailed(prev => prev.filter(f => f.item.id !== id));
  const handleDismissAll = () => setFailed([]);

  return (
    <div className="bg-white border border-red-200 rounded-lg shadow-sm overflow-hidden">
      {/* Header */}
      <div className="bg-red-50 border-b border-red-200 px-6 py-4 flex justify-between items-center">
        <div className="flex items-center gap-3">
          <div className="bg-red-100 p-2 rounded-lg">
            <AlertTriangle className="w-5 h-5 text-red-600" />
          </div>
          <div>
            <h3 className="font-black text-red-800 text-base">
              {failed.length > 0 ? `No Confirmados (${failed.length})` : 'Errores de Subida'}
            </h3>
            <p className="text-xs text-red-500">
              {failed.length > 0
                ? 'Estos cambios no llegaron a Odoo. Reintenta o elimínalos.'
                : 'Productos que no pudieron confirmarse en Odoo aparecerán aquí'}
            </p>
          </div>
        </div>
        {failed.length > 0 && (
          <div className="flex gap-2">
            <button
              onClick={handleRetryAll}
              disabled={isRetryingAll}
              className="flex items-center gap-2 bg-red-600 text-white px-4 py-2 rounded-lg font-bold text-sm hover:bg-red-700 disabled:opacity-50 transition-all"
            >
              {isRetryingAll
                ? <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
                : <RefreshCw className="w-4 h-4" />}
              Reintentar Todo
            </button>
            <button
              onClick={handleDismissAll}
              className="flex items-center gap-2 border border-red-200 text-red-600 px-4 py-2 rounded-lg font-bold text-sm hover:bg-red-50 transition-all"
            >
              <Trash2 className="w-4 h-4" /> Eliminar Todo
            </button>
          </div>
        )}
      </div>

      {/* Body */}
      {failed.length === 0 ? (
        <div className="px-6 py-10 flex flex-col items-center gap-2 text-gray-400">
          <div className="w-10 h-10 rounded-full bg-green-50 border border-green-100 flex items-center justify-center mb-1">
            <span className="text-green-500 text-lg font-black">✓</span>
          </div>
          <p className="font-medium text-sm">No hay productos con error en la subida</p>
        </div>
      ) : (
        <div className="divide-y divide-red-50">
          {failed.map((fc) => {
            const ErrorIcon = fc.errorType === 'network' ? WifiOff
              : fc.errorType === 'server' ? ServerCrash
              : fc.errorType === 'timeout' ? Clock
              : AlertTriangle;
            const errorColor = fc.errorType === 'network' ? 'text-orange-600 bg-orange-50 border-orange-100'
              : fc.errorType === 'server' ? 'text-red-600 bg-red-50 border-red-100'
              : fc.errorType === 'auth' ? 'text-purple-600 bg-purple-50 border-purple-100'
              : fc.errorType === 'timeout' ? 'text-yellow-700 bg-yellow-50 border-yellow-100'
              : 'text-gray-600 bg-gray-50 border-gray-100';
            const cC = fc.item.cost || 0; const cP = fc.item.price || 0;
            const tC = fc.item.costApproved ? (fc.item.newCost || cC) : cC;
            const tP = fc.item.priceApproved ? (fc.item.newPrice || cP) : cP;
            return (
              <div key={fc.item.id} className="px-6 py-4 flex items-center gap-4 hover:bg-red-50/30 transition-colors">
                <div className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-bold shrink-0 ${errorColor}`}>
                  <ErrorIcon className="w-3.5 h-3.5" />
                  {fc.errorType === 'network' ? 'Sin internet'
                    : fc.errorType === 'server' ? 'Servidor caído'
                    : fc.errorType === 'auth' ? 'Sesión expirada'
                    : fc.errorType === 'timeout' ? 'Timeout'
                    : fc.errorType === 'odoo' ? 'Error Odoo'
                    : 'Error'}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-gray-800 text-sm truncate">{fc.item.description}</div>
                  <div className="text-[10px] text-gray-400 font-mono">BAR: {fc.item.barcode}</div>
                  <div className="text-xs text-red-500 mt-0.5 truncate" title={fc.errorMsg}>{fc.errorMsg}</div>
                </div>
                <div className="shrink-0 space-y-1 text-xs">
                  {fc.item.costApproved && Math.abs(tC - cC) >= 0.000001 && (
                    <div className="flex items-center gap-1 text-orange-700">
                      <span className="line-through opacity-50">Bs{cC.toFixed(2)}</span>
                      <ArrowRight className="w-3 h-3" />
                      <span className="font-bold">Bs{tC.toFixed(2)}</span>
                      <span className="text-gray-400 text-[10px]">costo</span>
                    </div>
                  )}
                  {fc.item.priceApproved && Math.abs(tP - cP) >= 0.000001 && (
                    <div className="flex items-center gap-1 text-green-700">
                      <span className="line-through opacity-50">Bs{cP.toFixed(2)}</span>
                      <ArrowRight className="w-3 h-3" />
                      <span className="font-bold">Bs{tP.toFixed(2)}</span>
                      <span className="text-gray-400 text-[10px]">precio</span>
                    </div>
                  )}
                  <div className="text-[10px] text-gray-400">
                    {new Date(fc.failedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button
                    onClick={() => handleRetryOne(fc)}
                    className="flex items-center gap-1.5 bg-white border border-blue-200 text-blue-600 px-3 py-1.5 rounded-lg font-bold text-xs hover:bg-blue-600 hover:text-white hover:border-blue-600 transition-all"
                  >
                    <RefreshCw className="w-3 h-3" /> Reintentar
                  </button>
                  <button
                    onClick={() => handleDismissOne(fc.item.id)}
                    className="p-1.5 text-red-400 hover:bg-red-50 border border-red-100 rounded-lg hover:text-red-600 transition-colors"
                    title="Eliminar de la lista"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
