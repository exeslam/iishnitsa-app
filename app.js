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
    agents: { icon: "robot", c: ["#FF9F0A", "#F08300"] },
    mcp: { icon: "plug-connected", c: ["#5E5CE6", "#4B48D6"] },
    content: { icon: "movie", c: ["#FF375F", "#E5214A"] },
    local: { icon: "cpu", c: ["#30B0C7", "#1C95AB"] },
    build: { icon: "rocket", c: ["#34C759", "#22A447"] },
    what: { icon: "bulb", c: ["#FFCC00", "#F2B600"] },
    list: { icon: "star", c: ["#FF9F0A", "#F08300"] },
  };

  // Browsable collections: sections of link items. `tab` decides which tab stays lit.
  const COLLECTIONS = {
    library: { file: "data/library.json", title: "Библиотека", sub: "Бесплатные шрифты, стоки, музыка и нейронки", search: "Шрифты, музыка, фото", tab: "library", base: "#/library" },
    repos: { file: "data/repos.json", title: "Репозитории", sub: "Самое полезное на GitHub, без которого сложно", search: "Агенты, видео, MCP", tab: "base", base: "#/c/repos" },
    skills: { file: "data/skills.json", title: "Скиллы", sub: "Что это такое и какие поставить первыми", search: "Документы, дизайн", tab: "base", base: "#/c/skills" },
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
  const glossary = () => load("data/glossary.json");

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

  const matches = (q, ...fields) => fields.flat().filter(Boolean).join(" ").toLowerCase().includes(q);

  // Re-render on every keystroke but keep focus and caret in the search field.
  function bindSearch(rerender) {
    const input = view.querySelector(".search input");
    input?.addEventListener("input", () => {
      const pos = input.selectionStart;
      rerender(input.value).then(() => {
        const next = view.querySelector(".search input");
        next.focus();
        next.setSelectionRange(pos, pos);
      });
    });
  }

  const back = (hash, label) => (tg ? "" : `<div class="nav"><button class="back" data-go="${hash}">${icon("chevron-left")}${esc(label)}</button></div>`);
  const chev = () => icon("chevron-right").replace('class="ti"', 'class="ti chev"');
  const checked = (d) => `<p class="foot">Проверено ${esc(d.split("-").reverse().join("."))}. Ссылки и лицензии меняются, перед коммерческим использованием загляни на сайт.</p>`;

  async function screenCollection(key, query = "") {
    const c = COLLECTIONS[key];
    const data = await load(c.file);
    const q = query.trim().toLowerCase();
    const hits = q ? data.sections.flatMap((s) => s.items.filter((it) => matches(q, it.name, it.what, it.note, it.tags || []))) : [];
    const topLevel = key === "library";
    view.innerHTML = `<section class="screen">
      ${topLevel ? hero(c.title, c.sub) : `${back("#/base", "База")}<header class="hero"><h1>${esc(c.title)}</h1><p>${esc(c.sub)}</p></header>`}
      ${data.intro && !q ? `<div class="card-note">${inline(data.intro)}</div>` : ""}
      ${searchBox(c.search, query)}
      ${q
        ? hits.length ? `<div class="group">${hits.map(itemHtml).join("")}</div>` : `<div class="empty">Ничего не нашлось</div>`
        : `<div class="group">${data.sections.map((s) => `<button class="row" data-go="${c.base}/${esc(s.id)}">
            ${symFor(SECTION_LOOK[s.id], s.emoji)}
            <span class="txt"><div class="t">${esc(s.title)}</div></span>
            <span class="count">${s.items.length}</span>${chev()}
          </button>`).join("")}</div>${checked(data.updated)}`}
    </section>`;
    bindSearch((v) => screenCollection(key, v));
  }

  async function screenSection(key, id) {
    const c = COLLECTIONS[key];
    const data = await load(c.file);
    const s = data.sections.find((x) => x.id === id);
    if (!s) return go(c.base);
    view.innerHTML = `<section class="screen">
      ${back(c.base, c.title)}
      <header class="hero"><div style="display:flex;align-items:center;gap:12px">${symFor(SECTION_LOOK[s.id], s.emoji)}<h1 style="margin:0">${esc(s.title)}</h1></div></header>
      <div class="group">${s.items.map(itemHtml).join("")}</div>
    </section>`;
  }

  async function screenBase() {
    const [g, r, k] = await Promise.all([glossary(), load(COLLECTIONS.repos.file).catch(() => null), load(COLLECTIONS.skills.file).catch(() => null)]);
    const row = (go, look, t, sub, n) => `<button class="row" data-go="${go}">
        <span class="sym" style="--c1:${look.c[0]};--c2:${look.c[1]}">${icon(look.icon)}</span>
        <span class="txt"><div class="t">${t}</div><div class="s">${sub}</div></span>${n ? `<span class="count">${n}</span>` : ""}${chev()}</button>`;
    const count = (d) => (d ? d.sections.reduce((n, s) => n + s.items.length, 0) : 0);
    view.innerHTML = `<section class="screen">
      ${hero("База", "Всё, что нужно понимать, чтобы делать штуки с нейронками")}
      <div class="group">
        ${row("#/glossary", { icon: "writing", c: ["#5E5CE6", "#4B48D6"] }, "Словарь вайбкодера", "Агент, скилл, MCP, токен и ещё десятки слов простым языком", g.terms.length)}
        ${r ? row("#/c/repos", { icon: "git-branch", c: ["#3A3A3C", "#1C1C1E"] }, "Репозитории", "Самые нужные проекты на GitHub", count(r)) : ""}
        ${k ? row("#/c/skills", { icon: "components", c: ["#FF9F0A", "#F08300"] }, "Скиллы", "Что это и какие поставить первыми", count(k)) : ""}
      </div>
    </section>`;
  }

  async function screenGlossary(query = "") {
    const g = await glossary();
    const q = query.trim().toLowerCase();
    const terms = g.terms.filter((t) => !q || matches(q, t.term, t.en, t.what, t.more));
    const cats = [...new Set(terms.map((t) => t.cat))];
    view.innerHTML = `<section class="screen">
      ${back("#/base", "База")}
      <header class="hero"><h1>Словарь вайбкодера</h1><p>Нажми на слово, чтобы раскрыть</p></header>
      ${searchBox("Например, скилл или токен", query)}
      ${terms.length ? cats.map((cat) => `<div class="caption">${esc(cat)}</div><div class="group">${terms.filter((t) => t.cat === cat).map((t) => `
        <details class="term"${q ? " open" : ""}>
          <summary><span class="t">${esc(t.term)}</span>${t.en ? `<span class="en">${esc(t.en)}</span>` : ""}${icon("chevron-down").replace('class="ti"', 'class="ti chev"')}</summary>
          <div class="body"><p>${inline(t.what)}</p>${t.more ? `<p class="more">${inline(t.more)}</p>` : ""}${t.url ? `<button class="src" data-link="${esc(t.url)}">${icon("link")}Источник</button>` : ""}</div>
        </details>`).join("")}</div>`).join("") : `<div class="empty">Такого слова пока нет. Напиши в комменты канала, добавлю</div>`}
    </section>`;
    view.querySelectorAll("details.term").forEach((d) => d.addEventListener("toggle", () => d.open && haptic()));
    bindSearch(screenGlossary);
  }

  // ---------- router ----------
  function go(hash) {
    if (location.hash === hash) route();
    else location.hash = hash;
  }

  async function route() {
    const [, a = "guides", b, c] = (location.hash || "#/guides").split("/");
    const tab = a.startsWith("guide") ? "guides" : a === "library" ? "library" : "base";
    const deep = a === "c" || a === "glossary" || !!(a === "guide" ? b : b);
    tabbar.dataset.at = tab;
    tabbar.querySelectorAll(".tab").forEach((t) => t.setAttribute("aria-selected", String(t.dataset.tab === tab)));
    tabbar.classList.toggle("hide", deep);
    if (tg) deep ? tg.BackButton.show() : tg.BackButton.hide();
    window.scrollTo(0, 0);
    const d = (x) => decodeURIComponent(x);
    try {
      if (a === "guide" && b) await screenGuide(d(b));
      else if (a === "library" && b) await screenSection("library", d(b));
      else if (a === "library") await screenCollection("library");
      else if (a === "c" && b && c) await screenSection(d(b), d(c));
      else if (a === "c" && b) await screenCollection(d(b));
      else if (a === "glossary") await screenGlossary();
      else if (a === "base") await screenBase();
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
  if (start === "glossary" && !location.hash) location.hash = "#/glossary";
  route();
})();
