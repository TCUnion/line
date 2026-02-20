/**
 * LINE Rich Menu API 封裝模組
 *
 * 提供所有 Rich Menu 相關操作的統一介面，包含：
 * - 選單 CRUD（建立、查詢、刪除）
 * - 圖片上傳
 * - 使用者綁定管理
 * - 預設選單管理
 * - Rich Menu 別名管理
 * - 選單物件驗證
 *
 * 所有方法皆包含完整錯誤處理與自動重試機制。
 */

import fs from 'node:fs';
import path from 'node:path';
import config, { getAccessToken } from './config.js';

// NOTE: 統一錯誤格式，方便上層處理
class RichMenuApiError extends Error {
    /**
     * @param {string} message - 錯誤訊息
     * @param {number} statusCode - HTTP 狀態碼
     * @param {object} details - LINE API 回傳的錯誤詳情
     */
    constructor(message, statusCode, details = {}) {
        super(message);
        this.name = 'RichMenuApiError';
        this.statusCode = statusCode;
        this.details = details;
    }
}

/**
 * 驗證 Token 是否已設定
 * @throws {RichMenuApiError} 若 Token 未設定
 */
function ensureToken() {
    const token = getAccessToken();
    if (!token || token === 'your_channel_access_token_here') {
        throw new RichMenuApiError(
            '尚未設定 Channel Access Token。請先透過環境變數或 setAccessToken() 設定。',
            401
        );
    }
    return token;
}

/**
 * 根據回應狀態碼產生對應的繁體中文錯誤訊息
 * @param {number} status - HTTP 狀態碼
 * @param {object} body - 回應內容
 * @returns {string} 錯誤訊息
 */
function getErrorMessage(status, body) {
    const detail = body?.message || body?.error?.message || JSON.stringify(body);
    const messages = {
        400: `請求參數錯誤：${detail}`,
        401: 'Channel Access Token 無效或已過期，請重新取得。',
        403: '權限不足，請確認 Token 的權限設定。',
        404: '找不到指定的資源（Rich Menu 或使用者）。',
        409: '資源衝突，可能已存在相同的別名。',
        429: 'API 呼叫頻率超限，請稍後再試。',
    };
    return messages[status] || `API 呼叫失敗 (HTTP ${status})：${detail}`;
}

/**
 * 延遲指定時間
 * @param {number} ms - 毫秒數
 * @returns {Promise<void>}
 */
function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 帶重試機制的 HTTP 請求
 *
 * 僅在 429（速率限制）的情況下自動重試，
 * 使用指數退避策略避免持續觸及速率限制。
 *
 * @param {string} url - 請求 URL
 * @param {object} options - fetch 選項
 * @param {number} retryCount - 目前重試次數
 * @returns {Promise<Response>}
 */
async function fetchWithRetry(url, options, retryCount = 0) {
    const response = await fetch(url, options);

    if (response.status === 429 && retryCount < config.MAX_RETRIES) {
        // HACK: LINE API 沒有提供 Retry-After 標頭，使用指數退避替代
        const waitTime = config.RETRY_BASE_DELAY_MS * Math.pow(2, retryCount);
        console.warn(`⚠️ API 速率限制，${waitTime / 1000} 秒後重試（第 ${retryCount + 1} 次）...`);
        await delay(waitTime);
        return fetchWithRetry(url, options, retryCount + 1);
    }

    return response;
}

/**
 * 通用 API 呼叫方法
 * @param {string} endpoint - API 端點路徑
 * @param {object} options - 額外的 fetch 選項
 * @param {string} baseUrl - Base URL（預設為一般 API）
 * @returns {Promise<object|null>} 回應 JSON 或 null（204 / 空回應）
 */
async function apiCall(endpoint, options = {}, baseUrl = config.API_BASE_URL) {
    const token = ensureToken();
    const url = `${baseUrl}${endpoint}`;

    const defaultHeaders = {
        Authorization: `Bearer ${token}`,
    };

    const mergedOptions = {
        ...options,
        headers: {
            ...defaultHeaders,
            ...options.headers,
        },
    };

    const response = await fetchWithRetry(url, mergedOptions);

    // 204 No Content 或空回應代表操作成功但無回傳內容
    if (response.status === 204) {
        return { success: true };
    }

    const contentType = response.headers.get('content-type') || '';

    // 成功回應
    if (response.ok) {
        if (contentType.includes('application/json')) {
            const data = await response.json();
            return data;
        }
        // 某些成功回應僅回傳 {}
        const text = await response.text();
        if (text === '{}' || text === '') {
            return { success: true };
        }
        try {
            return JSON.parse(text);
        } catch {
            return { success: true, raw: text };
        }
    }

    // 錯誤回應
    let errorBody = {};
    try {
        errorBody = await response.json();
    } catch {
        errorBody = { message: await response.text().catch(() => '無法解析錯誤內容') };
    }

    throw new RichMenuApiError(
        getErrorMessage(response.status, errorBody),
        response.status,
        errorBody
    );
}

