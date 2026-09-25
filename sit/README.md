# SIT LMS Org Explorer (`tree_viewer.html`)

Công cụ xem cấu trúc org trên **LMS Staging** (Brightspace): Cluster → Programme → Course, Module → Offering, Semester → Offering.

Dữ liệu hiển thị **chỉ** đọc từ thư mục [`assets/`](./assets/) (JSON crawl sẵn). Trang HTML **không** gọi Brightspace trực tiếp và **không** có nút sync trong browser — cập nhật bằng script local rồi refresh trang.

## Mở viewer

1. Serve repo qua HTTP (bắt buộc — `file://` thường bị CORS):

   ```bash
   cd /path/to/public-notes
   npx --yes serve . -p 8080
   ```

2. Mở: `http://localhost:8080/sit/tree_viewer.html`

3. Sau khi cập nhật `assets/`, **refresh** trang (Cmd+Shift+R nếu trình duyệt vẫn giữ JSON cũ).

## Cập nhật dữ liệu (`sit/assets/`)

### Lần đầu — cấu hình token (không commit URL lên git)

Token Brightspace **không** nằm trong HTML/JS. Script Node gọi endpoint nội bộ (trả JWT ~1h) qua biến **`BRIGHTSPACE_SERVICE_TOKEN_URL`**.

**Cách 1 — env shell (khuyến nghị, không lưu URL trong file repo):**

```bash
export BRIGHTSPACE_SERVICE_TOKEN_URL='https://…/brightspace/service-token'
node sit/dev-tree-sync-server.mjs --once
```

**Cách 2 — file local (gitignore):**

```bash
cp .env.example .env
# hoặc: cp sit/.brightspace-crawl.env.example sit/.brightspace-crawl.env
# điền URL thật vào file — KHÔNG commit
```

Thứ tự đọc cấu hình: biến `process.env` (đã export) → `sit/.brightspace-crawl.env` → `.env` ở root repo. File `.example` trong git **chỉ có placeholder rỗng**, không chứa URL production/dev.

Logic token: [`lib/brightspace-token.mjs`](./lib/brightspace-token.mjs) (cache in-memory, refresh khi API 401).

### Chạy crawl + copy vào `assets/` (khuyến nghị)

Từ root repo `public-notes`:

```bash
node sit/dev-tree-sync-server.mjs --once
```

Luồng:

1. Lấy access token qua `BRIGHTSPACE_SERVICE_TOKEN_URL` (env hoặc file gitignore).
2. Chạy mặc định `~/Desktop/NodeJs/my-app/SIT_CRAWL/crawl.js` (Brightspace API).
3. Ghi output vào `my-app/SIT_CRAWL/output/`, rồi **copy** sang `sit/assets/`.
4. Cập nhật `meta.json` (`crawledAt`, …).

Thời gian chạy: vài phút (phụ thuộc số org unit + rate limit).

### Tuỳ chọn env

| Biến | Ý nghĩa |
|------|--------|
| `CRAWL_CMD` | Đường dẫn script crawl khác (vd. crawl orgstructure đầy đủ) |
| `ASSETS_DIR` | Mặc định: `sit/assets` |
| `CRAWL_OUTPUT` | Thư mục JSON sau crawl (mặc định: `output/` cạnh script) |
| `PORT` | Chỉ khi chạy dev server (không dùng `--once`) |

Ví dụ script crawl custom:

```bash
CRAWL_CMD="/path/to/crawl-orgstructure.mjs" node sit/dev-tree-sync-server.mjs --once
```

### Dev server (không bắt buộc)

```bash
node sit/dev-tree-sync-server.mjs
# GET http://127.0.0.1:9876/health
# POST http://127.0.0.1:9876/crawl
```

Viewer hiện **không** gọi endpoint này; dùng khi tích hợp tool khác hoặc test tay.

## File nào được crawl cập nhật?

Script mặc định (`SIT_CRAWL/crawl.js`) cập nhật **subset** sau trong `assets/`:

| File | Nội dung |
|------|----------|
| `clusterDump.json`, `schools.json` | Cluster (school) |
| `programmeDump.json`, `programs.json` | Programme |
| `semesters.json` | Semester |
| `course-offerings.json`, `courseDump.json` | Course offering |
| `map_cluster_programme.json` | Cluster → Programme |
| `map_cluster_course.json` | Cluster → Course |
| `map_programme_course.json` | Programme → Course |
| `map_semester_course.json` | Semester → Course |
| `meta.json` | Timestamp / counts (một phần) |

**Không** ghi đè bởi crawl mặc định (cần script orgstructure đầy đủ nếu muốn refresh):

- `modules.json`
- `module-to-offerings.json`
- `offering-ancestors.json`
- `semester-to-offerings.json`

Tab **Module → Offering** và **Data Quality** phụ thuộc các file trên — có thể lệch thời gian so với tab Cluster nếu chỉ chạy `crawl.js`.

## Cấu trúc thư mục liên quan

```
sit/
├── README.md                 ← file này
├── tree_viewer.html          ← UI explorer
├── dev-tree-sync-server.mjs  ← crawl + copy assets (--once)
├── lib/brightspace-token.mjs
├── .brightspace-crawl.env.example   ← placeholder, không URL thật
├── .brightspace-crawl.env           ← local only (gitignore)
└── assets/                   ← nguồn dữ liệu viewer
```

Script crawl gốc (repo khác): `NodeJs/my-app/SIT_CRAWL/crawl.js`.

## Troubleshooting

| Triệu chứng | Gợi ý |
|-------------|--------|
| Viewer báo không tải được assets | Serve HTTP; kiểm tra file tồn tại trong `sit/assets/` |
| Crawl 401/403 | Token/URL sai hoặc hết hạn — kiểm tra `export BRIGHTSPACE_SERVICE_TOKEN_URL` hoặc `.env` local |
| Thiếu `BRIGHTSPACE_TOKEN_MODULE` khi chạy `crawl.js` trực tiếp | Dùng `dev-tree-sync-server.mjs --once` hoặc set `BRIGHTSPACE_TOKEN_MODULE` tới `sit/lib/brightspace-token.mjs` |
| Số liệu Module không đổi sau `--once` | Đúng với crawl mặc định — cần script crawl module/ancestors |
