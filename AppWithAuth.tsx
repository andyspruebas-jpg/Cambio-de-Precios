import React from 'react';
import { useAuth } from './contexts/AuthContext';
import { Login } from './components/Login';
import App from './App';

export const AppWithAuth: React.FC = () => {
    const { isAuthenticated } = useAuth();

    if (!isAuthenticated) {
        return <Login />;
    }

    return <App />;
};
