(() => {
    "use strict";

    const ADMIN_PASSWORD = "edit58778285";
    const AUTH_KEY = "guild_auth_v1";
    const MODE_KEY = "guild_view_mode_v1";

    const SHEET_ID = "1Ac1K6_LX2VfhkHi4M8yLimywQlLseQl8F9_krYsbM1k";
    const SHEET_NAME_MEMBERS = "members";
    const SHEET_NAME_JOINWAIT = "join_wait";

    let currentSheet = SHEET_NAME_MEMBERS;

    function makeSheetCsvUrl(sheetName) {
        return `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheetName)}`;
    }

    // ✅ 여기 반드시 "최신 배포 /exec" 로 바꿔야 함
    const GAS_WEBAPP_URL =
        "https://script.google.com/macros/s/AKfycbw3jn84qIiTLloFAq3jtmsUytuf1uxtuTlmemzjPgvkhqYDSSTUc4Mttn7OZhONe4kN/exec";

    const API_TOKEN = "";

    const elLogout = document.getElementById("logoutBtn");
    const elAdd = document.getElementById("addBtn");
    const elEditModeBtn = document.getElementById("editModeBtn");

    const elSeg = document.getElementById("seg");
    const elQ = document.getElementById("q");
    const elThead = document.getElementById("thead");
    const elTbody = document.getElementById("tbody");
    const elError = document.getElementById("errorBox");
    const elLoading = document.getElementById("loadingBox");
    const elCards = document.getElementById("cards");

    const elViewRoot = document.getElementById("viewRoot");
    const elModeBtn = document.getElementById("modeBtn");
    const elSortbar = document.getElementById("sortbar");
    const elSortKeySel = document.getElementById("sortKeySel");
    const elSortDirPill = document.getElementById("sortDirPill");

    const elStatCount = document.getElementById("statCount");
    const elStatSum = document.getElementById("statSum");
    const elStatAvg = document.getElementById("statAvg");
    const elStatMax = document.getElementById("statMax");
    const elStatMin = document.getElementById("statMin");

    const adminModalEl = document.getElementById("adminModal");
    const adminModal = new bootstrap.Modal(adminModalEl, { backdrop: "static", keyboard: true });
    const elAdminPw = document.getElementById("adminPw");
    const elAdminErr = document.getElementById("adminErr");
    const elAdminOkBtn = document.getElementById("adminOkBtn");

    const memberModalEl = document.getElementById("memberModal");
    const memberModal = new bootstrap.Modal(memberModalEl, { backdrop: "static", keyboard: true });

    const elModalTitle = document.getElementById("modalTitle");
    const elMTier = document.getElementById("mTier");
    const elMNick = document.getElementById("mNick");
    const elMRole = document.getElementById("mRole");
    const elMPower = document.getElementById("mPower");
    const elMNote = document.getElementById("mNote");
    const elModalErr = document.getElementById("modalErr");
    const elSaveBtn = document.getElementById("saveBtn");
    const elDeleteBtn = document.getElementById("deleteBtn");

    let currentTier = "ALL";
    let currentQuery = "";
    let sortKey = "power";
    let sortDir = "desc";
    let editEnabled = false;

    let sheetRows = [];
    let allRows = [];
    let viewRows = [];
    let editing = null;

    function setLoading(on) { elLoading.style.display = on ? "block" : "none"; }
    function showError(msg) {
        if (!msg) { elError.style.display = "none"; elError.textContent = ""; return; }
        elError.style.display = "block"; elError.textContent = msg;
    }

    function escapeHtml(s) {
        return String(s ?? "")
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;")
            .replaceAll("'", "&#39;");
    }

    function toNumberSafe(v) {
        const s = String(v ?? "").trim().replaceAll("억", "").replaceAll(",", "");
        const n = Number(s);
        return Number.isFinite(n) ? n : 0;
    }

    function round1Number(n) { return Math.round((Number(n) || 0) * 10) / 10; }
    function round1Str(n) { const v = round1Number(n); return Number.isInteger(v) ? v.toString() : v.toFixed(1); }

    function formatPowerKor(eokValue) {
        const v = round1Number(eokValue);
        const abs = Math.abs(v);
        const sign = v < 0 ? "-" : "";
        if (abs < 10000) return `${sign}${round1Str(abs)}억`;
        const jo = Math.floor(abs / 10000);
        const remEok = round1Number(abs - jo * 10000);
        if (remEok <= 0) return `${sign}${jo}조`;
        return `${sign}${jo}조 ${round1Str(remEok)}억`;
    }

    function isMobileLike() { return window.matchMedia("(max-width: 575px)").matches; }

    function setNavBtnText(btnEl, text) {
        const t = btnEl?.querySelector?.(".navx-txt");
        if (t) t.textContent = text;
        else if (btnEl) btnEl.textContent = text;
    }

    function applyMode(mode) {
        const m = mode === "cards" ? "cards" : "table";
        localStorage.setItem(MODE_KEY, m);
        elViewRoot.classList.toggle("mode-table", m === "table");
        elViewRoot.classList.toggle("mode-cards", m === "cards");
        setNavBtnText(elModeBtn, m === "cards" ? "모드: 카드" : "모드: 테이블");
        if (isMobileLike()) elSortbar.style.display = "flex";
        else elSortbar.style.display = m === "cards" ? "flex" : "none";
    }

    function getModePref() {
        const saved = localStorage.getItem(MODE_KEY);
        if (saved === "cards" || saved === "table") return saved;
        return isMobileLike() ? "cards" : "table";
    }

    function toggleMode() { const now = localStorage.getItem(MODE_KEY) || getModePref(); applyMode(now === "cards" ? "table" : "cards"); render(); }

    function setEditEnabled(on) {
        editEnabled = !!on;
        setNavBtnText(elEditModeBtn, `편집: ${editEnabled ? "ON" : "OFF"}`);
        elEditModeBtn.classList.toggle("primary", editEnabled);
        elAdd.disabled = !editEnabled;
        render();
    }

    function isJoinWaitMode() { return currentSheet === SHEET_NAME_JOINWAIT; }

    function setSheetMode(sheetName) {
        const next = sheetName === SHEET_NAME_JOINWAIT ? SHEET_NAME_JOINWAIT : SHEET_NAME_MEMBERS;
        if (currentSheet === next) return;
        currentSheet = next;

        if (isJoinWaitMode()) {
            currentTier = "ALL";
            sortKey = "power";
            sortDir = "desc";
            if (elSortKeySel.value === "role") elSortKeySel.value = "power";
        }

        applyTierToAllRows();
        render();
        loadFromSheet();
    }

    // CSV
    function parseCSV(text) {
        const rows = [];
        let i = 0, field = "", row = [], inQuotes = false;
        function pushField() { row.push(field); field = ""; }
        function pushRow() { const joined = row.join("").trim(); if (!joined) { row = []; return; } rows.push(row); row = []; }
        while (i < text.length) {
            const c = text[i];
            if (inQuotes) {
                if (c === '"') {
                    const next = text[i + 1];
                    if (next === '"') { field += '"'; i += 2; continue; }
                    inQuotes = false; i++; continue;
                }
                field += c; i++; continue;
            } else {
                if (c === '"') { inQuotes = true; i++; continue; }
                if (c === ",") { pushField(); i++; continue; }
                if (c === "\r") { i++; continue; }
                if (c === "\n") { pushField(); pushRow(); i++; continue; }
                field += c; i++; continue;
            }
        }
        pushField(); pushRow();
        return rows;
    }

    function normHeader(h) { return String(h ?? "").trim().replaceAll(" ", "").replaceAll("\t", ""); }

    function mapSheetCSVToRows(csvText) {
        const grid = parseCSV(csvText);
        if (grid.length < 2) return [];
        const header = grid[0].map(normHeader);

        const tierI = header.findIndex((h) => h === "tier");
        const nickI = header.findIndex((h) => h === "nick");
        const powI = header.findIndex((h) => h === "power_eok");
        const noteI = header.findIndex((h) => h === "note");
        const roleI = header.findIndex((h) => h === "role");

        if (tierI < 0 || nickI < 0 || powI < 0 || noteI < 0) {
            throw new Error("시트 헤더가 올바르지 않습니다. tier,nick,power_eok,note (+members는 role)");
        }

        const out = [];
        for (let r = 1; r < grid.length; r++) {
            const line = grid[r];
            const tier = Number(String(line[tierI] ?? "").trim());
            const nick = String(line[nickI] ?? "").trim();
            if (!tier || !nick) continue;

            out.push({
                tier,
                nick,
                role: roleI >= 0 ? String(line[roleI] ?? "").trim() : "",
                power: toNumberSafe(line[powI]),
                note: String(line[noteI] ?? "").trim(),
            });
        }
        return out;
    }

    function keyOf(tier, nick) { return `${Number(tier)}:${String(nick || "").trim()}`.toLowerCase(); }

    async function loadFromSheet() {
        showError(null);
        setLoading(true);
        try {
            const url = `${makeSheetCsvUrl(currentSheet)}&t=${Date.now()}`;
            const res = await fetch(url, { cache: "no-store" });
            if (!res.ok) throw new Error(`시트를 불러오지 못했습니다 (HTTP ${res.status})`);
            const text = await res.text();

            sheetRows = mapSheetCSVToRows(text);
            applyTierToAllRows();
            render();
        } catch (err) {
            sheetRows = [];
            applyTierToAllRows();
            render();
            showError(String(err?.message || err));
        } finally {
            setLoading(false);
        }
    }

    function applyTierToAllRows() {
        if (isJoinWaitMode()) { allRows = sheetRows.slice(); return; }
        if (currentTier === "ALL") allRows = sheetRows.slice();
        else allRows = sheetRows.filter((x) => Number(x.tier) === Number(currentTier));
    }

    function applyQuery(rows) {
        const q = currentQuery.trim().toLowerCase();
        if (!q) return rows;
        return rows.filter((x) => `${x.nick} ${x.role} ${x.note}`.toLowerCase().includes(q));
    }

    function roleLabel(roleRaw) {
        const r = String(roleRaw || "").trim();
        if (r === "마스터") return "길드 마스터";
        if (r === "다운증후군") return "부마스터";
        return r || "-";
    }
    function roleClass(roleRaw) {
        const r = String(roleRaw || "").trim();
        if (r === "마스터") return "chip role-master";
        if (r === "다운증후군") return "chip role-sub";
        return "chip role-normal";
    }
    function roleSortRank(role) {
        const r = String(role || "").trim();
        if (r === "마스터") return 0;
        if (r === "다운증후군") return 1;
        return 2;
    }

    function compare(a, b) {
        const dir = sortDir === "asc" ? 1 : -1;
        if (sortKey === "role") {
            if (!isJoinWaitMode()) {
                const ar = roleSortRank(a.role), br = roleSortRank(b.role);
                if (ar !== br) return (ar - br) * dir;
                const cmp = roleLabel(a.role).localeCompare(roleLabel(b.role), "ko");
                if (cmp !== 0) return cmp * dir;
                return String(a.nick ?? "").localeCompare(String(b.nick ?? ""), "ko") * dir;
            }
            return String(a.nick ?? "").localeCompare(String(b.nick ?? ""), "ko") * dir;
        }
        if (sortKey === "power") return ((a.power || 0) - (b.power || 0)) * dir;
        return String(a[sortKey] ?? "").localeCompare(String(b[sortKey] ?? ""), "ko") * dir;
    }

    function updateSortIndicators() {
        elThead.querySelectorAll("[data-si]").forEach((s) => (s.textContent = ""));
        const target = elThead.querySelector(`[data-si="${sortKey}"]`);
        if (target) target.textContent = sortDir === "asc" ? "▲" : "▼";
    }

    function getTop10RankMap(rows) {
        const top = rows.slice().sort((a, b) => Number(b.power || 0) - Number(a.power || 0)).slice(0, 10);
        const map = new Map();
        top.forEach((x, idx) => map.set(keyOf(x.tier, x.nick), idx + 1));
        return map;
    }

    function bindNoteToggle(rootEl) {
        rootEl.querySelectorAll(".note, .mnote").forEach((el) => {
            if (el.dataset.bound === "1") return;
            el.dataset.bound = "1";
            el.addEventListener("click", () => el.classList.toggle("expanded"));
        });
    }

    function render() {
        const filtered = applyQuery(allRows).slice().sort(compare);
        viewRows = filtered;

        const count = filtered.length;
        const powers = filtered.map((x) => Number(x.power || 0));
        const sum = powers.reduce((acc, v) => acc + v, 0);
        const avg = count ? sum / count : 0;
        const max = count ? Math.max(...powers) : 0;
        const min = count ? Math.min(...powers) : 0;

        elStatCount.textContent = `${count}명`;
        elStatSum.textContent = formatPowerKor(sum);
        elStatAvg.textContent = formatPowerKor(avg);
        elStatMax.textContent = formatPowerKor(max);
        elStatMin.textContent = formatPowerKor(min);

        const top10RankMap = getTop10RankMap(filtered);

        const actionButtons = (tier, nick) => {
            const disabled = editEnabled ? "" : "disabled";
            const title = editEnabled ? "" : `title="편집 모드에서만 가능합니다"`;
            const key = escapeHtml(keyOf(tier, nick));

            if (isJoinWaitMode()) {
                return `
          <div class="row-actions">
            <button class="btnx primary" data-act="approve" data-key="${key}" ${disabled} ${title}>승인</button>
            <button class="btnx" data-act="edit" data-key="${key}" ${disabled} ${title}>수정</button>
            <button class="btnx danger" data-act="del" data-key="${key}" ${disabled} ${title}>삭제</button>
          </div>
        `;
            }

            return `
        <div class="row-actions">
          <button class="btnx primary" data-act="edit" data-key="${key}" ${disabled} ${title}>수정</button>
          <button class="btnx danger"  data-act="del"  data-key="${key}" ${disabled} ${title}>삭제</button>
        </div>
      `;
        };

        elTbody.innerHTML = filtered.map((r, i) => {
            const rank = top10RankMap.get(keyOf(r.tier, r.nick));
            const topBadge = rank ? `<span class="top-rank">TOP${rank}</span>` : "";

            const roleText = !isJoinWaitMode() ? roleLabel(r.role) : "-";
            const roleChipClass = !isJoinWaitMode() ? roleClass(r.role) : "chip role-normal";

            return `
        <tr>
          <td class="muted">${i + 1}</td>
          <td><span class="nick">${escapeHtml(r.nick)}</span></td>
          <td><span class="${roleChipClass}">${escapeHtml(roleText)}</span></td>
          <td class="right">
            <span class="power-cell">
              <span class="power-num">${formatPowerKor(r.power)}</span>
              ${topBadge}
            </span>
          </td>
          <td><span class="note">${escapeHtml(r.note || "-")}</span></td>
          <td>${actionButtons(r.tier, r.nick)}</td>
        </tr>
      `;
        }).join("");

        updateSortIndicators();

        elCards.innerHTML = filtered.map((r, i) => {
            const rank = top10RankMap.get(keyOf(r.tier, r.nick));
            const roleText = !isJoinWaitMode() ? roleLabel(r.role) : "-";
            const roleChipClass = !isJoinWaitMode() ? roleClass(r.role) : "chip role-normal";

            const disabled = editEnabled ? "" : "disabled";
            const title = editEnabled ? "" : `title="편집 모드에서만 가능합니다"`;
            const key = escapeHtml(keyOf(r.tier, r.nick));

            const actions = isJoinWaitMode()
                ? `
          <button class="btnx primary" data-act="approve" data-key="${key}" ${disabled} ${title}>승인</button>
          <button class="btnx" data-act="edit" data-key="${key}" ${disabled} ${title}>수정</button>
          <button class="btnx danger" data-act="del" data-key="${key}" ${disabled} ${title}>삭제</button>
        `
                : `
          <button class="btnx primary" data-act="edit" data-key="${key}" ${disabled} ${title}>수정</button>
          <button class="btnx danger"  data-act="del"  data-key="${key}" ${disabled} ${title}>삭제</button>
        `;

            return `
        <div class="mcard">
          <div class="mcard-name">
            <span class="muted" style="margin-right:6px;">${i + 1}.</span>
            <span class="nick">${escapeHtml(r.nick)}</span>
          </div>
          <div style="margin-top:10px; display:flex; flex-wrap:wrap; gap:8px;">
            <span class="${roleChipClass}">${escapeHtml(roleText)}</span>
            <span class="chip role-normal">전투력 <span style="margin-left:6px; font-weight:950;">${formatPowerKor(r.power)}</span></span>
            ${rank ? `<span class="top-rank">TOP${rank}</span>` : ""}
            <span class="chip role-normal">공인 <span style="margin-left:6px; font-weight:950;">${escapeHtml(r.tier)}</span></span>
          </div>
          <div class="mnote">${escapeHtml(r.note || "-")}</div>
          <div class="mcard-actions">${actions}</div>
        </div>
      `;
        }).join("");

        bindNoteToggle(document);

        setNavBtnText(elAdd, isJoinWaitMode() ? "가입 대기 추가" : "길드원 추가");
    }

    function findRowByKey(k) {
        const key = String(k || "").toLowerCase();
        return sheetRows.find((x) => keyOf(x.tier, x.nick) === key) || null;
    }

    // ===== Modal helpers
    function setModalErr(msg) {
        if (!msg) { elModalErr.style.display = "none"; elModalErr.textContent = ""; return; }
        elModalErr.style.display = "block";
        elModalErr.textContent = msg;
    }

    // ✅ JOIN_WAIT면 role 입력칸을 "완전히 숨김"
    function setRoleFieldForMode() {
        if (!elMRole) return;
        const join = isJoinWaitMode();
        const wrap = elMRole.closest(".col-12") || elMRole.parentElement;
        elMRole.disabled = join;
        if (join) elMRole.value = "";
        if (wrap) wrap.style.display = join ? "none" : "";
    }

    function openModalForCreate() {
        editing = null;
        elModalTitle.textContent = isJoinWaitMode() ? "가입 대기 추가" : "길드원 추가";
        elDeleteBtn.classList.add("d-none");
        setModalErr("");

        elMTier.value = currentTier === "ALL" ? "1" : String(currentTier);
        elMNick.value = "";
        elMRole.value = "";
        elMPower.value = "";
        elMNote.value = "";

        setRoleFieldForMode();

        memberModal.show();
        setTimeout(() => elMNick.focus(), 120);
    }

    function openModalForEdit(row) {
        editing = { oldTier: row.tier, oldNick: row.nick };
        elModalTitle.textContent = isJoinWaitMode() ? "가입 대기 수정" : "길드원 수정";
        elDeleteBtn.classList.remove("d-none");
        setModalErr("");

        elMTier.value = String(row.tier);
        elMNick.value = row.nick || "";
        elMRole.value = row.role || "";
        elMPower.value = String(row.power ?? "");
        elMNote.value = row.note || "";

        setRoleFieldForMode();

        memberModal.show();
        setTimeout(() => elMNick.focus(), 120);
    }

    function validateAndBuildRow() {
        const tier = Number(elMTier.value || 1);
        const nick = String(elMNick.value || "").trim();
        const power_eok = toNumberSafe(elMPower.value);
        const note = String(elMNote.value || "").trim();

        // ✅ join_wait는 role 자체가 없음
        const role = isJoinWaitMode() ? "" : String(elMRole.value || "").trim();

        if (!tier || tier < 1 || tier > 5) return { ok: false, msg: "공인은 1~5만 가능합니다." };
        if (!nick) return { ok: false, msg: "닉네임을 입력해 주세요." };
        if (!isJoinWaitMode() && !role) return { ok: false, msg: "직위를 입력해 주세요." };
        if (power_eok < 0) return { ok: false, msg: "전투력은 0 이상이어야 합니다." };

        const newKey = keyOf(tier, nick);
        const dup = sheetRows.find((x) => keyOf(x.tier, x.nick) === newKey);
        if (dup) {
            if (!editing) return { ok: false, msg: "같은 공인에 동일 닉네임이 이미 존재합니다." };
            const oldKey = keyOf(editing.oldTier, editing.oldNick);
            if (oldKey !== newKey) return { ok: false, msg: "같은 공인에 동일 닉네임이 이미 존재합니다." };
        }

        return { ok: true, row: { tier, nick, role, power_eok, note } };
    }

    // ===== GAS API
    function hintFromHttp(status, text) {
        const t = String(text || "").trim();
        if (status === 404) return "GAS WebApp URL이 404입니다. '새로 배포된 /exec URL'로 교체하세요.";
        if (status === 401 || status === 403) return "GAS 웹앱 접근 권한 문제입니다. 배포 설정에서 '모든 사용자'로 바꾸세요.";
        if (t.startsWith("<!doctype") || t.startsWith("<html")) return "GAS가 JSON 대신 HTML(로그인/권한 페이지)을 반환했습니다. 배포/권한 확인 필요.";
        return "";
    }

    async function apiPost(payload) {
        const url = `${GAS_WEBAPP_URL}?t=${Date.now()}`;

        let res;
        try {
            res = await fetch(url, {
                method: "POST",
                headers: { "Content-Type": "text/plain;charset=utf-8" },
                body: JSON.stringify(payload),
                cache: "no-store",
            });
        } catch (e) {
            throw new Error(`Failed to fetch (네트워크/CORS/권한). 배포 설정과 /exec URL을 확인하세요.\n원인: ${String(e?.message || e)}`);
        }

        const txt = await res.text();

        if (!res.ok) {
            const hint = hintFromHttp(res.status, txt);
            throw new Error(`HTTP ${res.status}\n${hint}\n응답 일부: ${txt.trim().slice(0, 180)}`);
        }

        const trimmed = txt.trim();
        if (trimmed.startsWith("<!doctype") || trimmed.startsWith("<html")) {
            const hint = hintFromHttp(200, trimmed);
            throw new Error(`서버가 JSON이 아닌 HTML을 반환했습니다.\n${hint}`);
        }

        let j;
        try { j = JSON.parse(txt); }
        catch { throw new Error(`JSON 파싱 실패: ${txt.slice(0, 200)}`); }

        if (!j.ok) throw new Error(j.message || "요청 실패");
        return j;
    }

    async function apiUpsert(row, targetSheet = currentSheet) {
        const payloadRow =
            targetSheet === SHEET_NAME_MEMBERS
                ? { tier: row.tier, nick: row.nick, role: row.role, power_eok: row.power_eok, note: row.note }
                : { tier: row.tier, nick: row.nick, power_eok: row.power_eok, note: row.note };

        return apiPost({ action: "upsert", token: API_TOKEN || "", sheet: targetSheet, row: payloadRow });
    }

    async function apiDeleteByKey(key, targetSheet = currentSheet) {
        return apiPost({ action: "delete", token: API_TOKEN || "", sheet: targetSheet, key });
    }

    async function approveJoinWait(row) {
        const memberRow = { tier: row.tier, nick: row.nick, role: "길드원", power_eok: row.power, note: row.note || "" };
        await apiUpsert(memberRow, SHEET_NAME_MEMBERS);
        await apiDeleteByKey(keyOf(row.tier, row.nick), SHEET_NAME_JOINWAIT);

        currentSheet = SHEET_NAME_MEMBERS;
        currentTier = "ALL";
        currentQuery = "";
        elQ.value = "";

        elSeg.querySelectorAll("button[data-tier]").forEach((b) => b.classList.remove("active"));
        const allBtn = elSeg.querySelector('button[data-tier="ALL"]');
        if (allBtn) allBtn.classList.add("active");

        await loadFromSheet();
    }

    function setAdminErr(msg) {
        if (!msg) { elAdminErr.style.display = "none"; elAdminErr.textContent = ""; return; }
        elAdminErr.style.display = "block";
        elAdminErr.textContent = msg;
    }

    // Events
    elModeBtn.addEventListener("click", toggleMode);

    window.addEventListener("resize", () => {
        const m = localStorage.getItem(MODE_KEY) || getModePref();
        applyMode(m);
    });

    elLogout.addEventListener("click", () => {
        localStorage.removeItem(AUTH_KEY);
        location.replace("index.html");
    });

    elEditModeBtn.addEventListener("click", () => {
        if (editEnabled) { setEditEnabled(false); return; }
        setAdminErr("");
        elAdminPw.value = "";
        adminModal.show();
        setTimeout(() => elAdminPw.focus(), 120);
    });

    elAdminOkBtn.addEventListener("click", () => {
        const pw = String(elAdminPw.value || "");
        if (pw !== ADMIN_PASSWORD) { setAdminErr("비밀번호가 올바르지 않습니다."); return; }
        adminModal.hide();
        setEditEnabled(true);
    });

    elAdd.addEventListener("click", () => {
        if (!editEnabled) return;
        openModalForCreate();
    });

    elSeg.addEventListener("click", async (e) => {
        const btn = e.target.closest("button[data-tier]");
        if (!btn) return;
        const tier = btn.dataset.tier;

        elSeg.querySelectorAll("button[data-tier]").forEach((b) => b.classList.toggle("active", b === btn));

        if (tier === "JOIN") { setSheetMode(SHEET_NAME_JOINWAIT); return; }

        if (currentSheet !== SHEET_NAME_MEMBERS) {
            currentSheet = SHEET_NAME_MEMBERS;
            await loadFromSheet();
        }
        currentTier = tier;
        applyTierToAllRows();
        render();
    });

    elQ.addEventListener("input", () => {
        currentQuery = elQ.value || "";
        render();
    });

    elThead.addEventListener("click", (e) => {
        const th = e.target.closest("th[data-key]");
        if (!th) return;
        const key = th.dataset.key;
        if (key === "rowno") return;
        if (key === "role" && isJoinWaitMode()) return;

        if (sortKey === key) sortDir = sortDir === "asc" ? "desc" : "asc";
        else { sortKey = key; sortDir = key === "power" ? "desc" : "asc"; }

        elSortKeySel.value = sortKey;
        syncSortDirPill();
        render();
    });

    function syncSortDirPill() {
        elSortDirPill.textContent = `정렬: ${sortDir === "asc" ? "오름차순" : "내림차순"}`;
        elSortDirPill.classList.toggle("active", sortDir === "desc");
    }

    elSortKeySel.addEventListener("change", () => {
        const v = elSortKeySel.value || "power";
        if (v === "role" && isJoinWaitMode()) { elSortKeySel.value = "power"; sortKey = "power"; }
        else sortKey = v;
        render();
    });

    elSortDirPill.addEventListener("click", () => {
        sortDir = sortDir === "asc" ? "desc" : "asc";
        syncSortDirPill();
        render();
    });

    elSortDirPill.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); elSortDirPill.click(); }
    });

    document.addEventListener("click", async (e) => {
        const btn = e.target.closest("button[data-act][data-key]");
        if (!btn) return;
        if (!editEnabled) return;

        const act = btn.dataset.act;
        const key = btn.dataset.key;
        const row = findRowByKey(key);
        if (!row) return;

        if (act === "approve") {
            if (!isJoinWaitMode()) return;
            if (!confirm(`가입 승인할까요?\n\n${row.nick} (공인${row.tier})`)) return;

            try { setLoading(true); showError(null); await approveJoinWait(row); }
            catch (err) { showError(String(err?.message || err)); }
            finally { setLoading(false); }
            return;
        }

        if (act === "edit") { openModalForEdit(row); return; }

        if (act === "del") {
            if (!confirm(`삭제할까요?\n\n${row.nick}${!isJoinWaitMode() ? ` (${roleLabel(row.role)})` : ""}`)) return;
            try {
                setLoading(true); showError(null);
                await apiDeleteByKey(keyOf(row.tier, row.nick), currentSheet);
                await loadFromSheet();
            } catch (err) {
                showError(String(err?.message || err));
            } finally {
                setLoading(false);
            }
        }
    });

    elSaveBtn.addEventListener("click", async () => {
        if (!editEnabled) return;

        const v = validateAndBuildRow();
        if (!v.ok) { setModalErr(v.msg); return; }
        setModalErr("");

        try {
            setLoading(true);
            showError(null);

            if (editing) {
                const oldKey = keyOf(editing.oldTier, editing.oldNick);
                const newKey = keyOf(v.row.tier, v.row.nick);
                if (oldKey !== newKey) await apiDeleteByKey(oldKey, currentSheet);
            }

            await apiUpsert(v.row, currentSheet);
            memberModal.hide();
            await loadFromSheet();
        } catch (err) {
            setModalErr(String(err?.message || err));
        } finally {
            setLoading(false);
        }
    });

    elDeleteBtn.addEventListener("click", async () => {
        if (!editEnabled || !editing) return;

        const oldKey = keyOf(editing.oldTier, editing.oldNick);
        const row = findRowByKey(oldKey);
        if (!row) return;

        if (!confirm(`삭제할까요?\n\n${row.nick}${!isJoinWaitMode() ? ` (${roleLabel(row.role)})` : ""}`)) return;

        try {
            setLoading(true);
            showError(null);
            await apiDeleteByKey(oldKey, currentSheet);
            memberModal.hide();
            await loadFromSheet();
        } catch (err) {
            showError(String(err?.message || err));
        } finally {
            setLoading(false);
        }
    });

    async function init() {
        applyMode(getModePref());
        elSortKeySel.value = sortKey;
        syncSortDirPill();
        setEditEnabled(false);

        currentSheet = SHEET_NAME_MEMBERS;
        await loadFromSheet();
    }

    init().catch((err) => showError(String(err?.message || err)));
})();
