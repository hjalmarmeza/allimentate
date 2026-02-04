const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');
const https = require('https');

// --- CONFIGURACIÓN ---
const BASE_URL = 'https://jameaperu.com/recetas/';
const TOTAL_PAGES = 10;
const OUTPUT_FILE = path.join(__dirname, '../data/db.js');

const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
};

const client = axios.create({
    headers: HEADERS,
    httpsAgent: new https.Agent({ rejectUnauthorized: false }),
    timeout: 15000
});

const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// --- LÓGICA DE EXTRACCIÓN MEJORADA ---
function extractSteps($, html) {
    let pasos = [];

    // 1. Intento Clásico (Clases conocidas de WP Recipe Maker)
    $('.wprm-recipe-instruction-text').each((_, el) => {
        pasos.push($(el).text().trim());
    });

    if (pasos.length > 0) return pasos;

    // 2. Intento Semántico (Buscar H3 "Preparación" y leer hermanos siguientes)
    $('h1, h2, h3, h4, h5').each((_, el) => {
        const title = $(el).text().trim().toLowerCase();
        if (pasos.length === 0 && (title.includes('preparación') || title.includes('instrucciones') || title.includes('cómo preparar'))) {
            // Empezar a leer elementos siguientes
            let next = $(el).next();
            let safetyCounter = 0;

            while (next.length && safetyCounter < 20) {
                // Si encontramos otro título fuerte, paramos
                if (next.is('h1, h2, h3') && next.text().trim().length > 0) break;

                // Si es lista, sacar sus items
                if (next.is('ol') || next.is('ul')) {
                    next.find('li').each((i, li) => {
                        pasos.push($(li).text().trim());
                    });
                }
                // Si es párrafo con texto sustancial
                else if (next.is('p')) {
                    const txt = next.text().trim();
                    if (txt.length > 15) pasos.push(txt);
                }
                // Si es div, a veces envuelven cosas
                else if (next.is('div')) {
                    // Caso especial: Divs contenedores de pasos
                    next.find('p, li').each((i, sub) => {
                        const t = $(sub).text().trim();
                        if (t.length > 15) pasos.push(t);
                    });
                }

                next = next.next();
                safetyCounter++;
            }
        }
    });

    return pasos;
}

(async () => {
    console.log(`🍳 INICIANDO ALLI-ROBOT 3.0 (MODO LECTURA PROFUNDA)...`);

    let allRecipesLinks = [];

    // --- FASE 1: RECOLECTAR LINKS ---
    console.log(`\n📋 FASE 1: Escaneando ${TOTAL_PAGES} páginas...`);

    for (let i = 1; i <= TOTAL_PAGES; i++) {
        const url = i === 1 ? BASE_URL : `${BASE_URL}page/${i}/`;
        process.stdout.write(`   [Pág ${i}] `);

        try {
            const resp = await client.get(url);
            const $ = cheerio.load(resp.data);

            $('a').each((_, el) => {
                const href = $(el).attr('href');
                if (href && href.includes('/recetas/') && !href.includes('/page/') && !href.includes('/category/')) {
                    if (href.split('/').length > 4) allRecipesLinks.push(href);
                }
            });
        } catch (e) { }
        await wait(100);
    }

    allRecipesLinks = [...new Set(allRecipesLinks)];
    console.log(`\n\n🔍 Total Enlaces Únicos: ${allRecipesLinks.length}`);

    // --- FASE 2: DETALLES ---
    console.log(`\n🕵️‍♂️ FASE 2: Extrayendo Recetas Completas...`);

    let db = [];

    for (const link of allRecipesLinks) {
        try {
            const resp = await client.get(link);
            const $ = cheerio.load(resp.data);

            const titulo = $('h1').first().text().trim();
            if (!titulo) continue;

            const shortName = titulo.substring(0, 30);

            // CATEGORÍA (Heurística)
            let categoria = 'Varios';
            const breadcrumb = $('.breadcrumb, .yoast-breadcrumbs').text().toLowerCase();
            const urlLower = link.toLowerCase();

            if (urlLower.includes('postre') || breadcrumb.includes('postre') || breadcrumb.includes('dulce') || breadcrumb.includes('torta') || breadcrumb.includes('mazamorra')) categoria = 'Postres';
            else if (urlLower.includes('sopa') || breadcrumb.includes('sopa') || breadcrumb.includes('chupe') || breadcrumb.includes('caldo')) categoria = 'Sopas';
            else if (urlLower.includes('entrada') || breadcrumb.includes('entrada') || breadcrumb.includes('tequeño') || breadcrumb.includes('ensalada')) categoria = 'Entradas';
            else if (urlLower.includes('bebida') || breadcrumb.includes('bebida') || breadcrumb.includes('coctel') || breadcrumb.includes('jugo')) categoria = 'Bebidas';
            else if (urlLower.includes('pollo') || urlLower.includes('lomo') || urlLower.includes('pescado') || urlLower.includes('arroz')) categoria = 'Platos de Fondo';

            // TIEMPO & IMAGEN
            const tiempo = $('.wprm-recipe-total-time-container').text().trim() || '45 min';
            let img = $('meta[property="og:image"]').attr('content');

            // INGREDIENTES
            let ingredientes = [];
            $('.wprm-recipe-ingredient-name').each((_, el) => ingredientes.push($(el).text().trim()));
            if (ingredientes.length === 0) {
                // Fallback ingredientes
                $('h3:contains("Ingredientes")').next().find('li').each((_, el) => ingredientes.push($(el).text().trim()));
            }

            // PASOS MEJORADOS
            let pasos = extractSteps($, resp.data);

            // GUARDADO: Ahora SÍ exigimos pasos, o al menos intentamos muy fuerte.
            // Si la extracción falló totalmente, ponemos un mensaje de depuración para saber qué pasó (o lo dejamos pasar para no perder la receta, pero marcándola).

            process.stdout.write(`   ✅ ${shortName} (${pasos.length} pasos)\n`);

            db.push({
                id: 'rec-' + Math.random().toString(36).substr(2, 9),
                titulo,
                categoria,
                tiempo,
                imagen: img || 'assets/logo.jpg',
                ingredientes: [...new Set(ingredientes)],
                pasos: pasos.length > 0 ? pasos : ["Esta receta es tan secreta que los pasos no se pudieron descargar automáticamente. ¡Improvisa con los ingredientes!"]
            });

        } catch (e) {
            process.stdout.write(`   ❌ Error en ${link}\n`);
        }
        await wait(20);
    }

    // --- GUARDAR ---
    if (db.length > 0) {
        console.log(`\n💾 GUARDANDO ${db.length} RECETAS...`);
        const fileContent = `window.ChefAlliDB = ${JSON.stringify(db, null, 4)};`;
        fs.writeFileSync(OUTPUT_FILE, fileContent);
        console.log(`🎉 ¡Misión Cumplida!`);
    }

})();
