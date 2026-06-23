import React, { useState } from 'react';
import { X, UserPlus, Mail, Lock, User as UserIcon, Shield } from 'lucide-react';

interface Props {
    isOpen: boolean;
    onClose: () => void;
    onUserCreated: () => void;
}

export const CreateUserModal: React.FC<Props> = ({ isOpen, onClose, onUserCreated }) => {
    const [formData, setFormData] = useState({
        email: '',
        password: '',
        name: '',
        role: 'sala' as 'admin' | 'proveedor' | 'sala' | 'analista' | 'ejecutor'
    });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    if (!isOpen) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            const response = await fetch('/api/auth/create-user', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData)
            });

            const data = await response.json();

            if (response.ok && data.success) {
                alert(`✅ Usuario creado exitosamente!\n\nEmail: ${formData.email}\nNombre: ${formData.name}\nRol: ${formData.role}`);
                setFormData({ email: '', password: '', name: '', role: 'sala' });
                onUserCreated();
                onClose();
            } else {
                setError(data.message || 'Error al crear usuario');
            }
        } catch (err) {
            setError('Error de conexión con el servidor');
            console.error('Error creating user:', err);
        } finally {
            setLoading(false);
        }
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        setFormData({
            ...formData,
            [e.target.name]: e.target.value
        });
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl shadow-2xl max-w-md w-full max-h-[90vh] overflow-y-auto">
                {/* Header */}
                <div className="sticky top-0 bg-gradient-to-r from-indigo-600 to-purple-600 text-white p-6 rounded-t-xl flex justify-between items-center">
                    <div className="flex items-center gap-3">
                        <UserPlus className="w-6 h-6" />
                        <h2 className="text-xl font-bold">Crear Nuevo Usuario</h2>
                    </div>
                    <button
                        onClick={onClose}
                        className="text-white hover:bg-white hover:bg-opacity-20 rounded-lg p-2 transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Form */}
                <form onSubmit={handleSubmit} className="p-6 space-y-4">
                    {error && (
                        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
                            {error}
                        </div>
                    )}

                    {/* Email */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            <Mail className="w-4 h-4 inline mr-2" />
                            Email / Usuario
                        </label>
                        <input
                            type="text"
                            name="email"
                            value={formData.email}
                            onChange={handleChange}
                            required
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                            placeholder="usuario@ejemplo.com"
                        />
                    </div>

                    {/* Password */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            <Lock className="w-4 h-4 inline mr-2" />
                            Contraseña
                        </label>
                        <input
                            type="password"
                            name="password"
                            value={formData.password}
                            onChange={handleChange}
                            required
                            minLength={6}
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                            placeholder="Mínimo 6 caracteres"
                        />
                    </div>

                    {/* Name */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            <UserIcon className="w-4 h-4 inline mr-2" />
                            Nombre Completo
                        </label>
                        <input
                            type="text"
                            name="name"
                            value={formData.name}
                            onChange={handleChange}
                            required
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                            placeholder="Juan Pérez"
                        />
                    </div>

                    {/* Role */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            <Shield className="w-4 h-4 inline mr-2" />
                            Rol
                        </label>
                        <select
                            name="role"
                            value={formData.role}
                            onChange={handleChange}
                            required
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                        >
                            <option value="sala">Sala de Ventas</option>
                            <option value="proveedor">Proveedor</option>
                            <option value="analista">Analista</option>
                            <option value="ejecutor">Ejecutor</option>
                            <option value="admin">Administrador</option>
                        </select>
                        <p className="text-xs text-gray-500 mt-1">
                            {formData.role === 'admin' && '• Acceso completo al sistema'}
                            {formData.role === 'proveedor' && '• Puede cargar productos y ver hojas de trabajo'}
                            {formData.role === 'sala' && '• Puede ejecutar cambios en sala de ventas'}
                            {formData.role === 'analista' && '• Acceso a importar datos, cargar proveedor y hoja de trabajo'}
                            {formData.role === 'ejecutor' && '• Solo puede actualizar Odoo'}
                        </p>
                    </div>

                    {/* Buttons */}
                    <div className="flex gap-3 pt-4">
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                        >
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            disabled={loading}
                            className="flex-1 px-4 py-2 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-lg hover:from-indigo-700 hover:to-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                        >
                            {loading ? (
                                <>
                                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                                    Creando...
                                </>
                            ) : (
                                <>
                                    <UserPlus className="w-4 h-4" />
                                    Crear Usuario
                                </>
                            )}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};
