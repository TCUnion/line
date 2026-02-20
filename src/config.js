/**
 * LINE Rich Menu 管理工具 - 環境設定
 *
 * 集中管理 API 端點與 Token 設定。
 * Token 優先從環境變數讀取，也支援執行期動態設定。
 */

import 'dotenv/config';

// NOTE: LINE API 有兩個不同的 Base URL，一般操作與資料操作（圖片上傳）分開
const config = {
  /** 一般 API Base URL（建立、查詢、刪除等操作） */
  API_BASE_URL: 'https://api.line.me',

  /** 資料 API Base URL（圖片上傳專用） */
  DATA_API_BASE_URL: 'https://api-data.line.me',

  /** Channel Access Token，從環境變數讀取 */
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN || '',

  /** 伺服器埠號 */
  port: parseInt(process.env.PORT, 10) || 3000,

  /** Rich Menu 圖片允許的尺寸 */
  ALLOWED_SIZES: [
    { width: 2500, height: 1686 },
    { width: 2500, height: 843 },
    { width: 1200, height: 810 },
    { width: 1200, height: 405 },
    { width: 800, height: 540 },
    { width: 800, height: 270 },
  ],

  /** Rich Menu 圖片允許的 MIME 類型 */
  ALLOWED_IMAGE_TYPES: ['image/png', 'image/jpeg'],

  /** API 呼叫最大重試次數（429 速率限制時） */
  MAX_RETRIES: 3,

  /** 重試間隔基數（毫秒），實際間隔 = 基數 × 2^重試次數 */
  RETRY_BASE_DELAY_MS: 1000,
};

/**
 * 動態設定 Channel Access Token
 * @param {string} token - LINE Channel Access Token
 */
export function setAccessToken(token) {
  config.channelAccessToken = token;
}

/**
 * 取得當前 Channel Access Token
 * @returns {string} 目前設定的 Token
 */
export function getAccessToken() {
  return config.channelAccessToken;
}

export default config;
