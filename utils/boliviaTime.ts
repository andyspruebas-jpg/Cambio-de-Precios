/**
 * Get current date/time in local timezone (Bolivia)
 * Simply returns the local time without any conversion
 */
export const getBoliviaTime = (): Date => {
    return new Date();
};

/**
 * Get local time as ISO string
 */
export const getBoliviaISOString = (): string => {
    return new Date().toISOString();
};

/**
 * Get local time formatted for filenames (YYYY-MM-DD_HH-MM-SS)
 * Uses local time, not UTC
 */
export const getBoliviaFilenameTimestamp = (): string => {
    const now = new Date();

    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');

    return `${year}-${month}-${day}_${hours}-${minutes}-${seconds}`;
};

/**
 * Get local time formatted for display (DD/MM/YYYY HH:MM:SS)
 */
export const getBoliviaDisplayTime = (): string => {
    const now = new Date();

    const day = String(now.getDate()).padStart(2, '0');
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const year = now.getFullYear();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');

    return `${day}/${month}/${year} ${hours}:${minutes}:${seconds}`;
};
