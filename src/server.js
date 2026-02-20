/**
 * LINE Rich Menu 管理工具 - Web UI 後端伺服器
 *
 * 提供 REST API 供前端 Web UI 呼叫，
 * 同時兼任靜態檔案伺服器。
 */

import express from 'express';
import multer from 'multer';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import config, { setAccessToken, getAccessToken } from './config.js';
import {
    listRichMenus,
    getRichMenu,
    createRichMenu,
    validateRichMenu,
    deleteRichMenu,
    uploadRichMenuImage,
    downloadRichMenuImage,
    setDefaultRichMenu,
    getDefaultRichMenu,
    cancelDefaultRichMenu,
    linkRichMenuToUser,
    unlinkRichMenuFromUser,
    getUserRichMenu,
    createRichMenuAlias,
    deleteRichMenuAlias,
    listRichMenuAliases,
    RichMenuApiError,
} from './richMenuClient.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

// ============================================================
// 中介層
// ============================================================

app.use(express.json({ limit: '2mb' }));

// 靜態檔案服務
app.use(express.static(path.join(__dirname, '..', 'public')));

// 圖片上傳暫存（使用 multer，限制 1MB）
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
        const allowed = ['image/png', 'image/jpeg'];
        if (allowed.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('僅支援 PNG 或 JPEG 格式'));
        }
    },
});

// 統一錯誤處理中介層
function asyncHandler(fn) {
    return (req, res, next) => {
        Promise.resolve(fn(req, res, next)).catch(next);
    };
}

// ============================================================
// API 路由 - Token 管理
// ============================================================

/** 設定 Token */
app.post(
    '/api/token',
    asyncHandler(async (req, res) => {
        const { token } = req.body;
        if (!token || token.length < 10) {
            return res.status(400).json({ success: false, error: 'Token 格式不正確' });
        }
        setAccessToken(token);
        res.json({ success: true, message: 'Token 已設定' });
    })
);

/** 檢查 Token 狀態 */
app.get('/api/token/status', (_req, res) => {
    const token = getAccessToken();
    const isSet = token && token !== 'your_channel_access_token_here' && token.length > 10;
    res.json({
        isSet,
        preview: isSet ? `${token.substring(0, 20)}...` : null,
    });
});

// ============================================================
// API 路由 - Rich Menu CRUD
// ============================================================

/** 列出所有 Rich Menu */
app.get(
    '/api/richmenus',
    asyncHandler(async (_req, res) => {
        const menus = await listRichMenus();
        res.json({ success: true, data: menus });
    })
);

/** 取得單一 Rich Menu */
app.get(
    '/api/richmenus/:id',
    asyncHandler(async (req, res) => {
        const menu = await getRichMenu(req.params.id);
        res.json({ success: true, data: menu });
    })
);

/** 建立 Rich Menu */
app.post(
    '/api/richmenus',
    asyncHandler(async (req, res) => {
        const result = await createRichMenu(req.body);
        res.status(201).json({ success: true, data: result });
    })
);

/** 驗證 Rich Menu */
app.post(
    '/api/richmenus/validate',
    asyncHandler(async (req, res) => {
        await validateRichMenu(req.body);
        res.json({ success: true, message: '驗證通過' });
    })
);

/** 刪除 Rich Menu */
app.delete(
    '/api/richmenus/:id',
    asyncHandler(async (req, res) => {
        await deleteRichMenu(req.params.id);
        res.json({ success: true, message: '已刪除' });
    })
);

// ============================================================
// API 路由 - 圖片操作
// ============================================================

/** 上傳 Rich Menu 圖片 */
app.post(
    '/api/richmenus/:id/image',
    upload.single('image'),
    asyncHandler(async (req, res) => {
        if (!req.file) {
            return res.status(400).json({ success: false, error: '未提供圖片檔案' });
        }
        await uploadRichMenuImage(req.params.id, req.file.buffer, req.file.mimetype);
        res.json({ success: true, message: '圖片已上傳' });
    })
);

/** 下載 Rich Menu 圖片（用於預覽） */
app.get(
    '/api/richmenus/:id/image',
    asyncHandler(async (req, res) => {
        const imageBuffer = await downloadRichMenuImage(req.params.id);
        res.set('Content-Type', 'image/png');
        res.send(imageBuffer);
    })
);

