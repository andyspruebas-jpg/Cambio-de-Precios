import React from 'react';
import { X } from 'lucide-react';
import { MergedItem } from '../types';
import { formatPrice } from '../utils/formatters';

interface Props {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    items: MergedItem[];
}

export const ProductListModal: React.FC<Props> = ({ isOpen, onClose, title, items }) => {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-lg shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col">
                {/* Header */}
                <div className="flex justify-between items-center p-6 border-b border-gray-200">
                    <h2 className="text-2xl font-bold text-gray-800">{title}</h2>
                    <button
                        onClick={onClose}
                        className="text-gray-400 hover:text-gray-600 transition-colors"
                    >
                        <X className="w-6 h-6" />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6">
                    {items.length === 0 ? (
                        <div className="text-center py-12 text-gray-500">
                            <p className="text-lg">No hay productos en esta categoría</p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="min-w-full w-max text-sm">
                                <thead className="bg-gray-50 text-gray-600 font-semibold uppercase tracking-wider sticky top-0">
                                    <tr>
                                        <th className="p-3 text-left border-b">Código de Barras</th>
                                        <th className="p-3 text-left border-b">Descripción</th>
                                        <th className="p-3 text-left border-b">Proveedor</th>
                                        <th className="p-3 text-right border-b">Costo</th>
                                        <th className="p-3 text-right border-b">Precio</th>
                                        <th className="p-3 text-center border-b">Estado</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {items.map((item) => (
                                        <tr key={item.id} className="hover:bg-gray-50">
                                            <td className="p-3 font-mono text-xs">{item.barcode}</td>
                                            <td className="p-3 font-medium text-gray-800 min-w-[500px] whitespace-normal">
                                                <div className="whitespace-normal break-words leading-tight">{item.description}</div>
                                            </td>
                                            <td className="p-3 text-gray-600">
                                                {item.provider || item.supplierName || item.batchSupplierName || 'N/A'}
                                            </td>
                                            <td className="p-3 text-right text-gray-600">
                                                Bs{formatPrice(item.newCost || item.cost, item.provider)}
                                            </td>
                                            <td className="p-3 text-right text-gray-600">
                                                Bs{formatPrice(item.newPrice || item.price, item.provider)}
                                            </td>
                                            <td className="p-3 text-center">
                                                <div className="flex flex-col gap-1">
                                                    {item.costApproved && (
                                                        <span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded">
                                                            Costo ✓
                                                        </span>
                                                    )}
                                                    {item.priceApproved && (
                                                        <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded">
                                                            Precio ✓
                                                        </span>
                                                    )}
                                                    {item.systemUpdated && (
                                                        <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded">
                                                            Confirmado
                                                        </span>
                                                    )}
                                                    {item.storeExecuted && (
                                                        <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded">
                                                            Ejecutado
                                                        </span>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="p-6 border-t border-gray-200 bg-gray-50">
                    <div className="flex justify-between items-center">
                        <p className="text-sm text-gray-600">
                            Total: <span className="font-bold text-gray-800">{items.length}</span> producto{items.length !== 1 ? 's' : ''}
                        </p>
                        <button
                            onClick={onClose}
                            className="bg-gray-600 hover:bg-gray-700 text-white px-6 py-2 rounded-lg transition-colors"
                        >
                            Cerrar
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