// ============================================================
// Rich Menu CRUD 操作
// ============================================================

/**
 * 列出所有 Rich Menu
 * @returns {Promise<Array>} Rich Menu 清單
 */
export async function listRichMenus() {
    const result = await apiCall('/v2/bot/richmenu/list');
    return result.richmenus || [];
}

/**
 * 取得單一 Rich Menu 資訊
 * @param {string} richMenuId - Rich Menu ID
 * @returns {Promise<object>} Rich Menu 物件
 */
export async function getRichMenu(richMenuId) {
    return apiCall(`/v2/bot/richmenu/${richMenuId}`);
}

/**
 * 建立 Rich Menu
 *
 * Rich Menu 物件必須包含：size、selected、name、chatBarText、areas。
 * 建立成功後回傳 richMenuId。
 *
 * @param {object} richMenuData - 符合 LINE 規範的 Rich Menu 物件
 * @returns {Promise<object>} 包含 richMenuId 的回應
 */
export async function createRichMenu(richMenuData) {
    return apiCall('/v2/bot/richmenu', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(richMenuData),
    });
}

/**
 * 驗證 Rich Menu 物件是否符合規範
 * @param {object} richMenuData - Rich Menu 物件
 * @returns {Promise<object>} 驗證結果
 */
export async function validateRichMenu(richMenuData) {
    return apiCall('/v2/bot/richmenu/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(richMenuData),
    });
}

/**
 * 刪除 Rich Menu
 * @param {string} richMenuId - Rich Menu ID
 * @returns {Promise<object>} 操作結果
 */
export async function deleteRichMenu(richMenuId) {
    return apiCall(`/v2/bot/richmenu/${richMenuId}`, {
        method: 'DELETE',
    });
}

// ============================================================
// 圖片操作
// ============================================================

/**
 * 上傳 Rich Menu 背景圖片
 *
 * NOTE: 圖片上傳使用不同的 Base URL (api-data.line.me)
 * 支援 PNG 與 JPEG 格式，檔案大小上限 1MB。
 *
 * @param {string} richMenuId - Rich Menu ID
 * @param {string|Buffer} imageInput - 圖片檔案路徑或 Buffer
 * @param {string} contentType - MIME 類型（預設 image/png）
 * @returns {Promise<object>} 操作結果
 */
export async function uploadRichMenuImage(richMenuId, imageInput, contentType = 'image/png') {
    let imageBuffer;

    if (Buffer.isBuffer(imageInput)) {
        imageBuffer = imageInput;
    } else if (typeof imageInput === 'string') {
        // 檔案路徑
        const absolutePath = path.resolve(imageInput);
        if (!fs.existsSync(absolutePath)) {
            throw new RichMenuApiError(`找不到圖片檔案：${absolutePath}`, 400);
        }
        imageBuffer = fs.readFileSync(absolutePath);

        // 自動偵測 MIME 類型
        const ext = path.extname(absolutePath).toLowerCase();
        if (ext === '.jpg' || ext === '.jpeg') {
            contentType = 'image/jpeg';
        } else if (ext === '.png') {
            contentType = 'image/png';
        }
    } else {
        throw new RichMenuApiError('imageInput 必須為檔案路徑（string）或 Buffer', 400);
    }

    // 檢查檔案大小（LINE 限制 1MB）
    if (imageBuffer.length > 1024 * 1024) {
        throw new RichMenuApiError(
            `圖片檔案大小超過 1MB 限制（目前 ${(imageBuffer.length / 1024 / 1024).toFixed(2)} MB）`,
            400
        );
    }

    return apiCall(
        `/v2/bot/richmenu/${richMenuId}/content`,
        {
            method: 'POST',
            headers: { 'Content-Type': contentType },
            body: imageBuffer,
        },
        config.DATA_API_BASE_URL
    );
}

/**
 * 下載 Rich Menu 圖片
 * @param {string} richMenuId - Rich Menu ID
 * @returns {Promise<Buffer>} 圖片 Buffer
 */
export async function downloadRichMenuImage(richMenuId) {
    const token = ensureToken();
    const url = `${config.DATA_API_BASE_URL}/v2/bot/richmenu/${richMenuId}/content`;

    const response = await fetchWithRetry(url, {
        headers: { Authorization: `Bearer ${token}` },
    });

    if (!response.ok) {
        throw new RichMenuApiError(`無法下載圖片（HTTP ${response.status}）`, response.status);
    }

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
}

// ============================================================
// 預設選單管理
// ============================================================

/**
 * 設定預設 Rich Menu（所有好友皆顯示）
 * @param {string} richMenuId - Rich Menu ID
 * @returns {Promise<object>} 操作結果
 */
