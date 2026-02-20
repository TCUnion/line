/**
 * LINE Rich Menu 管理工具 - 前端邏輯
 *
 * 處理 Web UI 的所有互動行為，包含：
 * - 頁面切換與導航
 * - Token 管理
 * - Rich Menu CRUD 操作
 * - 圖片上傳（拖拉 + 選檔）
 * - 使用者綁定
 * - 別名管理
 * - Toast 通知
 */

// ============================================================
// 通用工具
// ============================================================

/**
 * 呼叫後端 API
 * @param {string} path - API 路徑
 * @param {object} options - fetch 選項
 * @returns {Promise<object>} 回應 JSON
 */
async function api(path, options = {}) {
    try {
        const res = await fetch(path, {
            headers: { 'Content-Type': 'application/json', ...options.headers },
            ...options,
        });
        const data = await res.json();
        if (!data.success) {
            throw new Error(data.error?.message || data.error || '操作失敗');
        }
        return data;
    } catch (err) {
        if (err.message === 'Failed to fetch') {
            throw new Error('無法連線到伺服器');
        }
        throw err;
    }
}

/** 顯示 Toast 通知 */
function toast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    const el = document.createElement('div');
    el.className = `toast ${type}`;

    const icons = {
        success: '✅',
        error: '❌',
        info: 'ℹ️',
    };

    el.innerHTML = `<span>${icons[type] || ''}</span><span>${message}</span>`;
    container.appendChild(el);

    setTimeout(() => {
        el.remove();
    }, 4000);
}

// ============================================================
// 頁面導航
// ============================================================

const navItems = document.querySelectorAll('.nav-item');
const sections = document.querySelectorAll('.section');

navItems.forEach((item) => {
    item.addEventListener('click', () => {
        const target = item.dataset.section;

        navItems.forEach((n) => n.classList.remove('active'));
        item.classList.add('active');

        sections.forEach((s) => {
            s.classList.toggle('active', s.id === `section-${target}`);
        });

        // 載入對應資料
        if (target === 'menus') loadMenus();
        if (target === 'create') loadTemplates();
        if (target === 'users') loadMenuSelects();
        if (target === 'aliases') {
            loadMenuSelects();
            loadAliases();
        }
    });
});

// ============================================================
// Token 管理
// ============================================================

const tokenModal = document.getElementById('tokenModal');
const btnSetToken = document.getElementById('btnSetToken');
const btnCloseModal = document.getElementById('btnCloseModal');
const btnCancelToken = document.getElementById('btnCancelToken');
const btnSaveToken = document.getElementById('btnSaveToken');
const tokenInput = document.getElementById('tokenInput');

btnSetToken.addEventListener('click', () => tokenModal.classList.add('open'));
btnCloseModal.addEventListener('click', () => tokenModal.classList.remove('open'));
btnCancelToken.addEventListener('click', () => tokenModal.classList.remove('open'));

btnSaveToken.addEventListener('click', async () => {
    const token = tokenInput.value.trim();
    if (!token || token.length < 10) {
        toast('Token 格式不正確', 'error');
        return;
    }
    try {
        await api('/api/token', {
            method: 'POST',
            body: JSON.stringify({ token }),
        });
        toast('Token 已設定成功', 'success');
        tokenModal.classList.remove('open');
        tokenInput.value = '';
        checkTokenStatus();
        loadMenus();
    } catch (err) {
        toast(err.message, 'error');
    }
});

async function checkTokenStatus() {
    try {
        const { data } = await api('/api/token/status');
        // NOTE: data 在此不使用 .data，token/status 回傳格式不同
    } catch {
        // 忽略
    }

    // 簡化：嘗試呼叫 API 確認 token 是否有效
    const statusEl = document.getElementById('tokenStatus');
    try {
        const res = await fetch('/api/token/status');
        const data = await res.json();
        if (data.isSet) {
            statusEl.className = 'token-status connected';
            statusEl.querySelector('.status-text').textContent = '已連線';
        } else {
            statusEl.className = 'token-status disconnected';
            statusEl.querySelector('.status-text').textContent = '未連線';
        }
    } catch {
        statusEl.className = 'token-status disconnected';
        statusEl.querySelector('.status-text').textContent = '連線失敗';
    }
}

// ============================================================
// Rich Menu 列表
// ============================================================

let currentMenus = [];
let currentDefaultMenuId = null;

