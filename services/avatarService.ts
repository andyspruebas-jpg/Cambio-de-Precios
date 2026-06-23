// Usar URL relativa para que pase por el proxy de Vite
const API_URL = '/api/auth';

export const saveAvatarToMedia = async (userId: string, imageData: string): Promise<string | null> => {
    try {
        console.log('🖼️ Intentando guardar avatar para usuario:', userId);

        const response = await fetch(`${API_URL}/upload-avatar`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId, imageData })
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();

        if (data.success && data.avatarUrl) {
            // La URL ya viene con /media/, agregar el host del backend
            const fullUrl = `${data.avatarUrl}`;
            console.log('✅ Avatar guardado exitosamente:', fullUrl);
            return fullUrl;
        }

        throw new Error('No se recibió URL del avatar');
    } catch (error) {
        console.error('❌ Error uploading avatar:', error);
        console.log('⚠️ Guardando en localStorage como fallback');
        // Fallback: guardar en localStorage como base64
        return imageData;
    }
};
