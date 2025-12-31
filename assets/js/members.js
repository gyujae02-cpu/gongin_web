(() => {
    "use strict";

    // ===== 관리자 비밀번호 (배포 시 교체 가능)
    // 정적 사이트라 완전한 보안은 불가. "편집 방지" 목적의 UX 락으로 봐야 함.
    const ADMIN_PASSWORD = "1234";

    const AUTH_KEY = "guild_auth_v1";

    const CSV_FILES = {
        1: "공인1_길드원_리스트.csv",
        2: "공인2_길드원_리스트.csv",
        3: "공인3_길드원_리스트.csv",
    };

    const MODE_KEY = "guild_view_mode_v1";

    // ===== Elements (HTML 변경 반영)
    const elLogout = document.getElementById("logoutBtn");
    const elExport = document.getElementById("exportBtn");
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

    // Admin modal
    const adminModalEl = document.getElementById("adminModal");
    const adminModal = new bootstrap.Modal(adminModalEl, { backdrop: "static", keyboard: true });
    const elAdminPw = document.getElementById("adminPw");
    const elAdminErr = document.getElementById("adminErr");
    const elAdminOkBtn = document.getElementById("adminOkBtn");

    // Member modal
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

    // ===== State
    let currentTier = "ALL";
    let currentQuery = "";
    let sortKey = "power";
    let sortDir = "desc";
    let editEnabled = false;

    // 데이터는 "메모리"에만 존재
    const cache = new Map(); // tier -> rows
    let allRows = [];
    let viewRows = [];
    let editing = null; // { tier, id }

    // ===== Utils
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

    function formatEok(n) {
        const v = Number(n || 0);
        const isInt = Number.isInteger(v);
        return (isInt ? v.toString() : v.toFixed(1)) + "억";
    }

    function round1(n) {
        const v = Math.round((Number(n) || 0) * 10) / 10;
        return Number.isInteger(v) ? v.toString() : v.toFixed(1);
    }

    function isMobileLike() { return window.matchMedia("(max-width: 575px)").matches; }

    function applyMode(mode) {
        const m = (mode === "cards") ? "cards" : "table";
        localStorage.setItem(MODE_KEY, m);

        elViewRoot.classList.toggle("mode-table", m === "table");
        elViewRoot.classList.toggle("mode-cards", m === "cards");

        // nav 버튼 텍스트
        // (HTML에서 nav 버튼 안에 텍스트 span이 있지만 id는 modeBtn이라 그대로 textContent 조작해도 OK)
        elModeBtn.textContent = (m === "cards") ? "모드: 카드" : "모드: 테이블";

        // sortbar: 모바일에서는 항상 보이게(카드 모드 조작에 도움)
        if (isMobileLike()) elSortbar.style.display = "flex";
        else elSortbar.style.display = (m === "cards") ? "flex" : "none";
    }

    function getModePref() {
        const saved = localStorage.getItem(MODE_KEY);
        if (saved === "cards" || saved === "table") return saved;
        return isMobileLike() ? "cards" : "table";
    }

    function toggleMode() {
        const now = localStorage.getItem(MODE_KEY) || getModePref();
        applyMode(now === "cards" ? "table" : "cards");
        render();
    }

    function setEditEnabled(on) {
        editEnabled = !!on;

        elEditModeBtn.textContent = `편집: ${editEnabled ? "ON" : "OFF"}`;
        elEditModeBtn.classList.toggle("primary", editEnabled);
        elAdd.disabled = !editEnabled;

        render();
    }

    // ===== CSV parse
    function parseCSV(text) {
        const rows = [];
        let i = 0, field = "", row = [], inQuotes = false;

        function pushField() { row.push(field); field = ""; }
        function pushRow() {
            const joined = row.join("").trim();
            if (joined.length === 0) { row = []; return; }
            rows.push(row);
            row = [];
        }

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

    function mapCSVToRows(tier, csvText) {
        const grid = parseCSV(csvText);
        if (grid.length < 2) return [];

        const header = grid[0].map(normHeader);

        const nickI = header.findIndex(h => h === "닉네임" || h === "nickname");
        const roleI = header.findIndex(h => h === "직위" || h === "직책" || h === "role");
        const powI = header.findIndex(h => h === "전투력(억)" || h === "전투력" || h === "power");
        const noteI = header.findIndex(h => h === "비고" || h === "note");

        if (nickI < 0 || roleI < 0 || powI < 0 || noteI < 0) {
            throw new Error("CSV 헤더가 올바르지 않습니다. (닉네임, 직위, 전투력(억), 비고)");
        }

        const out = [];
        for (let r = 1; r < grid.length; r++) {
            const line = grid[r];
            const nick = String(line[nickI] ?? "").trim();
            if (!nick) continue;

            out.push({
                id: `${tier}:${nick}:${r}`,
                tier: Number(tier),
                nick,
                role: String(line[roleI] ?? "").trim(),
                power: toNumberSafe(line[powI]),
                note: String(line[noteI] ?? "").trim(),
            });
        }
        return out;
    }

    async function loadTier(tier) {
        const t = Number(tier);
        if (cache.has(t)) return cache.get(t);

        const file = CSV_FILES[t];
        const res = await fetch(encodeURI(file), { cache: "no-store" });
        if (!res.ok) throw new Error(`CSV를 불러오지 못했습니다: ${file} (HTTP ${res.status})`);

        const text = await res.text();
        const rows = mapCSVToRows(t, text);

        cache.set(t, rows);
        return rows;
    }

    async function loadByCurrentTier() {
        showError(null);
        setLoading(true);
        try {
            if (currentTier === "ALL") {
                const [a, b, c] = await Promise.all([loadTier(1), loadTier(2), loadTier(3)]);
                allRows = [...a, ...b, ...c];
            } else {
                allRows = await loadTier(currentTier);
            }
            render();
        } catch (err) {
            allRows = [];
            render();
            showError(String(err?.message || err));
        } finally {
            setLoading(false);
        }
    }

    // ===== Filter / Sort
    function applyQuery(rows) {
        const q = currentQuery.trim().toLowerCase();
        if (!q) return rows;
        return rows.filter(x => (`${x.nick} ${x.role} ${x.note}`).toLowerCase().includes(q));
    }

    // 직위 라벨/칩 클래스
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

    // 정렬 우선순위(기존 로직 유지 + 라벨 기반)
    function roleSortRank(role) {
        const r = String(role || "").trim();
        if (r === "마스터") return 0;
        if (r === "다운증후군") return 1;
        return 2;
    }

    function compare(a, b) {
        const dir = (sortDir === "asc") ? 1 : -1;

        if (sortKey === "role") {
            const ar = roleSortRank(a.role);
            const br = roleSortRank(b.role);
            if (ar !== br) return (ar - br) * dir;

            const al = roleLabel(a.role);
            const bl = roleLabel(b.role);
            const cmp = String(al ?? "").localeCompare(String(bl ?? ""), "ko");
            if (cmp !== 0) return cmp * dir;

            return String(a.nick ?? "").localeCompare(String(b.nick ?? ""), "ko") * dir;
        }

        if (sortKey === "power") return ((a.power || 0) - (b.power || 0)) * dir;

        return String(a[sortKey] ?? "").localeCompare(String(b[sortKey] ?? ""), "ko") * dir;
    }

    function updateSortIndicators() {
        elThead.querySelectorAll("[data-si]").forEach(s => s.textContent = "");
        const target = elThead.querySelector(`[data-si="${sortKey}"]`);
        if (target) target.textContent = (sortDir === "asc") ? "▲" : "▼";
    }

    // ===== TOP10 rank map (nick -> 1..10)
    function getTop10RankMap(rows) {
        const top = rows.slice()
            .sort((a, b) => Number(b.power || 0) - Number(a.power || 0))
            .slice(0, 10);

        const map = new Map();
        top.forEach((x, idx) => map.set(x.nick, idx + 1));
        return map;
    }

    // ===== Note expand toggle (table + cards)
    function bindNoteToggle(rootEl) {
        rootEl.querySelectorAll(".note, .mnote").forEach(el => {
            el.addEventListener("click", () => el.classList.toggle("expanded"));
        });
    }

    function render() {
        const filtered = applyQuery(allRows).slice().sort(compare);
        viewRows = filtered;

        const count = filtered.length;
        const powers = filtered.map(x => Number(x.power || 0));
        const sum = powers.reduce((acc, v) => acc + v, 0);
        const avg = count ? (sum / count) : 0;
        const max = count ? Math.max(...powers) : 0;
        const min = count ? Math.min(...powers) : 0;

        elStatCount.textContent = `${count}명`;
        elStatSum.textContent = `${round1(sum)}억`;
        elStatAvg.textContent = `${round1(avg)}억`;
        elStatMax.textContent = `${round1(max)}억`;
        elStatMin.textContent = `${round1(min)}억`;

        const top10RankMap = getTop10RankMap(filtered);

        const actionButtons = (id) => {
            const disabled = editEnabled ? "" : "disabled";
            const title = editEnabled ? "" : `title="편집 모드에서만 가능합니다"`;
            return `
        <div class="row-actions">
          <button class="btnx primary" data-act="edit" data-id="${escapeHtml(id)}" ${disabled} ${title}>수정</button>
          <button class="btnx danger"  data-act="del"  data-id="${escapeHtml(id)}" ${disabled} ${title}>삭제</button>
        </div>
      `;
        };

        // ===== Table
        elTbody.innerHTML = filtered.map((r, i) => {
            const rank = top10RankMap.get(r.nick);
            const topBadge = rank ? `<span class="top-rank">TOP${rank}</span>` : "";

            const roleText = roleLabel(r.role);
            const roleChipClass = roleClass(r.role);

            // note: tooltip 제거, ellipsis + click expand
            const noteSafe = escapeHtml(r.note || "-");

            return `
        <tr>
          <td class="muted">${i + 1}</td>
          <td><span class="nick">${escapeHtml(r.nick)}</span></td>
          <td><span class="${roleChipClass}">${escapeHtml(roleText)}</span></td>
          <td class="right">
            <span class="power-cell">
              <span class="power-num">${formatEok(r.power)}</span>
              ${topBadge}
            </span>
          </td>
          <td><span class="note" title="">${noteSafe}</span></td>
          <td>${actionButtons(r.id)}</td>
        </tr>
      `;
        }).join("");

        updateSortIndicators();

        // ===== Cards
        elCards.innerHTML = filtered.map((r, i) => {
            const rank = top10RankMap.get(r.nick);
            const topBadge = rank ? `<span class="top-rank">TOP${rank}</span>` : "";

            const roleText = roleLabel(r.role);
            const roleChipClass = roleClass(r.role);

            const disabled = editEnabled ? "" : "disabled";
            const title = editEnabled ? "" : `title="편집 모드에서만 가능합니다"`;

            return `
        <div class="mcard">
          <div class="mcard-top">
            <div style="min-width:0;">
              <div class="mcard-name">
                <span class="muted" style="margin-right:6px;">${i + 1}.</span>
                <span class="nick">${escapeHtml(r.nick)}</span>
              </div>

              <div class="mcard-meta" style="margin-top:10px; display:flex; flex-wrap:wrap; gap:8px;">
                <span class="${roleChipClass}">${escapeHtml(roleText)}</span>
                <span class="chip role-normal">전투력 <span style="margin-left:6px; font-weight:950;">${formatEok(r.power)}</span></span>
                ${rank ? `<span class="top-rank">TOP${rank}</span>` : ""}
                <span class="chip role-normal">공인 <span style="margin-left:6px; font-weight:950;">${r.tier}</span></span>
              </div>
            </div>
          </div>

          <div class="mnote">${escapeHtml(r.note || "-")}</div>

          <div class="mcard-actions">
            <button class="btnx primary" data-act="edit" data-id="${escapeHtml(r.id)}" ${disabled} ${title}>수정</button>
            <button class="btnx danger"  data-act="del"  data-id="${escapeHtml(r.id)}" ${disabled} ${title}>삭제</button>
          </div>
        </div>
      `;
        }).join("");

        // note expand bind (table + cards)
        bindNoteToggle(document);
    }

    function findRowById(id) {
        return allRows.find(x => x.id === id) || null;
    }

    // ===== 편집(메모리만)
    function setModalErr(msg) {
        if (!msg) { elModalErr.style.display = "none"; elModalErr.textContent = ""; return; }
        elModalErr.style.display = "block";
        elModalErr.textContent = msg;
    }

    function openModalForCreate() {
        editing = null;
        elModalTitle.textContent = "길드원 추가";
        elDeleteBtn.classList.add("d-none");
        setModalErr("");

        elMTier.value = (currentTier === "ALL") ? "1" : String(currentTier);
        elMNick.value = "";
        elMRole.value = "";
        elMPower.value = "";
        elMNote.value = "";

        memberModal.show();
        setTimeout(() => elMNick.focus(), 120);
    }

    function openModalForEdit(row) {
        editing = { tier: row.tier, id: row.id };
        elModalTitle.textContent = "길드원 수정";
        elDeleteBtn.classList.remove("d-none");
        setModalErr("");

        elMTier.value = String(row.tier);
        elMNick.value = row.nick || "";
        elMRole.value = row.role || "";
        elMPower.value = String(row.power ?? "");
        elMNote.value = row.note || "";

        memberModal.show();
        setTimeout(() => elMNick.focus(), 120);
    }

    function validateAndBuildRow() {
        const tier = Number(elMTier.value || 1);
        const nick = String(elMNick.value || "").trim();
        const role = String(elMRole.value || "").trim();
        const power = toNumberSafe(elMPower.value);
        const note = String(elMNote.value || "").trim();

        if (!nick) return { ok: false, msg: "닉네임을 입력해 주세요." };
        if (!role) return { ok: false, msg: "직위를 입력해 주세요." };
        if (power < 0) return { ok: false, msg: "전투력은 0 이상이어야 합니다." };

        // tier 내 닉네임 중복 방지(현재 캐시 기준)
        const tierRows = cache.get(tier) || [];
        const dup = tierRows.find(x =>
            String(x.nick).trim().toLowerCase() === nick.toLowerCase() &&
            (!editing || x.id !== editing.id)
        );
        if (dup) return { ok: false, msg: "같은 공인 그룹에 동일 닉네임이 이미 존재합니다." };

        // id 유지(편집), 신규는 timestamp로 생성
        const id = editing ? editing.id : `${tier}:${nick}:${Date.now().toString(16)}`;
        return { ok: true, row: { id, tier, nick, role, power, note } };
    }

    function upsertRowInTier(tier, row) {
        const t = Number(tier);
        const rows = (cache.get(t) || []).slice();
        const idx = rows.findIndex(x => x.id === row.id);
        if (idx >= 0) rows[idx] = row;
        else rows.push(row);
        cache.set(t, rows);
    }

    function deleteRowInTier(tier, id) {
        const t = Number(tier);
        const rows = (cache.get(t) || []).filter(x => x.id !== id);
        cache.set(t, rows);
    }

    // ===== Export
    function getTierLabel() { return currentTier === "ALL" ? "ALL" : `공인${currentTier}`; }
    function csvEscape(v) {
        const s = String(v ?? "");
        if (/[",\n]/.test(s)) return `"${s.replaceAll('"', '""')}"`;
        return s;
    }
    function makeExportCSV(rows) {
        const header = ["닉네임", "직위", "전투력(억)", "비고"];
        const lines = [header.join(",")];
        rows.forEach((r) => {
            lines.push([
                csvEscape(r.nick),
                csvEscape(r.role),
                Number(r.power || 0),
                csvEscape(r.note || "")
            ].join(","));
        });
        return lines.join("\n");
    }
    function downloadTextFile(filename, content, mime = "text/csv;charset=utf-8") {
        const blob = new Blob([content], { type: mime });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
    }

    // ===== Admin modal helpers
    function setAdminErr(msg) {
        if (!msg) { elAdminErr.style.display = "none"; elAdminErr.textContent = ""; return; }
        elAdminErr.style.display = "block";
        elAdminErr.textContent = msg;
    }

    // ===== Events
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
        if (editEnabled) {
            setEditEnabled(false);
            return;
        }
        setAdminErr("");
        elAdminPw.value = "";
        adminModal.show();
        setTimeout(() => elAdminPw.focus(), 120);
    });

    elAdminOkBtn.addEventListener("click", () => {
        const pw = String(elAdminPw.value || "");
        if (pw !== ADMIN_PASSWORD) {
            setAdminErr("비밀번호가 올바르지 않습니다.");
            return;
        }
        adminModal.hide();
        setEditEnabled(true);
    });

    elAdd.addEventListener("click", () => {
        if (!editEnabled) return;
        openModalForCreate();
    });

    // Tier
    elSeg.addEventListener("click", async (e) => {
        const btn = e.target.closest("button[data-tier]");
        if (!btn) return;

        currentTier = btn.dataset.tier;
        elSeg.querySelectorAll("button[data-tier]").forEach(b => b.classList.toggle("active", b === btn));

        await loadByCurrentTier();
    });

    // Search
    elQ.addEventListener("input", () => {
        currentQuery = elQ.value || "";
        render();
    });

    // Sort via header
    elThead.addEventListener("click", (e) => {
        const th = e.target.closest("th[data-key]");
        if (!th) return;

        const key = th.dataset.key;
        if (key === "rowno") return;

        if (sortKey === key) sortDir = (sortDir === "asc") ? "desc" : "asc";
        else {
            sortKey = key;
            sortDir = (key === "power") ? "desc" : "asc";
        }

        elSortKeySel.value = sortKey;
        syncSortDirPill();
        render();
    });

    function syncSortDirPill() {
        elSortDirPill.textContent = `정렬: ${sortDir === "asc" ? "오름차순" : "내림차순"}`;
        elSortDirPill.classList.toggle("active", sortDir === "desc");
    }

    elSortKeySel.addEventListener("change", () => {
        sortKey = elSortKeySel.value || "power";
        render();
    });

    elSortDirPill.addEventListener("click", () => {
        sortDir = (sortDir === "asc") ? "desc" : "asc";
        syncSortDirPill();
        render();
    });

    elSortDirPill.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            elSortDirPill.click();
        }
    });

    // Row actions
    document.addEventListener("click", (e) => {
        const btn = e.target.closest("button[data-act][data-id]");
        if (!btn) return;
        if (!editEnabled) return;

        const act = btn.dataset.act;
        const id = btn.dataset.id;

        const row = findRowById(id);
        if (!row) return;

        if (act === "edit") {
            openModalForEdit(row);
            return;
        }

        if (act === "del") {
            if (!confirm(`삭제할까요?\n\n${row.nick} (${roleLabel(row.role)})`)) return;
            deleteRowInTier(row.tier, row.id);
            loadByCurrentTier();
        }
    });

    // Save modal
    elSaveBtn.addEventListener("click", async () => {
        if (!editEnabled) return;

        const v = validateAndBuildRow();
        if (!v.ok) { setModalErr(v.msg); return; }
        setModalErr("");

        // tier가 바뀌는 경우: 기존 tier에서 삭제 후 신규 tier로 추가
        if (editing) {
            const oldTier = Number(editing.tier);
            const newTier = Number(v.row.tier);
            if (oldTier !== newTier) {
                deleteRowInTier(oldTier, editing.id);
                v.row.id = `${newTier}:${v.row.nick}:${Date.now().toString(16)}`;
            }
        }

        upsertRowInTier(v.row.tier, v.row);
        memberModal.hide();
        await loadByCurrentTier();
    });

    // Delete in modal
    elDeleteBtn.addEventListener("click", async () => {
        if (!editEnabled || !editing) return;

        const row = findRowById(editing.id);
        if (!row) return;

        if (!confirm(`삭제할까요?\n\n${row.nick} (${roleLabel(row.role)})`)) return;

        deleteRowInTier(row.tier, row.id);
        memberModal.hide();
        await loadByCurrentTier();
    });

    // Export (현재 표시 기준)
    elExport.addEventListener("click", () => {
        const label = getTierLabel();
        const q = (currentQuery || "").trim();
        const fileBase = q ? `${label}_길드원_리스트_검색` : `${label}_길드원_리스트`;
        downloadTextFile(`${fileBase}.csv`, makeExportCSV(viewRows));
    });

    // ===== Init
    async function init() {
        applyMode(getModePref());
        elSortKeySel.value = sortKey;
        syncSortDirPill();
        setEditEnabled(false);

        // preload csv
        await Promise.all([1, 2, 3].map(loadTier).map(p => p.catch(() => [])));
        await loadByCurrentTier();
    }

    init().catch(err => showError(String(err?.message || err)));
})();
