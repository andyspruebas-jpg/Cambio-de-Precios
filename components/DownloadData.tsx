import { useState, useMemo } from 'react';
import { Search, Download, FileSpreadsheet } from 'lucide-react';
import { OdooProduct } from '../types';

interface DownloadDataProps {
    products: OdooProduct[];
    onDownload: (providerName: string) => void;
    lastSyncDate?: Date | null;
}

export function DownloadData({ products, onDownload, lastSyncDate }: DownloadDataProps) {
    const [searchTerm, setSearchTerm] = useState('');

    const providers = useMemo(() => {
        const unique = new Set<string>();
        products.forEach(p => {
            const providerName = (p.provider && p.provider !== 'N/A')
                ? p.provider
                : p.supplierName;

            if (providerName && providerName !== 'N/A' && providerName !== 'Odoo Import') {
                unique.add(providerName);
            }
        });
        return Array.from(unique).sort();
    }, [products]);

    const filteredProviders = useMemo(() => {
        if (!searchTerm.trim()) return providers;
        return providers.filter(p =>
            p.toLowerCase().includes(searchTerm.toLowerCase())
        );
    }, [providers, searchTerm]);

    return (
        <div className="p-6 max-w-6xl mx-auto">
            <div className="mb-8">
                <h2 className="text-2xl font-bold text-gray-800 mb-2">Descargar Datos</h2>
                <p className="text-gray-500">Selecciona un proveedor para descargar sus productos registrados.</p>
                {lastSyncDate && (
                    <p className="text-xs text-gray-400 mt-2 flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-green-500 inline-block"></span>
                        Última sincronización: {lastSyncDate.toLocaleString()}
                    </p>
                )}
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="p-6 border-b border-gray-100 bg-gray-50">
                    <div className="relative max-w-md">
                        <Search className="w-5 h-5 text-gray-400 absolute left-3 top-3" />
                        <input
                            type="text"
                            placeholder="Buscar proveedor..."
                            className="w-full border border-gray-300 rounded-lg pl-10 pr-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                </div>

                <div className="max-h-[600px] overflow-y-auto p-2">
                    {filteredProviders.length > 0 ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                            {filteredProviders.map((provider) => {
                                const count = products.filter(p =>
                                    (p.provider === provider) || (p.supplierName === provider)
                                ).length;

                                return (
                                    <button
                                        key={provider}
                                        onClick={() => onDownload(provider)}
                                        className="flex items-center justify-between p-4 rounded-lg border border-gray-100 hover:border-indigo-200 hover:bg-indigo-50 transition-all group text-left"
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                                                <FileSpreadsheet className="w-5 h-5" />
                                            </div>
                                            <div>
                                                <h3 className="font-semibold text-gray-900 group-hover:text-indigo-700">{provider}</h3>
                                                <p className="text-xs text-gray-500">{count} productos</p>
                                            </div>
                                        </div>
                                        <Download className="w-5 h-5 text-gray-300 group-hover:text-indigo-600" />
                                    </button>
                                );
                            })}
                        </div>
                    ) : (
                        <div className="text-center py-12">
                            <p className="text-gray-500">No se encontraron proveedores que coincidan con la búsqueda.</p>
                        </div>
                    )}
                </div>

                <div className="p-4 border-t border-gray-100 bg-gray-50 text-xs text-center text-gray-400">
                    Mostrando {filteredProviders.length} proveedores
                </div>
            </div>
        </div>
    );
}
