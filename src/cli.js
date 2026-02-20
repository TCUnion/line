#!/usr/bin/env node

/**
 * LINE Rich Menu 管理工具 - CLI 互動式介面
 *
 * 提供終端機操作的選單式管理介面，支援：
 * - Token 設定與驗證
 * - Rich Menu CRUD 操作
 * - 圖片上傳
 * - 使用者綁定管理
 * - 預設選單管理
 * - 別名管理
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import inquirer from 'inquirer';
import { setAccessToken, getAccessToken } from './config.js';
import {
    listRichMenus,
    getRichMenu,
    createRichMenu,
    validateRichMenu,
    deleteRichMenu,
    uploadRichMenuImage,
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
const TEMPLATES_PATH = path.join(__dirname, '..', 'templates', 'rich-menu-templates.json');

// ============================================================
// 輔助函式
// ============================================================

/**
 * 以格式化方式顯示操作結果
 * @param {string} label - 標籤
 * @param {boolean} success - 是否成功
 * @param {string} message - 訊息
 */
function printResult(label, success, message) {
    const icon = success ? '✅' : '❌';
    console.log(`\n${icon} ${label}：${message}`);
}

/**
 * 統一錯誤處理
 * @param {Error} error - 錯誤物件
 */
function handleError(error) {
    if (error instanceof RichMenuApiError) {
        console.error(`\n❌ API 錯誤 (HTTP ${error.statusCode})：${error.message}`);
        if (error.details && Object.keys(error.details).length > 0) {
            console.error('   詳細資訊：', JSON.stringify(error.details, null, 2));
        }
    } else {
        console.error(`\n❌ 非預期錯誤：${error.message}`);
    }
}

/**
 * 載入模板清單
 * @returns {Array} 模板清單
 */
function loadTemplates() {
    const raw = fs.readFileSync(TEMPLATES_PATH, 'utf-8');
    return JSON.parse(raw).templates;
}

// ============================================================
// 功能選項
// ============================================================

/** 設定 Channel Access Token */
async function actionSetToken() {
    const current = getAccessToken();
    if (current && current !== 'your_channel_access_token_here') {
        console.log(`\n目前 Token：${current.substring(0, 20)}...`);
    }

    const { token } = await inquirer.prompt([
        {
            type: 'input',
            name: 'token',
            message: '請輸入 Channel Access Token：',
            validate: (v) => (v.length > 10 ? true : 'Token 長度不正確'),
        },
    ]);

    setAccessToken(token);
    printResult('設定 Token', true, '已成功設定');
}

/** 列出所有 Rich Menu */
async function actionListMenus() {
    try {
        const menus = await listRichMenus();
        if (menus.length === 0) {
            console.log('\n📋 目前沒有任何 Rich Menu。');
            return;
        }

        console.log(`\n📋 共有 ${menus.length} 個 Rich Menu：\n`);
        console.log('─'.repeat(80));
        menus.forEach((menu, idx) => {
            console.log(`  ${idx + 1}. 名稱：${menu.name}`);
            console.log(`     ID：${menu.richMenuId}`);
            console.log(`     尺寸：${menu.size.width} × ${menu.size.height}`);
            console.log(`     區域數：${menu.areas.length}`);
            console.log(`     聊天列文字：${menu.chatBarText}`);
            console.log(`     預設開啟：${menu.selected ? '是' : '否'}`);
            console.log('─'.repeat(80));
        });
    } catch (error) {
        handleError(error);
    }
}

