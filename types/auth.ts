export type UserRole = 'admin' | 'proveedor' | 'sala' | 'analista' | 'ejecutor' | 'gerente';

export interface User {
    id: string;
    username: string;
    name: string;
    role: UserRole;
    avatar?: string;
}

export interface UserUpdate {
    name?: string;
    password?: string;
    avatar?: string;
}

export interface AuthContextType {
    user: User | null;
    login: (username: string, password: string) => Promise<boolean>;
    logout: () => void;
    updateUser: (updates: UserUpdate) => Promise<void>;
    isAuthenticated: boolean;
}