async function loadMenus() {
    const listEl = document.getElementById('menuList');

    try {
        const [menusRes, defaultRes] = await Promise.all([
            api('/api/richmenus'),
            api('/api/default-richmenu'),
        ]);

        currentMenus = menusRes.data;
        currentDefaultMenuId = defaultRes.data?.richMenuId || null;

        if (currentMenus.length === 0) {
            listEl.innerHTML = `
        <div class="empty-state" style="grid-column: 1 / -1">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.4">
            <rect x="3" y="3" width="18" height="18" rx="2"/>
            <line x1="3" y1="9" x2="21" y2="9"/>
          </svg>
          <p>尚無任何 Rich Menu</p>
          <p class="empty-hint">點擊左側「建立選單」開始</p>
        </div>`;
            return;
        }

        listEl.innerHTML = currentMenus
            .map((menu) => {
                const isDefault = menu.richMenuId === currentDefaultMenuId;
                return `
        <div class="menu-card" data-id="${menu.richMenuId}">
          <div class="menu-card-image" id="img-${menu.richMenuId}">
            載入中...
          </div>
          <div class="menu-card-body">
            <div class="menu-card-name">
              ${menu.name}
              ${isDefault ? '<span class="badge badge-default">預設</span>' : ''}
              ${menu.selected ? '<span class="badge badge-green">自動開啟</span>' : ''}
            </div>
            <div class="menu-card-meta">
              <span>📐 ${menu.size.width}×${menu.size.height}</span>
              <span>🔲 ${menu.areas.length} 個區域</span>
              <span>💬 ${menu.chatBarText}</span>
            </div>
            <div class="menu-card-id">${menu.richMenuId}</div>
          </div>
          <div class="menu-card-actions">
            <button class="btn btn-sm btn-primary" onclick="previewMenu('${menu.richMenuId}')">👁️ 預覽</button>
            <button class="btn btn-sm btn-secondary" onclick="viewMenuJson('${menu.richMenuId}')">📄 JSON</button>
            <button class="btn btn-sm btn-secondary" onclick="cloneMenu('${menu.richMenuId}')">📋 複製</button>
            <button class="btn btn-sm btn-secondary" onclick="openUploadModal('${menu.richMenuId}', '${menu.name}')">🖼️ 上傳</button>
            <button class="btn btn-sm btn-secondary" onclick="setAsDefault('${menu.richMenuId}')">⭐ 預設</button>
            <button class="btn btn-sm btn-danger" onclick="deleteMenu('${menu.richMenuId}')">🗑️</button>
          </div>
        </div>`;
            })
            .join('');

        // 載入圖片預覽
        currentMenus.forEach((menu) => {
            loadMenuImage(menu.richMenuId);
        });
    } catch (err) {
        listEl.innerHTML = `
      <div class="empty-state" style="grid-column: 1 / -1">
        <p>❌ 載入失敗：${err.message}</p>
        <p class="empty-hint">請確認 Token 是否正確</p>
      </div>`;
    }
}

async function loadMenuImage(richMenuId) {
    const imgEl = document.getElementById(`img-${richMenuId}`);
    if (!imgEl) return;

    try {
        const res = await fetch(`/api/richmenus/${richMenuId}/image`);
        if (res.ok) {
            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            imgEl.innerHTML = `<img src="${url}" alt="Rich Menu 圖片">`;
        } else {
            imgEl.textContent = '尚未上傳圖片';
        }
    } catch {
        imgEl.textContent = '無法載入圖片';
    }
}

document.getElementById('btnRefresh').addEventListener('click', () => {
    loadMenus();
    toast('已重新整理', 'info');
});

// ============================================================
// 建立 Rich Menu（模板）
// ============================================================

async function loadTemplates() {
    const listEl = document.getElementById('templateList');

    try {
        const { data } = await api('/api/templates');
        const singleTemplates = data.filter((t) => t.data); // 排除多頁模板

        listEl.innerHTML = singleTemplates
            .map(
                (t) => `
      <div class="template-card" onclick="createFromTemplate('${t.id}')">
        <h4>${t.name}</h4>
        <p>${t.description}</p>
      </div>`
            )
            .join('');
    } catch (err) {
        listEl.innerHTML = `<p class="empty-hint">無法載入模板：${err.message}</p>`;
    }
}

// NOTE: 全域函式 — 從模板開啟視覺化編輯器
window.createFromTemplate = async function (templateId) {
    try {
        const { data: templates } = await api('/api/templates');
        const template = templates.find((t) => t.id === templateId);
        if (!template || !template.data) return;

        // 使用模板資料填入 clone editor
        openAdvancedEditor(JSON.parse(JSON.stringify(template.data)), null);
    } catch (err) {
        toast(err.message, 'error');
    }
};

// 從 JSON 建立
document.getElementById('btnValidate').addEventListener('click', async () => {
    const jsonText = document.getElementById('jsonEditor').value.trim();
    if (!jsonText) {
        toast('請先輸入 JSON', 'error');
        return;
    }
    try {
        const menuData = JSON.parse(jsonText);
        await api('/api/richmenus/validate', {
            method: 'POST',
            body: JSON.stringify(menuData),
        });
        toast('JSON 驗證通過！', 'success');
    } catch (err) {
        toast(`驗證失敗：${err.message}`, 'error');
    }
});

document.getElementById('btnCreateFromJson').addEventListener('click', async () => {
    const jsonText = document.getElementById('jsonEditor').value.trim();
    if (!jsonText) {
        toast('請先輸入 JSON', 'error');
        return;
    }
    try {
        const menuData = JSON.parse(jsonText);
        const { data: result } = await api('/api/richmenus', {
            method: 'POST',
            body: JSON.stringify(menuData),
        });
        toast(`選單已建立！ID：${result.richMenuId}`, 'success');
        document.getElementById('jsonEditor').value = '';
        document.querySelector('[data-section="menus"]').click();
    } catch (err) {
        toast(`建立失敗：${err.message}`, 'error');
    }
});

// ============================================================
// 刪除 / 設為預設
// ============================================================

window.deleteMenu = async function (richMenuId) {
    if (!confirm('確定要刪除此 Rich Menu？此操作無法復原。')) return;
    try {
        await api(`/api/richmenus/${richMenuId}`, { method: 'DELETE' });
        toast('Rich Menu 已刪除', 'success');
        loadMenus();
    } catch (err) {
        toast(err.message, 'error');
    }
};

window.setAsDefault = async function (richMenuId) {
    try {
        await api(`/api/default-richmenu/${richMenuId}`, { method: 'POST' });
        toast('已設為預設選單', 'success');
        loadMenus();
    } catch (err) {
        toast(err.message, 'error');
    }
};

/**
 * 複製現有選單 — 視覺化編輯器
 * 上方圖片 + 覆蓋區域，下方可編輯各區域的 action
 */

// NOTE: 用來暫存複製編輯器的選單副本
let cloneEditorData = null;
let cloneOriginalId = null; // 原始選單 ID，用於複製圖片

const cloneEditorModal = document.getElementById('cloneEditorModal');

document.getElementById('btnCloseCloneEditor').addEventListener('click', () => {
    cloneEditorModal.classList.remove('open');
});
document.getElementById('btnCloseCloneEditor2').addEventListener('click', () => {
    cloneEditorModal.classList.remove('open');
});

