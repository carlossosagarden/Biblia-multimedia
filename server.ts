import express, { Request, Response } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const isProd = process.env.NODE_ENV === 'production';

app.use(express.json());

// Initialize GoogleGenAI with the recommended User-Agent header
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY || '',
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    },
  },
});

// Primary free-tier model is 'gemini-3.8-flash', with graceful fallback to 'gemini-3.1-flash-lite'
// Neither requires a paid API key or billing account.
const FREE_TIER_MODELS = ['gemini-3.8-flash', 'gemini-3.1-flash-lite'];

async function generateFreeTierContent(options: {
  contents: string;
  systemInstruction?: string;
  responseMimeType?: string;
  temperature?: number;
}): Promise<{ text: string; modelUsed: string }> {
  let lastError: any = null;

  for (const model of FREE_TIER_MODELS) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents: options.contents,
        config: {
          systemInstruction: options.systemInstruction,
          responseMimeType: options.responseMimeType,
          temperature: options.temperature ?? 0.7,
        },
      });
      return { text: response.text || '', modelUsed: model };
    } catch (err: any) {
      lastError = err;
      console.warn(`[Gemini Free Tier] Model ${model} encountered notice:`, err?.message || err);
      // Try next free model in list if temporary demand spike occurred
    }
  }
  throw lastError;
}

// API Status & Configuration Endpoint
app.get('/api/gemini/status', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    configured: Boolean(process.env.GEMINI_API_KEY),
    model: FREE_TIER_MODELS[0],
    modelsAvailable: FREE_TIER_MODELS,
    freeTier: true,
  });
});

// Endpoint: Biblical Exegesis & Verse Explanation
app.post('/api/gemini/explain', async (req: Request, res: Response) => {
  try {
    const { verseRef, verseText, versionName } = req.body;

    if (!verseRef || !verseText) {
      return res.status(400).json({ error: 'Faltan parámetros del versículo.' });
    }

    if (!process.env.GEMINI_API_KEY) {
      return res.status(503).json({
        error: 'La clave GEMINI_API_KEY no está configurada.',
      });
    }

    const prompt = `Actúa como un teólogo e historiador bíblico respetuoso, riguroso y edificante.
Analiza el siguiente versículo bíblico:
Referencia: ${verseRef}
Traducción: ${versionName || 'Reina Valera 1960'}
Texto del versículo: «${verseText}»

Proporciona un análisis estructurado en español con:
1. Contexto Histórico y Cultural: ¿Quién lo escribió, a quién iba dirigido y en qué circunstancias?
2. Exégesis y Significado Teológico: ¿Qué enseña este pasaje sobre Dios, la fe, la gracia o la vida espiritual?
3. Aplicación Práctica a la Vida Diaria: ¿Cómo puede un creyente hoy vivir y aplicar esta verdad en su día a día?
4. Versículos Relacionados: Cita de 2 a 3 versículos bíblicos de apoyo con una breve mención de por qué se conectan.

Mantén un tono cálido, claro, pastoral y académicamente fidedigno a las Sagradas Escrituras.`;

    const { text, modelUsed } = await generateFreeTierContent({
      contents: prompt,
      systemInstruction:
        'Eres un erudito bíblico pastoral en español. Respondes con calidez, exactitud bíblica y profundidad teológica basada en las Sagradas Escrituras.',
      temperature: 0.7,
    });

    res.json({ analysis: text, model: modelUsed });
  } catch (err: any) {
    console.error('Error in /api/gemini/explain:', err);
    res.status(500).json({
      error: 'El servicio de Gemini está experimentando alta demanda momentánea. Por favor intenta en unos instantes.',
    });
  }
});

// Endpoint: Theological & Biblical Q&A
app.post('/api/gemini/ask', async (req: Request, res: Response) => {
  try {
    const { question, context } = req.body;

    if (!question || typeof question !== 'string') {
      return res.status(400).json({ error: 'Debe ingresar una pregunta bíblica.' });
    }

    if (!process.env.GEMINI_API_KEY) {
      return res.status(503).json({
        error: 'La clave GEMINI_API_KEY no está configurada.',
      });
    }

    const prompt = `Pregunta del lector: «${question}»
${context ? `Contexto o pasaje de referencia: ${context}` : ''}

Responde de manera bíblica, clara y fundamentada en español. 
Incluye:
- Respuesta directa y fundamentada teológicamente.
- Citas bíblicas específicas (Libro capítulo:versículo) que sustentan la respuesta.
- Consejo práctico o pastoral para la vida diaria.`;

    const { text, modelUsed } = await generateFreeTierContent({
      contents: prompt,
      systemInstruction:
        'Eres un asistente teológico bíblico. Respondes preguntas de fe, doctrina y vida cristiana citando las Escrituras con amor, sabiduría y verdad.',
      temperature: 0.6,
    });

    res.json({ answer: text, model: modelUsed });
  } catch (err: any) {
    console.error('Error in /api/gemini/ask:', err);
    res.status(500).json({
      error: 'El asistente bíblico Gemini está procesando muchas solicitudes. Intenta de nuevo en unos segundos.',
    });
  }
});

