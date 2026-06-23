import OpenAI from 'openai';
import { MergedItem } from "../types";
import { formatPrice } from '../utils/formatters';
// Use API key from environment variables (Vite)
const apiKey = import.meta.env.VITE_OPENAI_API_KEY;

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: apiKey || '',
  dangerouslyAllowBrowser: true // Required for client-side usage
});

export const analyzePriceBatch = async (items: MergedItem[]): Promise<string> => {
  if (!items || items.length === 0) return "No hay datos para analizar.";

  // Calculate statistics
  const totalItems = items.length;
  const itemsWithCostIncrease = items.filter(i => (i.newCost || i.cost) > i.cost);
  const avgCostIncrease = itemsWithCostIncrease.length > 0
    ? itemsWithCostIncrease.reduce((sum, i) => sum + (((i.newCost || i.cost) - i.cost) / i.cost * 100), 0) / itemsWithCostIncrease.length
    : 0;

  const itemsWithHighIncrease = items.filter(i => {
    const increase = ((i.newCost || i.cost) - i.cost) / i.cost * 100;
    return increase > 5;
  });

  const calculateMargin = (cost: number, price: number) => {
    if (price === 0) return 0;
    return ((price - cost) / price) * 100;
  };

  const itemsWithLowMargin = items.filter(i => {
    const newMargin = calculateMargin(i.newCost || i.cost, i.newPrice || i.price);
    return newMargin < 15;
  });

  // Prepare detailed data for analysis
  const detailedData = items.slice(0, 15).map(i => {
    const costIncrease = ((i.newCost || i.cost) - i.cost) / i.cost * 100;
    const currentMargin = calculateMargin(i.cost, i.price);
    const newMargin = calculateMargin(i.newCost || i.cost, i.newPrice || i.price);
    const marginImpact = newMargin - currentMargin;

    return {
      producto: i.description.substring(0, 40),
      costoActual: formatPrice(i.cost, i.provider),
      costoNuevo: formatPrice(i.newCost || i.cost, i.provider),
      incrementoCosto: `${costIncrease.toFixed(1)}%`,
      margenActual: `${currentMargin.toFixed(1)}%`,
      margenNuevo: `${newMargin.toFixed(1)}%`,
      impactoMargen: `${marginImpact > 0 ? '+' : ''}${marginImpact.toFixed(1)}%`
    };
  });

  const prompt = `
Eres un experto analista de precios para retail en Bolivia.

DATOS:
- Total productos: ${totalItems}
- Con aumento de costo: ${itemsWithCostIncrease.length}
- Aumento promedio: ${avgCostIncrease.toFixed(1)}%
- Con aumento >5%: ${itemsWithHighIncrease.length}
- Con margen <15%: ${itemsWithLowMargin.length}

MUESTRA (15 productos):
${JSON.stringify(detailedData, null, 2)}

GENERA UN ANÁLISIS BREVE (máximo 350 palabras) con:

1. 📊 RESUMEN EJECUTIVO (2 líneas)
2. ⚠️ ALERTAS CRÍTICAS (productos específicos con problemas)
3. 💡 RECOMENDACIONES (aprobar/negociar/rechazar)
4. 📈 OPORTUNIDADES (productos para promocionar)

Usa emojis, sé específico con nombres y números. Tono profesional pero accesible.
`;

  try {
    console.log('🚀 Llamando a OpenAI...');

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "Eres un experto analista de precios para retail. Respondes en español de forma profesional y concisa."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      temperature: 0.7,
      max_tokens: 800
    });

    console.log('✅ Respuesta recibida de OpenAI');
    return response.choices[0]?.message?.content || "No se pudo generar el análisis.";

  } catch (error: any) {
    console.error("❌ Error al llamar a OpenAI:", error);

    if (error?.status === 401) {
      return "⚠️ **Error de Autenticación**\n\nLa API key de OpenAI no es válida. Verifica `VITE_OPENAI_API_KEY` en tu archivo `.env.local`.";
    }

    if (error?.status === 429) {
      return "⚠️ **Límite Excedido**\n\nHas alcanzado el límite de tu plan de OpenAI. Verifica tu uso en platform.openai.com/usage";
    }

    if (error?.status === 403) {
      return "⚠️ **Acceso Denegado**\n\nTu API key no tiene permisos para usar este modelo. Verifica tu plan en platform.openai.com";
    }

    return `❌ **Error al Analizar**\n\n${error?.message || 'Error desconocido'}\n\nStatus: ${error?.status || 'N/A'}`;
  }
};
