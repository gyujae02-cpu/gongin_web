const AUTH_KEY = "guild_auth_v1";
const AUTH_TTL_MS = 1000 * 60 * 60 * 12; // 12시간
const FIXED_ID = "admin";

const PW_HASH_HEX = "77f1694a883c6a104c93b6f8643d9e2379041b6c231e722134a6868255a19e19";

(function autoRedirectIfAuthed() {
    try {
        const raw = localStorage.getItem(AUTH_KEY);
        if (!raw) return;
        const data = JSON.parse(raw);
        if (!data || !data.exp || Date.now() > data.exp) return;
        location.replace("members.html");
    } catch (e) { }
})();

async function sha256Hex(str) {
    const enc = new TextEncoder().encode(str);
    const buf = await crypto.subtle.digest("SHA-256", enc);
    const arr = Array.from(new Uint8Array(buf));
    return arr.map(b => b.toString(16).padStart(2, "0")).join("");
}

function setAuthed(id) {
    const exp = Date.now() + AUTH_TTL_MS;
    localStorage.setItem(AUTH_KEY, JSON.stringify({ id, exp }));
}

function showError(on) {
    document.getElementById("err").style.display = on ? "block" : "none";
}

document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    showError(false);

    const idEl = document.getElementById('id');
    const pwEl = document.getElementById('pw');
    const btn = document.getElementById('btn');

    idEl.value = FIXED_ID;

    const pw = (pwEl.value || "").trim();
    if (!pw) {
        pwEl.focus();
        return;
    }

    btn.disabled = true;
    try {
        const h = await sha256Hex(pw);
        if (h.toLowerCase() !== PW_HASH_HEX.toLowerCase()) {
            showError(true);
            return;
        }

        setAuthed(FIXED_ID);
        location.href = "members.html";
    } finally {
        btn.disabled = false;
    }
});