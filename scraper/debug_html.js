const axios = require('axios');
const fs = require('fs');

(async () => {
    try {
        const res = await axios.get('https://recetas.elperiodico.com/recetas-peruanas', {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36'
            }
        });
        fs.writeFileSync('debug.html', res.data);
        console.log('HTML saved to debug.html');
    } catch (e) {
        console.error(e);
    }
})();
