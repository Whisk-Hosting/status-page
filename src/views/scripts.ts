// The browser script, served once at /assets/app.js. Pages work without it except for the bot
// challenge; it adds the uptime tooltips, confirmations, copy buttons and the logo upload.
export const js = String.raw`
(() => {
  const $ = (s, el = document) => el.querySelector(s);

  // Uptime bar tooltips: hover, keyboard focus or a tap.
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text) e.textContent = text; return e; };
  const show = (bar) => {
    const tip = $("#tip");
    if (!tip) return;
    const [day, up, ...incs] = bar.dataset.tip.split("\n");
    tip.replaceChildren(el("b", "", day), document.createTextNode(up), ...incs.map((l) => {
      const [impact, ...t] = l.split("|");
      const row = el("div", "t-inc");
      row.append(el("span", "dot s-" + impact), el("span", "", t.join("|")));
      return row;
    }));
    tip.classList.add("on");
    const r = bar.getBoundingClientRect();
    const w = tip.offsetWidth, h = tip.offsetHeight;
    tip.style.left = Math.max(8, Math.min(innerWidth - w - 8, r.left + r.width / 2 - w / 2)) + "px";
    tip.style.top = (r.top - h - 10 < 8 ? r.bottom + 10 : r.top - h - 10) + "px";
  };
  const hide = () => { const tip = $("#tip"); if (tip) tip.classList.remove("on"); };
  document.addEventListener("mouseover", (e) => { const el = e.target.closest && e.target.closest("[data-tip]"); el ? show(el) : hide(); });
  document.addEventListener("focusin", (e) => { const el = e.target.closest && e.target.closest("[data-tip]"); if (el) show(el); });
  document.addEventListener("focusout", hide);
  document.addEventListener("touchstart", (e) => { const el = e.target.closest && e.target.closest("[data-tip]"); el ? show(el) : hide(); }, { passive: true });
  addEventListener("scroll", hide, { passive: true });

  // The bot challenge: on a 403 CHALLENGE_REQUIRED, find n with sha256(salt + n) = challenge and
  // send the request again with the solution in X-Altcha.
  const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
  const solve = async (ch) => {
    const enc = new TextEncoder();
    for (let n = 0; n <= ch.maxnumber; n++) {
      if (hex(await crypto.subtle.digest("SHA-256", enc.encode(ch.salt + n))) === ch.challenge)
        return btoa(JSON.stringify({ algorithm: ch.algorithm, challenge: ch.challenge, number: n, salt: ch.salt, signature: ch.signature }));
    }
    throw new Error("challenge not solved");
  };
  const post = async (url, body, headers = {}) => {
    const res = await fetch(url, { method: "POST", body, headers, credentials: "same-origin" });
    if (res.status !== 403 || !(res.headers.get("content-type") || "").includes("json")) return res;
    const data = await res.clone().json().catch(() => ({}));
    const ch = data.error && data.error.details && data.error.details.challenge || data.details && data.details.challenge;
    if (!ch) return res;
    return fetch(url, { method: "POST", body, headers: { ...headers, "X-Altcha": await solve(ch) }, credentials: "same-origin" });
  };
  const demo = document.body.hasAttribute("data-demo");
  document.addEventListener("submit", async (e) => {
    const f = e.target;
    if (f.dataset.confirm && !confirm(f.dataset.confirm)) return e.preventDefault();
    const btn = e.submitter || f.querySelector("[type=submit]");
    if (!(demo || f.hasAttribute("data-challenge")) || f.method !== "post") { if (btn) setTimeout(() => btn.classList.add("busy")); return; }
    e.preventDefault();
    if (btn) btn.classList.add("busy");
    const body = new URLSearchParams(new FormData(f, e.submitter));
    try {
      const res = await post(f.action, body, { "content-type": "application/x-www-form-urlencoded" });
      if (res.redirected) return location.assign(res.url);
      const text = await res.text();
      const doc = new DOMParser().parseFromString(text, "text/html");
      document.title = doc.title;
      document.body.replaceWith(doc.body);
      history.replaceState(null, "", res.url);
      scrollTo(0, 0);
    } catch {
      if (btn) btn.classList.remove("busy");
      alert("That didn't go through. Check your connection and try again.");
    }
  });

  // Copy buttons.
  document.addEventListener("click", (e) => {
    const b = e.target.closest && e.target.closest("[data-copy]");
    if (!b) return;
    navigator.clipboard.writeText($("#" + b.dataset.copy).textContent.trim());
    b.classList.add("busy"); setTimeout(() => b.classList.remove("busy"), 600);
  });

  // The logo: straight to storage, then save the settings form with its id.
  document.addEventListener("change", async (e) => {
    const input = e.target;
    if (!input.dataset || !input.dataset.upload || !input.files[0]) return;
    const file = input.files[0];
    const form = input.closest("form");
    try {
      const res = await post("/admin/settings/logo?type=" + encodeURIComponent(file.type), "");
      const up = await res.json();
      if (!res.ok) throw new Error(up.error ? up.error.message : "Upload refused");
      const fd = new FormData();
      Object.entries(up.fields).forEach(([k, v]) => fd.append(k, v));
      fd.append("file", file);
      const sent = await fetch(up.url, { method: "POST", body: fd });
      if (!sent.ok) throw new Error("Upload failed");
      $("#" + input.dataset.upload).value = up.id;
      form.requestSubmit();
    } catch (err) { alert(err.message); }
  });
  document.addEventListener("click", (e) => {
    const b = e.target.closest && e.target.closest("[data-clear]");
    if (!b) return;
    $("#" + b.dataset.clear).value = "";
    b.closest("form").requestSubmit();
  });
})();
`;
