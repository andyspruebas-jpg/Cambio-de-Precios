import React from 'react';
import { X, FileText, Calendar, ArrowRight } from 'lucide-react';
import { ProviderFile } from '../types';

interface Props {
    isOpen: boolean;
    onClose: () => void;
    files: ProviderFile[];
    onSelect: (filename: string) => void;
}

export const PendingSheetsModal: React.FC<Props> = ({ isOpen, onClose, files, onSelect }) => {
    if (!isOpen) return null;

    // Safety check for files prop
    const safeFiles = Array.isArray(files) ? files : [];

    // Helper to format date
    const formatDate = (dateStr: string) => {
        try {
            const date = new Date(dateStr);
            if (!isNaN(date.getTime())) {
                return date.toLocaleString();
            }
        } catch (e) {
            console.error('Error parsing date:', e);
        }
        return 'Fecha desconocida';
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
            <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full max-h-[80vh] flex flex-col overflow-hidden animate-fade-in-up">
                {/* Header */}
                <div className="flex justify-between items-center p-6 border-b border-gray-100 bg-gradient-to-r from-purple-50 to-white">
                    <div>
                        <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                            <FileText className="w-5 h-5 text-purple-600" />
                            Hojas Pendientes
                        </h2>
                        <p className="text-sm text-gray-500 mt-1">Selecciona un archivo para procesar</p>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                    {safeFiles.length === 0 ? (
                        <div className="text-center py-12 flex flex-col items-center">
                            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
                                <FileText className="w-8 h-8 text-gray-300" />
                            </div>
                            <h3 className="text-lg font-medium text-gray-900">No hay hojas pendientes</h3>
                            <p className="text-gray-500 mt-1">Todos los archivos han sido procesados</p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {safeFiles.map((file, index) => {
                                // Skip invalid files
                                if (!file || typeof file !== 'object') return null;

                                return (
                                    <button
                                        key={index}
                                        onClick={() => onSelect(file.name)}
                                        className="w-full text-left bg-white border border-gray-200 rounded-lg p-4 hover:border-purple-300 hover:shadow-md hover:bg-purple-50 transition-all group flex items-center justify-between"
                                    >
                                        <div className="flex items-start gap-3">
                                            <div className="p-2 bg-purple-100 rounded-lg group-hover:bg-purple-200 transition-colors">
                                                <FileText className="w-5 h-5 text-purple-600" />
                                            </div>
                                            <div>
                                                <h3 className="font-medium text-gray-800 group-hover:text-purple-700 transition-colors">
                                                    {file.name}
                                                </h3>
                                                <div className="flex items-center gap-2 mt-1 text-xs text-gray-500">
                                                    <Calendar className="w-3 h-3" />
                                                    <span>{formatDate(file.modified)}</span>
                                                </div>
                                            </div>
                                        </div>
                                        <ArrowRight className="w-4 h-4 text-gray-300 group-hover:text-purple-500 transform group-hover:translate-x-1 transition-all" />
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="p-4 bg-gray-50 border-t border-gray-100 flex justify-end">
                    <button
                        onClick={onClose}
                        className="text-sm text-gray-600 hover:text-gray-800 font-medium px-4 py-2"
                    >
                        Cancelar
                    </button>
                </div>
            </div>
        </div>
    );
};
