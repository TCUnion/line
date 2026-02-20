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
            <button class="btn btn-sm btn-secondary" onclick="openUploadModal('${menu.richMenuId}', '${menu.name}')">🖼️ 上傳圖片</button>
            <button class="btn btn-sm btn-secondary" onclick="setAsDefault('${menu.richMenuId}')">⭐ 設為預設</button>
            <button class="btn btn-sm btn-danger" onclick="deleteMenu('${menu.richMenuId}')">🗑️ 刪除</button>
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

// NOTE: 全域函式供 onclick 使用
window.createFromTemplate = async function (templateId) {
    try {
        const { data: templates } = await api('/api/templates');
        const template = templates.find((t) => t.id === templateId);
        if (!template || !template.data) return;

        const menuData = JSON.parse(JSON.stringify(template.data));

        const name = prompt('選單名稱（用於管理識別）：', menuData.name);
        if (!name) return;
        menuData.name = name;

        const chatBarText = prompt('聊天列顯示文字：', menuData.chatBarText);
        if (chatBarText) menuData.chatBarText = chatBarText;

        const { data: result } = await api('/api/richmenus', {
            method: 'POST',
            body: JSON.stringify(menuData),
        });

        toast(`選單已建立！ID：${result.richMenuId}`, 'success');
        // 切換到選單管理頁並載入
        document.querySelector('[data-section="menus"]').click();
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
// 初始化
// ============================================================

document.addEventListener('DOMContentLoaded', () => {
    checkTokenStatus();

    // 嘗試載入選單（如果 Token 已設定）
    setTimeout(() => {
        loadMenus().catch(() => { });
    }, 300);
});
