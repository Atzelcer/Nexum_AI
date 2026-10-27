(function initNexumOrbit() {
  const cfg = window.NEXUM_ORBIT || {};
  const current = cfg.current || "inicio";

  const ROOT = Object.assign(
    {
      inicio: "/index.html",
      computador: "/modulo_teclado/laboratorio-web/",
      arquitecto: "/modulo_arquitecto/panel/",
      game: "/modulo_game/panel/"
    },
    cfg.paths || {}
  );

  const ICONS = {
    inicio: '<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/>',
    computador: '<rect x="2.5" y="6" width="19" height="12" rx="2"/><path d="M6 10h.01M9.5 10h.01M13 10h.01M16.5 10h.01M7 14h10"/>',
    arquitecto: '<path d="M12 2.8l8 4.6v9.2l-8 4.6-8-4.6V7.4z"/><path d="M12 12l8-4.6M12 12v9.2M12 12L4 7.4"/>',
    game: '<path d="M7 8h10a5 5 0 0 1 4.6 7l-.9 2a2.5 2.5 0 0 1-4.2.5L15 16H9l-1.5 1.5a2.5 2.5 0 0 1-4.2-.5l-.9-2A5 5 0 0 1 7 8z"/><path d="M8 11v3M6.5 12.5h3M15.5 11.5h.01M17.5 13.5h.01"/>',
    ajustes: '<circle cx="12" cy="12" r="3"/><path d="M12 2.5v2.2M12 19.3v2.2M4.6 4.6l1.6 1.6M17.8 17.8l1.6 1.6M2.5 12h2.2M19.3 12h2.2M4.6 19.4l1.6-1.6M17.8 6.2l1.6-1.6"/>'
  };

  const DESTINATIONS = [
    { id: "inicio", label: "Inicio", tag: "Portal", color: "#7fd8c0", key: "0" },
    { id: "computador", label: "Interacción", tag: "Teclado y cursor", color: "#10b49c", key: "1" },
    { id: "arquitecto", label: "Arquitecto 3D", tag: "Escenas espaciales", color: "#e07a35", key: "2" },
    { id: "game", label: "Videojuego", tag: "Gestos a combate", color: "#4f8ec8", key: "3" }
  ].map((d) => ({ ...d, href: ROOT[d.id], enabled: Boolean(ROOT[d.id]) }));

  const HUB_ID = "__hub";
  const SECTOR = 360 / DESTINATIONS.length;
  const START = -90 - SECTOR / 2;
  const C = 120;
  const R_IN = 42;
  const R_OUT = 106;
  const GAP = 1.6;
  const ARROWS = { ArrowUp: 0, ArrowRight: 1, ArrowDown: 2, ArrowLeft: 3 };

  const state = { open: false, hover: null, hold: false, indicatorRot: 0 };

  function icon(id, cls = "") {
    return `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[id] || ""}</svg>`;
  }

  function polar(r, deg) {
    const rad = (deg * Math.PI) / 180;
    return [C + r * Math.cos(rad), C + r * Math.sin(rad)];
  }

  function slicePath(rIn, rOut, startDeg, endDeg) {
    const [sx, sy] = polar(rOut, startDeg);
    const [ex, ey] = polar(rOut, endDeg);
    const [ix, iy] = polar(rIn, endDeg);
    const [jx, jy] = polar(rIn, startDeg);
    const large = endDeg - startDeg > 180 ? 1 : 0;
    return `M ${sx} ${sy} A ${rOut} ${rOut} 0 ${large} 1 ${ex} ${ey} L ${ix} ${iy} A ${rIn} ${rIn} 0 ${large} 0 ${jx} ${jy} Z`;
  }

  function arcPath(r, startDeg, endDeg) {
    const [sx, sy] = polar(r, startDeg);
    const [ex, ey] = polar(r, endDeg);
    return `M ${sx} ${sy} A ${r} ${r} 0 0 1 ${ex} ${ey}`;
  }

  function resolveHref(href) {
    if (!href) return href;
    if (href.startsWith("http") || href.startsWith("/")) return href;
    try {
      return new URL(href, window.location.href).pathname;
    } catch (_err) {
      return href;
    }
  }

  function findById(id) {
    return DESTINATIONS.find((d) => d.id === id);
  }

  function sectorsMarkup() {
    return DESTINATIONS.map((d, i) => {
      const start = START + i * SECTOR + GAP;
      const end = START + (i + 1) * SECTOR - GAP;
      const mid = ((START + (i + 0.5) * SECTOR) * Math.PI) / 180;
      const dx = (Math.cos(mid) * 5).toFixed(2);
      const dy = (Math.sin(mid) * 5).toFixed(2);
      const cls = ["nx-orbit-slice", d.id === current ? "is-current" : "", d.enabled ? "" : "is-disabled"].join(" ");
      return `<path class="${cls}" data-id="${d.id}" style="--dx:${dx}px;--dy:${dy}px;--c:${d.color};--i:${i}" d="${slicePath(R_IN, R_OUT, start, end)}"></path>`;
    }).join("");
  }

  function itemsMarkup() {
    return DESTINATIONS.map((d, i) => {
      const cls = ["nx-orbit-item", d.id === current ? "is-current" : "", d.enabled ? "" : "is-disabled"].join(" ");
      return `<button type="button" class="${cls}" data-id="${d.id}" style="--a:${i * SECTOR}deg;--c:${d.color};--i:${i}" tabindex="-1">
        ${icon(d.id, "nx-orbit-item-icon")}
        <strong>${d.label}</strong>
        <small>${d.id === current ? "Estás aquí" : d.tag}</small>
      </button>`;
    }).join("");
  }

  function mount() {
    if (document.querySelector("#nxOrbit")) return;

    const fabClass = cfg.fabDark ? "nx-orbit-fab on-dark" : "nx-orbit-fab";
    const indicatorStart = START + GAP;
    const indicatorEnd = START + SECTOR - GAP;
    const root = document.createElement("div");
    root.innerHTML = `
      <button type="button" class="${fabClass}" id="nxOrbitFab" title="Navegación NEXUM (mantén E)">
        <span class="nx-orbit-fab-ring" aria-hidden="true"></span>
        <strong>NEXUM</strong>
        <small>orbit</small>
      </button>
      <div id="nxOrbit" class="nx-orbit" hidden aria-hidden="true">
        <div class="nx-orbit-backdrop" id="nxOrbitBackdrop"></div>
        <div class="nx-orbit-stage" role="dialog" aria-label="Navegación de módulos">
          <div class="nx-orbit-disk" id="nxOrbitDisk">
            <svg class="nx-orbit-svg" viewBox="0 0 240 240" aria-hidden="true">
              <defs>
                <filter id="nxOrbitGlow" x="-50%" y="-50%" width="200%" height="200%">
                  <feGaussianBlur stdDeviation="2.4" result="b"/>
                  <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
                </filter>
                <radialGradient id="nxOrbitFace" cx="50%" cy="50%" r="50%">
                  <stop offset="0.38" stop-color="rgba(10,16,14,0.0)"/>
                  <stop offset="1" stop-color="rgba(10,16,14,0.72)"/>
                </radialGradient>
              </defs>
              <circle class="nx-orbit-face" cx="${C}" cy="${C}" r="${R_OUT + 6}" fill="url(#nxOrbitFace)"></circle>
              <circle class="nx-orbit-ticks" cx="${C}" cy="${C}" r="117"></circle>
              <circle class="nx-orbit-track" cx="${C}" cy="${C}" r="${R_OUT + 6}"></circle>
              ${sectorsMarkup()}
              <g class="nx-orbit-indicator" id="nxOrbitIndicator">
                <path d="${arcPath(R_OUT + 6, indicatorStart, indicatorEnd)}" filter="url(#nxOrbitGlow)"></path>
              </g>
              <g class="nx-orbit-cursor" id="nxOrbitCursor">
                <circle cx="${C}" cy="${C - (R_OUT + 6)}" r="2.6"></circle>
              </g>
              <circle class="nx-orbit-core-glow" cx="${C}" cy="${C}" r="${R_IN - 1}"></circle>
            </svg>
            ${itemsMarkup()}
            <button type="button" class="nx-orbit-hub" id="nxOrbitHubBtn" title="Ajustes">
              <span class="nx-orbit-hub-eyebrow">NEXUM orbit</span>
              <span class="nx-orbit-hub-icon" id="nxOrbitHubIcon"></span>
              <span class="nx-orbit-hub-label" id="nxOrbitHub">NEXUM</span>
              <small id="nxOrbitHubHint">Elige destino</small>
            </button>
          </div>
          <p class="nx-orbit-tip">
            <span><kbd>E</kbd> mantener y soltar</span>
            <span><kbd>←</kbd><kbd>↑</kbd><kbd>→</kbd><kbd>↓</kbd> elegir</span>
            <span><kbd>Enter</kbd> entrar</span>
            <span><kbd>Esc</kbd> cerrar</span>
            <span>Centro = ajustes</span>
          </p>
        </div>
      </div>
    `;
    document.body.appendChild(root);
    wire();
  }

  function rotateIndicator(idx) {
    const target = idx * SECTOR;
    const cur = state.indicatorRot;
    const delta = ((((target - cur) % 360) + 540) % 360) - 180;
    state.indicatorRot = cur + delta;
    const ind = document.querySelector("#nxOrbitIndicator");
    if (ind) ind.style.transform = `rotate(${state.indicatorRot}deg)`;
  }

  function setHover(id) {
    const orbit = document.querySelector("#nxOrbit");
    const hubBtn = document.querySelector("#nxOrbitHubBtn");
    const hubIcon = document.querySelector("#nxOrbitHubIcon");
    const hub = document.querySelector("#nxOrbitHub");
    const hint = document.querySelector("#nxOrbitHubHint");
    state.hover = id;

    document.querySelectorAll(".nx-orbit-slice, .nx-orbit-item").forEach((el) => {
      el.classList.toggle("is-hot", el.dataset.id === id);
    });
    hubBtn?.classList.toggle("is-hot", id === HUB_ID);

    if (id === HUB_ID) {
      orbit?.style.setProperty("--hot", "#d9c48a");
      orbit?.classList.add("is-hub");
      if (hubIcon) hubIcon.innerHTML = icon("ajustes");
      if (hub) hub.textContent = "Ajustes";
      if (hint) hint.textContent = "Fuente y cuenta";
      return;
    }

    const dest = findById(id);
    if (!dest) return;
    orbit?.classList.remove("is-hub");
    orbit?.style.setProperty("--hot", dest.color);
    rotateIndicator(DESTINATIONS.indexOf(dest));
    if (hubIcon) hubIcon.innerHTML = icon(dest.id);
    if (hub) hub.textContent = dest.label;
    if (hint) {
      hint.textContent = dest.id === current
        ? "Estás aquí"
        : dest.enabled ? "Suelta para entrar" : "No disponible";
    }
  }

  function openOrbit() {
    const el = document.querySelector("#nxOrbit");
    if (!el || state.open) return;
    state.open = true;
    el.hidden = false;
    el.classList.remove("is-closing", "has-cursor");
    el.setAttribute("aria-hidden", "false");
    document.querySelector("#nxOrbitFab")?.classList.add("is-open");
    setHover(current);
  }

  function closeOrbit(apply) {
    const el = document.querySelector("#nxOrbit");
    if (!el || !state.open) return;
    const chosen = state.hover;
    el.classList.add("is-closing");
    state.open = false;
    document.querySelector("#nxOrbitFab")?.classList.remove("is-open");
    window.setTimeout(() => {
      el.hidden = true;
      el.classList.remove("is-closing");
      el.setAttribute("aria-hidden", "true");
    }, 220);
    if (!apply || !chosen) return;
    if (chosen === HUB_ID) openAjustes();
    else goTo(chosen);
  }

  function openAjustes() {
    if (typeof cfg.onAjustes === "function") cfg.onAjustes();
    else if (typeof window.openAccess === "function") window.openAccess();
    else {
      document.querySelector("#settingsOpenBtn")?.click();
      document.querySelector("#authOpenBtn")?.click();
      document.querySelector("#openAccessBtn")?.click();
    }
  }

  function goTo(id) {
    const dest = findById(id);
    if (!dest || id === current || !dest.enabled) return;
    const href = resolveHref(dest.href);
    if (!href || href.startsWith("#")) return;
    window.location.href = href;
  }

  function onPointer(clientX, clientY) {
    const disk = document.querySelector("#nxOrbitDisk");
    if (!disk || !state.open) return;
    const rect = disk.getBoundingClientRect();
    const dx = clientX - (rect.left + rect.width / 2);
    const dy = clientY - (rect.top + rect.height / 2);
    const dist = Math.hypot(dx, dy);
    const angle = (Math.atan2(dy, dx) * 180) / Math.PI;

    const orbit = document.querySelector("#nxOrbit");
    const cursor = document.querySelector("#nxOrbitCursor");
    orbit?.classList.add("has-cursor");
    if (cursor) cursor.style.transform = `rotate(${angle + 90}deg)`;

    if (dist < rect.width * (R_IN / 240)) {
      if (state.hover !== HUB_ID) setHover(HUB_ID);
      return;
    }
    const a = (((angle - START) % 360) + 360) % 360;
    const id = DESTINATIONS[Math.min(DESTINATIONS.length - 1, Math.floor(a / SECTOR))].id;
    if (id !== state.hover) setHover(id);
  }

  function wire() {
    document.querySelector("#nxOrbitFab")?.addEventListener("click", () => {
      if (state.open) closeOrbit(true);
      else openOrbit();
    });
    document.querySelector("#nxOrbitBackdrop")?.addEventListener("click", () => closeOrbit(false));
    document.querySelector("#nxOrbitHubBtn")?.addEventListener("click", (e) => {
      e.stopPropagation();
      setHover(HUB_ID);
      closeOrbit(true);
    });
    document.querySelectorAll(".nx-orbit-slice, .nx-orbit-item").forEach((el) => {
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        setHover(el.dataset.id);
        closeOrbit(true);
      });
    });
    window.addEventListener("pointermove", (e) => {
      if (state.open) onPointer(e.clientX, e.clientY);
    });
    window.addEventListener("keydown", (e) => {
      const typing = e.target && ["INPUT", "TEXTAREA", "SELECT"].includes(e.target.tagName);
      if (e.code === "KeyE" && !e.repeat && !typing) {
        e.preventDefault();
        state.hold = true;
        openOrbit();
        return;
      }
      if (!state.open) return;
      if (e.key === "Escape") {
        closeOrbit(false);
      } else if (e.key in ARROWS) {
        e.preventDefault();
        setHover(DESTINATIONS[ARROWS[e.key]].id);
      } else if (e.key === "Enter") {
        e.preventDefault();
        closeOrbit(true);
      } else {
        const dest = DESTINATIONS.find((d) => d.key === e.key);
        if (dest) {
          e.preventDefault();
          e.stopImmediatePropagation();
          setHover(dest.id);
          closeOrbit(true);
        }
      }
    }, true);
    window.addEventListener("keyup", (e) => {
      if (e.code !== "KeyE" || !state.hold) return;
      state.hold = false;
      closeOrbit(true);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mount);
  } else {
    mount();
  }
})();