// 圖片選項 radio 切換：選「上傳新圖片」才顯示 file input
document.querySelectorAll('input[name="cloneImageOption"]').forEach((radio) => {
    radio.addEventListener('change', () => {
        const uploadArea = document.getElementById('cloneImageUploadArea');
        uploadArea.style.display = radio.value === 'upload' && radio.checked ? 'block' : 'none';
    });
});

/**
 * 根據 action 類型渲染對應的編輯欄位
 * @param {object} action - action 物件
 * @param {number} idx - area 索引
 * @returns {string} HTML
 */
function renderActionFields(action, idx) {
    const typeOptions = [
        { value: 'uri', label: '🔗 開啟連結' },
        { value: 'message', label: '💬 發送文字' },
        { value: 'postback', label: '📮 Postback' },
        { value: 'richmenuswitch', label: '🔄 換頁選單' },
        { value: 'datetimepicker', label: '📅 日期選擇' },
        { value: 'clipboard', label: '📋 複製文字' },
    ];

    let html = `
        <div class="form-group">
            <label>Action 類型</label>
            <select data-area="${idx}" data-field="type" onchange="onCloneTypeChange(${idx}, this.value)">
                ${typeOptions.map((o) => `<option value="${o.value}" ${o.value === action.type ? 'selected' : ''}>${o.label}</option>`).join('')}
            </select>
        </div>
        <div class="form-group">
            <label>標籤（label）</label>
            <input type="text" data-area="${idx}" data-field="label" value="${action.label || ''}">
        </div>`;

    // NOTE: 根據不同 action 類型渲染對應欄位
    switch (action.type) {
        case 'uri':
            html += `
                <div class="form-group">
                    <label>連結 URL</label>
                    <input type="url" data-area="${idx}" data-field="uri" value="${action.uri || ''}" placeholder="https://example.com">
                </div>`;
            break;
        case 'message':
            html += `
                <div class="form-group">
                    <label>發送文字</label>
                    <input type="text" data-area="${idx}" data-field="text" value="${action.text || ''}">
                </div>`;
            break;
        case 'postback':
            html += `
                <div class="form-group">
                    <label>Data</label>
                    <input type="text" data-area="${idx}" data-field="data" value="${action.data || ''}">
                </div>
                <div class="form-group">
                    <label>顯示文字（可選）</label>
                    <input type="text" data-area="${idx}" data-field="displayText" value="${action.displayText || ''}">
                </div>`;
            break;
        case 'richmenuswitch':
            html += `
                <div class="form-group">
                    <label>目標別名 ID</label>
                    <input type="text" data-area="${idx}" data-field="richMenuAliasId" value="${action.richMenuAliasId || ''}">
                </div>
                <div class="form-group">
                    <label>Data</label>
                    <input type="text" data-area="${idx}" data-field="data" value="${action.data || ''}">
                </div>`;
            break;
        case 'datetimepicker':
            html += `
                <div class="form-group">
                    <label>Data</label>
                    <input type="text" data-area="${idx}" data-field="data" value="${action.data || ''}">
                </div>
                <div class="form-group">
                    <label>模式</label>
                    <select data-area="${idx}" data-field="mode">
                        <option value="datetime" ${action.mode === 'datetime' ? 'selected' : ''}>日期時間</option>
                        <option value="date" ${action.mode === 'date' ? 'selected' : ''}>僅日期</option>
                        <option value="time" ${action.mode === 'time' ? 'selected' : ''}>僅時間</option>
                    </select>
                </div>`;
            break;
        case 'clipboard':
            html += `
                <div class="form-group">
                    <label>複製內容</label>
                    <input type="text" data-area="${idx}" data-field="clipboardText" value="${action.clipboardText || ''}">
                </div>`;
            break;
    }

    return html;
}

/** 渲染所有區域編輯卡片 */
function renderCloneAreaCards() {
    const list = document.getElementById('cloneAreasList');
    document.getElementById('cloneAreasCount').textContent =
        `共 ${cloneEditorData.areas.length} 個`;

    list.innerHTML = cloneEditorData.areas
        .map((area, idx) => {
            const { bounds, action } = area;
            const info = getActionTypeInfo(action.type);
            return `
            <div class="clone-area-card open" id="cloneArea${idx}">
                <div class="clone-area-head" onclick="toggleCloneArea(${idx})">
                    <div class="clone-area-title">
                        ${info.icon} 區域 ${idx + 1}
                        <span class="clone-area-badge" data-type="${action.type}">${info.label}</span>
                    </div>
                    <span class="clone-area-toggle">▼</span>
                </div>
                <div class="clone-area-body" id="cloneAreaBody${idx}">
                    <div class="clone-area-coords">
                        座標: x:${bounds.x} y:${bounds.y} w:${bounds.width} h:${bounds.height}
                    </div>
                    ${renderActionFields(action, idx)}
                </div>
            </div>`;
        })
        .join('');
}

/** 切換區域卡片展開/收合 */
window.toggleCloneArea = function (idx) {
    document.getElementById(`cloneArea${idx}`).classList.toggle('open');
};

/** Action 類型變更時重新渲染該區域的欄位 */
window.onCloneTypeChange = function (idx, newType) {
    const area = cloneEditorData.areas[idx];
    // NOTE: 保留 bounds 和 label，重建 action
    area.action = { type: newType, label: area.action.label || '' };
    renderCloneAreaCards();
    // 重新渲染後自動展開被修改的區域
    document.getElementById(`cloneArea${idx}`).classList.add('open');
};