export async function setDefaultRichMenu(richMenuId) {
    return apiCall(`/v2/bot/user/all/richmenu/${richMenuId}`, {
        method: 'POST',
    });
}

/**
 * 取得目前預設 Rich Menu
 * @returns {Promise<object>} 包含 richMenuId 的回應
 */
export async function getDefaultRichMenu() {
    return apiCall('/v2/bot/user/all/richmenu');
}

/**
 * 取消預設 Rich Menu
 * @returns {Promise<object>} 操作結果
 */
export async function cancelDefaultRichMenu() {
    return apiCall('/v2/bot/user/all/richmenu', {
        method: 'DELETE',
    });
}

// ============================================================
// 使用者綁定管理
// ============================================================

/**
 * 將 Rich Menu 綁定到特定使用者
 * @param {string} userId - LINE 使用者 ID
 * @param {string} richMenuId - Rich Menu ID
 * @returns {Promise<object>} 操作結果
 */
export async function linkRichMenuToUser(userId, richMenuId) {
    return apiCall(`/v2/bot/user/${userId}/richmenu/${richMenuId}`, {
        method: 'POST',
    });
}

/**
 * 解除使用者的 Rich Menu 綁定
 * @param {string} userId - LINE 使用者 ID
 * @returns {Promise<object>} 操作結果
 */
export async function unlinkRichMenuFromUser(userId) {
    return apiCall(`/v2/bot/user/${userId}/richmenu`, {
        method: 'DELETE',
    });
}

/**
 * 查詢使用者目前綁定的 Rich Menu
 * @param {string} userId - LINE 使用者 ID
 * @returns {Promise<object>} 包含 richMenuId 的回應
 */
export async function getUserRichMenu(userId) {
    return apiCall(`/v2/bot/user/${userId}/richmenu`);
}

/**
 * 批量綁定 Rich Menu 給多個使用者
 * @param {string} richMenuId - Rich Menu ID
 * @param {string[]} userIds - 使用者 ID 陣列（最多 500 個）
 * @returns {Promise<object>} 操作結果
 */
export async function bulkLinkRichMenu(richMenuId, userIds) {
    if (userIds.length > 500) {
        throw new RichMenuApiError('批量綁定上限為 500 個使用者', 400);
    }

    return apiCall('/v2/bot/richmenu/bulk/link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ richMenuId, userIds }),
    });
}

/**
 * 批量解除多個使用者的 Rich Menu 綁定
 * @param {string[]} userIds - 使用者 ID 陣列（最多 500 個）
 * @returns {Promise<object>} 操作結果
 */
export async function bulkUnlinkRichMenu(userIds) {
    if (userIds.length > 500) {
        throw new RichMenuApiError('批量解除綁定上限為 500 個使用者', 400);
    }

    return apiCall('/v2/bot/richmenu/bulk/unlink', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userIds }),
    });
}

// ============================================================
// Rich Menu 別名管理（多層選單換頁功能）
// ============================================================

/**
 * 建立 Rich Menu 別名
 *
 * 別名可搭配 richmenuswitch action 實現多層選單換頁。
 *
 * @param {string} richMenuAliasId - 別名 ID（自訂字串）
 * @param {string} richMenuId - Rich Menu ID
 * @returns {Promise<object>} 操作結果
 */
export async function createRichMenuAlias(richMenuAliasId, richMenuId) {
    return apiCall('/v2/bot/richmenu/alias', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ richMenuAliasId, richMenuId }),
    });
}

/**
 * 更新 Rich Menu 別名對應的 Rich Menu
 * @param {string} richMenuAliasId - 別名 ID
 * @param {string} richMenuId - 新的 Rich Menu ID
 * @returns {Promise<object>} 操作結果
 */
export async function updateRichMenuAlias(richMenuAliasId, richMenuId) {
    return apiCall(`/v2/bot/richmenu/alias/${richMenuAliasId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ richMenuId }),
    });
}

/**
 * 取得 Rich Menu 別名資訊
 * @param {string} richMenuAliasId - 別名 ID
 * @returns {Promise<object>} 別名資訊
 */
export async function getRichMenuAlias(richMenuAliasId) {
    return apiCall(`/v2/bot/richmenu/alias/${richMenuAliasId}`);
}

/**
 * 刪除 Rich Menu 別名
 * @param {string} richMenuAliasId - 別名 ID
 * @returns {Promise<object>} 操作結果
 */
export async function deleteRichMenuAlias(richMenuAliasId) {
    return apiCall(`/v2/bot/richmenu/alias/${richMenuAliasId}`, {
        method: 'DELETE',
    });
}

/**
 * 列出所有 Rich Menu 別名
 * @returns {Promise<Array>} 別名清單
 */
export async function listRichMenuAliases() {
    const result = await apiCall('/v2/bot/richmenu/alias/list');
    return result.aliases || [];
}

// 匯出錯誤類別供外部使用
export { RichMenuApiError };
