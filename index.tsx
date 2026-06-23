import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import { AuthProvider } from './contexts/AuthContext';
import { AppWithAuth } from './AppWithAuth';

const root = ReactDOM.createRoot(document.getElementById('root')!);
root.render(
  <React.StrictMode>
    <AuthProvider>
      <AppWithAuth />
    </AuthProvider>
  </React.StrictMode>
);