/** 渲染複製編輯器中的圖片覆蓋區域（可點擊高亮對應卡片） */
function renderCloneOverlayAreas(menu, imgEl) {
    const overlay = document.getElementById('clonePreviewOverlay');
    overlay.innerHTML = '';

    menu.areas.forEach((area, idx) => {
        const { bounds, action } = area;
        const info = getActionTypeInfo(action.type);
        const el = document.createElement('div');
        el.className = 'preview-area';
        el.dataset.type = action.type;
        el.style.left = `${(bounds.x / menu.size.width) * 100}%`;
        el.style.top = `${(bounds.y / menu.size.height) * 100}%`;
        el.style.width = `${(bounds.width / menu.size.width) * 100}%`;
        el.style.height = `${(bounds.height / menu.size.height) * 100}%`;

        const labelText = action.label || action.text || action.uri || `區域 ${idx + 1}`;
        el.innerHTML = `
            <span class="preview-area-label">${info.icon} ${labelText}</span>
            <span class="preview-area-type">${info.label}</span>`;

        // 點擊圖片區域時，高亮並滾動到對應的編輯卡片
        el.addEventListener('click', () => {
            document.querySelectorAll('.clone-area-card').forEach((c) => c.classList.remove('active'));
            const card = document.getElementById(`cloneArea${idx}`);
            card.classList.add('active');
            card.classList.add('open');
            card.scrollIntoView({ behavior: 'smooth', block: 'center' });
        });

        overlay.appendChild(el);
    });
}

/** 從表單欄位收集資料並組成 Rich Menu JSON */
function collectCloneData() {
    const data = JSON.parse(JSON.stringify(cloneEditorData));
    data.name = document.getElementById('cloneName').value.trim();
    data.chatBarText = document.getElementById('cloneChatBar').value.trim();

    // 收集每個區域的 action 欄位
    data.areas.forEach((area, idx) => {
        const fields = document.querySelectorAll(`[data-area="${idx}"]`);
        const action = { type: area.action.type };

        fields.forEach((field) => {
            const key = field.dataset.field;
            const val = field.value.trim();
            if (key && val && key !== 'type') {
                action[key] = val;
            }
        });

        area.action = action;
    });

    return data;
}

/**
 * 通用視覺化選單編輯器
 * 可從「複製選單」或「模板建立」呼叫
 * @param {object} menuData - 選單資料（不含 richMenuId）
 * @param {string|null} originalMenuId - 原始選單 ID（用於複製圖片），null 表示從模板建立
 */
async function openAdvancedEditor(menuData, originalMenuId) {
    cloneEditorData = menuData;
    cloneOriginalId = originalMenuId;

    // 決定標題
    const isClone = !!originalMenuId;
    document.getElementById('cloneEditorTitle').textContent = isClone
        ? `複製選單 — ${menuData.name.replace('（副本）', '')}`
        : `✨ 進階建立 — ${menuData.name}`;

    // 設定基本欄位
    document.getElementById('cloneName').value = menuData.name;
    document.getElementById('cloneChatBar').value = menuData.chatBarText;

    // NOTE: 圖片選項根據模式不同設定
    const radioOriginal = document.querySelector('input[name="cloneImageOption"][value="original"]');
    const radioUpload = document.querySelector('input[name="cloneImageOption"][value="upload"]');
    const radioNone = document.querySelector('input[name="cloneImageOption"][value="none"]');

    if (isClone) {
        // 複製模式：預設使用原圖片
        radioOriginal.parentElement.style.display = '';
        radioOriginal.checked = true;
        radioUpload.checked = false;
        radioNone.checked = false;
    } else {
        // 模板模式：隱藏「使用原圖片」，預設「上傳新圖片」
        radioOriginal.parentElement.style.display = 'none';
        radioOriginal.checked = false;
        radioUpload.checked = true;
        radioNone.checked = false;
    }
    document.getElementById('cloneImageUploadArea').style.display = isClone ? 'none' : 'block';
    document.getElementById('cloneImageFile').value = '';

    // 渲染區域卡片
    renderCloneAreaCards();

    // 載入圖片（複製模式從 API 取，模板模式使用佔位圖）
    const imgEl = document.getElementById('clonePreviewImg');
    document.getElementById('clonePreviewOverlay').innerHTML = '';

    if (isClone) {
        try {
            const res = await fetch(`/api/richmenus/${originalMenuId}/image`);
            if (res.ok) {
                const blob = await res.blob();
                imgEl.src = URL.createObjectURL(blob);
            } else {
                setPlaceholderImage(imgEl, menuData.size, '尚未上傳圖片');
            }
        } catch {
            setPlaceholderImage(imgEl, menuData.size, '無法載入圖片');
        }
    } else {
        // 模板模式：渲染佈局示意圖
        setLayoutPreview(imgEl, menuData);
    }

    imgEl.onload = () => {
        renderCloneOverlayAreas(cloneEditorData, imgEl);
    };

    cloneEditorModal.classList.add('open');
}

/** 設定佔位圖片 */
function setPlaceholderImage(imgEl, size, text) {
    imgEl.src = `data:image/svg+xml,${encodeURIComponent(
        `<svg xmlns="http://www.w3.org/2000/svg" width="${size.width}" height="${size.height}"><rect fill="%23333" width="100%" height="100%"/><text x="50%" y="50%" fill="%23888" text-anchor="middle" dominant-baseline="central" font-size="48">${text}</text></svg>`
    )}`;
}

/** 模板模式佈局示意：用 SVG 繪製各區域方塊 */
function setLayoutPreview(imgEl, menuData) {
    const { width, height } = menuData.size;
    const colors = ['%2306c755', '%233b82f6', '%23f59e0b', '%23a855f7', '%23ec4899', '%236b7280'];
    let rects = '';
    menuData.areas.forEach((area, i) => {
        const { x, y, width: w, height: h } = area.bounds;
        const fill = colors[i % colors.length];
        rects += `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}" opacity="0.25" stroke="${fill}" stroke-width="4"/>`;
        rects += `<text x="${x + w / 2}" y="${y + h / 2}" fill="white" text-anchor="middle" dominant-baseline="central" font-size="56" font-weight="600">區域 ${i + 1}</text>`;
    });
    imgEl.src = `data:image/svg+xml,${encodeURIComponent(
        `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect fill="%231e1e2e" width="100%" height="100%"/>${rects}</svg>`
    )}`;
}

