import React, { createContext, useContext, useState, useEffect } from 'react';
import { User, UserUpdate, AuthContextType } from '../types/auth';
import { saveAvatarToMedia } from '../services/avatarService';

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [user, setUser] = useState<User | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    // Cargar usuario desde localStorage al iniciar
    useEffect(() => {
        const savedUser = localStorage.getItem('priceflow_user');
        const sessionToken = localStorage.getItem('priceflow_session');

        if (savedUser && sessionToken) {
            try {
                const parsedUser = JSON.parse(savedUser);
                setUser(parsedUser as User);
            } catch (error) {
                console.error('Error loading user:', error);
                localStorage.removeItem('priceflow_user');
                localStorage.removeItem('priceflow_session');
            }
        }
        setIsLoading(false);
    }, []);

    const login = async (email: string, password: string): Promise<boolean> => {
        try {
            // Intentar login con el backend
            const response = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password })
            });

            if (response.ok) {
                const data = await response.json();
                if (data.success && data.user) {
                    const sessionToken = `session_${Date.now()}_${Math.random()}`;

                    // Convertir avatar relativo a URL completa
                    let avatar = data.user.avatar;
                    if (avatar && avatar.startsWith('/media/')) {
                        avatar = `${avatar}`;
                    }

                    const userToSave: User = {
                        id: data.user.id,
                        username: data.user.username,
                        name: data.user.name,
                        role: data.user.role as 'admin' | 'proveedor' | 'sala' | 'analista' | 'ejecutor',
                        avatar
                    };

                    setUser(userToSave);
                    localStorage.setItem('priceflow_user', JSON.stringify(userToSave));
                    localStorage.setItem('priceflow_session', sessionToken);
                    return true;
                }
            }
        } catch (error) {
            console.log('Backend no disponible, usando fallback local');
        }

        return false;
    };

    const logout = () => {
        setUser(null);
        localStorage.removeItem('priceflow_user');
        localStorage.removeItem('priceflow_session');
    };

    const updateUser = async (updates: UserUpdate) => {
        if (!user) return;

        let avatarUrl = updates.avatar;

        // Si hay una imagen nueva (base64), guardarla en media
        if (updates.avatar && updates.avatar.startsWith('data:image')) {
            const savedUrl = await saveAvatarToMedia(user.id, updates.avatar);
            if (savedUrl) {
                avatarUrl = savedUrl;
            }
        }

        // Actualizar en el backend
        try {
            const updateData: any = {
                id: user.id,
                name: updates.name,
            };

            if (avatarUrl && avatarUrl.startsWith('data:image')) {
                updateData.avatar = avatarUrl;
            } else if (avatarUrl) {
                updateData.avatar = avatarUrl.replace(window.location.origin, '');
            }

            if (updates.password) {
                updateData.password = updates.password;
            }

            await fetch('/api/auth/update-user', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(updateData)
            });
        } catch (e) {
            console.log('Error actualizando usuario en backend:', e);
        }

        const updatedUser: User = {
            ...user,
            name: updates.name || user.name,
            avatar: avatarUrl || user.avatar
        };
        setUser(updatedUser);
        localStorage.setItem('priceflow_user', JSON.stringify(updatedUser));
    };

    if (isLoading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-100">
                <div className="text-center">
                    <div className="w-16 h-16 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                    <p className="text-gray-600">Cargando...</p>
                </div>
            </div>
        );
    }

    return (
        <AuthContext.Provider value={{ user, login, logout, updateUser, isAuthenticated: !!user }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};
