import React, { useState, useEffect } from 'react';
import { LogIn, User, Lock, AlertCircle, Shield } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

export const Login: React.FC = () => {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [rememberMe, setRememberMe] = useState(false);
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const { login } = useAuth();

    // Load remembered credentials on mount
    useEffect(() => {
        const remembered = localStorage.getItem('priceflow_remember_me');
        const savedUsername = localStorage.getItem('priceflow_saved_username');

        if (remembered === 'true' && savedUsername) {
            setUsername(savedUsername);
            setRememberMe(true);
        }
    }, []);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setIsLoading(true);

        if (!username || !password) {
            setError('Por favor ingresa usuario y contraseña');
            setIsLoading(false);
            return;
        }

        const success = await login(username, password);
        if (!success) {
            setError('Usuario o contraseña incorrectos');
            setPassword('');
        } else {
            // Save remember me preference
            if (rememberMe) {
                localStorage.setItem('priceflow_remember_me', 'true');
                localStorage.setItem('priceflow_saved_username', username);
            } else {
                localStorage.removeItem('priceflow_remember_me');
                localStorage.removeItem('priceflow_saved_username');
            }
        }
        setIsLoading(false);
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-800 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
                {/* Header */}
                <div className="bg-gradient-to-r from-blue-600 to-indigo-600 p-8 text-white">
                    <div className="flex items-center justify-center mb-4">
                        <div className="bg-white/20 p-4 rounded-full backdrop-blur-sm">
                            <LogIn className="w-12 h-12" />
                        </div>
                    </div>
                    <h1 className="text-3xl font-bold text-center">Andys</h1>
                    <p className="text-blue-100 text-center mt-2">Gestión de Precios v1.0</p>
                </div>

                {/* Form */}
                <div className="p-8">
                    <h2 className="text-2xl font-bold text-gray-800 mb-6 text-center">Iniciar Sesión</h2>

                    <form onSubmit={handleSubmit} className="space-y-6">
                        {/* Username */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                Usuario
                            </label>
                            <div className="relative">
                                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                    <User className="h-5 w-5 text-gray-400" />
                                </div>
                                <input
                                    type="text"
                                    value={username}
                                    onChange={(e) => setUsername(e.target.value)}
                                    className="block w-full pl-10 pr-3 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                                    placeholder="Ingresa tu usuario"
                                    autoFocus
                                />
                            </div>
                        </div>

                        {/* Password */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                Contraseña
                            </label>
                            <div className="relative">
                                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                    <Lock className="h-5 w-5 text-gray-400" />
                                </div>
                                <input
                                    type="password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className="block w-full pl-10 pr-3 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                                    placeholder="Ingresa tu contraseña"
                                />
                            </div>
                        </div>

                        {/* Remember Me Checkbox */}
                        <div className="flex items-center">
                            <input
                                id="remember-me"
                                type="checkbox"
                                checked={rememberMe}
                                onChange={(e) => setRememberMe(e.target.checked)}
                                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded cursor-pointer"
                            />
                            <label htmlFor="remember-me" className="ml-2 flex items-center gap-2 text-sm text-gray-700 cursor-pointer select-none">
                                <Shield className="w-4 h-4 text-blue-600" />
                                <span>Recordarme</span>
                            </label>
                        </div>

                        {/* Error Message */}
                        {error && (
                            <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-center gap-2 text-red-700">
                                <AlertCircle className="w-5 h-5 flex-shrink-0" />
                                <span className="text-sm">{error}</span>
                            </div>
                        )}

                        {/* Submit Button */}
                        <button
                            type="submit"
                            className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 text-white py-3 rounded-lg font-semibold hover:from-blue-700 hover:to-indigo-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-all transform hover:scale-[1.02] active:scale-[0.98]"
                        >
                            Iniciar Sesión
                        </button>
                    </form>


                </div>
            </div>
        </div>
    );
};