/** 開啟複製編輯器（從現有選單複製） */
window.cloneMenu = async function (richMenuId) {
    const menu = currentMenus.find((m) => m.richMenuId === richMenuId);
    if (!menu) {
        toast('找不到選單資料', 'error');
        return;
    }

    const originalId = menu.richMenuId;
    const menuData = JSON.parse(JSON.stringify(menu));
    delete menuData.richMenuId;
    menuData.name = `${menuData.name}（副本）`;

    await openAdvancedEditor(menuData, originalId);
};

/** 建立選單按鈕（含圖片處理） */
document.getElementById('btnSubmitClone').addEventListener('click', async () => {
    const submitBtn = document.getElementById('btnSubmitClone');
    submitBtn.disabled = true;
    submitBtn.textContent = '⏳ 建立中...';

    try {
        const menuData = collectCloneData();

        if (!menuData.name) {
            toast('請輸入選單名稱', 'error');
            return;
        }

        // 步驟 1: 建立選單
        const { data: result } = await api('/api/richmenus', {
            method: 'POST',
            body: JSON.stringify(menuData),
        });
        const newMenuId = result.richMenuId;
        toast(`選單已建立！ID：${newMenuId}`, 'success');

        // 步驟 2: 處理圖片
        const imageOption = document.querySelector('input[name="cloneImageOption"]:checked').value;

        if (imageOption === 'original' && cloneOriginalId) {
            // NOTE: 下載原始圖片，再上傳到新選單
            try {
                submitBtn.textContent = '⏳ 複製圖片中...';
                const imgRes = await fetch(`/api/richmenus/${cloneOriginalId}/image`);
                if (imgRes.ok) {
                    const imgBlob = await imgRes.blob();
                    const formData = new FormData();
                    formData.append('image', imgBlob, 'menu.png');
                    await fetch(`/api/richmenus/${newMenuId}/image`, {
                        method: 'POST',
                        body: formData,
                    });
                    toast('圖片已複製到新選單', 'success');
                } else {
                    toast('原選單無圖片，請稍後手動上傳', 'warning');
                }
            } catch (imgErr) {
                toast(`圖片複製失敗：${imgErr.message}`, 'error');
            }
        } else if (imageOption === 'upload') {
            // NOTE: 上傳使用者選擇的新圖片
            const fileInput = document.getElementById('cloneImageFile');
            if (fileInput.files.length > 0) {
                try {
                    submitBtn.textContent = '⏳ 上傳圖片中...';
                    const formData = new FormData();
                    formData.append('image', fileInput.files[0]);
                    await fetch(`/api/richmenus/${newMenuId}/image`, {
                        method: 'POST',
                        body: formData,
                    });
                    toast('新圖片已上傳', 'success');
                } catch (imgErr) {
                    toast(`圖片上傳失敗：${imgErr.message}`, 'error');
                }
            } else {
                toast('未選擇圖片，請稍後手動上傳', 'warning');
            }
        }

        cloneEditorModal.classList.remove('open');

        // 切換到選單管理頁並重新載入
        document.querySelector('[data-section="menus"]').click();
        loadMenus();
    } catch (err) {
        toast(err.message, 'error');
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = '🚀 建立選單';
    }
});

// ============================================================
// 圖片上傳
// ============================================================

let uploadTargetId = null;
const uploadModal = document.getElementById('uploadModal');
const uploadArea = document.getElementById('uploadArea');
const imageInput = document.getElementById('imageInput');
const previewImg = document.getElementById('previewImg');
const imagePreviewDiv = document.getElementById('imagePreview');
const btnConfirmUpload = document.getElementById('btnConfirmUpload');

window.openUploadModal = function (richMenuId, menuName) {
    uploadTargetId = richMenuId;
    document.getElementById('uploadMenuName').textContent = `上傳圖片到：${menuName}`;
    imagePreviewDiv.style.display = 'none';
    uploadArea.style.display = 'flex';
    btnConfirmUpload.disabled = true;
    imageInput.value = '';
    uploadModal.classList.add('open');
};

document.getElementById('btnCloseUpload').addEventListener('click', () => {
    uploadModal.classList.remove('open');
});
document.getElementById('btnCancelUpload').addEventListener('click', () => {
    uploadModal.classList.remove('open');
});

// 點擊選檔
uploadArea.addEventListener('click', () => imageInput.click());

// 拖拉上傳
uploadArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadArea.classList.add('dragover');
});
uploadArea.addEventListener('dragleave', () => {
    uploadArea.classList.remove('dragover');
});
uploadArea.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadArea.classList.remove('dragover');
    const file = e.dataTransfer.files[0];
    if (file) handleImageSelect(file);
});

// 檔案選擇
imageInput.addEventListener('change', () => {
    const file = imageInput.files[0];
    if (file) handleImageSelect(file);
});

function handleImageSelect(file) {
    if (!['image/png', 'image/jpeg'].includes(file.type)) {
        toast('僅支援 PNG 或 JPEG 格式', 'error');
        return;
    }
    if (file.size > 1024 * 1024) {
        toast('圖片檔案超過 1MB 限制', 'error');
        return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
        previewImg.src = e.target.result;
        imagePreviewDiv.style.display = 'block';
        uploadArea.style.display = 'none';
        btnConfirmUpload.disabled = false;
    };
    reader.readAsDataURL(file);
}

