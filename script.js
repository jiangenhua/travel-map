/**
 * 世界旅行地图 - 主要逻辑
 */

// ==================== 全局状态 ====================
const STORAGE_KEY = 'travel-map-data';
const TOTAL_COUNTRIES = Object.keys(COUNTRIES_DATA).length;

let map = null;
let countriesLayer = null;
let visitData = {}; // { ISO_A3: { date, cities, rating, notes, photos } }
let currentCountryCode = null;
let currentCountryInfo = null;
let currentRating = 0;
let currentPhotos = [];
let viewerPhotos = [];
let viewerIndex = 0;

// GeoJSON 数据源（多个备用源，按顺序尝试）
const GEOJSON_SOURCES = [
    'https://cdn.jsdelivr.net/gh/nvkelso/natural-earth-vector@master/geojson/ne_50m_admin_0_countries.geojson',
    'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_admin_0_countries.geojson',
    'https://datahub.io/core/geo-countries/r/0.geojson'
];

// ==================== 数据持久化 ====================
function loadData() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
            visitData = JSON.parse(raw);
            // 清理早期版本的无效数据（ISO_A3 为 "-99" 的脏数据）
            const invalidKeys = ['-99', '-1', 'undefined', 'null', ''];
            let cleaned = false;
            for (const key of invalidKeys) {
                if (key in visitData) {
                    delete visitData[key];
                    cleaned = true;
                }
            }
            if (cleaned) {
                saveData();
                console.log('已清理无效数据条目');
            }
        }
    } catch (e) {
        console.error('加载数据失败：', e);
        visitData = {};
    }
}

function saveData() {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(visitData));
    } catch (e) {
        console.error('保存数据失败：', e);
        if (e.name === 'QuotaExceededError') {
            showToast('存储空间不足，照片可能过大', 'error');
        }
    }
}

// ==================== 地图初始化 ====================
function initMap() {
    map = L.map('map', {
        center: [20, 10],
        zoom: 2,
        minZoom: 2,
        maxZoom: 8,
        worldCopyJump: true,
        zoomControl: true,
        attributionControl: false
    });

    // 使用 CartoDB 简洁底图
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png', {
        subdomains: 'abcd',
        maxZoom: 19
    }).addTo(map);

    // 加载国家边界数据
    loadCountriesGeoJSON();
}

async function loadCountriesGeoJSON() {
    let geojson = null;

    for (const url of GEOJSON_SOURCES) {
        try {
            const response = await fetch(url);
            if (response.ok) {
                geojson = await response.json();
                break;
            }
        } catch (e) {
            console.warn(`加载失败 ${url}:`, e);
        }
    }

    if (!geojson) {
        document.getElementById('mapLoading').innerHTML = `
            <p style="color: #ef4444;">⚠️ 地图数据加载失败</p>
            <p style="font-size: 12px; color: #6b7280;">请检查网络连接后刷新页面</p>
        `;
        return;
    }

    countriesLayer = L.geoJSON(geojson, {
        style: getCountryStyle,
        onEachFeature: bindCountryEvents
    }).addTo(map);

    document.getElementById('mapLoading').classList.add('hidden');
    refreshUI();
}

function getCountryStyle(feature) {
    const code = getFeatureCode(feature);
    const isVisited = !!visitData[code];

    return {
        fillColor: isVisited ? '#4f7df3' : '#e5e7eb',
        fillOpacity: isVisited ? 0.75 : 0.6,
        weight: 0.6,
        color: '#9ca3af',
        opacity: 0.8
    };
}

