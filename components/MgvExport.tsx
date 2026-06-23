import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Download, History, Search, RotateCcw, FileText, ChevronDown, ChevronUp, User, Clock, Trash2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

interface MgvProduct {
    cod_int: string;
    codigo_prod: string;
    cod_sistema: string;
    dep_bal: string;
    marca: string;
    descripcion: string;
    unidad: string;
    costo: number;
    con_margen: number;
    precio: number;
    precio_actual: number;
    precio_original: number;
    modificado: boolean;
    col_r: string;
    col_s: string;
}

interface MgvHistoryEntry {
    id: number;
    timestamp: string;
    user: string;
    filename: string;
    modified_count: number;
    modified: { codigo_prod: string; descripcion: string; precio_original: number; precio_nuevo: number }[];
    content?: string;
}

interface Props {
    addNotification: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

export const MgvExport: React.FC<Props> = ({ addNotification }) => {
    const { user } = useAuth();
    const notify = useRef(addNotification);
    notify.current = addNotification;

    const [products, setProducts] = useState<MgvProduct[]>([]);
    const [loading, setLoading] = useState(true);
    const [pendingPrices, setPendingPrices] = useState<Record<string, string>>({});
    const [search, setSearch] = useState('');
    const [tab, setTab] = useState<'productos' | 'historial'>('productos');
    const [history, setHistory] = useState<MgvHistoryEntry[]>([]);
    const [historyLoading, setHistoryLoading] = useState(false);
    const [exporting, setExporting] = useState(false);
    const [expandedHistory, setExpandedHistory] = useState<number | null>(null);

    const loadProducts = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/mgv/products');
            const data = await res.json();
            setProducts(data);
        } catch {
            notify.current('Error cargando productos MGV', 'error');
        } finally {
            setLoading(false);
        }
    }, []);

    const loadHistory = useCallback(async () => {
        setHistoryLoading(true);
        try {
            const res = await fetch('/api/mgv/history');
            setHistory(await res.json());
        } catch {
            notify.current('Error cargando historial', 'error');
        } finally {
            setHistoryLoading(false);
        }
    }, []);

    useEffect(() => { loadProducts(); }, [loadProducts]);
    useEffect(() => { if (tab === 'historial') loadHistory(); }, [tab, loadHistory]);

    const filtered = useMemo(() => {
        if (!search.trim()) return products;
        const q = search.toLowerCase();
        return products.filter(p =>
            p.descripcion.toLowerCase().includes(q) ||
            p.codigo_prod.includes(q) ||
            p.marca.toLowerCase().includes(q)
        );
    }, [products, search]);

    const handlePriceChange = (codigoProd: string, value: string) => {
        setPendingPrices(prev => ({ ...prev, [codigoProd]: value }));
    };

    const handlePriceBlur = async (product: MgvProduct) => {
        const raw = pendingPrices[product.codigo_prod];
        if (raw === undefined) return;
        const num = parseFloat(raw.replace(',', '.'));
        if (isNaN(num) || num <= 0) {
            setPendingPrices(prev => { const n = { ...prev }; delete n[product.codigo_prod]; return n; });
            return;
        }
        if (num === product.precio_actual) {
            setPendingPrices(prev => { const n = { ...prev }; delete n[product.codigo_prod]; return n; });
            return;
        }
        fetch('/api/mgv/prices', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ overrides: { [product.codigo_prod]: num } }),
        }).catch(() => notify.current('Error guardando precio', 'error'));
        setPendingPrices(prev => { const n = { ...prev }; delete n[product.codigo_prod]; return n; });
        setProducts(prev => prev.map(p =>
            p.codigo_prod === product.codigo_prod
                ? { ...p, precio_actual: num, modificado: true }
                : p
        ));
    };

    const handleRevert = async (codigoProd: string) => {
        fetch(`/api/mgv/prices/${codigoProd}`, { method: 'DELETE' })
            .catch(() => notify.current('Error revirtiendo precio', 'error'));
        setProducts(prev => prev.map(p =>
            p.codigo_prod === codigoProd
                ? { ...p, precio_actual: p.precio_original, modificado: false }
                : p
        ));
    };

    const handleExport = async () => {
        setExporting(true);
        try {
            const res = await fetch('/api/mgv/export', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ user: user?.username || user?.id || 'unknown' }),
            });
            const data = await res.json();
            if (!data.ok) throw new Error(data.error);
            triggerDownload(data.content, data.filename);
            notify.current(`Exportado: ${data.filename} (${data.modified_count} modificados)`, 'success');
            if (tab === 'historial') loadHistory();
        } catch (e: any) {
            notify.current(`Error exportando: ${e.message}`, 'error');
        } finally {
            setExporting(false);
        }
    };

    const triggerDownload = (content: string, filename: string) => {
        const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
    };

    const handleHistoryDelete = async (h: MgvHistoryEntry, e: React.MouseEvent) => {
        e.stopPropagation();
        fetch(`/api/mgv/history/${h.id}`, { method: 'DELETE' })
            .catch(() => notify.current('Error borrando entrada', 'error'));
        setHistory(prev => prev.filter(x => x.id !== h.id));
        if (expandedHistory === h.id) setExpandedHistory(null);
    };

    const handleHistoryDownload = async (h: MgvHistoryEntry, e: React.MouseEvent) => {
        e.stopPropagation();
        try {
            const res = await fetch(`/api/mgv/history/${h.id}/download`);
            const data = await res.json();
            if (!data.ok) throw new Error(data.error);
            triggerDownload(data.content, data.filename);
        } catch (err: any) {
            notify.current(`Error descargando: ${err.message}`, 'error');
        }
    };

    const modifiedCount = products.filter(p => p.modificado).length;

    return (
        <div className="flex flex-col h-full bg-gray-50">
            {/* Header bar */}
            <div className="bg-white border-b px-6 py-3 flex items-center justify-between gap-4 flex-shrink-0">
                <div className="flex gap-2">
                    <button
                        onClick={() => setTab('productos')}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === 'productos' ? 'bg-indigo-600 text-white' : 'text-gray-600 hover:bg-gray-100'}`}
                    >
                        Productos ({products.length})
                    </button>
                    <button
                        onClick={() => setTab('historial')}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${tab === 'historial' ? 'bg-indigo-600 text-white' : 'text-gray-600 hover:bg-gray-100'}`}
                    >
                        <History className="w-4 h-4" />
                        Historial
                    </button>
                </div>

                {tab === 'productos' && (
                    <div className="flex items-center gap-3 flex-1 max-w-md">
                        <div className="relative flex-1">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                            <input
                                type="text"
                                placeholder="Buscar producto..."
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                                className="w-full pl-9 pr-4 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            />
                        </div>
                    </div>
                )}

                <button
                    onClick={handleExport}
                    disabled={exporting}
                    className="flex items-center gap-2 px-5 py-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors shadow-sm"
                >
                    <Download className="w-4 h-4" />
                    {exporting ? 'Exportando...' : `Exportar TXT${modifiedCount > 0 ? ` (${modifiedCount} mod.)` : ''}`}
                </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-auto p-6">
                {tab === 'productos' ? (
                    loading ? (
                        <div className="flex items-center justify-center h-40 text-gray-500">Cargando productos...</div>
                    ) : (
                        <div className="bg-white rounded-lg shadow overflow-hidden border border-gray-200">
                            <div className="overflow-x-auto">
                                <table className="min-w-full w-max text-left text-sm whitespace-nowrap">
                                    <thead className="bg-gray-50 text-gray-600 font-semibold uppercase tracking-wider">
                                        <tr>
                                            <th className="px-4 py-3 w-20">Código</th>
                                            <th className="px-4 py-3">Marca</th>
                                            <th className="px-4 py-3">Descripción</th>
                                            <th className="px-4 py-3 w-16 text-center">Unidad</th>
                                            <th className="px-4 py-3 text-right w-24">Costo</th>
                                            <th className="px-4 py-3 text-right w-28">Precio Orig.</th>
                                            <th className="px-4 py-3 text-right w-36 text-orange-600">Precio</th>
                                            <th className="px-4 py-3 w-10"></th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                        {filtered.map(p => {
                                            const inputVal = pendingPrices[p.codigo_prod] !== undefined
                                                ? pendingPrices[p.codigo_prod]
                                                : p.precio_actual.toFixed(2);
                                            return (
                                                <tr
                                                    key={p.codigo_prod}
                                                    className={p.modificado ? 'bg-amber-50' : 'hover:bg-gray-50'}
                                                >
                                                    <td className="px-4 py-2 font-mono text-xs text-gray-500">{p.codigo_prod}</td>
                                                    <td className="px-4 py-2 text-gray-600 whitespace-nowrap">{p.marca}</td>
                                                    <td className="px-4 py-2 text-gray-800">{p.descripcion}</td>
                                                    <td className="px-4 py-2 text-gray-500 text-center">{p.unidad}</td>
                                                    <td className="px-4 py-2 text-right text-gray-600">{p.costo.toFixed(2)}</td>
                                                    <td className="px-4 py-2 text-right text-gray-500 text-xs">
                                                        {p.modificado ? (
                                                            <span className="line-through">{p.precio_original.toFixed(2)}</span>
                                                        ) : (
                                                            p.precio_original.toFixed(2)
                                                        )}
                                                    </td>
                                                    <td className="px-4 py-2 text-right">
                                                        <input
                                                            type="number"
                                                            step="0.01"
                                                            min="0"
                                                            value={inputVal}
                                                            onChange={e => handlePriceChange(p.codigo_prod, e.target.value)}
                                                            onBlur={() => handlePriceBlur(p)}
                                                            onKeyDown={e => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                                                            className={`w-28 px-2 py-1 border rounded text-right text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-orange-400 ${p.modificado ? 'border-orange-400 bg-orange-50 text-orange-700' : 'border-orange-200 text-orange-600'}`}
                                                        />
                                                    </td>
                                                    <td className="px-2 py-2">
                                                        {p.modificado && (
                                                            <button
                                                                onClick={() => handleRevert(p.codigo_prod)}
                                                                title="Revertir precio original"
                                                                className="p-1 rounded text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                                                            >
                                                                <RotateCcw className="w-3.5 h-3.5" />
                                                            </button>
                                                        )}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                        {filtered.length === 0 && (
                                            <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-400">Sin resultados</td></tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )
                ) : (
                    /* Historial tab */
                    historyLoading ? (
                        <div className="flex items-center justify-center h-40 text-gray-500">Cargando historial...</div>
                    ) : history.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-40 text-gray-400 gap-2">
                            <FileText className="w-8 h-8" />
                            <span>Sin exportaciones aún</span>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {history.map(h => (
                                <div key={h.id} className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                                    <div
                                        className="px-5 py-4 flex items-center gap-4 cursor-pointer hover:bg-gray-50 transition-colors"
                                        onClick={() => setExpandedHistory(expandedHistory === h.id ? null : h.id)}
                                    >
                                        {/* Icon */}
                                        <div className="w-9 h-9 rounded-lg bg-indigo-50 flex items-center justify-center flex-shrink-0">
                                            <FileText className="w-4 h-4 text-indigo-500" />
                                        </div>

                                        {/* Main info */}
                                        <div className="flex-1 min-w-0">
                                            <div className="font-medium text-gray-800 text-sm truncate">{h.filename}</div>
                                            <div className="flex items-center gap-3 mt-0.5 text-xs text-gray-500">
                                                <span className="flex items-center gap-1">
                                                    <Clock className="w-3 h-3" />
                                                    {new Date(h.timestamp).toLocaleString('es-BO')}
                                                </span>
                                                <span className="flex items-center gap-1">
                                                    <User className="w-3 h-3" />
                                                    {h.user}
                                                </span>
                                            </div>
                                        </div>

                                        {/* Badge */}
                                        <span className={`flex-shrink-0 px-2.5 py-1 rounded-full text-xs font-semibold ${h.modified_count > 0 ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-500'}`}>
                                            {h.modified_count} mod.
                                        </span>

                                        {/* Download button */}
                                        <button
                                            onClick={e => handleHistoryDownload(h, e)}
                                            title="Descargar TXT"
                                            className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors bg-green-50 text-green-700 hover:bg-green-100"
                                        >
                                            <Download className="w-3.5 h-3.5" />
                                            TXT
                                        </button>

                                        {/* Delete button */}
                                        <button
                                            onClick={e => handleHistoryDelete(h, e)}
                                            title="Borrar entrada"
                                            className="flex-shrink-0 p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                                        >
                                            <Trash2 className="w-3.5 h-3.5" />
                                        </button>

                                        {/* Expand toggle */}
                                        {h.modified_count > 0 ? (
                                            expandedHistory === h.id
                                                ? <ChevronUp className="w-4 h-4 text-gray-400 flex-shrink-0" />
                                                : <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" />
                                        ) : (
                                            <div className="w-4 flex-shrink-0" />
                                        )}
                                    </div>

                                    {expandedHistory === h.id && h.modified.length > 0 && (
                                        <div className="border-t border-gray-100 bg-gray-50">
                                            <table className="w-full text-xs">
                                                <thead>
                                                    <tr className="bg-gray-100 text-gray-500 uppercase tracking-wider font-semibold">
                                                        <th className="px-5 py-2 text-left">Cód.</th>
                                                        <th className="px-5 py-2 text-left">Descripción</th>
                                                        <th className="px-5 py-2 text-right">Precio Ant.</th>
                                                        <th className="px-5 py-2 text-right">Precio Nuevo</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-gray-100">
                                                    {h.modified.map((m, i) => (
                                                        <tr key={i} className="bg-white hover:bg-gray-50">
                                                            <td className="px-5 py-2 text-gray-500 font-mono">{m.codigo_prod}</td>
                                                            <td className="px-5 py-2 text-gray-700">{m.descripcion}</td>
                                                            <td className="px-5 py-2 text-right text-gray-400 line-through">{m.precio_original.toFixed(2)}</td>
                                                            <td className="px-5 py-2 text-right text-green-700 font-semibold">{m.precio_nuevo.toFixed(2)}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )
                )}
            </div>
        </div>
    );
};