btnConfirmUpload.addEventListener('click', async () => {
    const file = imageInput.files[0] || null;

    // 從 preview 取得檔案（拖拉上傳的情況）
    let uploadFile = file;
    if (!uploadFile) {
        // 拖拉上傳：從 Data URL 轉換
        const dataUrl = previewImg.src;
        if (dataUrl.startsWith('data:')) {
            const res = await fetch(dataUrl);
            const blob = await res.blob();
            uploadFile = new File([blob], 'richmenu.png', { type: blob.type });
        }
    }

    if (!uploadFile) {
        toast('請先選擇圖片', 'error');
        return;
    }

    const formData = new FormData();
    formData.append('image', uploadFile);

    try {
        btnConfirmUpload.disabled = true;
        btnConfirmUpload.textContent = '上傳中...';

        const res = await fetch(`/api/richmenus/${uploadTargetId}/image`, {
            method: 'POST',
            body: formData,
        });
        const data = await res.json();

        if (!data.success) throw new Error(data.error?.message || '上傳失敗');

        toast('圖片已上傳成功', 'success');
        uploadModal.classList.remove('open');
        loadMenus();
    } catch (err) {
        toast(err.message, 'error');
    } finally {
        btnConfirmUpload.disabled = false;
        btnConfirmUpload.textContent = '上傳';
    }
});

// ============================================================
// 使用者綁定
// ============================================================

async function loadMenuSelects() {
    try {
        const { data: menus } = await api('/api/richmenus');
        const options = menus
            .map((m) => `<option value="${m.richMenuId}">${m.name}</option>`)
            .join('');

        const selects = ['userRichMenuSelect', 'defaultRichMenuSelect', 'aliasRichMenuSelect'];
        selects.forEach((id) => {
            const el = document.getElementById(id);
            if (el) {
                el.innerHTML = `<option value="">-- 請選擇 --</option>${options}`;
            }
        });

        // 載入預設選單資訊
        try {
            const { data: def } = await api('/api/default-richmenu');
            const infoEl = document.getElementById('defaultMenuInfo');
            if (def) {
                const menu = menus.find((m) => m.richMenuId === def.richMenuId);
                infoEl.innerHTML = `目前預設選單：<strong>${menu?.name || def.richMenuId}</strong>`;
            } else {
                infoEl.textContent = '目前尚未設定預設選單';
            }
        } catch {
            document.getElementById('defaultMenuInfo').textContent = '無法載入預設選單資訊';
        }
    } catch (err) {
        toast(`載入選單清單失敗：${err.message}`, 'error');
    }
}

document.getElementById('btnLinkUser').addEventListener('click', async () => {
    const userId = document.getElementById('userId').value.trim();
    const richMenuId = document.getElementById('userRichMenuSelect').value;

    if (!userId) return toast('請輸入使用者 ID', 'error');
    if (!richMenuId) return toast('請選擇 Rich Menu', 'error');

    try {
        await api(`/api/users/${userId}/richmenu/${richMenuId}`, { method: 'POST' });
        toast('已成功綁定選單到使用者', 'success');
    } catch (err) {
        toast(err.message, 'error');
    }
});

document.getElementById('btnUnlinkUser').addEventListener('click', async () => {
    const userId = document.getElementById('userId').value.trim();
    if (!userId) return toast('請輸入使用者 ID', 'error');

    try {
        await api(`/api/users/${userId}/richmenu`, { method: 'DELETE' });
        toast('已解除使用者的選單綁定', 'success');
    } catch (err) {
        toast(err.message, 'error');
    }
});

document.getElementById('btnQueryUser').addEventListener('click', async () => {
    const userId = document.getElementById('userId').value.trim();
    if (!userId) return toast('請輸入使用者 ID', 'error');

    const resultEl = document.getElementById('userResult');
    try {
        const { data } = await api(`/api/users/${userId}/richmenu`);
        resultEl.style.display = 'block';
        if (data) {
            resultEl.innerHTML = `綁定的選單 ID：<strong>${data.richMenuId}</strong>`;
        } else {
            resultEl.textContent = '此使用者尚未綁定任何選單';
        }
    } catch (err) {
        resultEl.style.display = 'block';
        resultEl.textContent = `查詢失敗：${err.message}`;
    }
});

// 預設選單
document.getElementById('btnSetDefault').addEventListener('click', async () => {
    const richMenuId = document.getElementById('defaultRichMenuSelect').value;
    if (!richMenuId) return toast('請選擇 Rich Menu', 'error');

    try {
        await api(`/api/default-richmenu/${richMenuId}`, { method: 'POST' });
        toast('已設定預設選單', 'success');
        loadMenuSelects();
    } catch (err) {
        toast(err.message, 'error');
    }
});

document.getElementById('btnCancelDefault').addEventListener('click', async () => {
    if (!confirm('確定要取消預設選單？')) return;
    try {
        await api('/api/default-richmenu', { method: 'DELETE' });
        toast('已取消預設選單', 'success');
        loadMenuSelects();
    } catch (err) {
        toast(err.message, 'error');
    }
});

// ============================================================
// 別名管理
// ============================================================

async function loadAliases() {
    const listEl = document.getElementById('aliasList');
    try {
        const { data: aliases } = await api('/api/aliases');
        if (aliases.length === 0) {
            listEl.innerHTML = '<p class="empty-hint">尚無任何別名</p>';
            return;
        }
        listEl.innerHTML = aliases
            .map(
                (a) => `
      <div class="alias-item">
        <div class="alias-item-info">
          <span class="alias-item-id">${a.richMenuAliasId}</span>
          <span class="alias-item-arrow">→</span>
          <span class="alias-item-menu">${a.richMenuId}</span>
        </div>
        <button class="btn btn-sm btn-danger" onclick="deleteAlias('${a.richMenuAliasId}')">刪除</button>
      </div>`
            )
            .join('');
    } catch (err) {
        listEl.innerHTML = `<p class="empty-hint">載入失敗：${err.message}</p>`;
    }
}

