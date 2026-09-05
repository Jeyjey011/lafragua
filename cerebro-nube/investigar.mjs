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

// Temas por orden del dueño: SOLO lo creativo — estilos, prompts, modelos.
// Nada de políticas de plataformas: eso no le sirve.
const TEMAS = [
  'estilos de animación que están explotando en TikTok ahora mismo (frutinovelas 3D, Pixar hiperreal, y los que vengan): cómo se ven exactamente, qué los distingue visualmente y qué prompts los producen',
  'técnicas actuales de prompts para video con IA (Seedance, Kling, Veo, Sora): la estructura exacta de prompt que da personajes consistentes entre tomas, movimiento limpio y cámara con intención',
  'técnicas de prompts para imagen con IA (nano-banana, Seedream, gpt-image): cómo describir personajes, envases de producto y escenas para que salgan idénticos entre imágenes',
  'modelos nuevos o mejorados de video e imagen con IA este mes: qué hacen mejor que los anteriores, cuánto cuestan y para qué tipo de creatividad conviene cada uno',
  'cómo construyen su storyboard las mejores creatividades animadas: cuántas escenas, ritmo, transiciones entre tomas y cómo montan el momento icónico',
  'emoción y actuación en personajes animados con IA: cómo pedir en el prompt expresiones faciales, lágrimas, gestos y drama de telenovela que se sientan reales'
];

const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();

// UNA REGLA ES UNA LINEA, NO UN PARRAFO CON XML DENTRO. Investigar con busqueda
// web deja el marcado de las citas dentro del texto: han llegado a guardarse
// reglas con «(cite index="14-12">…</cite>» pegado en medio. Y esas reglas se
// inyectan luego en CADA prompt que escribe la app, asi que se le estaba mandando
// media etiqueta XML al modelo de imagen en todas las generaciones.
const LARGO_MAX_REGLA = 240;
function limpiarRegla(t) {
  let s = String(t == null ? '' : t);
  // La apertura llega de las dos formas: «<cite index="…">» y, tal cual se ha
  // visto en el gist, «(cite index="…">» — con parentesis y sin cerrarlo nunca.
  s = s.replace(/[<(]\s*cite\b[^>]{0,300}>/gi, '');
  s = s.replace(/<\s*\/\s*cite\s*>/gi, '').replace(/\)?\s*<\/cite>/gi, '');
  s = s.replace(/<[^<>]{0,120}>/g, '');
  s = s.replace(/\bindex\s*=\s*"[^"]*"/gi, '');
  s = s.replace(/\s*\(\s*\)/g, '').replace(/\s+([,.;:])/g, '$1');
  s = s.replace(/\s+/g, ' ').trim();
  if (s.length > LARGO_MAX_REGLA) {
    const corte = s.lastIndexOf(' ', LARGO_MAX_REGLA - 1);
    s = s.slice(0, corte > 80 ? corte : (LARGO_MAX_REGLA - 1)).replace(/[\s,;:.]+$/, '') + '.';
  }
  return s;
}

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
const sistema = 'Eres el cerebro CREATIVO de un estudio de anuncios animados con IA (historias con antagonista y vuelco, estilos Pixar/Simpson/anime/frutinovela, productos de transformación física, mercado Colombia). ' +
  'LA FÓRMULA DE LA CASA, INNEGOCIABLE: antes/después corporales agresivos y extremos, lenguaje directo sin censura y neuromarketing — eso ES lo que vende aquí. NUNCA propongas restringirlo, sustituirlo ni suavizarlo. ' +
  'TU TERRENO ES LO CREATIVO: estilos de animación y cómo se ven, técnicas de prompt, modelos de IA y sus trucos, storyboard, escenas, cámara, emoción. Tu trabajo es ayudar a crear MÁS y MEJOR contenido con la misma fórmula. ' +
  'PROHIBIDO traer análisis de políticas de Meta/TikTok, moderación o compliance: al dueño no le sirve y no lo quiere. ' +
  'Investiga en la web el tema que se te da y devuelve SOLO un JSON: ' +
  '{"hallazgos":["máx 4 datos concretos y accionables sobre lo creativo, en español, 1 línea cada uno — si es un truco de prompt, escribe el truco literal"],' +
  '"reglas_nuevas":["máx 3 reglas creativas, cortas, empezando por un verbo, que AYUDEN a producir más y mejor (prompts, escenas, estilos) — jamás restricciones a la fórmula de la casa"],' +
  '"no_hagas":["máx 3 errores CREATIVOS que arruinan una animación o un prompt, formulados como NO hagas X porque Y"]} ' +
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

