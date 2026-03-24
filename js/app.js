document.addEventListener('DOMContentLoaded', async () => {
    const grid = document.getElementById('moduleGrid');
    const categoryList = document.getElementById('categoryList');
    const searchInput = document.getElementById('moduleSearch');
    
    let catalog = null;
    let activeRegion = 'all';
    
    try {
        const response = await fetch('data/catalog.json');
        catalog = await response.json();
        renderCategories();
        renderModules();
    } catch (err) {
        console.error('Failed to load catalog:', err);
        grid.innerHTML = '<div class="loading-state">Failed to load anatomy data. Ensure you are running a local server.</div>';
    }

    searchInput.addEventListener('input', (e) => {
        renderModules(e.target.value.toLowerCase(), activeRegion);
    });

    function renderCategories() {
        // Extract unique regions
        const regions = new Set();
        catalog.modules.forEach(m => {
            if (m.region) regions.add(m.region);
        });

        let html = `<li class="active" data-region="all">All Regions</li>`;
        Array.from(regions).sort().forEach(r => {
            if (!r) return;
            const niceName = r.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
            html += `<li data-region="${r}">${niceName}</li>`;
        });
        
        categoryList.innerHTML = html;
        
        categoryList.querySelectorAll('li').forEach(li => {
            li.addEventListener('click', (e) => {
                categoryList.querySelectorAll('li').forEach(n => n.classList.remove('active'));
                const el = e.target;
                el.classList.add('active');
                activeRegion = el.dataset.region;
                renderModules(searchInput.value.toLowerCase(), activeRegion);
            });
        });
    }

    function renderModules(searchQuery = '', region = 'all') {
        grid.innerHTML = '';
        
        const filtered = catalog.modules.filter(m => {
            const name = (m.name && m.name.en) ? m.name.en.toLowerCase() : '';
            const matchesSearch = name.includes(searchQuery) || m.code.toLowerCase().includes(searchQuery);
            const matchesRegion = region === 'all' || m.region === region;
            return matchesSearch && matchesRegion;
        });

        if (filtered.length === 0) {
            grid.innerHTML = '<div class="loading-state">No medical modules found matching your search.</div>';
            return;
        }
        
        filtered.forEach(m => {
            const name = (m.name && m.name.en) ? m.name.en : m.code;
            const regionName = m.region ? m.region.split('_').join(' ') : 'General';
            
            // Note: icons logic - icons are stored in icons/module_code.jpg
            const card = document.createElement('a');
            card.className = 'module-card';
            card.href = `viewer.html?module=${m.code}`;
            
            card.innerHTML = `
                <div class="card-img">
                    <img src="icons/${m.code}.jpg" alt="${name}" onerror="this.src='data:image/svg+xml;utf8,<svg xmlns=\\'http://www.w3.org/2000/svg\\' width=\\'100%\\' height=\\'100%\\'><rect width=\\'100%\\' height=\\'100%\\' fill=\\'%23222\\'/></svg>'">
                </div>
                <div class="card-content">
                    <h3 class="card-title">${name}</h3>
                    <div class="card-desc">
                        <span class="badge">${regionName}</span>
                    </div>
                </div>
            `;
            grid.appendChild(card);
        });
    }
});