document.getElementById('btnCreateAlias').addEventListener('click', async () => {
    const aliasId = document.getElementById('aliasId').value.trim();
    const richMenuId = document.getElementById('aliasRichMenuSelect').value;

    if (!aliasId) return toast('請輸入別名 ID', 'error');
    if (!richMenuId) return toast('請選擇 Rich Menu', 'error');

    try {
        await api('/api/aliases', {
            method: 'POST',
            body: JSON.stringify({ richMenuAliasId: aliasId, richMenuId }),
        });
        toast('別名已建立', 'success');
        document.getElementById('aliasId').value = '';
        loadAliases();
    } catch (err) {
        toast(err.message, 'error');
    }
});

window.deleteAlias = async function (aliasId) {
    if (!confirm(`確定要刪除別名「${aliasId}」？`)) return;
    try {
        await api(`/api/aliases/${encodeURIComponent(aliasId)}`, { method: 'DELETE' });
        toast('別名已刪除', 'success');
        loadAliases();
    } catch (err) {
        toast(err.message, 'error');
    }
};

// ============================================================
// JSON 查看器
// ============================================================

const jsonViewModal = document.getElementById('jsonViewModal');

// 關閉按鈕
document.getElementById('btnCloseJsonView').addEventListener('click', () => {
    jsonViewModal.classList.remove('open');
});
document.getElementById('btnCloseJsonView2').addEventListener('click', () => {
    jsonViewModal.classList.remove('open');
});

/**
 * JSON 語法高亮
 * 將 JSON 字串中的 key、string、number、boolean、null 加上對應的 CSS class
 * @param {string} json - 格式化後的 JSON 字串
 * @returns {string} 帶 HTML 標籤的高亮字串
 */
function highlightJson(json) {
    // NOTE: 先將特殊字元轉義，再針對 JSON 結構加上 span 標籤
    return json
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(
            /("(\\u[a-fA-F0-9]{4}|\\[^u]|[^\\"])*")(\s*:)?/g,
            (match, str, _inner, colon) => {
                if (colon) {
                    // JSON key
                    return `<span class="json-key">${str}</span>${colon}`;
                }
                // JSON string value
                return `<span class="json-string">${str}</span>`;
            }
        )
        .replace(/\b(-?\d+(\.\d+)?([eE][+-]?\d+)?)\b/g, '<span class="json-number">$1</span>')
        .replace(/\b(true|false)\b/g, '<span class="json-bool">$1</span>')
        .replace(/\bnull\b/g, '<span class="json-null">null</span>');
}

/** 查看選單 JSON（從已載入的 currentMenus 中取得） */
window.viewMenuJson = function (richMenuId) {
    const menu = currentMenus.find((m) => m.richMenuId === richMenuId);
    if (!menu) {
        toast('找不到選單資料', 'error');
        return;
    }

    const jsonStr = JSON.stringify(menu, null, 2);

    // 設定標題
    document.getElementById('jsonViewTitle').textContent = `${menu.name} — JSON`;

    // 顯示 meta 資訊
    document.getElementById('jsonViewMeta').textContent =
        `${menu.areas.length} 個區域 ・ ${menu.size.width}×${menu.size.height}`;

    // 語法高亮後填入
    document.querySelector('#jsonViewContent code').innerHTML = highlightJson(jsonStr);

    jsonViewModal.classList.add('open');
};

// 複製 JSON
document.getElementById('btnCopyJson').addEventListener('click', () => {
    const code = document.querySelector('#jsonViewContent code');
    const text = code.textContent;
    navigator.clipboard.writeText(text).then(
        () => toast('JSON 已複製到剪貼簿', 'success'),
        () => toast('複製失敗', 'error')
    );
});

// ============================================================
// 選單視覺化預覽
// ============================================================

const previewModal = document.getElementById('previewModal');

document.getElementById('btnClosePreview').addEventListener('click', () => {
    previewModal.classList.remove('open');
});
document.getElementById('btnClosePreview2').addEventListener('click', () => {
    previewModal.classList.remove('open');
});

/**
 * 取得 action 類型的中文名稱與圖示
 * @param {string} type - action type
 * @returns {{ label: string, icon: string }}
 */
function getActionTypeInfo(type) {
    const map = {
        message: { label: '發送文字', icon: '💬' },
        uri: { label: '開啟連結', icon: '🔗' },
        postback: { label: 'Postback', icon: '📮' },
        richmenuswitch: { label: '換頁選單', icon: '🔄' },
        datetimepicker: { label: '日期選擇', icon: '📅' },
        clipboard: { label: '複製文字', icon: '📋' },
    };
    return map[type] || { label: type, icon: '⚙️' };
}

/**
 * 根據 action 產生詳細資訊的 HTML 列表
 * @param {object} action - Rich Menu area action
 * @returns {string} HTML
 */
