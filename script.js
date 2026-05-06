/**
 * 世界旅行地图 - 基于 D3.js 的 3D 地球仪
 */

// ==================== 全局状态 ====================
const STORAGE_KEY = 'travel-map-data';
const TOTAL_COUNTRIES = Object.keys(COUNTRIES_DATA).length;

// 地图相关
let svg, gCountries, gGraticule, sphereCircle;
let projection, pathGenerator;
let countryFeatures = [];
let width = 0, height = 0;
let currentScale = 280;
let rotation = [0, -20];
let autoRotateTimer = null;
let isAutoRotating = false;

// 弹窗相关
let visitData = {};
let currentCountryCode = null;
let currentCountryInfo = null;
let currentRating = 0;
let currentPhotos = [];
let viewerPhotos = [];
let viewerIndex = 0;

// GeoJSON 数据源
const GEOJSON_SOURCES = [
    'https://cdn.jsdelivr.net/gh/nvkelso/natural-earth-vector@master/geojson/ne_110m_admin_0_countries.geojson',
    'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_admin_0_countries.geojson',
    'https://cdn.jsdelivr.net/gh/nvkelso/natural-earth-vector@master/geojson/ne_50m_admin_0_countries.geojson'
];

// ==================== 数据持久化 ====================
function loadData() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
            visitData = JSON.parse(raw);
            // 清理早期版本的无效数据
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
        return true;
    } catch (e) {
        console.error('保存数据失败：', e);
        if (e.name === 'QuotaExceededError') {
            showToast('存储空间不足，请删除部分照片或清空数据', 'error');
        } else {
            showToast('保存失败：' + e.message, 'error');
        }
        return false;
    }
}

