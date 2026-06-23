const API_URL = '/api/auth';

export interface LoginResponse {
    success: boolean;
    user?: {
        id: string;
        username: string;
        name: string;
        role: string;
        avatar?: string;
    };
    error?: string;
}

export const authService = {
    async login(email: string, password: string): Promise<LoginResponse> {
        try {
            const response = await fetch(`${API_URL}/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password })
            });

            if (!response.ok) {
                const error = await response.json();
                return { success: false, error: error.error || 'Login failed' };
            }

            return await response.json();
        } catch (error) {
            console.error('Login error:', error);
            return { success: false, error: 'Network error' };
        }
    },

    async updateUser(id: string, updates: { name?: string; password?: string; avatar?: string }): Promise<boolean> {
        try {
            const response = await fetch(`${API_URL}/update-user`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id, ...updates })
            });

            const data = await response.json();
            return data.success;
        } catch (error) {
            console.error('Update user error:', error);
            return false;
        }
    },

    async uploadAvatar(userId: string, imageData: string): Promise<string | null> {
        try {
            const response = await fetch(`${API_URL}/upload-avatar`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId, imageData })
            });

            const data = await response.json();
            return data.success ? data.avatarUrl : null;
        } catch (error) {
            console.error('Upload avatar error:', error);
            return null;
        }
    }
};