/** 從模板建立 Rich Menu */
async function actionCreateFromTemplate() {
    try {
        const templates = loadTemplates();
        // 排除 multi-page 類型（需要特殊處理）
        const singleTemplates = templates.filter((t) => t.data);

        const { templateId } = await inquirer.prompt([
            {
                type: 'list',
                name: 'templateId',
                message: '請選擇 Rich Menu 模板：',
                choices: singleTemplates.map((t) => ({
                    name: `${t.name} - ${t.description}`,
                    value: t.id,
                })),
            },
        ]);

        const template = singleTemplates.find((t) => t.id === templateId);
        const menuData = JSON.parse(JSON.stringify(template.data));

        // 自訂名稱
        const { customName, chatBarText } = await inquirer.prompt([
            {
                type: 'input',
                name: 'customName',
                message: '選單名稱（用於管理識別）：',
                default: menuData.name,
            },
            {
                type: 'input',
                name: 'chatBarText',
                message: '聊天列顯示文字：',
                default: menuData.chatBarText,
            },
        ]);

        menuData.name = customName;
        menuData.chatBarText = chatBarText;

        // 預覽 JSON
        console.log('\n📄 即將建立的 Rich Menu JSON：');
        console.log(JSON.stringify(menuData, null, 2));

        const { confirm } = await inquirer.prompt([
            { type: 'confirm', name: 'confirm', message: '確認建立？', default: true },
        ]);

        if (!confirm) {
            console.log('已取消。');
            return;
        }

        const result = await createRichMenu(menuData);
        printResult('建立 Rich Menu', true, `ID：${result.richMenuId}`);
    } catch (error) {
        handleError(error);
    }
}

/** 從自訂 JSON 建立 Rich Menu */
async function actionCreateFromJson() {
    try {
        const { jsonPath } = await inquirer.prompt([
            {
                type: 'input',
                name: 'jsonPath',
                message: '請輸入 Rich Menu JSON 檔案路徑：',
                validate: (v) => {
                    const p = path.resolve(v);
                    return fs.existsSync(p) ? true : `找不到檔案：${p}`;
                },
            },
        ]);

        const raw = fs.readFileSync(path.resolve(jsonPath), 'utf-8');
        const menuData = JSON.parse(raw);

        // 先驗證
        console.log('\n🔍 驗證 Rich Menu 物件...');
        await validateRichMenu(menuData);
        console.log('✅ 驗證通過');

        const result = await createRichMenu(menuData);
        printResult('建立 Rich Menu', true, `ID：${result.richMenuId}`);
    } catch (error) {
        handleError(error);
    }
}

/** 上傳 Rich Menu 圖片 */
async function actionUploadImage() {
    try {
        const menus = await listRichMenus();
        if (menus.length === 0) {
            console.log('\n⚠️ 沒有任何 Rich Menu，請先建立。');
            return;
        }

        const { richMenuId } = await inquirer.prompt([
            {
                type: 'list',
                name: 'richMenuId',
                message: '請選擇要上傳圖片的 Rich Menu：',
                choices: menus.map((m) => ({
                    name: `${m.name} (${m.size.width}×${m.size.height})`,
                    value: m.richMenuId,
                })),
            },
        ]);

        const { imagePath } = await inquirer.prompt([
            {
                type: 'input',
                name: 'imagePath',
                message: '請輸入圖片檔案路徑（PNG 或 JPEG）：',
                validate: (v) => {
                    const p = path.resolve(v);
                    if (!fs.existsSync(p)) return `找不到檔案：${p}`;
                    const ext = path.extname(p).toLowerCase();
                    if (!['.png', '.jpg', '.jpeg'].includes(ext)) return '僅支援 PNG 或 JPEG 格式';
                    return true;
                },
            },
        ]);

        console.log('\n📤 正在上傳圖片...');
        await uploadRichMenuImage(richMenuId, path.resolve(imagePath));
        printResult('上傳圖片', true, '圖片已成功上傳並附加至選單');
    } catch (error) {
        handleError(error);
    }
}

/** 設定預設 Rich Menu */
async function actionSetDefault() {
    try {
        // 顯示目前預設
        try {
            const current = await getDefaultRichMenu();
            console.log(`\n目前預設選單 ID：${current.richMenuId}`);
        } catch {
            console.log('\n目前尚未設定預設選單。');
        }

        const menus = await listRichMenus();
        if (menus.length === 0) {
            console.log('⚠️ 沒有任何 Rich Menu，請先建立。');
            return;
        }

        const { action } = await inquirer.prompt([
            {
                type: 'list',
                name: 'action',
                message: '請選擇操作：',
                choices: [
                    { name: '設定新的預設選單', value: 'set' },
                    { name: '取消目前預設選單', value: 'cancel' },
                    { name: '返回', value: 'back' },
                ],
            },
        ]);

        if (action === 'back') return;

        if (action === 'cancel') {
            await cancelDefaultRichMenu();
            printResult('取消預設選單', true, '已成功取消');
            return;
        }

        const { richMenuId } = await inquirer.prompt([
            {
                type: 'list',
                name: 'richMenuId',
                message: '請選擇要設為預設的 Rich Menu：',
                choices: menus.map((m) => ({
                    name: `${m.name} (${m.size.width}×${m.size.height})`,
                    value: m.richMenuId,
                })),
            },
        ]);

        await setDefaultRichMenu(richMenuId);
        printResult('設定預設選單', true, '已成功設定');
    } catch (error) {
        handleError(error);
    }
}

