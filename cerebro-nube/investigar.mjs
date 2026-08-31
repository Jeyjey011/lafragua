// EL CEREBRO NOCTURNO DE LA FRAGUA
// Corre solo, cada noche, en GitHub Actions. Investiga en internet un tema en
// rotación, destila reglas nuevas y las escribe en el cerebro compartido (el
// gist). Cada app, al abrir, ve la fecha nueva y AVISA al usuario sola.
// Las llaves llegan por secretos cifrados del repositorio — nunca están aquí.

const limpiar = v => String(v || '').replace(/﻿/g, '').trim();
const ANTHROPIC = limpiar(process.env.ANTHROPIC_API_KEY);
const TOKEN = limpiar(process.env.CEREBRO_TOKEN);
const GIST = limpiar(process.env.CEREBRO_GIST);
if (!ANTHROPIC || !TOKEN || !GIST) { console.error('Faltan secretos.'); process.exit(1); }

// GitHub exige User-Agent: sin esto responde 403 (aprendido a las malas en la 1.29.0).
const cabGit = {
  'Authorization': 'Bearer ' + TOKEN,
  'Accept': 'application/vnd.github+json',
  'User-Agent': 'LaFragua-CerebroNocturno/1.0'
};

const TEMAS = [
  'hooks y guiones de anuncios animados que están funcionando en TikTok e Instagram ahora mismo para suplementos y productos de transformación física',
  'técnicas actuales de prompts para video de animación con IA (Seedance, Kling, Veo): qué estructura de prompt da personajes consistentes y movimiento limpio',
  'cuándo funciona mejor un personaje hablando a cámara y cuándo voz en off en anuncios cortos de TikTok, y qué dice la data reciente',
  'duración óptima y ritmo de escenas en anuncios de video para conversión: cuántas escenas, de cuántos segundos, dónde recortar',
  'cómo construir conexión emocional en anuncios animados de historias (humillación, antagonista, vuelco) sin que la plataforma los rechace',
  'errores comunes que hacen que Meta o TikTok rechacen anuncios de suplementos y cómo evitarlos'
];

const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();

function parseLoose(texto) {
  let t = String(texto || '').replace(/```json/gi, '```').replace(/```/g, '').trim();
  const a = t.indexOf('{'), b = t.lastIndexOf('}');
  if (a < 0 || b <= a) throw new Error('la respuesta no trae JSON');
  return JSON.parse(t.slice(a, b + 1));
}

// 1. Leer el cerebro tal como está.
const g = await (await fetch('https://api.github.com/gists/' + GIST, { headers: cabGit })).json();
if (!g.files || !g.files['cerebro.json']) { console.error('No se pudo leer el gist: ' + (g.message || '?')); process.exit(1); }
let cerebro = {};
try { cerebro = JSON.parse(g.files['cerebro.json'].content) || {}; } catch (e) { cerebro = {}; }
cerebro.reglas = cerebro.reglas || [];
cerebro.historial = cerebro.historial || [];
let jarvis = {};
try { jarvis = g.files['jarvis.json'] ? JSON.parse(g.files['jarvis.json'].content) : {}; } catch (e) { jarvis = {}; }

const idx = (parseInt(jarvis.tema_idx || 0, 10)) % TEMAS.length;
const tema = TEMAS[idx];
console.log('Tema de esta noche: ' + tema);

// 2. Investigar con búsqueda web real.
const sistema = 'Eres el cerebro de un estudio de anuncios animados con IA (historias con antagonista y vuelco, estilo Pixar/Simpson/anime, productos de transformación física, mercado Colombia). ' +
  'Investiga en la web el tema que se te da y devuelve SOLO un JSON: ' +
  '{"hallazgos":["máx 4 datos concretos y accionables, en español, 1 línea cada uno"],' +
  '"reglas_nuevas":["máx 3 reglas cortas empezando por un verbo, que una IA pueda seguir al escribir guiones o prompts — solo si el hallazgo lo amerita"],' +
  '"no_hagas":["máx 3 errores concretos que hay que evitar, formulados como NO hagas X porque Y"]} ' +
  'Nada de generalidades: si no encuentras algo específico y actual, devuelve menos elementos.';

const resp = await fetch('https://api.anthropic.com/v1/messages', {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'x-api-key': ANTHROPIC, 'anthropic-version': '2023-06-01' },
  body: JSON.stringify({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 2500,
    system: sistema,
    tools: [{ type: 'web_search_20250305', name: 'web_search' }],
    messages: [{ role: 'user', content: 'Tema a investigar esta noche: ' + tema }]
  })
});
const data = await resp.json();
if (data.error) { console.error('Anthropic: ' + data.error.message); process.exit(1); }
const bloques = (data.content || []).filter(c => c.type === 'text');
const h = parseLoose(bloques.length ? bloques[bloques.length - 1].text : '');
h.hallazgos = h.hallazgos || []; h.reglas_nuevas = h.reglas_nuevas || []; h.no_hagas = h.no_hagas || [];
console.log('Hallazgos: ' + h.hallazgos.length + ' · reglas nuevas: ' + h.reglas_nuevas.length + ' · no hagas: ' + h.no_hagas.length);

// 3. Fundir las reglas nuevas sin repetir, quedando lo más nuevo (tope 40, como la app).
const ahora = new Date().toISOString();
const yaHay = new Set(cerebro.reglas.map(r => norm(r.t)));
let nuevas = 0;
for (const t of h.reglas_nuevas) {
  const limpio = String(t).trim();
  if (!limpio || yaHay.has(norm(limpio))) continue;
  cerebro.reglas.unshift({ t: limpio, f: ahora, de: 'jarvis-nube' });
  yaHay.add(norm(limpio)); nuevas++;
}
cerebro.reglas = cerebro.reglas.slice(0, 40);
cerebro.actualizado = ahora;

// 4. Guardar: el cerebro con las reglas, y jarvis.json con el parte de la noche
//    (la app lo lee al abrir y le AVISA al usuario que hay algo nuevo).
const parte = {
  fecha: ahora, tema: tema, tema_idx: idx + 1,
  hallazgos: h.hallazgos, no_hagas: h.no_hagas, reglas_nuevas: h.reglas_nuevas,
  reglas_que_entraron: nuevas
};
const w = await fetch('https://api.github.com/gists/' + GIST, {
  method: 'PATCH',
  headers: { ...cabGit, 'Content-Type': 'application/json' },
  body: JSON.stringify({ files: {
    'cerebro.json': { content: JSON.stringify(cerebro, null, 1) },
    'jarvis.json': { content: JSON.stringify(parte, null, 1) }
  }})
});
if (!w.ok) { console.error('No se pudo escribir el gist: HTTP ' + w.status); process.exit(1); }
console.log('Cerebro actualizado: ' + nuevas + ' reglas nuevas entraron. Total: ' + cerebro.reglas.length + '.');
