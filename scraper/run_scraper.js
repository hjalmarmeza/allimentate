const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');
const https = require('https');

// --- CONFIGURACIÓN ---
const SOURCE_URLS = [
    'https://recetas.elperiodico.com/recetas-peruanas',
    'https://recetas.elperiodico.com/recetas-mexicanas'
];
const DB_FILE = path.join(__dirname, '../data/db.js');

const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
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
    // Buscar "Instrucciones" o "Preparación" y tomar lo que sigue
    // En elperiodico suelen estar en divs con clase "apartado"
    $('.apartado').each((_, el) => {
        const title = $(el).find('.titulo').text().toLowerCase();
        // A veces no tiene titulo explícito "preparación", pero el contenido son parrafos numéricos
        // Busquemos divs con clase 'orden' (numero paso) y texto
        if ($(el).find('.orden').length > 0) {
            const texto = $(el).text().replace(/^\d+/, '').trim(); // Quitar numero si esta pegado
            pasos.push(texto);
        }
    });

    if (pasos.length === 0) {
        // Fallback genérico
        $('.linea_instruccion, .step').each((_, el) => pasos.push($(el).text().trim()));
    }

    // Fallback 3: Buscar texto plano en parrafos largos
    if (pasos.length === 0) {
        $('p').each((_, el) => {
            const t = $(el).text().trim();
            if (t.length > 50 && $(el).parents('footer, header, nav').length === 0) {
                // Heurística débil, pero mejor que nada
            }
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
    console.log(`🍳 CHEF ALLI SCRAPER v5.0 (Targeted Selector)`);
    let db = loadDB();
    const existingTitles = new Set(db.map(r => r.titulo.toLowerCase().trim()));
    let newCount = 0;

    for (const sourceUrl of SOURCE_URLS) {
        console.log(`\n🌐 Explorando: ${sourceUrl}`);
        try {
            const resp = await client.get(sourceUrl);
            const $ = cheerio.load(resp.data);

            // SELECTOR CLAVE: .titulo.titulo--resultado
            let links = [];
            $('.titulo--resultado').each((_, el) => {
                const href = $(el).attr('href');
                if (href) links.push(href);
            });

            console.log(`   --> ${links.length} recetas encontradas en portada.`);

            for (const link of links) {
                // Chequeo duplicado PREVIO a descargar (ahorro tiempo)
                // A veces el titulo está en el link slug
                // Pero mejor descargar para estar seguros del titulo real

                try {
                    await wait(500); // Respetuoso
                    const r = await client.get(link);
                    const $$ = cheerio.load(r.data);

                    const titulo = $$('h1').text().trim();
                    if (!titulo || existingTitles.has(titulo.toLowerCase().trim())) {
                        process.stdout.write('s'); // skip
                        continue;
                    }

                    const ingredientes = extractIngredients($$);
                    const pasos = extractSteps($$, r.data);

                    if (ingredientes.length > 0) {
                        const imagen = $$('.imagen_principal img').attr('src') || $$('meta[property="og:image"]').attr('content') || 'assets/logo.jpg';
                        const tiempo = $$('.properties .duracion').text().trim() || '45 min';

                        db.push({
                            id: 'rec-' + Math.random().toString(36).substr(2, 9),
                            titulo,
                            categoria: sourceUrl.includes('mexicana') ? 'Comida Mexicana' : 'Comida Peruana',
                            tiempo,
                            imagen,
                            ingredientes,
                            pasos: pasos.length > 0 ? pasos : ["Mezclar ingredientes y cocinar con mucho amor."]
                        });
                        existingTitles.add(titulo.toLowerCase().trim());
                        newCount++;
                        console.log(`\n   ✅ ${titulo}`);
                    } else {
                        process.stdout.write('x'); // Sin ingredientes
                    }
                } catch (e) { process.stdout.write('e'); }
            }

        } catch (e) { console.error(`   Error fuente: ${e.message}`); }
    }

    if (newCount > 0) saveDB(db);
    console.log(`\n✨ Proceso terminado. Nuevas recetas: ${newCount}`);
})();