function getFeatureCode(feature) {
    const props = feature.properties || {};
    // 按优先级尝试各个 ISO 代码字段
    // 注意：Natural Earth 数据中很多国家的 ISO_A3 是 "-99"（如法国、挪威、科索沃等），
    // 这是由于政治原因或数据缺失。所以优先使用 ADM0_A3（行政区代码），它对所有国家都有效。
    const isoFields = [
        'ADM0_A3', 'adm0_a3',
        'ISO_A3_EH', 'iso_a3_eh',
        'ISO_A3', 'iso_a3',
        'WB_A3', 'wb_a3',
        'BRK_A3', 'brk_a3',
        'GU_A3', 'gu_a3',
        'SOV_A3', 'sov_a3'
    ];
    for (const field of isoFields) {
        const c = props[field];
        if (c && typeof c === 'string') {
            const v = c.trim();
            if (v && v !== '-99' && v !== '-1' && v !== 'undefined' && v.length === 3) {
                return v.toUpperCase();
            }
        }
    }
    // 最后用国家名作为唯一标识，避免不同国家共享同一个无效代码
    const name = getFeatureName(feature);
    if (name) {
        return '__' + name.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]/g, '_');
    }
    return null;
}

function getFeatureName(feature) {
    const props = feature.properties || {};
    return props.NAME_ZH || props.name_zh ||
           props.NAME || props.name || 
           props.ADMIN || props.admin || 
           props.NAME_LONG || props.name_long ||
           props.NAME_EN || props.name_en || '';
}

function bindCountryEvents(feature, layer) {
    const code = getFeatureCode(feature);
    const name = getFeatureName(feature);
    const info = getCountryInfo(code, name);

    // 鼠标悬停
    layer.on('mouseover', function(e) {
        const layer = e.target;
        layer.setStyle({
            weight: 2,
            color: '#4f7df3',
            fillOpacity: visitData[info.code] ? 0.9 : 0.8
        });
        layer.bringToFront();
    });

    layer.on('mouseout', function(e) {
        countriesLayer.resetStyle(e.target);
    });

    // 悬浮提示
    const tooltipText = `${info.flag} ${info.zh}${visitData[info.code] ? ' ✓' : ''}`;
    layer.bindTooltip(tooltipText, {
        sticky: true,
        className: 'country-tooltip',
        direction: 'top'
    });

    // 点击事件
    layer.on('click', function() {
        openCountryModal(info);
    });
}

// ==================== 国家弹窗 ====================
function openCountryModal(info) {
    currentCountryInfo = info;
    currentCountryCode = info.code;

    document.getElementById('modalCountryName').textContent = info.zh;
    document.getElementById('modalCountryFlag').textContent = info.flag;

    const data = visitData[info.code];
    const isVisited = !!data;

    document.getElementById('visitedToggle').checked = isVisited;
    document.getElementById('visitDate').value = data?.date || '';
    document.getElementById('visitCities').value = data?.cities || '';
    document.getElementById('visitNotes').value = data?.notes || '';

    currentRating = data?.rating || 0;
    currentPhotos = data?.photos ? [...data.photos] : [];

    updateRatingUI();
    updatePhotoGrid();
    updateDetailsState();

    document.getElementById('countryModal').classList.add('active');
}

function closeModal() {
    document.getElementById('countryModal').classList.remove('active');
    currentCountryCode = null;
    currentCountryInfo = null;
    currentPhotos = [];
}

function updateDetailsState() {
    const isVisited = document.getElementById('visitedToggle').checked;
    const details = document.getElementById('visitDetails');
    if (isVisited) {
        details.classList.add('active');
    } else {
        details.classList.remove('active');
    }
}

function updateRatingUI() {
    const stars = document.querySelectorAll('#ratingStars .star');
    stars.forEach((star, idx) => {
        if (idx < currentRating) {
            star.classList.add('active');
        } else {
            star.classList.remove('active');
        }
    });
}

