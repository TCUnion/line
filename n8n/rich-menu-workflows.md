# n8n HTTP Request Node 設定 — LINE Rich Menu 管理

> 以下提供 n8n 中使用 HTTP Request Node 操作 LINE Rich Menu API 的完整設定參數。

## 前置準備

在 n8n 中建立一個 **Header Auth** 類型的 Credential：

| 欄位 | 值 |
|------|------|
| Name | `LINE-Bot-Auth` |
| Header Name | `Authorization` |
| Header Value | `Bearer YOUR_CHANNEL_ACCESS_TOKEN` |

後續所有節點的 Authentication 設定皆選擇此 Credential。

---

## 1. 列出所有 Rich Menu

**節點名稱建議**：`取得所有圖文選單`

| 設定項目 | 值 |
|----------|------|
| Method | `GET` |
| URL | `https://api.line.me/v2/bot/richmenu/list` |
| Authentication | Header Auth → `LINE-Bot-Auth` |
| Response Format | JSON |

**回應範例**：
```json
{
  "richmenus": [
    {
      "richMenuId": "richmenu-xxxxx",
      "name": "我的選單",
      "size": { "width": 2500, "height": 1686 },
      "chatBarText": "點擊開啟",
      "selected": true,
      "areas": [...]
    }
  ]
}
```

---

## 2. 建立 Rich Menu

**節點名稱建議**：`建立圖文選單`

| 設定項目 | 值 |
|----------|------|
| Method | `POST` |
| URL | `https://api.line.me/v2/bot/richmenu` |
| Authentication | Header Auth → `LINE-Bot-Auth` |
| Content Type | JSON |
| Body Parameters | 使用 JSON 格式 |

**Body JSON**（六宮格範例）：
```json
{
  "size": { "width": 2500, "height": 1686 },
  "selected": true,
  "name": "六宮格選單",
  "chatBarText": "點擊開啟選單",
  "areas": [
    {
      "bounds": { "x": 0, "y": 0, "width": 833, "height": 843 },
      "action": { "type": "message", "label": "功能 1", "text": "功能1" }
    },
    {
      "bounds": { "x": 833, "y": 0, "width": 834, "height": 843 },
      "action": { "type": "message", "label": "功能 2", "text": "功能2" }
    },
    {
      "bounds": { "x": 1667, "y": 0, "width": 833, "height": 843 },
      "action": { "type": "message", "label": "功能 3", "text": "功能3" }
    },
    {
      "bounds": { "x": 0, "y": 843, "width": 833, "height": 843 },
      "action": { "type": "message", "label": "功能 4", "text": "功能4" }
    },
    {
      "bounds": { "x": 833, "y": 843, "width": 834, "height": 843 },
      "action": { "type": "message", "label": "功能 5", "text": "功能5" }
    },
    {
      "bounds": { "x": 1667, "y": 843, "width": 833, "height": 843 },
      "action": { "type": "message", "label": "功能 6", "text": "功能6" }
    }
  ]
}
```

**回應範例**：
```json
{
  "richMenuId": "richmenu-88c05xxxxx"
}
```

> ⚠️ 在 n8n 中設定 Body 時，可切換到 **JSON** 模式直接貼上完整 JSON。

---

## 3. 上傳選單圖片

**節點名稱建議**：`上傳圖文選單圖片`

| 設定項目 | 值 |
|----------|------|
| Method | `POST` |
| URL | `https://api-data.line.me/v2/bot/richmenu/{{ $json.richMenuId }}/content` |
| Authentication | Header Auth → `LINE-Bot-Auth` |
| Content Type | `Binary Data` |
| Body Content Type | 選擇 `n8n Binary Data` |
| Input Data Field Name | `data`（預設） |

**注意事項**：
- URL 中的 `{{ $json.richMenuId }}` 是 n8n 表達式，引用上一個建立選單節點的回傳值
- 圖片必須為 **PNG** 或 **JPEG** 格式
- 檔案大小上限 **1MB**
- 需要在 Headers 額外加入 `Content-Type: image/png` 或 `image/jpeg`

**額外 Headers 設定**：

| Header Name | Header Value |
|-------------|-------------|
| `Content-Type` | `image/png` |

### 如何取得圖片的 Binary Data

有兩種方式：

1. **HTTP Request 下載圖片**：先用一個 HTTP Request 節點 GET 圖片 URL，回應的 binary 資料直接傳入下一個上傳節點。

2. **Read Binary File 節點**：使用 `Read Binary File` 節點讀取本地檔案，然後傳入上傳節點。

---

## 4. 設定預設選單

**節點名稱建議**：`設定預設圖文選單`

