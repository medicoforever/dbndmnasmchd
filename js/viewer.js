const urlParams = new URLSearchParams(window.location.search);
const moduleCode = urlParams.get('module');

if (!moduleCode) {
    window.location.href = 'index.html';
}

// State
let moduleData = null;
let currentSeriesIdx = 0;
let currentContrastIdx = 0;
let currentSlice = 1;
let totalSlices = 1;
let isLabelsVisible = true;
let searchQuery = '';
let hiddenFilters = new Set(); // IDs of filters to hide

// DOM Elements
const moduleTitle = document.getElementById('moduleTitle');
const seriesTitle = document.getElementById('seriesTitle');
const mainImage = document.getElementById('mainImage');
const imageLayer = document.getElementById('imageLayer');
const pointsLayer = document.getElementById('pointsLayer');
const labelsLayer = document.getElementById('labelsLayer');
const linesCanvas = document.getElementById('linesCanvas');
const sliceSlider = document.getElementById('sliceSlider');
const sliceCurrent = document.getElementById('sliceCurrent');
const sliceTotal = document.getElementById('sliceTotal');
const toggleLabelsBtn = document.getElementById('toggleLabelsBtn');
const labelSearch = document.getElementById('labelSearch');
const filterSelectBtn = document.getElementById('filterSelectBtn');
const filterDropdown = document.getElementById('filterDropdown');
const seriesSelectBtn = document.getElementById('seriesSelectBtn');
const seriesDropdown = document.getElementById('seriesDropdown');
const contrastContainer = document.getElementById('contrastContainer');
const contrastSelectBtn = document.getElementById('contrastSelectBtn');
const contrastDropdown = document.getElementById('contrastDropdown');

async function init() {
    try {
        const res = await fetch(`data/modules/${moduleCode}/data.json`);
        moduleData = await res.json();
        
        // Ensure language exists, fallback to code
        const modName = (moduleData.name && moduleData.name.en) ? moduleData.name.en : moduleData.code;
        moduleTitle.textContent = modName;
        
        if (moduleData.series && moduleData.series.length > 0) {
            setupSeriesDropdown();
            loadSeries(0);
        } else {
            alert('No series data found for this module.');
        }
        
    } catch (e) {
        console.error(e);
        alert('Failed to load module data. Are you running a local web server?');
    }
}

function setupSeriesDropdown() {
    seriesDropdown.innerHTML = '';
    moduleData.series.forEach((ser, idx) => {
        const name = (ser.name && ser.name.en) ? ser.name.en : `Series ${ser.id}`;
        const item = document.createElement('div');
        item.className = `dropdown-item ${idx === currentSeriesIdx ? 'active' : ''}`;
        item.textContent = name;
        item.onclick = () => {
            seriesDropdown.classList.add('hidden');
            if (currentSeriesIdx !== idx) {
                currentSeriesIdx = idx;
                setupSeriesDropdown(); // update active class
                loadSeries(idx);
            }
        };
        seriesDropdown.appendChild(item);
    });
}

function setupContrastDropdown(series) {
    if (!series.contrasts || series.contrasts.length <= 1) {
        contrastContainer.style.display = 'none';
        return;
    }
    
    contrastContainer.style.display = 'block';
    contrastDropdown.innerHTML = '';
    
    series.contrasts.forEach((cnt, idx) => {
        const name = (cnt.name && cnt.name.en) ? cnt.name.en : cnt.code;
        const item = document.createElement('div');
        item.className = `dropdown-item ${idx === currentContrastIdx ? 'active' : ''}`;
        item.textContent = name;
        item.onclick = () => {
            contrastDropdown.classList.add('hidden');
            if (currentContrastIdx !== idx) {
                currentContrastIdx = idx;
                setupContrastDropdown(series);
                loadSlice(currentSlice);
            }
        };
        contrastDropdown.appendChild(item);
    });
}

function loadSeries(idx) {
    const ser = moduleData.series[idx];
    const name = (ser.name && ser.name.en) ? ser.name.en : `Series ${ser.id}`;
    seriesTitle.textContent = name;
    
    currentContrastIdx = 0;
    setupContrastDropdown(ser);
    
    // Some modules map slices via sort_order mapped strictly 1 to N, others jump.
    // The image files are named by sort_order.
    // Let's find the min and max sort_order from points (or use ser.images)
    totalSlices = ser.images || 1;
    let minIdx = ser.start_index || 1;
    
    // We will just assume slider runs from minIdx to minIdx + totalSlices - 1. But `slice_order` in files might not match exactly if there are gaps?
    // Actually our exporter mapped them by `sort_order` directly!
    // Often it starts at 1 to number_of_images
    
    sliceSlider.min = minIdx;
    sliceSlider.max = minIdx + totalSlices - 1;
    sliceSlider.value = minIdx;
    sliceTotal.textContent = minIdx + totalSlices - 1;
    
    currentSlice = minIdx;
    
    // Reset zoom
    transform = { x: 0, y: 0, scale: 1 };
    applyTransform();
    
    loadSlice(currentSlice);
}