function saveCountry() {
    if (!currentCountryCode) return;

    const isVisited = document.getElementById('visitedToggle').checked;

    if (!isVisited) {
        delete visitData[currentCountryCode];
        showToast('已取消标记', 'success');
    } else {
        visitData[currentCountryCode] = {
            code: currentCountryCode,
            zh: currentCountryInfo.zh,
            en: currentCountryInfo.en,
            flag: currentCountryInfo.flag,
            continent: currentCountryInfo.continent,
            date: document.getElementById('visitDate').value,
            cities: document.getElementById('visitCities').value.trim(),
            rating: currentRating,
            notes: document.getElementById('visitNotes').value.trim(),
            photos: currentPhotos,
            updatedAt: new Date().toISOString()
        };
        showToast(`已保存 ${currentCountryInfo.zh} 的旅行记录`, 'success');
    }

    saveData();
    refreshUI();
    closeModal();
}

// ==================== 照片处理 ====================
async function handlePhotoUpload(event) {
    const files = Array.from(event.target.files);
    if (files.length === 0) return;

    let added = 0;
    let skipped = 0;

    for (const file of files) {
        if (!file.type.startsWith('image/')) {
            continue;
        }
        try {
            const compressed = await compressImage(file, 1280, 0.8);
            currentPhotos.push({
                id: Date.now() + '-' + Math.random().toString(36).substr(2, 9),
                name: file.name,
                size: compressed.length,
                data: compressed,
                uploadedAt: new Date().toISOString()
            });
            added++;
        } catch (e) {
            console.error('图片处理失败：', e);
            skipped++;
        }
    }

    updatePhotoGrid();
    event.target.value = '';

    if (added > 0) {
        showToast(`已添加 ${added} 张照片${skipped > 0 ? `，${skipped} 张失败` : ''}`, 'success');
    }
}

/**
 * 压缩图片，限制最大边长，输出为 base64
 */
function compressImage(file, maxSize = 1280, quality = 0.8) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                let width = img.width;
                let height = img.height;

                if (width > maxSize || height > maxSize) {
                    if (width > height) {
                        height = Math.round((height * maxSize) / width);
                        width = maxSize;
                    } else {
                        width = Math.round((width * maxSize) / height);
                        height = maxSize;
                    }
                }

                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                resolve(canvas.toDataURL('image/jpeg', quality));
            };
            img.onerror = reject;
            img.src = e.target.result;
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

function updatePhotoGrid() {
    const grid = document.getElementById('photoGrid');
    if (currentPhotos.length === 0) {
        grid.innerHTML = '';
        return;
    }

    grid.innerHTML = currentPhotos.map((photo, idx) => `
        <div class="photo-item" data-index="${idx}">
            <img src="${photo.data}" alt="${photo.name}">
            <button class="photo-item-remove" data-index="${idx}" title="删除">×</button>
        </div>
    `).join('');

    grid.querySelectorAll('.photo-item').forEach(el => {
        el.addEventListener('click', (e) => {
            if (e.target.classList.contains('photo-item-remove')) {
                const idx = parseInt(e.target.dataset.index);
                currentPhotos.splice(idx, 1);
                updatePhotoGrid();
            } else {
                const idx = parseInt(el.dataset.index);
                openPhotoViewer(currentPhotos, idx);
            }
        });
    });
}

// ==================== 照片预览 ====================
function openPhotoViewer(photos, startIdx = 0) {
    if (!photos || photos.length === 0) return;
    viewerPhotos = photos;
    viewerIndex = startIdx;
    updateViewerImage();
    document.getElementById('photoViewer').classList.add('active');
}

function closePhotoViewer() {
    document.getElementById('photoViewer').classList.remove('active');
}

function updateViewerImage() {
    const photo = viewerPhotos[viewerIndex];
    if (!photo) return;
    document.getElementById('photoViewerImg').src = photo.data;
    document.getElementById('photoViewerInfo').textContent = 
        `${viewerIndex + 1} / ${viewerPhotos.length}`;
}

function showPrevPhoto() {
    if (viewerPhotos.length === 0) return;
    viewerIndex = (viewerIndex - 1 + viewerPhotos.length) % viewerPhotos.length;
    updateViewerImage();
}

function showNextPhoto() {
    if (viewerPhotos.length === 0) return;
    viewerIndex = (viewerIndex + 1) % viewerPhotos.length;
    updateViewerImage();
}

