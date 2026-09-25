# public-notes

Ghi chú, báo cáo và memo kỹ thuật (HTML tĩnh).

Trang chủ: [index.html](./index.html)

## SIT — Org Structure Explorer

- Viewer: [sit/tree_viewer.html](./sit/tree_viewer.html)
- **Hướng dẫn crawl & cập nhật `sit/assets/`:** [sit/README.md](./sit/README.md)

Tóm tắt nhanh (set URL qua env — không commit):

```bash
export BRIGHTSPACE_SERVICE_TOKEN_URL='https://…/brightspace/service-token'
node sit/dev-tree-sync-server.mjs --once
# refresh sit/tree_viewer.html trong browser
```

Hoặc copy [`.env.example`](./.env.example) → `.env`, điền URL, rồi chạy lệnh trên.