function loadSlice(sliceIndex) {
    sliceCurrent.textContent = sliceIndex;
    sliceSlider.value = sliceIndex;
    
    const ser = moduleData.series[currentSeriesIdx];
    const cnt = ser.contrasts[currentContrastIdx];
    
    // Build image URL
    const imgUrl = `data/modules/${moduleCode}/${cnt.code}/${sliceIndex}.jpg`;
    mainImage.src = imgUrl;
    
    // Preload next and prev
    if (sliceIndex < parseInt(sliceSlider.max)) {
        document.getElementById('preloadImgPlus1').src = `data/modules/${moduleCode}/${cnt.code}/${sliceIndex + 1}.jpg`;
    }
    if (sliceIndex > parseInt(sliceSlider.min)) {
        document.getElementById('preloadImgMinus1').src = `data/modules/${moduleCode}/${cnt.code}/${sliceIndex - 1}.jpg`;
    }
    
    renderPoints(ser, sliceIndex);
}

function renderPoints(series, sliceIndex) {
    pointsLayer.innerHTML = '';
    labelsLayer.innerHTML = '';
    const ctx = linesCanvas.getContext('2d');
    ctx.clearRect(0, 0, linesCanvas.width, linesCanvas.height);
    
    if (!isLabelsVisible) return;
    
    const pts = series.points ? series.points[sliceIndex.toString()] : null;
    if (!pts) return;
    
    const cWidth = series.width || 512;
    const cHeight = series.height || 512;
    
    linesCanvas.width = cWidth;
    linesCanvas.height = cHeight;
    ctx.strokeStyle = 'rgba(255,255,255,0.4)';
    ctx.lineWidth = 1.5;
    
    pts.forEach((pt, i) => {
        // FILTER CHECK
        if (hiddenFilters.has(pt.filter_id)) return;

        const txt = (pt.name && pt.name.en) ? pt.name.en : 'Structure';
        
        // SEARCH CHECK
        const isMatch = searchQuery && txt.toLowerCase().includes(searchQuery);
        if (searchQuery && !isMatch) return; // Hide non-matches if searching

        const px = (pt.x / cWidth) * 100;
        const py = (pt.y / cHeight) * 100;
        
        const dot = document.createElement('div');
        dot.className = 'anatomy-point';
        if (isMatch) dot.classList.add('search-match');
        dot.style.left = px + '%';
        dot.style.top = py + '%';
        dot.style.backgroundColor = pt.color || '#ffcc00';
        
        const label = document.createElement('div');
        label.className = 'anatomy-label';
        if (isMatch) label.classList.add('search-match');
        label.textContent = txt;
        label.style.top = py + '%';
        
        let labelX;
        if (pt.x > cWidth / 2) {
            label.style.left = '98%';
            label.style.transform = 'translate(-100%, -50%)';
            labelX = cWidth * 0.98;
        } else {
            label.style.left = '2%';
            label.style.transform = 'translate(0%, -50%)';
            labelX = cWidth * 0.02;
        }
        
        ctx.beginPath();
        ctx.moveTo(pt.x, pt.y);
        ctx.lineTo(labelX, pt.y);
        ctx.stroke();
        
        const highlight = () => {
            dot.classList.add('active');
            label.classList.add('active');
            ctx.beginPath();
            ctx.moveTo(pt.x, pt.y);
            ctx.lineTo(labelX, pt.y);
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 2;
            ctx.stroke();
        };
        const removeHighlight = () => {
            dot.classList.remove('active');
            label.classList.remove('active');
            renderPoints(series, sliceIndex);
        };
        
        dot.onmouseenter = highlight;
        dot.onmouseleave = removeHighlight;
        label.onmouseenter = highlight;
        label.onmouseleave = removeHighlight;
        
        pointsLayer.appendChild(dot);
        labelsLayer.appendChild(label);
    });
}

// Event Listeners
sliceSlider.addEventListener('input', (e) => {
    currentSlice = parseInt(e.target.value);
    loadSlice(currentSlice);
});

toggleLabelsBtn.addEventListener('click', () => {
    isLabelsVisible = !isLabelsVisible;
    toggleLabelsBtn.classList.toggle('active', isLabelsVisible);
    document.body.classList.toggle('hide-labels', !isLabelsVisible);
    if (isLabelsVisible) {
        const ser = moduleData.series[currentSeriesIdx];
        renderPoints(ser, currentSlice);
    }
});

labelSearch.addEventListener('input', (e) => {
    searchQuery = e.target.value.toLowerCase();
    const ser = moduleData.series[currentSeriesIdx];
    renderPoints(ser, currentSlice);
});