// 3. EL FILTRO DE LA CASA (orden del dueño): las reglas entran SOLAS, pero
//    jamás una que restrinja los antes/después, el lenguaje, lo sin censura o
//    el neuromarketing. Eso se corta en código, no de palabra. Las vetadas por
//    el dueño tampoco vuelven a entrar.
function reglaRestrictiva(t) {
  const s = ' ' + norm(t) + ' ';
  // MISMO FILTRO QUE LA APP, LETRA POR LETRA. Y con el mismo arreglo: «meta» iba
  // suelto y casaba DENTRO de «metafora», así que este cerebro —que es el
  // CREATIVO— tiraba a la basura, en silencio y cada noche, justo las reglas
  // sobre metáforas visuales, que son de lo mejor que puede traer. Los que pueden
  // esconderse dentro de otra palabra van con límite de palabra; los largos no.
  if (/\b(meta|ftc|claim|claims)\b/.test(s)) return true;
  if (/(tiktok|facebook|instagram|politic|complian|moderacion|censur|prohibid|restricc|rechaz)/.test(s)) return true;
  // un verbo de recorte apuntando a la fórmula de la casa: fuera
  // «generaliza» y «diluye» recortan igual que «suaviza». Se colaron dos reglas
  // reales —«sustituye descripciones FISICAS especificas por terminos generales
  // abstractos» y «generaliza terminos especificos de caracteristicas fisicas»—
  // que son lo contrario de la formula de la casa y que llevaban metidas en TODOS
  // los prompts: «fisic» y «especific» no estaban en la lista de lo protegido.
  const recorta = /(sustituye|sustituir|reemplaza|suaviza|evita|elimina|quita|reduce|modera|generaliza|generalizar|diluye|dilu[yi]|abstrae|no uses|no muestres|no hagas|en lugar de|en vez de)/.test(s);
  const laFormula = /(antes|despues|transformacion|corporal|cuerpo|agresiv|lenguaje|tono|sin censura|neuromarketing|gluteo|busto|cintura|peso|extrem|fisic|especific|explicit|descripcion)/.test(s);
  return recorta && laFormula;
}

// UNA REGLA TIENE QUE SER UNA REGLA. Cuando no hay patron, el modelo contesta con
// una frase —«No hay patron accionable. Los ejemplos muestran…»— y esa frase se
// guardaba TAL CUAL como regla, se subia aqui y desde aqui se le pegaba a cada
// prompt. En el cerebro real habia DIECIOCHO de estas, mas trozos sueltos de una
// lista. Cientos de caracteres de ruido dentro de cada generacion.
const NO_ES_REGLA = [
  /^no hay\b/i, /^no se puede\b/i, /^no se detect/i, /^no encuentro\b/i, /^no existe\b/i,
  /^no puedo\b/i, /^no es posible\b/i, /^sin patr[oó]n/i, /^dada la falta\b/i,
  /^los ejemplos\b/i, /^estos ejemplos\b/i, /^el [uú]nico cambio\b/i, /^el redactor\b/i,
  /^ninguna regla\b/i, /^[-•*]\s/, /:\s*$/
];
function esReglaDeVerdad(t) {
  const s = limpiarRegla(t);
  if (s.length < 15) return false;
  if (NO_ES_REGLA.some(re => re.test(s))) return false;
  if (/\b(los ejemplos|estos ejemplos|los ["«]?cambios["»]?\s+son|no representan|no reflejan)\b/i.test(s)) return false;
  if (/\bpatr[oó]n(es)?\b/i.test(s) && /\bno\b/i.test(s.slice(0, 40))) return false;
  // Ninguna regla buena pide dejar el texto a medias: eso sale de leer las
  // pulsaciones del usuario mientras escribe, no de una correccion de verdad.
  if (/\b(ilegible|inconclusa|inconclusas|incompleta|incompletas|truncad|a medias|sin terminar)\b/i.test(s)) return false;
  return true;
}
const ahora = new Date().toISOString();
const vetadas = new Set((cerebro.vetadas || []).map(norm));
const yaHay = new Set(cerebro.reglas.map(r => norm(r.t)));
let entraron = 0, descartadas = 0;
const limpias = [];
for (const bruta of h.reglas_nuevas) {
  const t = limpiarRegla(bruta);
  if (!t || yaHay.has(norm(t)) || vetadas.has(norm(t))) continue;
  if (!esReglaDeVerdad(t)) { descartadas++; continue; }
  if (reglaRestrictiva(t)) { descartadas++; continue; }
  cerebro.reglas.unshift({ t: t, f: ahora, de: 'jarvis-nube' });
  yaHay.add(norm(t)); limpias.push(t); entraron++;
}
// Y se pasa la limpieza por las que YA estaban guardadas: las que entraron antes
// de este arreglo llevan el marcado de las citas dentro y se estan colando en los
// prompts cada vez que se genera algo.
let arregladas = 0;
cerebro.reglas = cerebro.reglas.map(r => {
  const limpio = limpiarRegla(r && r.t);
  if (r && limpio && limpio !== r.t) { arregladas++; return { ...r, t: limpio }; }
  return r;
}).filter(r => r && r.t);
if (arregladas) console.log('Reglas viejas limpiadas de marcado: ' + arregladas);
// Y fuera las que nunca fueron reglas. Las de PRODUCTO: van aparte y no se tocan.
const antesDeCribar = cerebro.reglas.length;
cerebro.reglas = cerebro.reglas.filter(r => /^PRODUCTO:/i.test(r.t) || (esReglaDeVerdad(r.t) && !reglaRestrictiva(r.t)));
if (cerebro.reglas.length !== antesDeCribar)
  console.log('Fuera ' + (antesDeCribar - cerebro.reglas.length) + ' que no eran reglas.');
cerebro.reglas = cerebro.reglas.slice(0, 40);
cerebro.actualizado = ahora;

// 4. Guardar el cerebro (con las vetadas intactas) y el parte de la noche.
const parte = {
  fecha: ahora, tema: tema, tema_idx: idx + 1,
  hallazgos: h.hallazgos, no_hagas: h.no_hagas, reglas_nuevas: limpias,
  reglas_que_entraron: entraron, descartadas_por_el_filtro: descartadas
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
console.log('Cerebro: ' + entraron + ' reglas entraron, ' + descartadas + ' descartadas por el filtro de la casa. Total: ' + cerebro.reglas.length + '.');