// ==================== 国家代码识别 ====================
function getFeatureCode(feature) {
    const props = feature.properties || {};
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

// ==================== 球体地图初始化 ====================
function initGlobe() {
    const container = document.getElementById('globe');
    width = container.clientWidth;
    height = container.clientHeight;

    // 计算合适的初始缩放
    currentScale = Math.min(width, height) * 0.42;

    projection = d3.geoOrthographic()
        .scale(currentScale)
        .translate([width / 2, height / 2])
        .clipAngle(90)
        .rotate(rotation);

    pathGenerator = d3.geoPath(projection);

    svg = d3.select('#globe').append('svg')
        .attr('viewBox', `0 0 ${width} ${height}`)
        .attr('preserveAspectRatio', 'xMidYMid meet');

    // 渐变定义
    const defs = svg.append('defs');

    // 球体海洋渐变
    const oceanGradient = defs.append('radialGradient')
        .attr('id', 'ocean-gradient')
        .attr('cx', '40%')
        .attr('cy', '35%');
    oceanGradient.append('stop')
        .attr('offset', '0%')
        .attr('stop-color', '#7ab8e8');
    oceanGradient.append('stop')
        .attr('offset', '60%')
        .attr('stop-color', '#4a90c8');
    oceanGradient.append('stop')
        .attr('offset', '100%')
        .attr('stop-color', '#1f4d7a');

    // 球体光晕
    const glow = defs.append('radialGradient')
        .attr('id', 'glow-gradient');
    glow.append('stop').attr('offset', '0%').attr('stop-color', 'rgba(100,180,255,0)');
    glow.append('stop').attr('offset', '85%').attr('stop-color', 'rgba(100,180,255,0)');
    glow.append('stop').attr('offset', '100%').attr('stop-color', 'rgba(100,180,255,0.4)');

    // 外层光晕
    svg.append('circle')
        .attr('class', 'globe-glow')
        .attr('cx', width / 2)
        .attr('cy', height / 2)
        .attr('r', currentScale * 1.08)
        .attr('fill', 'url(#glow-gradient)');

    // 海洋背景圆（球体）
    sphereCircle = svg.append('circle')
        .attr('class', 'sphere')
        .attr('cx', width / 2)
        .attr('cy', height / 2)
        .attr('r', currentScale)
        .attr('fill', 'url(#ocean-gradient)');

    // 经纬线层
    gGraticule = svg.append('g').attr('class', 'graticule-layer');
    gGraticule.append('path')
        .datum(d3.geoGraticule10())
        .attr('class', 'graticule')
        .attr('d', pathGenerator);

    // 国家层
    gCountries = svg.append('g').attr('class', 'countries-layer');

    // 加载国家数据
    loadCountries();

    // 设置交互
    setupInteractions();

    // 窗口大小变化时重绘
    window.addEventListener('resize', handleResize);
}

async function loadCountries() {
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
            <p style="font-size: 12px;">请检查网络连接后刷新页面</p>
        `;
        return;
    }

    countryFeatures = geojson.features;

    gCountries.selectAll('path')
        .data(countryFeatures)
        .enter().append('path')
        .attr('class', d => {
            const code = getFeatureCode(d);
            return 'country ' + (visitData[code] ? 'visited' : 'unvisited');
        })
        .attr('d', pathGenerator)
        .attr('stroke', 'rgba(255,255,255,0.5)')
        .attr('stroke-width', 0.5)
        .on('mouseover', handleCountryMouseOver)
        .on('mousemove', handleCountryMouseMove)
        .on('mouseout', handleCountryMouseOut)
        .on('click', handleCountryClick);

    document.getElementById('mapLoading').classList.add('hidden');
    refreshUI();
}

function updateGlobe() {
    if (!projection) return;
    sphereCircle.attr('r', projection.scale());
    svg.select('.globe-glow').attr('r', projection.scale() * 1.08);
    gGraticule.select('path').attr('d', pathGenerator);
    gCountries.selectAll('path').attr('d', pathGenerator);
}

function handleResize() {
    const container = document.getElementById('globe');
    const newWidth = container.clientWidth;
    const newHeight = container.clientHeight;
    if (newWidth === width && newHeight === height) return;

    width = newWidth;
    height = newHeight;
    const newScale = Math.min(width, height) * 0.42;

    projection.translate([width / 2, height / 2]).scale(newScale);
    svg.attr('viewBox', `0 0 ${width} ${height}`);
    sphereCircle.attr('cx', width / 2).attr('cy', height / 2);
    svg.select('.globe-glow').attr('cx', width / 2).attr('cy', height / 2);
    updateGlobe();
}

// ==================== 交互（拖拽/缩放/点击） ====================
function setupInteractions() {
    // 拖拽旋转
    const drag = d3.drag()
        .on('start', () => {
            stopAutoRotate();
        })
        .on('drag', (event) => {
            const sensitivity = 0.4;
            const r = projection.rotate();
            const k = sensitivity * (300 / projection.scale());
            const newLambda = r[0] + event.dx * k;
            const newPhi = r[1] - event.dy * k;
            rotation = [newLambda, Math.max(-90, Math.min(90, newPhi))];
            projection.rotate(rotation);
            updateGlobe();
        });

    svg.call(drag);

    // 滚轮缩放
    svg.on('wheel', (event) => {
        event.preventDefault();
        const delta = event.deltaY < 0 ? 1.15 : 0.87;
        zoom(delta);
    }, { passive: false });

    // 防止双击选中
    svg.on('dblclick', (event) => event.preventDefault());
}

function zoom(factor) {
    const newScale = projection.scale() * factor;
    const minScale = Math.min(width, height) * 0.2;
    const maxScale = Math.min(width, height) * 3;
    const clamped = Math.max(minScale, Math.min(maxScale, newScale));
    projection.scale(clamped);
    updateGlobe();
}

function resetView() {
    stopAutoRotate();
    rotation = [0, -20];
    const initialScale = Math.min(width, height) * 0.42;
    projection.scale(initialScale).rotate(rotation);
    updateGlobe();
}

function startAutoRotate() {
    if (isAutoRotating) return;
    isAutoRotating = true;
    document.getElementById('autoRotateBtn').classList.add('active');

    let lastTime = Date.now();
    const tick = () => {
        const now = Date.now();
        const dt = now - lastTime;
        lastTime = now;
        if (!isAutoRotating) return;
        const r = projection.rotate();
        rotation = [r[0] + dt * 0.015, r[1]];
        projection.rotate(rotation);
        updateGlobe();
        autoRotateTimer = requestAnimationFrame(tick);
    };
    autoRotateTimer = requestAnimationFrame(tick);
}

function stopAutoRotate() {
    if (!isAutoRotating) return;
    isAutoRotating = false;
    document.getElementById('autoRotateBtn').classList.remove('active');
    if (autoRotateTimer) {
        cancelAnimationFrame(autoRotateTimer);
        autoRotateTimer = null;
    }
}

function toggleAutoRotate() {
    if (isAutoRotating) stopAutoRotate();
    else startAutoRotate();
}

// ==================== 国家事件 ====================
function handleCountryMouseOver(event, d) {
    d3.select(this).classed('hover', true);
    const code = getFeatureCode(d);
    const name = getFeatureName(d);
    const info = getCountryInfo(code, name);
    const tooltip = document.getElementById('globeTooltip');
    const visited = visitData[info.code];
    tooltip.innerHTML = `${info.flag} <strong>${info.zh}</strong>${visited ? ' ✓' : ''}`;
    tooltip.classList.add('visible');
    handleCountryMouseMove(event);
}

function handleCountryMouseMove(event) {
    const tooltip = document.getElementById('globeTooltip');
    const container = document.getElementById('globe').getBoundingClientRect();
    tooltip.style.left = (event.clientX - container.left) + 'px';
    tooltip.style.top = (event.clientY - container.top) + 'px';
}

function handleCountryMouseOut(event, d) {
    d3.select(this).classed('hover', false);
    document.getElementById('globeTooltip').classList.remove('visible');
}

function handleCountryClick(event, d) {
    event.stopPropagation();
    const code = getFeatureCode(d);
    const name = getFeatureName(d);
    const info = getCountryInfo(code, name);
    if (!info.code) return;

    // 旋转地球到该国家中心
    const centroid = d3.geoCentroid(d);
    if (centroid && !isNaN(centroid[0]) && !isNaN(centroid[1])) {
        animateRotation([-centroid[0], -centroid[1]]);
    }

    openCountryModal(info);
}

function animateRotation(targetRotation) {
    stopAutoRotate();
    const startRotation = projection.rotate();
    const duration = 600;
    const startTime = Date.now();

    const interpolate = d3.interpolate(startRotation, [targetRotation[0], targetRotation[1], 0]);
    const tick = () => {
        const elapsed = Date.now() - startTime;
        const t = Math.min(1, elapsed / duration);
        const eased = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
        rotation = interpolate(eased);
        projection.rotate(rotation);
        updateGlobe();
        if (t < 1) requestAnimationFrame(tick);
    };
    tick();
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

/**
 * 把当前编辑的内容立即保存到 visitData（用于自动保存场景，例如照片上传）
 * 即使用户没点保存按钮，也确保数据落地
 */
function commitCurrentEdit({ markVisited = false } = {}) {
    if (!currentCountryCode || !currentCountryInfo) return false;

    const isVisited = markVisited || document.getElementById('visitedToggle').checked;
    if (!isVisited) return false;

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
    return saveData();
}

function saveCountry() {
    if (!currentCountryCode) return;

    const isVisited = document.getElementById('visitedToggle').checked;

    if (!isVisited) {
        delete visitData[currentCountryCode];
        saveData();
        showToast('已取消标记', 'success');
    } else {
        const ok = commitCurrentEdit();
        if (ok) {
            showToast(`已保存 ${currentCountryInfo.zh} 的旅行记录`, 'success');
        }
    }

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
        // 自动启用「已去过」开关，并立即写入 localStorage
        // 这样即使用户上传完直接关闭弹窗，照片也已经持久化
        const toggle = document.getElementById('visitedToggle');
        if (!toggle.checked) {
            toggle.checked = true;
            updateDetailsState();
        }
        const ok = commitCurrentEdit({ markVisited: true });
        if (ok) {
            refreshUI();
            showToast(`已添加 ${added} 张照片并自动保存${skipped > 0 ? `（${skipped} 张失败）` : ''}`, 'success');
        }
    } else if (skipped > 0) {
        showToast(`${skipped} 张图片处理失败`, 'error');
    }
}

function compressImage(file, maxSize = 1280, quality = 0.8) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                let w = img.width;
                let h = img.height;

                if (w > maxSize || h > maxSize) {
                    if (w > h) {
                        h = Math.round((h * maxSize) / w);
                        w = maxSize;
                    } else {
                        w = Math.round((w * maxSize) / h);
                        h = maxSize;
                    }
                }

                const canvas = document.createElement('canvas');
                canvas.width = w;
                canvas.height = h;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, w, h);
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
                // 删除照片也立即同步到本地
                if (document.getElementById('visitedToggle').checked) {
                    commitCurrentEdit();
                    refreshUI();
                }
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
    updateCountryColors();
}

function updateCountryColors() {
    if (!gCountries) return;
    gCountries.selectAll('path')
        .attr('class', d => {
            const code = getFeatureCode(d);
            return 'country ' + (visitData[code] ? 'visited' : 'unvisited');
        });
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
                    <p class="empty-hint">点击地球上的国家开始记录吧！</p>
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
                // 旋转地球到该国家
                const feature = countryFeatures.find(f => getFeatureCode(f) === code);
                if (feature) {
                    const centroid = d3.geoCentroid(feature);
                    if (centroid && !isNaN(centroid[0])) {
                        animateRotation([-centroid[0], -centroid[1]]);
                    }
                }
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
    // 弹窗关闭
    document.getElementById('modalClose').addEventListener('click', closeModal);
    document.getElementById('cancelBtn').addEventListener('click', closeModal);
    document.querySelector('#countryModal .modal-overlay').addEventListener('click', closeModal);
    document.getElementById('saveBtn').addEventListener('click', saveCountry);

    document.getElementById('visitedToggle').addEventListener('change', updateDetailsState);

    // 评分
    document.querySelectorAll('#ratingStars .star').forEach(star => {
        star.addEventListener('click', () => {
            const value = parseInt(star.dataset.value);
            currentRating = currentRating === value ? 0 : value;
            updateRatingUI();
        });
    });

    // 照片上传
    document.getElementById('uploadBtn').addEventListener('click', () => {
        document.getElementById('photoInput').click();
    });
    document.getElementById('photoInput').addEventListener('change', handlePhotoUpload);

    // 照片预览
    document.getElementById('photoViewerClose').addEventListener('click', closePhotoViewer);
    document.querySelector('.photo-viewer-overlay').addEventListener('click', closePhotoViewer);
    document.getElementById('photoViewerPrev').addEventListener('click', showPrevPhoto);
    document.getElementById('photoViewerNext').addEventListener('click', showNextPhoto);

    // 键盘
    document.addEventListener('keydown', (e) => {
        if (document.getElementById('photoViewer').classList.contains('active')) {
            if (e.key === 'Escape') closePhotoViewer();
            else if (e.key === 'ArrowLeft') showPrevPhoto();
            else if (e.key === 'ArrowRight') showNextPhoto();
        } else if (document.getElementById('countryModal').classList.contains('active')) {
            if (e.key === 'Escape') closeModal();
        }
    });

    // 数据管理
    document.getElementById('exportBtn').addEventListener('click', exportData);
    document.getElementById('importBtn').addEventListener('click', () => {
        document.getElementById('importInput').click();
    });
    document.getElementById('importInput').addEventListener('change', importData);
    document.getElementById('resetBtn').addEventListener('click', resetData);

    // 搜索
    let searchTimer = null;
    document.getElementById('searchInput').addEventListener('input', (e) => {
        if (searchTimer) clearTimeout(searchTimer);
        searchTimer = setTimeout(() => {
            updateVisitedList(e.target.value);
        }, 200);
    });

    // 地图控制按钮
    document.getElementById('autoRotateBtn').addEventListener('click', toggleAutoRotate);
    document.getElementById('zoomInBtn').addEventListener('click', () => zoom(1.3));
    document.getElementById('zoomOutBtn').addEventListener('click', () => zoom(0.77));
    document.getElementById('resetViewBtn').addEventListener('click', resetView);
}

// ==================== 初始化 ====================
document.addEventListener('DOMContentLoaded', () => {
    loadData();
    bindEvents();
    initGlobe();
});