// Endpoint: Generate Custom Daily Devotional
app.post('/api/gemini/devotional', async (req: Request, res: Response) => {
  try {
    const { topic } = req.body;

    if (!process.env.GEMINI_API_KEY) {
      return res.status(503).json({
        error: 'La clave GEMINI_API_KEY no está configurada.',
      });
    }

    const prompt = `Genera un devocional cristiano inspirador para el día de hoy${topic ? ` sobre el tema: "${topic}"` : ''}.
Devuelve la respuesta en formato JSON con la siguiente estructura exacta:
{
  "title": "Título conmovedor del devocional",
  "keyVerseRef": "Referencia Bíblica (ej: Filipenses 4:6-7)",
  "keyVerseText": "Texto completo del versículo en español (RVR1960)",
  "devotional": "Reflexión devocional profunda de 2 a 3 párrafos para el corazón",
  "prayer": "Oración de fe y agradecimiento para cerrar el devocional"
}`;

    const { text } = await generateFreeTierContent({
      contents: prompt,
      responseMimeType: 'application/json',
      temperature: 0.8,
    });

    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = {
        title: 'Paz en la Presencia de Dios',
        keyVerseRef: 'Filipenses 4:6-7',
        keyVerseText: 'Por nada estéis afanosos, sino sean conocidas vuestras peticiones delante de Dios...',
        devotional: text,
        prayer: 'Señor, guardo mi corazón en tu perfecta paz. Amén.',
      };
    }

    res.json(data);
  } catch (err: any) {
    console.error('Error in /api/gemini/devotional:', err);
    res.status(500).json({
      error: 'No se pudo generar el devocional en este instante. Por favor reintenta.',
    });
  }
});

// Endpoint: Generate Prayer for a Specific Passage
app.post('/api/gemini/prayer', async (req: Request, res: Response) => {
  try {
    const { verseRef, verseText } = req.body;

    if (!process.env.GEMINI_API_KEY) {
      return res.status(503).json({
        error: 'La clave GEMINI_API_KEY no está configurada.',
      });
    }

    const prompt = `Escribe una oración sincera, íntima y ferviente basada en este versículo bíblico:
Referencia: ${verseRef}
Texto: «${verseText}»

La oración debe permitir al creyente orarle a Dios haciendo suya la promesa o enseñanza de este pasaje.`;

    const { text } = await generateFreeTierContent({
      contents: prompt,
      temperature: 0.7,
    });

    res.json({ prayer: text });
  } catch (err: any) {
    console.error('Error in /api/gemini/prayer:', err);
    res.status(500).json({
      error: 'No se pudo generar la oración en este momento.',
    });
  }
});

// Endpoint: Original Language Lexical & Strong's Word Study
app.post('/api/gemini/lexicon', async (req: Request, res: Response) => {
  try {
    const { word, strong, lemma, language, verseRef } = req.body;

    if (!process.env.GEMINI_API_KEY) {
      return res.status(503).json({
        error: 'La clave GEMINI_API_KEY no está configurada.',
      });
    }

    const langName = language === 'hebrew' ? 'Hebreo Bíblico (Texto Masorético)' : 'Griego Koiné (Nuevo Testamento)';

    const prompt = `Actúa como un lexicógrafo y erudito en lenguas bíblicas antiguas (${langName}).
Analiza en profundidad la siguiente palabra original de las Sagradas Escrituras:
- Palabra original: ${word}
- Raíz / Lemma: ${lemma || 'No especificado'}
- Código Strong: ${strong || 'No especificado'}
- Pasaje donde aparece: ${verseRef || 'Pasaje bíblico'}

Proporciona un estudio léxico riguroso y accesible en español con:
1. Etimología y Significado Raíz: ¿De qué raíz proviene y cuál era su sentido concreto en la antigüedad?
2. Usos y Matices Teológicos: ¿Cómo se usa esta palabra en otros libros de la Biblia y qué riquezas de significado revela que a veces se pierden en la traducción al español?
3. Revelación Espiritual: ¿Qué verdad profunda nos enseña sobre Dios, Cristo o el alma humana este término original?`;

    const { text, modelUsed } = await generateFreeTierContent({
      contents: prompt,
      systemInstruction:
        'Eres un profesor experto en hebreo bíblico, arameo y griego koiné. Explicas la riqueza de los manuscritos originales con reverencia bíblica y precisión académica.',
      temperature: 0.6,
    });

    res.json({ analysis: text, model: modelUsed });
  } catch (err: any) {
    console.error('Error in /api/gemini/lexicon:', err);
    res.status(500).json({
      error: 'Error al consultar el estudio léxico del idioma original.',
    });
  }
});

// Setup Vite middleware in Dev, Static serving in Prod
async function startServer() {
  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        host: '0.0.0.0',
        port: PORT,
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Santa Biblia Pro server running on http://0.0.0.0:${PORT} (Gemini API: Free Tier)`);
  });
}

startServer();