/** 使用者綁定管理 */
async function actionUserBinding() {
    try {
        const { action } = await inquirer.prompt([
            {
                type: 'list',
                name: 'action',
                message: '請選擇使用者綁定操作：',
                choices: [
                    { name: '綁定選單到使用者', value: 'link' },
                    { name: '解除使用者綁定', value: 'unlink' },
                    { name: '查詢使用者目前選單', value: 'query' },
                    { name: '返回', value: 'back' },
                ],
            },
        ]);

        if (action === 'back') return;

        const { userId } = await inquirer.prompt([
            {
                type: 'input',
                name: 'userId',
                message: '請輸入 LINE 使用者 ID（U 開頭的 33 碼字串）：',
                validate: (v) => (v.startsWith('U') && v.length === 33 ? true : '使用者 ID 格式不正確'),
            },
        ]);

        if (action === 'query') {
            const result = await getUserRichMenu(userId);
            printResult('查詢使用者選單', true, `綁定的選單 ID：${result.richMenuId}`);
            return;
        }

        if (action === 'unlink') {
            await unlinkRichMenuFromUser(userId);
            printResult('解除綁定', true, '已成功解除使用者的選單綁定');
            return;
        }

        // 綁定操作
        const menus = await listRichMenus();
        if (menus.length === 0) {
            console.log('⚠️ 沒有任何 Rich Menu，請先建立。');
            return;
        }

        const { richMenuId } = await inquirer.prompt([
            {
                type: 'list',
                name: 'richMenuId',
                message: '請選擇要綁定的 Rich Menu：',
                choices: menus.map((m) => ({
                    name: `${m.name} (${m.size.width}×${m.size.height})`,
                    value: m.richMenuId,
                })),
            },
        ]);

        await linkRichMenuToUser(userId, richMenuId);
        printResult('綁定選單', true, '已成功將選單綁定到使用者');
    } catch (error) {
        handleError(error);
    }
}

/** 刪除 Rich Menu */
async function actionDeleteMenu() {
    try {
        const menus = await listRichMenus();
        if (menus.length === 0) {
            console.log('\n⚠️ 沒有任何 Rich Menu 可刪除。');
            return;
        }

        const { richMenuId } = await inquirer.prompt([
            {
                type: 'list',
                name: 'richMenuId',
                message: '請選擇要刪除的 Rich Menu：',
                choices: menus.map((m) => ({
                    name: `${m.name} — ${m.richMenuId}`,
                    value: m.richMenuId,
                })),
            },
        ]);

        const { confirm } = await inquirer.prompt([
            { type: 'confirm', name: 'confirm', message: '確認刪除？此操作無法復原。', default: false },
        ]);

        if (!confirm) {
            console.log('已取消。');
            return;
        }

        await deleteRichMenu(richMenuId);
        printResult('刪除 Rich Menu', true, '已成功刪除');
    } catch (error) {
        handleError(error);
    }
}

