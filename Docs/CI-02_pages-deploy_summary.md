# CI-02 摘要:GitHub Pages 自動部署 + 一鍵/零觸交付

**背景**:Boss 不想每次手動 reset/pull/resolve/push 交接。選定「GitHub + 自動部署」路線(2026-07-04, wave 12)。

## 做了什麼

### 1. GitHub Pages 自動部署
- 新增 `.github/workflows/deploy.yml`:push 到 `main` 時 build(`vite build --base=/Otty-DAM-IT-/`)→ `actions/upload-pages-artifact` → `actions/deploy-pages@v4` 發佈到 GitHub Pages。
- `actions/configure-pages@v5` 加 `enablement: true`,workflow 自己把 Pages 來源設成「GitHub Actions」,不必人工先在 Settings 開。
- **線上網址**:https://in-this-world.github.io/Otty-DAM-IT-/
- 權限:job 內 `pages: write` + `id-token: write`(用 workflow 內建 `GITHUB_TOKEN`,不吃 PAT)。

### 2. Vite base path 修正(關鍵)
- 專案在 Pages 是子路徑 `/Otty-DAM-IT-/`,故 build 帶 `--base`。
- `import.meta.env.BASE_URL` 需型別:`tsconfig.json` 的 `types` 加 `vite/client`。
- **`BootScene.preload` 加 `this.load.setBaseURL(import.meta.env.BASE_URL)`**:否則 Phaser 用相對路徑 `assets/otter.png` 在子路徑下會抓錯位置。本機 dev(base=`/`)與 Pages(base=`/Otty-DAM-IT-/`)皆正確。

### 3. 交付機制(mount 限制的解法)
- Windows mount **禁刪檔**,git/npm 無法就地在 boss 資料夾跑;但**可寫新檔**、**可讀**,sandbox **可 `git push` 到 github.com**(但 `api.github.com` / `github.io` 在 allowlist 外,無法從 sandbox 查 Actions 狀態或抓線上頁)。
- **主要交付**:sandbox 用存好的 PAT `git push` 到 GitHub `main` → Actions 自動部署 → boss 只要開網址。
- **PAT 儲存**:fine-grained token(此 repo:Contents RW + Workflows RW + Metadata)存於 `OttyBuildDam/.gh-token`,已加進 `.gitignore`(`.gh-token` / `.secrets/` / `*.pat`);bundle 只含已 commit 物件,故不外洩。**下次直接讀,不再問 boss**。push 用 `git push "https://x-access-token:$(cat .gh-token)@github.com/in-this-world/Otty-DAM-IT-.git" main`。
- **後備**:repo 內留 `repo.bundle` + `sync-otty.bat`(雙擊即把工作樹強制對齊最新 main,`reset --hard` + `clean -fd`,自動清掉會擋 pull 的 untracked 檔)。

## 關鍵決策
- **Pages 而非 Cloudflare**:靜態 Vite app,Pages 零額外帳號/密鑰,最省事達成「開網址即玩」。(MASTER_PLAN 原寫 CF Pages,屆時 P5 要換再說。)
- **PAT 明文存檔**:boss 明確要求「存起來別再問」。以 gitignore + bundle 只含 committed 物件 雙重保護不進版控;建議短效期並隨時可撤換。

## 測試/驗證
- 本機:`npx tsc --noEmit` + `npx vite build --base=/Otty-DAM-IT-/` 綠;`dist/index.html` 正確引用 `/Otty-DAM-IT-/assets/...`,`dist/assets/` 含 otter.png/json + animations.json。`npm run check` 186 綠。
- GitHub:`main` 已推(至 a015cac);build job 綠、產出 artifact。**deploy-pages 首跑一度 "Deployment failed, try again later"**(首次設定常見的暫時性/來源未就緒),已加 `enablement:true` 並重推重跑。**線上頁是否綠仍待 boss 目視確認**(sandbox 看不到 Actions/線上頁)。

## 後續 / 注意
- 若 deploy 持續失敗:確認 repo 是否為 private(free 方案 private 不支援 Pages);檢查 `github-pages` environment 保護規則;或再重推一次(常暫時性)。
- 之後每次交接:sandbox push → boss 開網址。若 token 失效多半是過期/被撤,向 boss 要新的。
- 詳見 memory `otty-deploy`。
