import React, { useState, useEffect } from 'react';
import { FileText, Calendar, Eye, ArrowLeft, Download, Trash2 } from 'lucide-react';
import * as XLSX from 'xlsx';
import { formatPrice } from '../utils/formatters';

interface ArchivedFile {
    filename: string;
    originalName: string;
    modified: string;
    size: number;
}

interface ArchivedItem {
    barcode: string;
    description: string;
    cost: number;
    price: number;
    newCost: number;
    newPrice: number;
    suggestedPrice: number;
    provider: string;
    supplierName: string;
    status: string;
    costApproved: boolean;
    priceApproved: boolean;
    systemUpdated: boolean;
    storeExecuted: boolean;
}

export const ArchivedSheets: React.FC = () => {
    const [archives, setArchives] = useState<ArchivedFile[]>([]);
    const [selectedFile, setSelectedFile] = useState<ArchivedFile | null>(null);
    const [fileData, setFileData] = useState<ArchivedItem[]>([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        fetchArchives();
    }, []);

    const fetchArchives = async () => {
        try {
            const res = await fetch('/api/list-archives');
            const data = await res.json();
            setArchives(data.archives || []);
        } catch (error) {
            console.error('Error fetching archives:', error);
        }
    };

    const handleViewFile = async (file: ArchivedFile) => {
        setLoading(true);
        try {
            const res = await fetch(`/api/get-archive-data/${file.filename}`);
            const data = await res.json();
            setFileData(data);
            setSelectedFile(file);
        } catch (error) {
            console.error('Error loading file data:', error);
            alert('Error al cargar los datos del archivo.');
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async (file: ArchivedFile) => {
        if (!window.confirm(`¿Estás seguro de que deseas eliminar permanentemente el archivo "${file.originalName}"?`)) {
            return;
        }

        try {
            const res = await fetch(`/api/archive-sheet/${file.filename}`, {
                method: 'DELETE'
            });

            if (res.ok) {
                // Refresh list
                fetchArchives();
                alert('Archivo eliminado correctamente.');
            } else {
                alert('Error al eliminar el archivo.');
            }
        } catch (error) {
            console.error('Error deleting archive:', error);
            alert('Error al eliminar el archivo.');
        }
    };

    const handleExportExcel = () => {
        if (!selectedFile || fileData.length === 0) return;

        const headers = ['Codigo', 'Producto', 'Proveedor', 'Costo Ant.', 'Costo Nuevo', 'Precio Ant.', 'Precio Nuevo', 'Estado'];
        const rows = fileData.map(item => [
            item.barcode,
            item.description,
            item.provider || item.supplierName,
            item.cost,
            item.newCost,
            item.price,
            item.newPrice,
            item.status
        ]);

        const workbook = XLSX.utils.book_new();
        const worksheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Archivo Finalizado');
        XLSX.writeFile(workbook, `Reporte_${selectedFile.originalName.replace('.csv', '')}.xlsx`);
    };

    if (selectedFile) {
        return (
            <div className="space-y-6">
                <div className="flex items-center justify-between">
                    <button
                        onClick={() => setSelectedFile(null)}
                        className="flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors"
                    >
                        <ArrowLeft className="w-5 h-5" />
                        <span>Volver a la lista</span>
                    </button>
                    <div className="flex items-center gap-4">
                        <h2 className="text-xl font-bold text-gray-800">{selectedFile.originalName}</h2>
                        <button
                            onClick={handleExportExcel}
                            className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                        >
                            <Download className="w-4 h-4" />
                            Exportar Excel
                        </button>
                    </div>
                </div>

                {loading ? (
                    <div className="flex justify-center p-12">
                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
                    </div>
                ) : (
                    <div className="bg-white rounded-lg shadow overflow-hidden border border-gray-200">
                        <div className="overflow-x-auto">
                            <table className="min-w-full w-max text-left text-sm">
                                <thead className="bg-gray-100 text-gray-600 font-semibold uppercase sticky top-0">
                                    <tr>
                                        <th className="p-3 border-b">Codigo</th>
                                        <th className="p-3 border-b">Producto</th>
                                        <th className="p-3 border-b">Proveedor</th>
                                        <th className="p-3 border-b text-right">Costo Ant.</th>
                                        <th className="p-3 border-b text-right header-highlight bg-orange-50 text-orange-800">Costo Nuevo</th>
                                        <th className="p-3 border-b text-right">Precio Ant.</th>
                                        <th className="p-3 border-b text-right header-highlight bg-green-50 text-green-800">Precio Nuevo</th>
                                        <th className="p-3 border-b text-center">Estado</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {fileData.map((item, idx) => (
                                        <tr key={idx} className="hover:bg-gray-50">
                                            <td className="p-3 font-mono text-gray-600">{item.barcode}</td>
                                            <td className="p-3 font-medium text-gray-900 min-w-[500px] whitespace-normal">
                                                <div className="whitespace-normal break-words leading-tight">{item.description}</div>
                                            </td>
                                            <td className="p-3 text-gray-500">{item.provider || item.supplierName || 'N/A'}</td>
                                            <td className="p-3 text-right text-gray-500">Bs{formatPrice(item.cost, item.provider || item.supplierName)}</td>
                                            <td className="p-3 text-right font-bold text-orange-700 bg-orange-50/30">Bs{formatPrice(item.newCost, item.provider || item.supplierName)}</td>
                                            <td className="p-3 text-right text-gray-500">Bs{formatPrice(item.price, item.provider || item.supplierName)}</td>
                                            <td className="p-3 text-right font-bold text-green-700 bg-green-50/30">Bs{formatPrice(item.newPrice, item.provider || item.supplierName)}</td>
                                            <td className="p-3 text-center">
                                                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${item.status === 'STORE_EXECUTED' ? 'bg-green-100 text-green-800' :
                                                    item.status === 'SYSTEM_UPDATED' ? 'bg-blue-100 text-blue-800' :
                                                        'bg-gray-100 text-gray-800'
                                                    }`}>
                                                    {item.status === 'STORE_EXECUTED' ? 'Finalizado' : item.status}
                                                </span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h2 className="text-2xl font-bold text-gray-800">Excels Finalizados</h2>
                    <p className="text-gray-500">Historial de hojas de trabajo procesadas y archivadas</p>
                </div>
            </div>

            <div className="bg-white rounded-lg shadow overflow-hidden border border-gray-200">
                {archives.length === 0 ? (
                    <div className="p-12 text-center text-gray-500">
                        <FileText className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                        <p>No hay hojas archivadas todavía.</p>
                    </div>
                ) : (
                    <table className="w-full text-left text-sm">
                        <thead className="bg-gray-50 text-gray-600 font-semibold uppercase">
                            <tr>
                                <th className="p-4 border-b">Nombre del Archivo</th>
                                <th className="p-4 border-b">Fecha de Archivo</th>
                                <th className="p-4 border-b text-right">Tamaño</th>
                                <th className="p-4 border-b text-center">Acciones</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {archives.map((file, idx) => (
                                <tr key={idx} className="hover:bg-gray-50 transition-colors">
                                    <td className="p-4">
                                        <div className="flex items-center gap-3">
                                            <div className="p-2 bg-indigo-50 rounded-lg text-indigo-600">
                                                <FileText className="w-5 h-5" />
                                            </div>
                                            <span className="font-medium text-gray-900">{file.originalName}</span>
                                        </div>
                                    </td>
                                    <td className="p-4 text-gray-500">
                                        <div className="flex items-center gap-2">
                                            <Calendar className="w-4 h-4" />
                                            {new Date(file.modified).toLocaleString()}
                                        </div>
                                    </td>
                                    <td className="p-4 text-right text-gray-500">
                                        {(file.size / 1024).toFixed(1)} KB
                                    </td>
                                    <td className="p-4 text-center">
                                        <div className="flex items-center justify-center gap-2">
                                            <button
                                                onClick={() => handleViewFile(file)}
                                                className="inline-flex items-center gap-2 px-3 py-1.5 bg-white border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 hover:text-indigo-600 transition-colors shadow-sm"
                                                title="Ver Contenido"
                                            >
                                                <Eye className="w-4 h-4" />
                                                Ver Datos
                                            </button>
                                            <button
                                                onClick={() => handleDelete(file)}
                                                className="inline-flex items-center gap-2 px-3 py-1.5 bg-white border border-red-200 rounded-lg text-red-600 hover:bg-red-50 transition-colors shadow-sm"
                                                title="Eliminar Archivo"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
};