/** 管理 Rich Menu 別名 */
async function actionManageAliases() {
    try {
        const { action } = await inquirer.prompt([
            {
                type: 'list',
                name: 'action',
                message: '請選擇別名管理操作：',
                choices: [
                    { name: '列出所有別名', value: 'list' },
                    { name: '建立新別名', value: 'create' },
                    { name: '刪除別名', value: 'delete' },
                    { name: '返回', value: 'back' },
                ],
            },
        ]);

        if (action === 'back') return;

        if (action === 'list') {
            const aliases = await listRichMenuAliases();
            if (aliases.length === 0) {
                console.log('\n📋 目前沒有任何別名。');
                return;
            }
            console.log(`\n📋 共有 ${aliases.length} 個別名：`);
            aliases.forEach((a) => {
                console.log(`  → ${a.richMenuAliasId} ➜ ${a.richMenuId}`);
            });
            return;
        }

        if (action === 'create') {
            const menus = await listRichMenus();
            if (menus.length === 0) {
                console.log('⚠️ 沒有任何 Rich Menu，請先建立。');
                return;
            }

            const { aliasId, richMenuId } = await inquirer.prompt([
                {
                    type: 'input',
                    name: 'aliasId',
                    message: '請輸入別名 ID（例如 richmenu-alias-page-a）：',
                    validate: (v) => (v.length >= 1 ? true : '別名 ID 不可為空'),
                },
                {
                    type: 'list',
                    name: 'richMenuId',
                    message: '請選擇要對應的 Rich Menu：',
                    choices: menus.map((m) => ({
                        name: `${m.name} — ${m.richMenuId}`,
                        value: m.richMenuId,
                    })),
                },
            ]);

            await createRichMenuAlias(aliasId, richMenuId);
            printResult('建立別名', true, `${aliasId} ➜ ${richMenuId}`);
            return;
        }

        if (action === 'delete') {
            const aliases = await listRichMenuAliases();
            if (aliases.length === 0) {
                console.log('⚠️ 沒有任何可刪除的別名。');
                return;
            }

            const { aliasId } = await inquirer.prompt([
                {
                    type: 'list',
                    name: 'aliasId',
                    message: '請選擇要刪除的別名：',
                    choices: aliases.map((a) => ({
                        name: `${a.richMenuAliasId} ➜ ${a.richMenuId}`,
                        value: a.richMenuAliasId,
                    })),
                },
            ]);

            await deleteRichMenuAlias(aliasId);
            printResult('刪除別名', true, '已成功刪除');
        }
    } catch (error) {
        handleError(error);
    }
}

// ============================================================
// 主選單迴圈
// ============================================================

async function mainMenu() {
    console.log('\n╔══════════════════════════════════════════╗');
    console.log('║    LINE Rich Menu 管理工具 v1.0.0       ║');
    console.log('╚══════════════════════════════════════════╝\n');

    // 檢查 Token
    const token = getAccessToken();
    if (!token || token === 'your_channel_access_token_here') {
        console.log('⚠️ 尚未設定 Channel Access Token。\n');
        await actionSetToken();
    }

    // 主選單迴圈
    let running = true;
    while (running) {
        const { action } = await inquirer.prompt([
            {
                type: 'list',
                name: 'action',
                message: '請選擇操作：',
                choices: [
                    new inquirer.Separator('── 選單管理 ──'),
                    { name: '📋 列出所有 Rich Menu', value: 'list' },
                    { name: '➕ 從模板建立 Rich Menu', value: 'createTemplate' },
                    { name: '📝 從 JSON 檔案建立 Rich Menu', value: 'createJson' },
                    { name: '🗑️  刪除 Rich Menu', value: 'delete' },
                    new inquirer.Separator('── 圖片與設定 ──'),
                    { name: '🖼️  上傳選單圖片', value: 'upload' },
                    { name: '⭐ 設定預設選單', value: 'default' },
                    new inquirer.Separator('── 使用者與別名 ──'),
                    { name: '👤 使用者綁定管理', value: 'user' },
                    { name: '🔗 Rich Menu 別名管理', value: 'alias' },
                    new inquirer.Separator('── 系統 ──'),
                    { name: '🔑 重新設定 Token', value: 'token' },
                    { name: '🚪 離開', value: 'exit' },
                ],
            },
        ]);

        const actions = {
            list: actionListMenus,
            createTemplate: actionCreateFromTemplate,
            createJson: actionCreateFromJson,
            delete: actionDeleteMenu,
            upload: actionUploadImage,
            default: actionSetDefault,
            user: actionUserBinding,
            alias: actionManageAliases,
            token: actionSetToken,
            exit: () => {
                running = false;
                console.log('\n👋 再見！');
            },
        };

        const handler = actions[action];
        if (handler) await handler();
    }
}

// 啟動 CLI
mainMenu().catch((err) => {
    console.error('CLI 啟動失敗：', err);
    process.exit(1);
});
