import { useState, useMemo } from 'react';
import { RefreshCw, FileSpreadsheet, Search, Clock } from 'lucide-react';
import { StorageService } from '../services/storageService';
import { OdooProduct } from '../types';

interface IngestionProps {
    onLoadCSV: () => Promise<void>;
    onLoadOdoo: (onProgress?: (p: number, t: number) => void, forceFull?: boolean) => Promise<number>;
    odooSyncStatus: 'idle' | 'syncing' | 'success' | 'error';
    csvLoadStatus: 'idle' | 'loading' | 'success' | 'error';
    products?: OdooProduct[];
    onSelectProvider?: (provider: string) => void;
    lastSyncDate?: Date | null;
}

export function Ingestion({
    onLoadCSV,
    onLoadOdoo,
    odooSyncStatus,
    csvLoadStatus,
    products = [],
    onSelectProvider,
    lastSyncDate
}: IngestionProps) {
    const [searchTerm, setSearchTerm] = useState('');
    const [showDropdown, setShowDropdown] = useState(false);

    const [syncProgress, setSyncProgress] = useState({ current: 0, total: 0 });

    const handleOdooSync = async () => {
        try {
            setSyncProgress({ current: 0, total: 0 });
            // Manual sync attempts incremental first if possible (forceFull=false)
            // But if user suspects issues, they might want full... 
            // Given the prompt "no haga todo desde 0", we prefer incremental.
            await onLoadOdoo((current, total) => {
                setSyncProgress({ current, total });
            }, false); // forceFull = false
        } catch (error) {
            console.error('Error during Odoo sync:', error);
        }
    };

    const providers = useMemo(() => {
        const unique = new Set<string>();
        products.forEach(p => {
            // Use provider field if available, otherwise fall back to supplierName
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
        if (!searchTerm.trim()) return [];
        return providers.filter(p =>
            p.toLowerCase().includes(searchTerm.toLowerCase())
        ).slice(0, 10);
    }, [providers, searchTerm]);

    const handleSelectProvider = (providerName: string) => {
        if (onSelectProvider) {
            onSelectProvider(providerName);
            setSearchTerm('');
            setShowDropdown(false);
        }
    };

    const getStatusText = (status: string) => {
        switch (status) {
            case 'syncing': return 'Sincronizando...';
            case 'success': return 'Sincronizado';
            case 'error': return 'Error';
            default: return 'No sincronizado';
        }
    };

    const formatSyncTime = (date: Date | null) => {
        if (!date) return 'Nunca';
        return new Intl.DateTimeFormat('es-ES', {
            dateStyle: 'short',
            timeStyle: 'short'
        }).format(date);
    };

    const savedCSVPath = StorageService.getLastCSVPath();

    return (
        <div className="space-y-6">
            <h2 className="text-2xl font-bold text-gray-800">Fuentes de Datos</h2>

            <div className="space-y-4">
                {/* Odoo Sync Card */}
                <div className="bg-white rounded-lg border border-gray-200 p-6">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-4">
                            <div className={`w-12 h-12 rounded-full flex items-center justify-center ${odooSyncStatus === 'success' ? 'bg-purple-100' :
                                odooSyncStatus === 'syncing' ? 'bg-yellow-100' :
                                    odooSyncStatus === 'error' ? 'bg-red-100' : 'bg-gray-100'
                                }`}>
                                <RefreshCw className={`w-6 h-6 ${odooSyncStatus === 'success' ? 'text-purple-600' :
                                    odooSyncStatus === 'syncing' ? 'text-yellow-600 animate-spin' :
                                        odooSyncStatus === 'error' ? 'text-red-600' : 'text-gray-400'
                                    }`} />
                            </div>
                            <div>
                                <div className="flex items-center gap-2">
                                    <h3 className="text-lg font-semibold text-gray-900">Sincronización Automática</h3>
                                    <span className="text-xs font-medium bg-green-100 text-green-700 px-2 py-0.5 rounded-full border border-green-200">
                                        Activa
                                    </span>
                                </div>
                                <p className="text-sm text-gray-500">
                                    {odooSyncStatus === 'syncing'
                                        ? `Sincronizando cambios... ${syncProgress.total > 0 ? `(${Math.round((syncProgress.current / syncProgress.total) * 100)}%)` : ''}`
                                        : 'El sistema busca cambios cada 10 minutos'}
                                </p>
                                <div className="flex items-center space-x-2 mt-1">
                                    <Clock className="w-3 h-3 text-gray-400" />
                                    <p className="text-xs text-gray-400">Última actualización: {formatSyncTime(lastSyncDate)}</p>
                                </div>
                            </div>
                        </div>

                            {odooSyncStatus === 'syncing' ? (
                                <div className="flex flex-col items-end min-w-[150px]">
                                    <span className="mb-1 text-xs font-semibold text-purple-600 animate-pulse">
                                        Actualizando datos...
                                    </span>
                                    <div className="w-32 h-1.5 bg-purple-100 rounded-full overflow-hidden">
                                        <div
                                            className="h-full bg-purple-500 transition-all duration-300"
                                            style={{ width: `${syncProgress.total > 0 ? (syncProgress.current / syncProgress.total) * 100 : 100}%` }}
                                        />
                                    </div>
                                </div>
                            ) : (
                                <button
                                    onClick={handleOdooSync}
                                    className="flex items-center gap-2 px-3 py-1.5 bg-blue-50 text-blue-600 hover:bg-blue-100 rounded-md text-sm font-medium transition-colors"
                                >
                                    <RefreshCw className="w-4 h-4" />
                                    Sincronizar Manual
                                </button>
                            )}
                        </div>
                    {savedCSVPath && odooSyncStatus === 'success' && (
                        <div className="mt-4 p-3 bg-purple-50 border border-purple-200 rounded-lg flex justify-between items-center">
                            <p className="text-sm text-purple-800">
                                <span className="font-medium">Respaldo local actualizado:</span> <code className="bg-purple-100 px-2 py-1 rounded ml-1 text-xs">{savedCSVPath}</code>
                            </p>
                        </div>
                    )}
                </div>

                {/* Provider Selection Card */}
                <div className="bg-white rounded-lg border border-gray-200 p-6">
                    <div className="flex items-center space-x-4 mb-4">
                        <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center">
                            <FileSpreadsheet className="w-6 h-6 text-blue-600" />
                        </div>
                        <div>
                            <h3 className="text-lg font-semibold text-gray-900">Seleccionar Proveedor</h3>
                            <p className="text-sm text-gray-500">Cargar productos desde datos sincronizados</p>
                        </div>
                    </div>

                    <div className="relative">
                        <div className="relative">
                            <Search className="w-5 h-5 text-gray-400 absolute left-3 top-3" />
                            <input
                                type="text"
                                placeholder="Buscar proveedor..."
                                className="w-full border border-gray-300 rounded-lg pl-10 pr-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                value={searchTerm}
                                onChange={(e) => {
                                    setSearchTerm(e.target.value);
                                    setShowDropdown(true);
                                }}
                                onFocus={() => setShowDropdown(true)}
                                onBlur={() => setTimeout(() => setShowDropdown(false), 200)}
                            />
                        </div>

                        {showDropdown && filteredProviders.length > 0 && (
                            <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-64 overflow-auto">
                                {filteredProviders.map((provider, index) => (
                                    <button
                                        key={index}
                                        onClick={() => handleSelectProvider(provider)}
                                        className="w-full text-left px-4 py-3 hover:bg-blue-50 transition-colors border-b border-gray-100 last:border-b-0"
                                    >
                                        <span className="font-medium text-gray-900">{provider}</span>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    <p className="text-xs text-gray-500 mt-4">
                        Selecciona un proveedor de la lista para cargar sus productos en la Hoja de Trabajo.
                        Se encontraron {providers.length} proveedores en la última sincronización.
                    </p>
                </div>
            </div>

            {/* Info Section */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h4 className="font-semibold text-blue-900 mb-2">Instrucciones</h4>
                <ul className="text-sm text-blue-800 space-y-1">
                    <li>• Primero sincroniza con Odoo para obtener los datos más recientes.</li>
                    <li>• Escribe en el buscador para filtrar proveedores en tiempo real.</li>
                    <li>• Haz clic en un proveedor para cargar sus productos en la Hoja de Trabajo.</li>
                </ul>
            </div>
        </div >
    );
}