// ==================== 侧边栏更新 ====================
function refreshUI() {
    updateStats();
    updateProgressBar();
    updateVisitedList();

    if (countriesLayer) {
        countriesLayer.eachLayer(layer => {
            countriesLayer.resetStyle(layer);
        });
    }
}

function updateStats() {
    const countries = Object.keys(visitData);
    const photoCount = countries.reduce((sum, code) => 
        sum + (visitData[code].photos?.length || 0), 0);
    const continents = new Set(countries.map(code => visitData[code].continent).filter(Boolean));

    document.getElementById('countryCount').textContent = countries.length;
    document.getElementById('photoCount').textContent = photoCount;
    document.getElementById('continentCount').textContent = continents.size;
}

function updateProgressBar() {
    const visited = Object.keys(visitData).length;
    const percent = Math.min(100, (visited / TOTAL_COUNTRIES) * 100);
    document.getElementById('progressFill').style.width = percent + '%';
    document.getElementById('progressText').textContent = percent.toFixed(1) + '%';
}

function updateVisitedList(filter = '') {
    const list = document.getElementById('visitedList');
    let countries = Object.values(visitData);

    if (filter) {
        const f = filter.toLowerCase();
        countries = countries.filter(c => 
            c.zh.toLowerCase().includes(f) || 
            c.en.toLowerCase().includes(f) ||
            (c.cities || '').toLowerCase().includes(f)
        );
    }

    countries.sort((a, b) => {
        const da = a.date || a.updatedAt || '';
        const db = b.date || b.updatedAt || '';
        return db.localeCompare(da);
    });

    if (countries.length === 0) {
        if (filter) {
            list.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">🔍</div>
                    <p>未找到匹配的国家</p>
                </div>
            `;
        } else {
            list.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">🗺️</div>
                    <p>还没有旅行记录</p>
                    <p class="empty-hint">点击地图上的国家开始记录吧！</p>
                </div>
            `;
        }
        return;
    }

    list.innerHTML = countries.map(c => {
        const photoCount = c.photos?.length || 0;
        const firstPhoto = c.photos?.[0];
        const dateStr = c.date ? formatDate(c.date) : '';
        const ratingStr = c.rating ? '★'.repeat(c.rating) : '';

        return `
            <div class="visited-item" data-code="${c.code}">
                <div class="visited-item-flag">${c.flag}</div>
                <div class="visited-item-info">
                    <div class="visited-item-name">${c.zh}</div>
                    <div class="visited-item-meta">
                        ${dateStr ? `<span>${dateStr}</span>` : ''}
                        ${ratingStr ? `<span class="visited-item-rating">${ratingStr}</span>` : ''}
                        ${c.cities ? `<span>📍 ${c.cities}</span>` : ''}
                    </div>
                </div>
                ${firstPhoto ? `
                    <div class="visited-item-photos">
                        <img src="${firstPhoto.data}" alt="">
                        ${photoCount > 1 ? `<span class="photo-count">${photoCount}</span>` : ''}
                    </div>
                ` : photoCount > 0 ? `
                    <div class="visited-item-photos">📷 ${photoCount}</div>
                ` : ''}
            </div>
        `;
    }).join('');

    list.querySelectorAll('.visited-item').forEach(el => {
        el.addEventListener('click', () => {
            const code = el.dataset.code;
            const data = visitData[code];
            if (data) {
                openCountryModal({
                    code: data.code,
                    zh: data.zh,
                    en: data.en,
                    flag: data.flag,
                    continent: data.continent
                });
            }
        });
    });
}

function formatDate(dateStr) {
    if (!dateStr) return '';
    try {
        const d = new Date(dateStr);
        return d.toLocaleDateString('zh-CN', { year: 'numeric', month: 'short', day: 'numeric' });
    } catch {
        return dateStr;
    }
}