function buildActionDetail(action) {
    const rows = [];

    const addRow = (key, value) => {
        if (value === undefined || value === null) return;
        rows.push(`
            <div class="area-detail-row">
                <span class="area-detail-key">${key}</span>
                <span class="area-detail-value">${value}</span>
            </div>`);
    };

    const info = getActionTypeInfo(action.type);
    addRow('類型', `${info.icon} ${info.label}（${action.type}）`);

    if (action.label) addRow('標籤', action.label);

    switch (action.type) {
        case 'message':
            addRow('發送文字', action.text);
            break;
        case 'uri':
            addRow('連結', `<a href="${action.uri}" target="_blank" rel="noopener">${action.uri}</a>`);
            if (action.altUri?.desktop) addRow('桌面版連結', action.altUri.desktop);
            break;
        case 'postback':
            addRow('Data', `<code>${action.data}</code>`);
            if (action.displayText) addRow('顯示文字', action.displayText);
            if (action.text) addRow('發送文字', action.text);
            break;
        case 'richmenuswitch':
            addRow('目標別名', action.richMenuAliasId);
            addRow('聊天列文字', action.data);
            break;
        case 'datetimepicker':
            addRow('Data', action.data);
            addRow('模式', action.mode || 'datetime');
            if (action.initial) addRow('初始值', action.initial);
            if (action.min) addRow('最小值', action.min);
            if (action.max) addRow('最大值', action.max);
            break;
        case 'clipboard':
            addRow('複製內容', action.clipboardText);
            break;
        default:
            // 顯示所有非 type/label 的屬性
            Object.entries(action).forEach(([k, v]) => {
                if (k !== 'type' && k !== 'label') {
                    addRow(k, typeof v === 'object' ? JSON.stringify(v) : v);
                }
            });
    }

    return rows.join('');
}

/**
 * 在預覽圖上渲染區域覆蓋
 * @param {object} menu - Rich Menu 物件
 * @param {HTMLImageElement} imgEl - 已載入的圖片元素
 */
function renderPreviewAreas(menu, imgEl) {
    const overlay = document.getElementById('previewOverlay');
    overlay.innerHTML = '';

    // NOTE: 圖片容器實際寬高（用於將原始座標映射到顯示尺寸）
    const displayW = imgEl.clientWidth;
    const displayH = imgEl.clientHeight;
    const scaleX = displayW / menu.size.width;
    const scaleY = displayH / menu.size.height;

    menu.areas.forEach((area, idx) => {
        const { bounds, action } = area;
        const info = getActionTypeInfo(action.type);

        const el = document.createElement('div');
        el.className = 'preview-area';
        el.dataset.type = action.type;

        // 計算位置與尺寸（百分比定位更穩定）
        el.style.left = `${(bounds.x / menu.size.width) * 100}%`;
        el.style.top = `${(bounds.y / menu.size.height) * 100}%`;
        el.style.width = `${(bounds.width / menu.size.width) * 100}%`;
        el.style.height = `${(bounds.height / menu.size.height) * 100}%`;

        // 標籤內容
        const labelText = action.label || action.text || action.uri || action.richMenuAliasId || action.data || `區域 ${idx + 1}`;
        el.innerHTML = `
            <span class="preview-area-label">${info.icon} ${labelText}</span>
            <span class="preview-area-type">${info.label}</span>`;

        // 點擊顯示詳細資訊
        el.addEventListener('click', () => showAreaDetail(area, idx));

        overlay.appendChild(el);
    });
}

/** 顯示選取區域的詳細 action 資訊 */
function showAreaDetail(area, idx) {
    const detailEl = document.getElementById('areaDetail');
    const { bounds, action } = area;

    document.getElementById('areaDetailTitle').textContent =
        `區域 ${idx + 1}：${action.label || getActionTypeInfo(action.type).label}`;

    let html = buildActionDetail(action);
    html += `
        <div class="area-detail-row">
            <span class="area-detail-key">範圍</span>
            <span class="area-detail-value">x:${bounds.x} y:${bounds.y} w:${bounds.width} h:${bounds.height}</span>
        </div>`;

    document.getElementById('areaDetailBody').innerHTML = html;
    detailEl.style.display = 'block';
}

/** 開啟預覽彈窗 */
window.previewMenu = async function (richMenuId) {
    const menu = currentMenus.find((m) => m.richMenuId === richMenuId);
    if (!menu) {
        toast('找不到選單資料', 'error');
        return;
    }

    // 設定標題與 meta
    document.getElementById('previewTitle').textContent = `${menu.name} — 預覽`;
    document.getElementById('previewMeta').textContent =
        `尺寸 ${menu.size.width}×${menu.size.height} ・ ${menu.areas.length} 個點擊區域 ・ 聊天列文字「${menu.chatBarText}」`;

    // 隱藏前一次的詳細面板
    document.getElementById('areaDetail').style.display = 'none';
    document.getElementById('previewOverlay').innerHTML = '';

    const imgEl = document.getElementById('previewMenuImg');

    // 嘗試載入圖片
    try {
        const res = await fetch(`/api/richmenus/${richMenuId}/image`);
        if (res.ok) {
            const blob = await res.blob();
            imgEl.src = URL.createObjectURL(blob);
        } else {
            // 無圖片時使用灰色佔位
            imgEl.src = `data:image/svg+xml,${encodeURIComponent(
                `<svg xmlns="http://www.w3.org/2000/svg" width="${menu.size.width}" height="${menu.size.height}"><rect fill="%23333" width="100%" height="100%"/><text x="50%" y="50%" fill="%23888" text-anchor="middle" dominant-baseline="central" font-size="48">尚未上傳圖片</text></svg>`
            )}`;
        }
    } catch {
        imgEl.src = `data:image/svg+xml,${encodeURIComponent(
            `<svg xmlns="http://www.w3.org/2000/svg" width="${menu.size.width}" height="${menu.size.height}"><rect fill="%23333" width="100%" height="100%"/><text x="50%" y="50%" fill="%23888" text-anchor="middle" dominant-baseline="central" font-size="48">無法載入圖片</text></svg>`
        )}`;
    }

    // 等圖片載入後渲染覆蓋區域
    imgEl.onload = () => {
        renderPreviewAreas(menu, imgEl);
    };

    previewModal.classList.add('open');
};

// ============================================================
// 初始化
// ============================================================

document.addEventListener('DOMContentLoaded', () => {
    checkTokenStatus();

    // 嘗試載入選單（如果 Token 已設定）
    setTimeout(() => {
        loadMenus().catch(() => { });
    }, 300);
});
