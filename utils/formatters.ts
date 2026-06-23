export const SPECIAL_PROVIDER = "COLGATE PALMOLIVE BOLIVIA LTDA";

/**
 * Returns the decimal precision for a given provider.
 * COLGATE PALMOLIVE BOLIVIA LTDA uses 5 decimals, others use 2.
 */
export const getPrecision = (provider?: string | null): number => {
    if (!provider) return 2;
    const p = provider.trim().toUpperCase();
    const target = SPECIAL_PROVIDER.toUpperCase();

    // Check for exact match or if it contains the main name
    if (p === target || (p.includes("COLGATE") && p.includes("PALMOLIVE"))) {
        return 5;
    }
    return 2;
};

/**
 * Formats a number to the correct precision based on the provider.
 */
export const formatPrice = (price: number, provider?: string | null): string => {
    const precision = getPrecision(provider);
    return price.toFixed(precision);
};

/**
 * Rounds (or not) a number based on the provider's precision requirements.
 */
export const roundPrice = (price: number, provider?: string | null): number => {
    const precision = getPrecision(provider);
    // Since the requirement is "don't round" for Colgate, 
    // but we need to limit to 5 decimals for Odoo/Storage,
    // we use toFixed(precision) and parseFloat to get the number.
    // toFixed(5) will only round if there's a 6th decimal, 
    // which is likely what they want to avoid "standard" 2-decimal rounding.
    return parseFloat(price.toFixed(precision));
};

/**
 * Returns the Excel number format string for a given provider.
 */
export const getExcelFormat = (provider?: string | null): string => {
    const precision = getPrecision(provider);
    if (precision === 5) {
        return '"Bs"#,##0.00000';
    }
    return '"Bs"#,##0.00';
};

/**
 * Returns the Excel percentage format string.
 */
export const getExcelPctFormat = (provider?: string | null): string => {
    const precision = getPrecision(provider);
    if (precision === 5) {
        return '0.00000"%"';
    }
    return '0.00"%"';
};

/**
 * Returns the numeric step for input fields based on provider precision.
 */
export const getStep = (provider?: string | null): string => {
    return getPrecision(provider) === 5 ? "0.00001" : "0.01";
};
