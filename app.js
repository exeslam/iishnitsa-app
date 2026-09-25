// ИИшница mini-app. Plain JS, no build.
// Tabs: #/home (slider: product + club, promo video, category feed) and #/account (purchases, docs).
// Deep: #/p/<product>, #/guide/<slug>, #/prompt/<id>, #/glossary, #/library[/<sec>], #/c/<coll>[/<sec>], #/doc/<slug>, #/purchases.
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
    library: { file: "data/library.json", title: "Библиотека", sub: "Бесплатные шрифты, стоки, музыка и нейронки", search: "Шрифты, музыка, фото", tab: "home", base: "#/library" },
    repos: { file: "data/repos.json", title: "Репозитории", sub: "Самое полезное на GitHub, без которого сложно", search: "Агенты, видео, MCP", tab: "home", base: "#/c/repos" },
    skills: { file: "data/skills.json", title: "Скиллы", sub: "Что это такое и какие поставить первыми", search: "Документы, дизайн", tab: "home", base: "#/c/skills" },
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
  // Always light (Umar 26.09): the app ignores Telegram's and the OS dark mode.
  function applyTheme() {
    document.documentElement.dataset.theme = "light";
    const bg = document.body.classList.contains("white") ? "#FFFFFF" : "#F2F2F7";
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

  // ---------- home: slider (product, club) + promo video + category feed ----------
  const CATS = [
    { id: "all", title: "Все" },
    { id: "prompts", title: "Промпты" },
    { id: "interesting", title: "Интересное" },
    { id: "design", title: "Дизайн" },
    { id: "video", title: "Видео" },
    { id: "ai", title: "Нейронки" },
    { id: "guides", title: "Гайды" },
  ];
  const home = () => load("data/home.json");
  const prompts = () => load("data/prompts.json");
  let homeCat = "all";

  const card = (go, look, t, sub, extra = "") => `<button class="fcard" ${go.startsWith("http") ? `data-link="${esc(go)}"` : `data-go="${esc(go)}"`}>
      <span class="sym" style="--c1:${look.c[0]};--c2:${look.c[1]}">${icon(look.icon)}</span>
      <span class="txt"><span class="t">${esc(t)}</span><span class="s">${esc(sub)}</span></span>${extra || chev()}</button>`;
  const PROMPT_LOOK = { icon: "writing", c: ["#5E5CE6", "#4B48D6"] };

  async function feed(cat) {
    const [g, p, lib, repos] = await Promise.all([guides(), prompts(), load(COLLECTIONS.library.file), load(COLLECTIONS.repos.file)]);
    const libSec = (id) => lib.sections.find((s) => s.id === id);
    const secRow = (key, s) => s && card(`${COLLECTIONS[key].base}/${s.id}`, SECTION_LOOK[s.id] || { icon: "star", c: ["#8E8E93", "#6D6D72"] }, s.title, `${s.items.length} проверенных ссылок`);
    const blocks = {
      guides: () => g.map((x) => card(`#/guide/${x.slug}`, { icon: x.icon, c: [x.c1, x.c2] }, x.title, x.subtitle)),
      prompts: (n) => p.prompts.slice(0, n).map((x) => card(`#/prompt/${x.id}`, PROMPT_LOOK, x.title, x.text.split("\n")[0])),
      interesting: () => [
        card("#/glossary", { icon: "writing", c: ["#5E5CE6", "#4B48D6"] }, "Словарь вайбкодера", "Агент, скилл, MCP и токен простыми словами"),
        card("#/c/repos", { icon: "git-branch", c: ["#3A3A3C", "#1C1C1E"] }, "Репозитории", "Самые нужные проекты на GitHub"),
        card("#/c/skills", { icon: "components", c: ["#FF9F0A", "#F08300"] }, "Скиллы", "Что это и какие поставить первыми"),
      ],
      design: () => ["fonts", "icons", "photos", "3d", "design"].map((id) => secRow("library", libSec(id))).filter(Boolean),
      video: () => [secRow("library", libSec("video")), secRow("library", libSec("music")), secRow("repos", repos.sections.find((s) => s.id === "video"))].filter(Boolean),
      ai: (n) => (libSec("ai")?.items || []).slice(0, n).map((it) => card(it.url, SECTION_LOOK.ai, it.name, it.what, icon("link").replace('class="ti"', 'class="ti chev"'))),
    };
    if (cat !== "all") return `<div class="flist">${blocks[cat](99).join("")}</div>`;
    const ORDER = ["guides", "prompts", "interesting", "design", "video", "ai"];
    return ORDER.map((id) => CATS.find((c) => c.id === id))
      .map((c) => {
        const rows = blocks[c.id](3);
        return rows.length ? `<div class="fhead"><h2>${c.title}</h2><button class="more" data-cat="${c.id}">Все</button></div><div class="flist">${rows.join("")}</div>` : "";
      })
      .join("");
  }

  // Slides are video banners (motion, no sound); the text lives in the video, the pill leads to the product page.
  function slideHtml(s) {
    if (s.video)
      return `<button class="slide vid" data-go="#/p/${esc(s.slug)}" aria-label="${esc(s.title)}">
        <video src="${esc(s.video)}" ${s.poster ? `poster="${esc(s.poster)}"` : ""} autoplay muted loop playsinline preload="auto"></video>
        <span class="slide-cta glass-pill">${esc(s.cta)}${icon("chevron-right")}</span></button>`;
    return `<button class="slide" data-go="#/p/${esc(s.slug)}" style="--a:${s.c1};--b:${s.c2}">
      <div class="slide-art">${ART[s.art]?.() || ""}</div>
      <div class="slide-txt">
        ${s.badge ? `<span class="badge">${esc(s.badge)}</span>` : ""}
        <h2>${esc(s.title)}</h2><p>${esc(s.subtitle)}</p>
        <span class="slide-cta">${esc(s.cta)}${icon("chevron-right")}</span>
      </div></button>`;
  }

  async function screenHome() {
    const h = await home();
    view.innerHTML = `<section class="screen home">
      <header class="topbar"><img src="avatar.jpg" alt=""><div><b>ИИшница</b><span>нейронки на завтрак</span></div></header>
      <div class="slider" id="slider">${h.slides.map(slideHtml).join("")}</div>
      <div class="dots">${h.slides.map((_, i) => `<i class="${i ? "" : "on"}"></i>`).join("")}</div>
      ${h.video ? `<div class="promo"><video src="${esc(h.video.src)}" ${h.video.poster ? `poster="${esc(h.video.poster)}"` : ""} autoplay muted loop playsinline preload="metadata"></video></div>` : ""}
      <nav class="chips" id="chips">${CATS.map((c) => `<button class="chip-btn${c.id === homeCat ? " on" : ""}" data-cat="${c.id}">${c.title}</button>`).join("")}</nav>
      <div id="feed">${await feed(homeCat)}</div>
    </section>`;
    const slider = view.querySelector("#slider");
    const dots = view.querySelectorAll(".dots i");
    slider.addEventListener("scroll", () => {
      const i = Math.round(slider.scrollLeft / slider.clientWidth);
      dots.forEach((d, k) => d.classList.toggle("on", k === i));
    }, { passive: true });
  }

  async function selectCat(cat) {
    homeCat = cat;
    haptic();
    view.querySelectorAll(".chip-btn").forEach((b) => b.classList.toggle("on", b.dataset.cat === cat));
    view.querySelector(`.chip-btn[data-cat="${cat}"]`)?.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
    const f = view.querySelector("#feed");
    f.innerHTML = await feed(cat);
    const chips = view.querySelector("#chips");
    if (chips.getBoundingClientRect().top < 0) chips.scrollIntoView({ block: "start" });
  }

  // ---------- illustrations (inline, mm-apple: clean shapes, glass, systemBlue) ----------
  const ART = {
    terminal: () => `<div class="art-term"><div class="bar"><i></i><i></i><i></i></div>
      <div class="ln"><span class="pr">&gt;</span> claude</div>
      <div class="ln dim">Сделай мне сайт-визитку</div>
      <div class="ln ok">${icon("circle-check-filled")} index.html</div>
      <div class="ln ok">${icon("circle-check-filled")} style.css</div>
      <div class="ln ok">${icon("circle-check-filled")} Готово, открой в браузере</div></div>`,
    club: () => `<div class="art-club">${["🍳", "⚡️", "🎬", "🧩"].map((e, i) => `<span style="--i:${i}">${e}</span>`).join("")}<div class="bubble">Разбор твоего проекта в пятницу</div></div>`,
  };

  // ---------- product page from data/products/<slug>.json ----------
  function block(b) {
    switch (b.type) {
      case "hero":
        return `<div class="p-hero" style="--a:${b.c1};--b:${b.c2}"><div class="p-art">${ART[b.art]?.() || ""}</div>${b.badge ? `<span class="badge">${esc(b.badge)}</span>` : ""}<h1>${esc(b.title)}</h1><p>${esc(b.subtitle)}</p></div>`;
      case "facts":
        return `<div class="p-facts">${b.items.map((f) => `<div><b>${esc(f.value)}</b><span>${esc(f.label)}</span></div>`).join("")}</div>`;
      case "checklist":
        return `<h2 class="p-h">${esc(b.title)}</h2>${b.sub ? `<p class="p-sub">${esc(b.sub)}</p>` : ""}<div class="group">${b.items.map((it) => `<div class="row static">${symFor(it.look || { icon: it.icon || "check", c: it.c || ["#34C759", "#22A447"] })}<span class="txt"><div class="t">${esc(it.title)}</div>${it.sub ? `<div class="s">${inline(it.sub)}</div>` : ""}</span>${it.tag ? `<span class="chip">${esc(it.tag)}</span>` : ""}</div>`).join("")}</div>`;
      case "prices":
        return `<h2 class="p-h">${esc(b.title)}</h2>${b.sub ? `<p class="p-sub">${esc(b.sub)}</p>` : ""}<div class="p-prices">${b.items.map((p) => `<div class="price${p.pick ? " pick" : ""}">${p.pick ? `<span class="badge">${esc(p.pick)}</span>` : ""}<div class="pn">${esc(p.name)}</div><div class="pv">${esc(p.price)}</div><div class="ps">${esc(p.per || "")}</div><p>${esc(p.what)}</p></div>`).join("")}</div>${b.note ? `<p class="p-note">${inline(b.note)}</p>` : ""}`;
      case "modules":
        return `<h2 class="p-h">${esc(b.title)}</h2><div class="p-mods">${b.items.map((m, i) => `<div class="mod"><span class="n">${i + 1}</span><div><b>${esc(m.title)}</b><p>${inline(m.text)}</p></div></div>`).join("")}</div>`;
      case "faq":
        return `<h2 class="p-h">${esc(b.title || "Вопросы")}</h2><div class="group">${b.items.map((q) => `<details class="term"><summary><span class="t">${esc(q.q)}</span><span class="en"></span>${icon("chevron-down").replace('class="ti"', 'class="ti chev"')}</summary><div class="body"><p>${inline(q.a)}</p></div></details>`).join("")}</div>`;
      case "video":
        return `<div class="promo p-video"><video src="${esc(b.src)}" ${b.poster ? `poster="${esc(b.poster)}"` : ""} autoplay muted loop playsinline preload="metadata"></video></div>`;
      case "text":
        return `${b.title ? `<h2 class="p-h">${esc(b.title)}</h2>` : ""}<p class="p-sub">${inline(b.text)}</p>`;
      default:
        return "";
    }
  }

  async function screenProduct(slug) {
    const p = await load(`data/products/${slug}.json`);
    view.innerHTML = `<section class="screen product">
      ${back("#/home", "Главная")}
      ${p.blocks.map(block).join("")}
      <div class="p-bottom"><button class="cta" data-link="${esc(p.cta.url)}">${esc(p.cta.label)}</button>${p.cta.note ? `<p class="foot center">${esc(p.cta.note)}</p>` : ""}</div>
    </section>`;
  }

  async function screenPrompt(id) {
    const p = (await prompts()).prompts.find((x) => x.id === id);
    if (!p) return go("#/home");
    view.innerHTML = `<section class="screen">
      ${back("#/home", "Главная")}
      <article class="doc"><h1>${esc(p.title)}</h1><p class="lead">Скопируй и подставь своё в [скобки]</p>
      <div class="code"><pre>${esc(p.text)}</pre><div class="bar"><button class="copy" id="cp">${icon("copy")}Скопировать</button></div></div>
      ${p.from ? `<p><button class="src" data-go="#/guide/${esc(p.from)}">${icon("file-text")}Из гайда</button></p>` : ""}</article>
    </section>`;
    view.querySelector("#cp").addEventListener("click", (e) => copy(p.text, e.currentTarget));
  }

  // ---------- account ----------
  async function screenAccount() {
    const u = tg?.initDataUnsafe?.user;
    const name = u ? [u.first_name, u.last_name].filter(Boolean).join(" ") : "Гость";
    const ava = u?.photo_url ? `<img src="${esc(u.photo_url)}" alt="">` : `<span class="ava-fallback">${esc(name.slice(0, 1))}</span>`;
    const row = (goTo, look, t, sub = "") => `<button class="row" ${goTo.startsWith("http") ? `data-link="${esc(goTo)}"` : `data-go="${esc(goTo)}"`}>${symFor(look)}<span class="txt"><div class="t">${esc(t)}</div>${sub ? `<div class="s">${esc(sub)}</div>` : ""}</span>${chev()}</button>`;
    view.innerHTML = `<section class="screen">
      <header class="hero"><h1>Аккаунт</h1></header>
      <div class="profile">${ava}<div><b>${esc(name)}</b><span>${u?.username ? "@" + esc(u.username) : "Открой приложение из Telegram"}</span></div></div>
      <div class="caption">Покупки</div>
      <div class="group">${row("#/purchases", { icon: "wallet", c: ["#34C759", "#22A447"] }, "Мои покупки", "Курсы, паки и подписка на клуб")}</div>
      <div class="caption">Документы</div>
      <div class="group">
        ${row("#/doc/privacy", { icon: "shield-check", c: ["#8E8E93", "#6D6D72"] }, "Политика конфиденциальности")}
        ${row("#/doc/terms", { icon: "file-text", c: ["#8E8E93", "#6D6D72"] }, "Пользовательское соглашение")}
        ${row("#/doc/offer", { icon: "clipboard-list", c: ["#8E8E93", "#6D6D72"] }, "Публичная оферта")}
      </div>
      <div class="caption">Связь</div>
      <div class="group">
        ${row("https://t.me/iishnitsa_nazavtrak", { icon: "brand-telegram", c: ["#2AABEE", "#1E96D6"] }, "Канал ИИшница")}
        ${row("https://t.me/iishnitsa1_bot", { icon: "message-circle", c: ["#007AFF", "#0A6CFF"] }, "Поддержка", "Напиши боту, ответим")}
      </div>
      <p class="foot center">ИИшница · версия 0.3</p>
    </section>`;
  }

  async function screenPurchases() {
    view.innerHTML = `<section class="screen">${back("#/account", "Аккаунт")}<header class="hero"><h1>Мои покупки</h1></header>
      <div class="empty-card">${icon("wallet")}<b>Покупок пока нет</b><p>Когда купишь курс или вступишь в клуб, доступ появится здесь</p><button class="cta" data-go="#/home">На главную</button></div></section>`;
  }

  const DOC_TITLES = { privacy: "Политика конфиденциальности", terms: "Пользовательское соглашение", offer: "Публичная оферта" };

  async function screenDoc(slug) {
    const md = await load(`docs/${slug}.md`, "text").catch(() => null);
    const body = md
      ? `<article class="doc legal">${renderGuide(md).html}</article>`
      : `<header class="hero"><h1>${esc(DOC_TITLES[slug] || "Документ")}</h1></header><div class="empty-card">${icon("file-text")}<b>Документ готовится</b><p>${slug === "offer" ? "Оферта появится вместе со стартом продаж" : "Скоро опубликуем. Вопросы можно задать в боте"}</p></div>`;
    view.innerHTML = `<section class="screen">${back("#/account", "Аккаунт")}${body}</section>`;
  }

  async function screenGuide(slug) {
    const list = await guides();
    const g = list.find((x) => x.slug === slug);
    if (!g) return go("#/home");
    const md = await load(g.file, "text");
    const { html, codes } = renderGuide(md);
    view.innerHTML = `<section class="screen">
      ${tg ? "" : `<div class="nav"><button class="back" data-go="#/home">${icon("chevron-left")}Главная</button></div>`}
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
    view.innerHTML = `<section class="screen">
      ${back("#/home", "Главная")}<header class="hero"><h1>${esc(c.title)}</h1><p>${esc(c.sub)}</p></header>
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

  async function screenGlossary(query = "") {
    const g = await glossary();
    const q = query.trim().toLowerCase();
    const terms = g.terms.filter((t) => !q || matches(q, t.term, t.en, t.what, t.more));
    const cats = [...new Set(terms.map((t) => t.cat))];
    view.innerHTML = `<section class="screen">
      ${back("#/home", "Главная")}
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
    const [, a = "home", b, c] = (location.hash || "#/home").split("/");
    const tab = a === "account" || a === "doc" || a === "purchases" ? "account" : "home";
    const deep = !["home", "account", ""].includes(a);
    tabbar.dataset.at = tab;
    tabbar.querySelectorAll(".tab").forEach((t) => t.setAttribute("aria-selected", String(t.dataset.tab === tab)));
    tabbar.classList.toggle("hide", deep);
    document.body.classList.toggle("white", a === "home" || a === "" || a === "p");
    applyTheme();
    if (tg) deep ? tg.BackButton.show() : tg.BackButton.hide();
    window.scrollTo(0, 0);
    const d = (x) => decodeURIComponent(x);
    try {
      if (a === "guide" && b) await screenGuide(d(b));
      else if (a === "p" && b) await screenProduct(d(b));
      else if (a === "prompt" && b) await screenPrompt(d(b));
      else if (a === "library" && b) await screenSection("library", d(b));
      else if (a === "library") await screenCollection("library");
      else if (a === "c" && b && c) await screenSection(d(b), d(c));
      else if (a === "c" && b) await screenCollection(d(b));
      else if (a === "glossary") await screenGlossary();
      else if (a === "account") await screenAccount();
      else if (a === "purchases") await screenPurchases();
      else if (a === "doc" && b) await screenDoc(d(b));
      else await screenHome();
    } catch (e) {
      view.innerHTML = `<div class="empty">Не получилось загрузить. Проверь интернет и открой ещё раз</div>`;
      console.error(e);
    }
  }

  document.addEventListener("click", (e) => {
    const el = e.target.closest("[data-go],[data-link],[data-tab],[data-cat]");
    if (!el) return;
    if (el.dataset.cat) return selectCat(el.dataset.cat);
    if (el.dataset.tab) {
      haptic();
      return go(`#/${el.dataset.tab}`);
    }
    if (el.dataset.link) return openLink(el.dataset.link);
    haptic();
    go(el.dataset.go);
  });

  tg?.BackButton.onClick(() => (history.length > 1 ? history.back() : go("#/home")));
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
