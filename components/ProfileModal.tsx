import React, { useState, useRef } from 'react';
import { X, User as UserIcon, Lock, Camera, Save } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

interface Props {
    isOpen: boolean;
    onClose: () => void;
}

export const ProfileModal: React.FC<Props> = ({ isOpen, onClose }) => {
    const { user, updateUser, logout } = useAuth();
    const [name, setName] = useState(user?.name || '');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [avatar, setAvatar] = useState(user?.avatar || '');
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const fileInputRef = useRef<HTMLInputElement>(null);

    if (!isOpen || !user) return null;

    const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            // Validar que sea una imagen
            if (!file.type.startsWith('image/')) {
                setError('Por favor selecciona un archivo de imagen');
                return;
            }

            // Validar tamaño (max 2MB)
            if (file.size > 2 * 1024 * 1024) {
                setError('La imagen debe ser menor a 2MB');
                return;
            }

            // Convertir a base64
            const reader = new FileReader();
            reader.onloadend = () => {
                setAvatar(reader.result as string);
                setError('');
            };
            reader.readAsDataURL(file);
        }
    };

    const handleSave = async () => {
        setError('');
        setSuccess('');

        // Validar nombre
        if (!name.trim()) {
            setError('El nombre no puede estar vacío');
            return;
        }

        // Validar contraseña si se está cambiando
        if (password) {
            if (password.length < 6) {
                setError('La contraseña debe tener al menos 6 caracteres');
                return;
            }
            if (password !== confirmPassword) {
                setError('Las contraseñas no coinciden');
                return;
            }
        }

        // Actualizar usuario
        await updateUser({
            name: name.trim(),
            avatar: avatar || undefined,
            password: password || undefined
        });
        setSuccess('Perfil actualizado correctamente');

        // Si cambió la contraseña, cerrar sesión para que vuelva a iniciar
        if (password) {
            setTimeout(() => {
                alert('Contraseña actualizada. Por favor, inicia sesión nuevamente.');
                logout();
            }, 1500);
        } else {
            setTimeout(() => {
                onClose();
            }, 1500);
        }
    };

    const getRoleColor = (role: string) => {
        switch (role) {
            case 'admin': return 'bg-blue-100 text-blue-800';
            case 'proveedor': return 'bg-green-100 text-green-800';
            case 'sala': return 'bg-orange-100 text-orange-800';
            default: return 'bg-gray-100 text-gray-800';
        }
    };

    const getRoleLabel = (role: string) => {
        switch (role) {
            case 'admin': return 'Administrador';
            case 'proveedor': return 'Proveedor';
            case 'sala': return 'Sala de Ventas';
            default: return role;
        }
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[200]">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
                {/* Header */}
                <div className="bg-gradient-to-r from-indigo-600 to-indigo-700 p-6 text-white relative">
                    <button
                        onClick={onClose}
                        className="absolute top-4 right-4 p-2 hover:bg-white/20 rounded-lg transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                    <div className="flex items-center gap-4">
                        {/* Avatar with upload button */}
                        <div className="relative group">
                            <div className="w-16 h-16 rounded-full flex items-center justify-center text-2xl font-bold overflow-hidden bg-white/20 backdrop-blur-sm">
                                {avatar ? (
                                    <img src={avatar} alt="Avatar" className="w-full h-full object-cover" />
                                ) : (
                                    <span>{user.name.charAt(0).toUpperCase()}</span>
                                )}
                            </div>
                            <button
                                onClick={() => fileInputRef.current?.click()}
                                className="absolute inset-0 bg-black bg-opacity-50 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                                title="Cambiar foto"
                            >
                                <Camera className="w-6 h-6" />
                            </button>
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept="image/*"
                                onChange={handleImageUpload}
                                className="hidden"
                            />
                        </div>
                        <div>
                            <h2 className="text-2xl font-bold">Mi Perfil</h2>
                            <p className="text-indigo-100 text-sm">@{user.username}</p>
                        </div>
                    </div>
                </div>

                {/* Body */}
                <div className="p-6 space-y-4">
                    {/* Role Badge */}
                    <div className="flex items-center justify-between">
                        <span className="text-sm text-gray-600">Rol:</span>
                        <span className={`px-3 py-1 rounded-full text-sm font-medium ${getRoleColor(user.role)}`}>
                            {getRoleLabel(user.role)}
                        </span>
                    </div>

                    {/* Name Input */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            <UserIcon className="w-4 h-4 inline mr-2" />
                            Nombre
                        </label>
                        <input
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                            placeholder="Tu nombre"
                        />
                    </div>

                    {/* Password Change */}
                    <div className="border-t pt-4">
                        <h3 className="text-sm font-semibold text-gray-700 mb-3">
                            <Lock className="w-4 h-4 inline mr-2" />
                            Cambiar Contraseña
                        </h3>
                        <div className="space-y-3">
                            <input
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                                placeholder="Nueva contraseña (opcional)"
                            />
                            {password && (
                                <input
                                    type="password"
                                    value={confirmPassword}
                                    onChange={(e) => setConfirmPassword(e.target.value)}
                                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                                    placeholder="Confirmar contraseña"
                                />
                            )}
                        </div>
                    </div>

                    {/* Messages */}
                    {error && (
                        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
                            {error}
                        </div>
                    )}
                    {success && (
                        <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg text-sm">
                            {success}
                        </div>
                    )}

                    {/* Actions */}
                    <div className="flex gap-3 pt-4">
                        <button
                            onClick={onClose}
                            className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                        >
                            Cancelar
                        </button>
                        <button
                            onClick={handleSave}
                            className="flex-1 px-4 py-2 bg-gradient-to-r from-indigo-600 to-indigo-700 text-white rounded-lg hover:from-indigo-700 hover:to-indigo-800 transition-colors flex items-center justify-center gap-2"
                        >
                            <Save className="w-4 h-4" />
                            Guardar
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