function setupFilterDropdown() {
    filterDropdown.innerHTML = '';
    if (!moduleData.filters) return;
    
    // Sort filters by system/name
    const sortedFilters = Object.values(moduleData.filters).sort((a,b) => {
        const nameA = a.name ? (a.name.en || '') : '';
        const nameB = b.name ? (b.name.en || '') : '';
        return nameA.localeCompare(nameB);
    });

    sortedFilters.forEach(f => {
        const name = f.name ? (f.name.en || f.category) : f.category;
        const item = document.createElement('div');
        item.className = 'dropdown-item';
        
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = !hiddenFilters.has(f.id);
        checkbox.style.marginRight = '10px';
        
        item.appendChild(checkbox);
        item.appendChild(document.createTextNode(name));
        
        item.onclick = (e) => {
            e.stopPropagation();
            checkbox.checked = !checkbox.checked;
            if (checkbox.checked) hiddenFilters.delete(f.id);
            else hiddenFilters.add(f.id);
            
            const ser = moduleData.series[currentSeriesIdx];
            renderPoints(ser, currentSlice);
        };
        checkbox.onclick = (e) => {
            e.stopPropagation();
            if (checkbox.checked) hiddenFilters.delete(f.id);
            else hiddenFilters.add(f.id);
            const ser = moduleData.series[currentSeriesIdx];
            renderPoints(ser, currentSlice);
        };

        filterDropdown.appendChild(item);
    });
}

// Dropdowns
filterSelectBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    filterDropdown.classList.toggle('hidden');
    seriesDropdown.classList.add('hidden');
    contrastDropdown.classList.add('hidden');
    if (!filterDropdown.classList.contains('hidden')) setupFilterDropdown();
});
contrastSelectBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    contrastDropdown.classList.toggle('hidden');
    seriesDropdown.classList.add('hidden');
});
document.addEventListener('click', () => {
    seriesDropdown.classList.add('hidden');
    contrastDropdown.classList.add('hidden');
});

// Pan and Zoom Logic
const workspace = document.getElementById('viewerWorkspace');

function applyTransform() {
    // Math clamping
    if (transform.scale < 0.5) transform.scale = 0.5;
    if (transform.scale > 5) transform.scale = 5;
    
    imageLayer.style.transform = `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`;
}

// Wheel zoom
workspace.addEventListener('wheel', (e) => {
    e.preventDefault();
    const zoomIntensity = 0.1;
    const delta = e.deltaY > 0 ? -zoomIntensity : zoomIntensity;
    
    // Zoom toward pointer
    const rect = workspace.getBoundingClientRect();
    const x = e.clientX - rect.left - rect.width/2;
    const y = e.clientY - rect.top - rect.height/2;
    
    const prevScale = transform.scale;
    transform.scale += delta;
    
    // Clamp
    if (transform.scale < 0.5) transform.scale = 0.5;
    if (transform.scale > 5) transform.scale = 5;
    
    // Math to keep zoom centered on mouse
    const scaleRatio = transform.scale / prevScale;
    transform.x = x - (x - transform.x) * scaleRatio;
    transform.y = y - (y - transform.y) * scaleRatio;
    
    applyTransform();
});

// Touch / Pointer Pan
let evCache = [];

workspace.addEventListener('pointerdown', (e) => {
    evCache.push(e);
    if (evCache.length === 1) {
        isDragging = true;
        startPan = { x: e.clientX, y: e.clientY };
    } else if (evCache.length === 2) {
        // Pinch start
        isDragging = false;
        pinchStartDist = Math.hypot(
            evCache[0].clientX - evCache[1].clientX,
            evCache[0].clientY - evCache[1].clientY
        );
        pinchStartScale = transform.scale;
    }
});

workspace.addEventListener('pointermove', (e) => {
    const index = evCache.findIndex((ev) => ev.pointerId === e.pointerId);
    if (index !== -1) evCache[index] = e;
    
    if (evCache.length === 1 && isDragging) {
        const dx = e.clientX - startPan.x;
        const dy = e.clientY - startPan.y;
        transform.x += dx;
        transform.y += dy;
        startPan = { x: e.clientX, y: e.clientY };
        applyTransform();
    } else if (evCache.length === 2) {
        // Pinch zoom
        const dist = Math.hypot(
            evCache[0].clientX - evCache[1].clientX,
            evCache[0].clientY - evCache[1].clientY
        );
        const scaleChange = dist / pinchStartDist;
        transform.scale = pinchStartScale * scaleChange;
        applyTransform();
    }
});

function handlePointerUp(e) {
    evCache = evCache.filter((ev) => ev.pointerId !== e.pointerId);
    if (evCache.length < 2) isDragging = false;
}

workspace.addEventListener('pointerup', handlePointerUp);
workspace.addEventListener('pointercancel', handlePointerUp);
workspace.addEventListener('pointerout', handlePointerUp);
workspace.addEventListener('pointerleave', handlePointerUp);

// Start
init();
