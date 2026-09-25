// ИИшница mini-app: guides (Markdown from guides/*.md) + free library (data/library.json).
// Plain JS, no build. Routes: #/guides, #/guide/<slug>, #/library, #/library/<section>.
(() => {
  // telegram-web-app.js defines WebApp in any browser; only initData proves we run inside Telegram.
  const tg = window.Telegram?.WebApp?.initData ? window.Telegram.WebApp : undefined;
  const CHANNEL = "https://t.me/iishnitsa_nazavtrak";
  const view = document.getElementById("view");
  const tabbar = document.getElementById("tabbar");
  const toastEl = document.getElementById("toast");

  // Section look by id; unknown ids fall back to the section emoji.
  const SECTION_LOOK = {
    fonts: { icon: "typography", c: ["#5E5CE6", "#4B48D6"] },
    icons: { icon: "icons", c: ["#FF9F0A", "#F08300"] },
    photos: { icon: "photo", c: ["#30B0C7", "#1C95AB"] },
    photo: { icon: "photo", c: ["#30B0C7", "#1C95AB"] },
    video: { icon: "video", c: ["#FF375F", "#E5214A"] },
    music: { icon: "music", c: ["#FF2D55", "#D91C43"] },
    "3d": { icon: "box", c: ["#AF52DE", "#9538C6"] },
    illustrations: { icon: "box", c: ["#AF52DE", "#9538C6"] },
    design: { icon: "palette", c: ["#34C759", "#22A447"] },
    mockups: { icon: "palette", c: ["#34C759", "#22A447"] },
    ai: { icon: "sparkles", c: ["#2E8BFF", "#0A6CFF"] },
  };

  const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const icon = (name) => `<span class="ti">${window.ICONS?.[name] ? `<svg viewBox="0 0 24 24">${window.ICONS[name]}</svg>` : ""}</span>`;
  const inline = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>");
  const haptic = (kind) => tg?.HapticFeedback?.[kind === "ok" ? "notificationOccurred" : "impactOccurred"]?.(kind === "ok" ? "success" : "light");

  function paintIcons(root = document) {
    root.querySelectorAll("[data-icon]").forEach((el) => {
      el.innerHTML = window.ICONS?.[el.dataset.icon] ? `<svg viewBox="0 0 24 24">${window.ICONS[el.dataset.icon]}</svg>` : "";
    });
  }

  function toast(text) {
    toastEl.textContent = text;
    toastEl.classList.add("on");
    clearTimeout(toast.t);
    toast.t = setTimeout(() => toastEl.classList.remove("on"), 1600);
  }

  function openLink(url) {
    haptic();
    if (!tg) return window.open(url, "_blank", "noopener");
    if (/^https:\/\/t\.me\//.test(url)) tg.openTelegramLink(url);
    else tg.openLink(url);
  }

  async function copy(text, btn) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = Object.assign(document.createElement("textarea"), { value: text });
      ta.style.cssText = "position:fixed;opacity:0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
    }
    haptic("ok");
    btn.classList.add("done");
    btn.innerHTML = `${icon("check")}Скопировано`;
    setTimeout(() => {
      btn.classList.remove("done");
      btn.innerHTML = `${icon("copy")}Скопировать`;
    }, 1800);
  }

  // ---------- theme: follow Telegram, fall back to the OS ----------
  function applyTheme() {
    const dark = tg?.colorScheme ? tg.colorScheme === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    const bg = dark ? "#000000" : "#F2F2F7";
    try {
      tg?.setHeaderColor?.(bg);
      tg?.setBackgroundColor?.(bg);
      tg?.setBottomBarColor?.(bg);
    } catch {}
  }

  // ---------- data ----------
  const cache = {};
  const load = (url, as = "json") => (cache[url] ??= fetch(url, { cache: "no-cache" }).then((r) => (r.ok ? r[as]() : Promise.reject(new Error(url)))));
  const guides = () => load("data/guides.json");
  const library = () => load("data/library.json");

  // ---------- Markdown → guide HTML (same dialect as the bot's magnet files) ----------
  function renderGuide(md) {
    const lines = md.split("\n");
    const sep = lines.findIndex((l) => l.trim() === "---");
    const body = (sep >= 0 ? lines.slice(sep + 1) : lines).join("\n");

    const blocks = [];
    let buf = [];
    let inCode = false;
    for (const line of body.split("\n")) {
      if (line.trim().startsWith("```")) {
        if (inCode) {
          blocks.push({ code: buf.join("\n") });
          buf = [];
        } else if (buf.length) {
          blocks.push({ lines: buf });
          buf = [];
        }
        inCode = !inCode;
        continue;
      }
      if (!inCode && line.trim() === "") {
        if (buf.length) blocks.push({ lines: buf });
        buf = [];
        continue;
      }
      buf.push(line);
    }
    if (buf.length) blocks.push(inCode ? { code: buf.join("\n") } : { lines: buf });

    const out = [];
    let first = true;
    blocks.forEach((b, i) => {
      if (b.code !== undefined) {
        first = false;
        out.push(`<div class="code"><pre>${esc(b.code)}</pre><div class="bar"><button class="copy" data-copy="${i}">${icon("copy")}Скопировать</button></div></div>`);
        return;
      }
      const l = b.lines;
      const h = /^(#{1,3}) (.*)$/.exec(l[0]);
      if (h && h[1].length > 1) first = false;
      if (h) {
        const tag = h[1].length === 1 ? "h1" : h[1].length === 2 ? "h2" : "h3";
        out.push(`<${tag}>${inline(h[2])}</${tag}>`);
        if (l.length > 1) out.push(`<p>${l.slice(1).map(inline).join("<br>")}</p>`);
        return;
      }
      const boldOnly = /^\*\*(.+)\*\*$/.exec(l[0]);
      if (boldOnly && l.length === 1 && blocks[i + 1]?.code !== undefined) {
        out.push(`<h3>${esc(boldOnly[1])}</h3>`);
        return;
      }
      if (boldOnly && l.length > 1) {
        const m = /^(\d+-\d+ (?:минута|минуты|сек)\.?)\s*(.*)$/.exec(boldOnly[1]);
        const k = m ? `<span class="k">${esc(m[1].replace(/\.$/, ""))}</span>` : "";
        const st = m ? m[2] : boldOnly[1];
        out.push(`<div class="step">${k}<div class="st">${esc(st)}</div><p>${l.slice(1).map(inline).join("<br>")}</p></div>`);
        return;
      }
      if (l.every((x) => /^- /.test(x))) {
        out.push(`<ul>${l.map((x) => `<li>${inline(x.slice(2))}</li>`).join("")}</ul>`);
        return;
      }
      if (l.every((x) => /^\d+\. /.test(x))) {
        out.push(`<ol>${l.map((x) => `<li>${inline(x.replace(/^\d+\. /, ""))}</li>`).join("")}</ol>`);
        return;
      }
      out.push(`<p${first ? ' class="lead"' : ""}>${l.map(inline).join("<br>")}</p>`);
      first = false;
    });
    return { html: out.join(""), codes: blocks };
  }

  // ---------- screens ----------
  function hero(title, sub) {
    return `<header class="hero"><div class="eyebrow"><img src="avatar.jpg" alt="">ИИшница</div><h1>${esc(title)}</h1><p>${esc(sub)}</p></header>`;
  }

  function searchBox(placeholder, value = "") {
    return `<label class="search">${icon("search")}<input type="search" placeholder="${esc(placeholder)}" value="${esc(value)}" enterkeyhint="search"></label>`;
  }

  function symFor(look, emoji) {
    return look ? `<span class="sym" style="--c1:${look.c[0]};--c2:${look.c[1]}">${icon(look.icon)}</span>` : `<span class="sym emoji">${esc(emoji || "📌")}</span>`;
  }

  async function screenGuides() {
    const list = await guides();
    const [top, ...rest] = list;
    view.innerHTML = `<section class="screen">
      ${hero("Гайды", "Пошагово, бесплатно, проверено на себе")}
      ${top ? `<button class="feature" data-go="#/guide/${esc(top.slug)}">
        <span class="sym" style="--c1:${top.c1};--c2:${top.c2}">${icon(top.icon)}</span>
        <span class="go">Открыть</span>
        <h3>${esc(top.title)}</h3><p>${esc(top.subtitle)}</p>
        <div class="meta">${top.tags.map((t) => `<span class="pill">${esc(t)}</span>`).join("")}</div>
      </button>` : `<div class="empty">Гайды скоро появятся</div>`}
      ${rest.length ? `<div class="caption">Ещё гайды</div><div class="group">${rest.map((g) => `<button class="row" data-go="#/guide/${esc(g.slug)}">
          <span class="sym" style="--c1:${g.c1};--c2:${g.c2}">${icon(g.icon)}</span>
          <span class="txt"><div class="t">${esc(g.title)}</div><div class="s">${esc(g.subtitle)}</div></span>${icon("chevron-right").replace('class="ti"', 'class="ti chev"')}
        </button>`).join("")}</div>` : ""}
      <div class="caption">Новые гайды</div>
      <div class="group"><button class="row" data-link="${CHANNEL}">
        <span class="sym" style="--c1:#2AABEE;--c2:#1E96D6">${icon("brand-telegram")}</span>
        <span class="txt"><div class="t">Канал ИИшница</div><div class="s">Каждый день промпт, инструмент или разбор</div></span>${icon("chevron-right").replace('class="ti"', 'class="ti chev"')}
      </button></div>
    </section>`;
  }

  async function screenGuide(slug) {
    const list = await guides();
    const g = list.find((x) => x.slug === slug);
    if (!g) return go("#/guides");
    const md = await load(g.file, "text");
    const { html, codes } = renderGuide(md);
    view.innerHTML = `<section class="screen">
      ${tg ? "" : `<div class="nav"><button class="back" data-go="#/guides">${icon("chevron-left")}Гайды</button></div>`}
      <article class="doc">${html}</article>
      <button class="cta" data-link="${CHANNEL}">${icon("brand-telegram")}Больше в канале ИИшница</button>
    </section>`;
    view.querySelectorAll("[data-copy]").forEach((b) => b.addEventListener("click", () => copy(codes[Number(b.dataset.copy)].code, b)));
  }

  function itemHtml(it) {
    const chips = [it.license && `<span class="chip ok">${esc(it.license)}</span>`, ...(it.tags || []).map((t) => `<span class="chip">${esc(t)}</span>`)].filter(Boolean).join("");
    return `<button class="item" data-link="${esc(it.url)}">
      <div class="top"><span class="t">${esc(it.name)}</span>${icon("link").replace('class="ti"', 'class="ti ext"')}</div>
      <div class="w">${esc(it.what)}</div>
      ${chips ? `<div class="chips">${chips}</div>` : ""}
      ${it.note ? `<div class="note">${esc(it.note)}</div>` : ""}
    </button>`;
  }

  async function screenLibrary(query = "") {
    const lib = await library();
    const q = query.trim().toLowerCase();
    const hits = q
      ? lib.sections.flatMap((s) => s.items.filter((it) => [it.name, it.what, it.note, ...(it.tags || [])].join(" ").toLowerCase().includes(q)))
      : [];
    view.innerHTML = `<section class="screen">
      ${hero("Библиотека", "Бесплатные шрифты, стоки, музыка и нейронки")}
      ${searchBox("Шрифты, музыка, фото", query)}
      ${q
        ? hits.length
          ? `<div class="group">${hits.map(itemHtml).join("")}</div>`
          : `<div class="empty">Ничего не нашлось</div>`
        : `<div class="group">${lib.sections.map((s) => `<button class="row" data-go="#/library/${esc(s.id)}">
            ${symFor(SECTION_LOOK[s.id], s.emoji)}
            <span class="txt"><div class="t">${esc(s.title)}</div></span>
            <span class="count">${s.items.length}</span>${icon("chevron-right").replace('class="ti"', 'class="ti chev"')}
          </button>`).join("")}</div>
          <p class="foot">Проверено ${esc(lib.updated.split("-").reverse().join("."))}. Лицензии меняются, перед коммерческим использованием загляни на сайт.</p>`}
    </section>`;
    const input = view.querySelector(".search input");
    input.addEventListener("input", () => {
      const pos = input.selectionStart;
      screenLibrary(input.value).then(() => {
        const next = view.querySelector(".search input");
        next.focus();
        next.setSelectionRange(pos, pos);
      });
    });
  }

  async function screenSection(id) {
    const lib = await library();
    const s = lib.sections.find((x) => x.id === id);
    if (!s) return go("#/library");
    view.innerHTML = `<section class="screen">
      ${tg ? "" : `<div class="nav"><button class="back" data-go="#/library">${icon("chevron-left")}Библиотека</button></div>`}
      <header class="hero"><div style="display:flex;align-items:center;gap:12px">${symFor(SECTION_LOOK[s.id], s.emoji)}<h1 style="margin:0">${esc(s.title)}</h1></div></header>
      <div class="group">${s.items.map(itemHtml).join("")}</div>
    </section>`;
  }

  // ---------- router ----------
  function go(hash) {
    if (location.hash === hash) route();
    else location.hash = hash;
  }

  async function route() {
    const [, a = "guides", b] = (location.hash || "#/guides").split("/");
    const deep = !!b;
    const tab = a.startsWith("guide") ? "guides" : "library";
    tabbar.dataset.at = tab;
    tabbar.querySelectorAll(".tab").forEach((t) => t.setAttribute("aria-selected", String(t.dataset.tab === tab)));
    tabbar.classList.toggle("hide", deep);
    if (tg) deep ? tg.BackButton.show() : tg.BackButton.hide();
    window.scrollTo(0, 0);
    try {
      if (a === "guide" && b) await screenGuide(decodeURIComponent(b));
      else if (a === "library" && b) await screenSection(decodeURIComponent(b));
      else if (a === "library") await screenLibrary();
      else await screenGuides();
    } catch (e) {
      view.innerHTML = `<div class="empty">Не получилось загрузить. Проверь интернет и открой ещё раз</div>`;
      console.error(e);
    }
  }

  document.addEventListener("click", (e) => {
    const el = e.target.closest("[data-go],[data-link],[data-tab]");
    if (!el) return;
    if (el.dataset.tab) {
      haptic();
      return go(`#/${el.dataset.tab}`);
    }
    if (el.dataset.link) return openLink(el.dataset.link);
    haptic();
    go(el.dataset.go);
  });

  tg?.BackButton.onClick(() => history.length > 1 ? history.back() : go("#/guides"));
  tg?.onEvent?.("themeChanged", applyTheme);
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", applyTheme);
  window.addEventListener("hashchange", route);

  applyTheme();
  paintIcons();
  tg?.ready();
  tg?.expand();
  // Deep link: t.me/<bot>/<app>?startapp=guide_reel-20 opens that guide.
  const start = tg?.initDataUnsafe?.start_param;
  if (start?.startsWith("guide_") && !location.hash) location.hash = `#/guide/${start.slice(6)}`;
  route();
})();