| 設定項目 | 值 |
|----------|------|
| Method | `POST` |
| URL | `https://api.line.me/v2/bot/user/all/richmenu/{{ $json.richMenuId }}` |
| Authentication | Header Auth → `LINE-Bot-Auth` |

---

## 5. 綁定選單到使用者

**節點名稱建議**：`綁定使用者圖文選單`

| 設定項目 | 值 |
|----------|------|
| Method | `POST` |
| URL | `https://api.line.me/v2/bot/user/{{ $json.userId }}/richmenu/{{ $json.richMenuId }}` |
| Authentication | Header Auth → `LINE-Bot-Auth` |

---

## 6. 解除使用者綁定

**節點名稱建議**：`解除使用者選單綁定`

| 設定項目 | 值 |
|----------|------|
| Method | `DELETE` |
| URL | `https://api.line.me/v2/bot/user/{{ $json.userId }}/richmenu` |
| Authentication | Header Auth → `LINE-Bot-Auth` |

---

## 7. 查詢使用者綁定的選單

**節點名稱建議**：`查詢使用者綁定選單`

| 設定項目 | 值 |
|----------|------|
| Method | `GET` |
| URL | `https://api.line.me/v2/bot/user/{{ $json.userId }}/richmenu` |
| Authentication | Header Auth → `LINE-Bot-Auth` |

---

## 8. 刪除 Rich Menu

**節點名稱建議**：`刪除圖文選單`

| 設定項目 | 值 |
|----------|------|
| Method | `DELETE` |
| URL | `https://api.line.me/v2/bot/richmenu/{{ $json.richMenuId }}` |
| Authentication | Header Auth → `LINE-Bot-Auth` |

---

## 9. 取消預設選單

**節點名稱建議**：`取消預設圖文選單`

| 設定項目 | 值 |
|----------|------|
| Method | `DELETE` |
| URL | `https://api.line.me/v2/bot/user/all/richmenu` |
| Authentication | Header Auth → `LINE-Bot-Auth` |

---

## 10. 建立 Rich Menu 別名（多層選單換頁）

**節點名稱建議**：`建立選單別名`

| 設定項目 | 值 |
|----------|------|
| Method | `POST` |
| URL | `https://api.line.me/v2/bot/richmenu/alias` |
| Authentication | Header Auth → `LINE-Bot-Auth` |
| Content Type | JSON |

**Body JSON**：
```json
{
  "richMenuAliasId": "richmenu-alias-page-a",
  "richMenuId": "{{ $json.richMenuId }}"
}
```

---

## 11. 列出所有別名

**節點名稱建議**：`取得所有選單別名`

| 設定項目 | 值 |
|----------|------|
| Method | `GET` |
| URL | `https://api.line.me/v2/bot/richmenu/alias/list` |
| Authentication | Header Auth → `LINE-Bot-Auth` |

---

## 錯誤處理建議

在 n8n 中設定錯誤處理：

1. **Error Workflow**：建立一個錯誤通知工作流，在 Rich Menu 操作失敗時自動通知。

2. **IF 節點判斷**：在關鍵操作後加入 IF 節點，檢查回傳的 HTTP 狀態碼：
   - `200`：操作成功
   - `400`：參數錯誤（檢查 JSON 格式）
   - `401`：Token 無效（重新取得 Token）
   - `404`：找不到資源（Rich Menu ID 可能已被刪除）
   - `429`：速率限制（加入 Wait 節點等待後重試）

3. **Retry on Fail**：在 HTTP Request 節點啟用 `Retry on Fail`：
   - Max Tries：`3`
   - Wait Between Tries（ms）：`2000`

---

## 完整工作流範例（建立 + 上傳 + 設為預設）

```
[Manual Trigger]
      ↓
[建立圖文選單] (POST /v2/bot/richmenu)
      ↓
[下載選單圖片] (GET 圖片 URL → Binary)
      ↓
[上傳圖文選單圖片] (POST api-data.line.me/.../content)
      ↓
[設定預設圖文選單] (POST /v2/bot/user/all/richmenu/...)
      ↓
[LINE 通知成功] (Reply "選單已更新！")
```

---

## 多層選單換頁範例流程

```
[Manual Trigger]
      ↓
[建立選單 A] → 取得 richMenuId-A
      ↓
[建立選單 B] → 取得 richMenuId-B
      ↓
[上傳圖片 A] → richMenuId-A
      ↓
[上傳圖片 B] → richMenuId-B
      ↓
[建立別名 A] → alias-page-a ➜ richMenuId-A
      ↓
[建立別名 B] → alias-page-b ➜ richMenuId-B
      ↓
[設為預設選單] → richMenuId-A
```

> 📝 選單 JSON 中的 `areas.action` 須使用 `richmenuswitch` 類型搭配別名 ID 實現換頁。
