const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');
const https = require('https');

// --- CONFIGURACIÓN ---
const CATEGORIES = [
    // Ya descargadas:
    // { name: 'Comida Peruana', url: 'https://recetas.elperiodico.com/recetas-peruanas', maxPages: 20 },
    // { name: 'Comida Mexicana', url: 'https://recetas.elperiodico.com/recetas-mexicanas', maxPages: 50 },

    // Nuevas Solicitudes:
    { name: 'Comida Italiana', url: 'https://recetas.elperiodico.com/recetas-italianas', maxPages: 30 },
    { name: 'Comida Americana', url: 'https://recetas.elperiodico.com/busqueda/country_id/53', maxPages: 10 }
];

const DB_FILE = path.join(__dirname, '../data/db.js');

const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
};

const client = axios.create({
    headers: HEADERS,
    httpsAgent: new https.Agent({ rejectUnauthorized: false }),
    timeout: 30000
});

const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

function loadDB() {
    try {
        if (!fs.existsSync(DB_FILE)) return [];
        let content = fs.readFileSync(DB_FILE, 'utf-8');
        content = content.replace('window.ChefAlliDB = ', '').replace(/;\s*$/, '');
        return JSON.parse(content);
    } catch (e) { return []; }
}

function saveDB(data) {
    const content = `window.ChefAlliDB = ${JSON.stringify(data, null, 4)};`;
    fs.writeFileSync(DB_FILE, content);
}

// Extractor Genérico
function extractSteps($, html) {
    let pasos = [];
    $('.apartado').each((_, el) => {
        if ($(el).find('.orden').length > 0) {
            const texto = $(el).text().replace(/^\d+/, '').trim();
            pasos.push(texto);
        }
    });
    if (pasos.length === 0) {
        $('.linea_instruccion, .step').each((_, el) => pasos.push($(el).text().trim()));
    }
    // Fallback: párrafos largos en zona de contenido
    if (pasos.length === 0) {
        $('.instrucciones p, .elaboracion p, .receta-pasos p').each((_, el) => {
            const t = $(el).text().trim();
            if (t.length > 20 && !t.includes('Compartir')) pasos.push(t);
        });
    }
    return pasos;
}

function extractIngredients($) {
    let ing = [];
    $('.ingrediente').each((_, el) => {
        const t = $(el).find('label').text().trim() || $(el).text().trim();
        if (t && !t.includes('Ingredientes')) ing.push(t);
    });
    if (ing.length === 0) {
        $('.ingredients li').each((_, el) => ing.push($(el).text().trim()));
    }
    return ing;
}

(async () => {
    console.log(`🍳 CHEF ALLI SCRAPER v6.1 (Deep Harvest)`);
    console.log(`=======================================`);

    let db = loadDB();
    const existingTitles = new Set(db.map(r => r.titulo.toLowerCase().trim()));
    let totalNew = 0;

    for (const cat of CATEGORIES) {
        console.log(`\n📂 PROCESANDO: ${cat.name}`);

        for (let page = 1; page <= cat.maxPages; page++) {
            const url = page === 1 ? cat.url : `${cat.url}/${page}`;
            process.stdout.write(`   📖 Pág ${page} `);

            try {
                const resp = await client.get(url);
                const $ = cheerio.load(resp.data);

                // SELECTOR MAESTRO
                let links = [];
                $('.titulo--resultado').each((_, el) => {
                    const href = $(el).attr('href');
                    if (href) links.push(href);
                });

                if (links.length === 0) {
                    // Intento secundario por si cambia el diseño en paginas profundas
                    $('a.titulo').each((_, el) => {
                        const href = $(el).attr('href');
                        if (href) links.push(href);
                    });
                }

                if (links.length === 0) {
                    console.log("-> Sin resultados. Fin de categoría.");
                    break;
                }

                process.stdout.write(`(${links.length}) -> `);

                let pageNewCount = 0;
                for (const link of links) {
                    try {
                        const r = await client.get(link);
                        const $$ = cheerio.load(r.data);

                        const titulo = $$('h1').text().trim();

                        // Validar Título y Duplicados
                        if (!titulo || existingTitles.has(titulo.toLowerCase().trim())) {
                            continue;
                        }

                        const ingredientes = extractIngredients($$);
                        const pasos = extractSteps($$, r.data);

                        // Validar Calidad (Ingredientes mínimos)
                        if (ingredientes.length > 1) {
                            const imagen = $$('.imagen_principal img').attr('src') || $$('meta[property="og:image"]').attr('content') || 'assets/logo.jpg';
                            const tiempo = $$('.properties .duracion').text().trim() || '45 min';

                            db.push({
                                id: 'rec-' + Math.random().toString(36).substr(2, 9),
                                titulo,
                                categoria: cat.name,
                                tiempo,
                                imagen,
                                ingredientes,
                                pasos: pasos.length > 0 ? pasos : ["Ver detalles en la web original."]
                            });
                            existingTitles.add(titulo.toLowerCase().trim());
                            pageNewCount++;
                            totalNew++;
                            process.stdout.write('+');
                        }
                    } catch (e) { process.stdout.write('x'); }
                }
                console.log(` [${pageNewCount} nuevas]`);

                // Guardar cada 2 páginas para no perder nada si se corta
                if (page % 2 === 0) saveDB(db);

            } catch (e) {
                if (e.response && e.response.status === 404) {
                    console.log("-> Fin (404).");
                    break;
                }
                console.log(`-> Error: ${e.message}`);
                // Si falla una página, intentamos la siguiente (tolerancia a fallos)
                continue;
            }
        }
    }

    if (totalNew > 0) {
        saveDB(db);
        console.log(`\n🎉 PROCESO TERMINADO. Nuevas Recetas: ${totalNew}`);
        console.log(`📚 Total Base de Datos: ${db.length}`);
    } else {
        console.log(`\n😴 No se encontraron recetas nuevas.`);
    }

})();