// ============================================================
// API 路由 - 預設選單
// ============================================================

/** 取得預設選單 */
app.get(
    '/api/default-richmenu',
    asyncHandler(async (_req, res) => {
        try {
            const result = await getDefaultRichMenu();
            res.json({ success: true, data: result });
        } catch (err) {
            // 404 表示尚未設定，不算錯誤
            if (err.statusCode === 404) {
                return res.json({ success: true, data: null });
            }
            throw err;
        }
    })
);

/** 設定預設選單 */
app.post(
    '/api/default-richmenu/:id',
    asyncHandler(async (req, res) => {
        await setDefaultRichMenu(req.params.id);
        res.json({ success: true, message: '已設定預設選單' });
    })
);

/** 取消預設選單 */
app.delete(
    '/api/default-richmenu',
    asyncHandler(async (_req, res) => {
        await cancelDefaultRichMenu();
        res.json({ success: true, message: '已取消預設選單' });
    })
);

// ============================================================
// API 路由 - 使用者綁定
// ============================================================

/** 綁定選單到使用者 */
app.post(
    '/api/users/:userId/richmenu/:richMenuId',
    asyncHandler(async (req, res) => {
        await linkRichMenuToUser(req.params.userId, req.params.richMenuId);
        res.json({ success: true, message: '已綁定' });
    })
);

/** 解除使用者綁定 */
app.delete(
    '/api/users/:userId/richmenu',
    asyncHandler(async (req, res) => {
        await unlinkRichMenuFromUser(req.params.userId);
        res.json({ success: true, message: '已解除綁定' });
    })
);

/** 查詢使用者選單 */
app.get(
    '/api/users/:userId/richmenu',
    asyncHandler(async (req, res) => {
        try {
            const result = await getUserRichMenu(req.params.userId);
            res.json({ success: true, data: result });
        } catch (err) {
            if (err.statusCode === 404) {
                return res.json({ success: true, data: null });
            }
            throw err;
        }
    })
);

// ============================================================
// API 路由 - 別名管理
// ============================================================

/** 列出所有別名 */
app.get(
    '/api/aliases',
    asyncHandler(async (_req, res) => {
        const aliases = await listRichMenuAliases();
        res.json({ success: true, data: aliases });
    })
);

/** 建立別名 */
app.post(
    '/api/aliases',
    asyncHandler(async (req, res) => {
        const { richMenuAliasId, richMenuId } = req.body;
        await createRichMenuAlias(richMenuAliasId, richMenuId);
        res.status(201).json({ success: true, message: '別名已建立' });
    })
);

/** 刪除別名 */
app.delete(
    '/api/aliases/:aliasId',
    asyncHandler(async (req, res) => {
        await deleteRichMenuAlias(req.params.aliasId);
        res.json({ success: true, message: '別名已刪除' });
    })
);

// ============================================================
// API 路由 - 模板
// ============================================================

/** 取得所有模板 */
app.get('/api/templates', (_req, res) => {
    const templatesPath = path.join(__dirname, '..', 'templates', 'rich-menu-templates.json');
    const raw = fs.readFileSync(templatesPath, 'utf-8');
    const templates = JSON.parse(raw);
    res.json({ success: true, data: templates.templates });
});

// ============================================================
// 全域錯誤處理
// ============================================================

// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
    if (err instanceof RichMenuApiError) {
        return res.status(err.statusCode || 500).json({
            success: false,
            error: {
                code: err.statusCode,
                message: err.message,
                details: err.details,
            },
        });
    }

    // multer 錯誤
    if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({
            success: false,
            error: { message: '圖片檔案超過 1MB 限制' },
        });
    }

    console.error('未預期錯誤：', err);
    res.status(500).json({
        success: false,
        error: { message: err.message || '伺服器內部錯誤' },
    });
});

// ============================================================
// 啟動伺服器
// ============================================================

app.listen(config.port, () => {
    console.log('');
    console.log('╔══════════════════════════════════════════╗');
    console.log('║    LINE Rich Menu 管理工具 — Web UI     ║');
    console.log('╚══════════════════════════════════════════╝');
    console.log('');
    console.log(`   🌐 開啟瀏覽器：http://localhost:${config.port}`);
    console.log(`   📋 API 文件：  http://localhost:${config.port}/api/richmenus`);
    console.log('');
});

export default app;