// ==================== 数据导入/导出 ====================
function exportData() {
    if (Object.keys(visitData).length === 0) {
        showToast('暂无数据可导出', 'error');
        return;
    }

    const exportObj = {
        version: '1.0',
        exportedAt: new Date().toISOString(),
        countries: visitData
    };

    const blob = new Blob([JSON.stringify(exportObj, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `travel-map-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);

    showToast('数据已导出', 'success');
}

function importData(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const obj = JSON.parse(e.target.result);
            const data = obj.countries || obj;

            if (typeof data !== 'object') {
                throw new Error('数据格式错误');
            }

            const merge = Object.keys(visitData).length > 0 ?
                confirm('当前已有旅行数据，是否合并？\n点击「确定」合并，「取消」覆盖') : false;

            if (merge) {
                visitData = { ...visitData, ...data };
            } else {
                visitData = data;
            }

            saveData();
            refreshUI();
            showToast('数据已导入', 'success');
        } catch (err) {
            console.error(err);
            showToast('导入失败：文件格式错误', 'error');
        }
    };
    reader.readAsText(file);
    event.target.value = '';
}

function resetData() {
    if (Object.keys(visitData).length === 0) {
        showToast('暂无数据', 'error');
        return;
    }
    if (!confirm('确定要清空所有旅行数据吗？此操作不可恢复！\n建议先导出数据备份。')) {
        return;
    }
    visitData = {};
    saveData();
    refreshUI();
    showToast('数据已清空', 'success');
}

// ==================== Toast ====================
let toastTimer = null;
function showToast(message, type = '') {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className = 'toast show ' + type;

    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
        toast.className = 'toast ' + type;
    }, 2500);
}

// ==================== 事件绑定 ====================
function bindEvents() {
    document.getElementById('modalClose').addEventListener('click', closeModal);
    document.getElementById('cancelBtn').addEventListener('click', closeModal);
    document.querySelector('#countryModal .modal-overlay').addEventListener('click', closeModal);
    document.getElementById('saveBtn').addEventListener('click', saveCountry);

    document.getElementById('visitedToggle').addEventListener('change', updateDetailsState);

    document.querySelectorAll('#ratingStars .star').forEach(star => {
        star.addEventListener('click', () => {
            const value = parseInt(star.dataset.value);
            currentRating = currentRating === value ? 0 : value;
            updateRatingUI();
        });
    });

    document.getElementById('uploadBtn').addEventListener('click', () => {
        document.getElementById('photoInput').click();
    });
    document.getElementById('photoInput').addEventListener('change', handlePhotoUpload);

    document.getElementById('photoViewerClose').addEventListener('click', closePhotoViewer);
    document.querySelector('.photo-viewer-overlay').addEventListener('click', closePhotoViewer);
    document.getElementById('photoViewerPrev').addEventListener('click', showPrevPhoto);
    document.getElementById('photoViewerNext').addEventListener('click', showNextPhoto);

    document.addEventListener('keydown', (e) => {
        if (document.getElementById('photoViewer').classList.contains('active')) {
            if (e.key === 'Escape') closePhotoViewer();
            else if (e.key === 'ArrowLeft') showPrevPhoto();
            else if (e.key === 'ArrowRight') showNextPhoto();
        } else if (document.getElementById('countryModal').classList.contains('active')) {
            if (e.key === 'Escape') closeModal();
        }
    });

    document.getElementById('exportBtn').addEventListener('click', exportData);
    document.getElementById('importBtn').addEventListener('click', () => {
        document.getElementById('importInput').click();
    });
    document.getElementById('importInput').addEventListener('change', importData);
    document.getElementById('resetBtn').addEventListener('click', resetData);

    let searchTimer = null;
    document.getElementById('searchInput').addEventListener('input', (e) => {
        if (searchTimer) clearTimeout(searchTimer);
        searchTimer = setTimeout(() => {
            updateVisitedList(e.target.value);
        }, 200);
    });
}

// ==================== 初始化 ====================
document.addEventListener('DOMContentLoaded', () => {
    loadData();
    bindEvents();
    initMap();
});
