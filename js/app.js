// --- CONFIGURACIÓN Y ESTADO ---
const App = {
    data: [],       // Todas las recetas
    favorites: [],  // IDs de favoritos
    currentCategory: 'Todo',

    // --- INICIALIZACIÓN ---
    init: () => {
        console.log("Chef Alli iniciando 3.0...");

        // 1. Cargar Datos Globales
        if (window.ChefAlliDB && Array.isArray(window.ChefAlliDB)) {
            App.data = window.ChefAlliDB;
        } else {
            console.error("No se encontró window.ChefAlliDB");
            document.getElementById('recipe-list').innerHTML = '<p class="error-msg">Error cargando base de datos.</p>';
            return;
        }

        // 2. Cargar Favoritos del LocalStorage
        try {
            const savedFavs = localStorage.getItem('alli_favorites');
            if (savedFavs) {
                App.favorites = JSON.parse(savedFavs);
            }
        } catch (e) {
            console.warn("No se pudo acceder a localStorage");
        }

        // 3. Renderizar Inicial
        App.renderCategories();
        App.updateCount(App.data.length);
        App.render(App.data);

        // 4. Configurar Eventos
        App.setupEvents();
    },

    // --- RENDERIZADO DE CATEGORÍAS ---
    renderCategories: () => {
        // Obtener categorías únicas y limpias, ordenadas alfabéticamente
        const uniqueCats = [...new Set(App.data.map(r => r.categoria ? r.categoria.trim() : 'Varios'))].sort();
        const categories = ['Todo', ...uniqueCats];

        const container = document.getElementById('category-filters');
        if (!container) return; // Si no existe el contenedor en HTML aún

        container.innerHTML = categories.map(cat => `
            <button class="category-chip ${cat === App.currentCategory ? 'active' : ''}" 
                    onclick="App.filterByCategory('${cat}')">
                ${cat}
            </button>
        `).join('');
    },

    // --- RENDERIZADO DE RECETAS ---
    // --- RENDERIZADO OPTIMIZADO (PAGINACIÓN) ---
    render: (recipes) => {
        const container = document.getElementById('recipe-list');
        container.innerHTML = '';
        container.scrollTop = 0;

        if (!recipes || recipes.length === 0) {
            container.innerHTML = `
                <div class="empty-state" style="text-align: center; padding: 40px; opacity: 0.7;">
                    <p style="font-size: 1.2rem; margin-bottom: 10px;">No encontramos recetas aquí 🍳</p>
                    <small>Prueba buscando otra cosa o cambia de categoría.</small>
                </div>`;
            return;
        }

        // Configuración de Paginación
        App.currentList = recipes;
        App.renderedCount = 0;
        App.batchSize = 20; // 20 recetas por carga para fluidez total

        App.loadMore();
    },

    loadMore: () => {
        const container = document.getElementById('recipe-list');
        const btn = document.getElementById('load-more-btn');
        if (btn) btn.remove();

        const toAdd = App.currentList.slice(App.renderedCount, App.renderedCount + App.batchSize);
        const fragment = document.createDocumentFragment();

        toAdd.forEach(recipe => {
            const isFav = App.favorites.includes(recipe.id);
            const card = document.createElement('article');
            card.className = 'recipe-card';
            card.onclick = (e) => {
                if (e.target.closest('.fav-btn')) return;
                App.showDetail(recipe);
            };

            card.innerHTML = `
                <div class="card-image">
                    <img src="${recipe.imagen}" alt="${recipe.titulo}" loading="lazy" onerror="this.src='assets/logo.jpg'">
                    <span class="card-category">${recipe.categoria || 'Varios'}</span>
                    <button class="fav-btn ${isFav ? 'active' : ''}" onclick="App.toggleFavorite('${recipe.id}', this)" aria-label="Favorito">
                        ${isFav ? '❤️' : '🤍'}
                    </button>
                </div>
                <div class="card-content" style="padding: 12px;">
                    <h3 style="font-size: 1rem; margin-bottom: 5px; line-height: 1.3;">${recipe.titulo}</h3>
                    <div class="card-meta" style="font-size: 0.85rem; color: #a16207;">
                        <span>⏱️ ${recipe.tiempo}</span>
                        <span style="margin-left:8px;">🥗 ${recipe.ingredientes ? recipe.ingredientes.length : 0} ingr.</span>
                    </div>
                </div>
            `;
            fragment.appendChild(card);
        });

        container.appendChild(fragment);
        App.renderedCount += toAdd.length;

        // Botón "Ver Más" si quedan elementos
        if (App.renderedCount < App.currentList.length) {
            const moreBtn = document.createElement('button');
            moreBtn.id = 'load-more-btn';
            moreBtn.innerHTML = `Ver más recetas... <small style="display:block; font-weight:normal; opacity:0.8">(${App.renderedCount} de ${App.currentList.length})</small>`;
            moreBtn.style.cssText = `
                display: block; width: 100%; padding: 15px; margin-top: 20px;
                background: white; border: 2px dashed rgba(146, 64, 14, 0.2);
                color: var(--primary); font-weight: bold; cursor: pointer;
                border-radius: 15px; font-size: 1rem;
            `;
            moreBtn.onclick = () => App.loadMore();
            container.appendChild(moreBtn);
        }
    },

    // --- ACCIONES DE NAVEGACIÓN Y FILTRO ---

    // Filtro por Chips de Categoría
    filterByCategory: (category) => {
        App.currentCategory = category;
        App.renderCategories(); // Actualizar chips visualmente

        // Restaurar estado visual de la barra inferior a "Todo" si no es favoritos
        App.updateNavState('all');

        if (category === 'Todo') {
            App.render(App.data);
            App.updateCount(App.data.length);
        } else {
            const filtered = App.data.filter(r => (r.categoria || 'Varios').trim() === category);
            App.render(filtered);
            App.updateCount(filtered.length, category);
        }
    },

    // Filtro General (Bottom Nav)
    filter: (mode) => {
        if (mode === 'all') {
            App.currentCategory = 'Todo';
            App.renderCategories();
            App.render(App.data);
            App.updateCount(App.data.length);
            App.updateNavState('all');
        } else if (mode === 'favorites') {
            App.currentCategory = ''; // Deseleccionar categorías
            App.renderCategories();

            const favRecipes = App.data.filter(r => App.favorites.includes(r.id));
            App.render(favRecipes);
            App.updateCount(favRecipes.length, 'Favoritas');
            App.updateNavState('favorites');
        }
    },

    // Acción para botón Azar
    random: () => {
        if (App.data.length > 0) {
            const randomRecipe = App.data[Math.floor(Math.random() * App.data.length)];
            App.showDetail(randomRecipe);
        }
    },

    // Buscador
    filterData: (rawTerm) => {
        // Normalizar: Minúsculas y Sin Acentos
        const term = rawTerm.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

        let source = App.data;
        // Si estamos filtrando por categoría específica, buscar solo ahí
        if (App.currentCategory !== 'Todo' && App.currentCategory !== '') {
            source = App.data.filter(r => (r.categoria || 'Varios').trim() === App.currentCategory);
        }

        const filtered = source.filter(r => {
            const title = r.titulo.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
            const hasIng = r.ingredientes && r.ingredientes.some(i =>
                i.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").includes(term)
            );
            return title.includes(term) || hasIng;
        });

        App.render(filtered);
    },

    // Helpers UI
    updateNavState: (activeMode) => {
        document.querySelectorAll('.nav-item').forEach(btn => btn.classList.remove('active'));
        if (activeMode === 'all') {
            document.querySelector('.nav-item[onclick*="all"]')?.classList.add('active');
        } else if (activeMode === 'favorites') {
            document.querySelector('.nav-item[onclick*="favorites"]')?.classList.add('active');
        }
    },

    updateCount: (count, label = 'recetas') => {
        const el = document.getElementById('recipe-count');
        if (el) el.textContent = `${count} ${label}`;
    },

    // --- ACCIONES DE FAVORITOS ---
    toggleFavorite: (id, btnElement) => {
        // Detener propagación para no abrir modal
        if (event) event.stopPropagation();

        const index = App.favorites.indexOf(id);
        if (index === -1) {
            App.favorites.push(id);
            btnElement.textContent = '❤️';
            btnElement.classList.add('active');

            // Animación
            btnElement.animate([
                { transform: 'scale(1)' },
                { transform: 'scale(1.4)' },
                { transform: 'scale(1)' }
            ], { duration: 300 });
        } else {
            App.favorites.splice(index, 1);
            btnElement.textContent = '🤍';
            btnElement.classList.remove('active');

            // Si estamos viendo favoritos, eliminar tarjeta
            // Verificamos si la clase active está en el botón de favoritos de la navbar
            const favNav = document.querySelector('.nav-item[onclick*="favorites"]');
            if (favNav && favNav.classList.contains('active')) {
                const card = btnElement.closest('.recipe-card');
                if (card) {
                    card.style.transition = 'opacity 0.3s, transform 0.3s';
                    card.style.opacity = '0';
                    card.style.transform = 'scale(0.8)';
                    setTimeout(() => {
                        card.remove();
                        App.updateCount(document.querySelectorAll('#recipe-list .recipe-card').length, 'Favoritas');
                    }, 300);
                }
            }
        }
        localStorage.setItem('alli_favorites', JSON.stringify(App.favorites));
    },

    // --- DETALLE Y MODAL (FIXED) ---
    showDetail: (recipe) => {
        document.getElementById('modal-title').textContent = recipe.titulo;

        const img = document.getElementById('modal-img');
        img.src = recipe.imagen;
        img.onerror = () => img.src = 'assets/logo.jpg';

        document.getElementById('modal-time').textContent = recipe.tiempo;
        document.getElementById('modal-cat').textContent = recipe.categoria || 'General';

        // Ingredientes
        const ingList = document.getElementById('modal-ingredients');
        ingList.innerHTML = '';
        if (recipe.ingredientes && recipe.ingredientes.length > 0) {
            ingList.innerHTML = recipe.ingredientes.map(i => `<li>${i}</li>`).join('');
        } else {
            ingList.innerHTML = '<li style="opacity:0.6; font-style:italic;">Ingredientes no detallados.</li>';
        }

        // Pasos (Inteligente)
        const stepsContainer = document.getElementById('modal-steps');
        stepsContainer.innerHTML = '';

        if (recipe && Array.isArray(recipe.pasos) && recipe.pasos.length > 0) {
            stepsContainer.innerHTML = recipe.pasos.map((p, i) => `
                <div class="step">
                    <span class="step-num">${i + 1}</span>
                    <p style="flex:1; line-height:1.6;">${p}</p>
                </div>
            `).join('');
        } else if (typeof recipe.pasos === 'string' && recipe.pasos.length > 10) {
            // Fallback string largo
            stepsContainer.innerHTML = `<p class="step-text" style="white-space: pre-line; line-height:1.6;">${recipe.pasos}</p>`;
        } else {
            stepsContainer.innerHTML = `
                <div class="empty-steps" style="text-align:center; padding:20px; color:#78350f;">
                    <p style="font-size:1.1rem; font-weight:bold;">📝 Preparación intuitiva</p>
                    <small>Mezcla los ingredientes con amor y sazón.</small>
                </div>`;
        }

        document.getElementById('recipe-modal').classList.add('active');
    },

    closeModal: () => {
        document.getElementById('recipe-modal').classList.remove('active');
    },

    setupEvents: () => {
        // Buscador
        const searchInput = document.getElementById('search-input');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                const term = e.target.value.toLowerCase();
                App.filterData(term);
            });
        }

        // Cerrar modal con ESC
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') App.closeModal();
        });
    }
};

// Iniciar
window.addEventListener('DOMContentLoaded', () => {
    // Timeout para asegurar carga de scripts
    setTimeout(App.init, 50);
});
