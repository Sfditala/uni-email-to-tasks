(() => {
  const SVG = "http://www.w3.org/2000/svg";
  const $ = (id) => document.getElementById(id);
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const BOX = 62;

  const KINDS = {
    trigger: { color: "#ef5a66", label: "Trigger", glyph: "▶" },
    agent: { color: "#f5c04e", label: "Agent", glyph: "✦" },
    model: { color: "#b18cff", label: "Model", glyph: "◆" },
    knowledge: { color: "#4fd1a5", label: "Knowledge & memory", glyph: "▤" },
    tool: { color: "#63b3ff", label: "Tool", glyph: "⚙" },
    gate: { color: "#ff9f5a", label: "Logic & gates", glyph: "⑂" },
    output: { color: "#e6e6e6", label: "Message & voice", glyph: "✉" },
  };

  function kindOf(type) {
    const t = type.toLowerCase();
    if (/trigger/.test(t)) return "trigger";
    if (/agenttool|\.agent$/.test(t)) return "agent";
    if (/lmchat|embeddings/.test(t)) return "model";
    if (/vectorstore|memory|dataloader|textsplitter/.test(t)) return "knowledge";
    if (/hitl|\.if$|switch|\.set$|\.code$/.test(t)) return "gate";
    if (/tool|googledrive|\.supabase$/.test(t)) return "tool";
    return "output";
  }

  const state = { project: null, wf: null, nodes: new Map(), trace: null, step: -1, timer: null, view: null, selected: null };
  const cache = new Map();

  function el(tag, attrs = {}, ...kids) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === "class") e.className = v;
      else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
      else e.setAttribute(k, v);
    }
    for (const kid of kids) e.append(kid);
    return e;
  }
  function svg(tag, attrs = {}) {
    const e = document.createElementNS(SVG, tag);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
    return e;
  }

  async function load() {
    const res = await fetch("workflow.json");
    if (!res.ok) throw new Error("workflow.json is missing");
    return res.json();
  }

  function edgesOf(wf) {
    const out = [];
    for (const [from, kinds] of Object.entries(wf.connections)) {
      for (const [kind, outputs] of Object.entries(kinds)) {
        (outputs || []).forEach((targets, index) => {
          for (const t of targets || []) out.push({ from, to: t.node, kind, index, total: outputs.length });
        });
      }
    }
    return out;
  }

  /* ---------- canvas ---------- */
  function drawCanvas() {
    const canvas = $("canvas");
    canvas.replaceChildren();
    canvas.classList.remove("dim");
    const nodes = state.wf.nodes.filter((n) => !n.type.endsWith("stickyNote"));
    state.nodes = new Map(nodes.map((n) => [n.name, n]));
    const world = svg("g", { id: "world" });
    const edgeLayer = svg("g");
    const nodeLayer = svg("g");
    world.append(edgeLayer, nodeLayer);
    canvas.append(world);

    for (const e of edgesOf(state.wf)) {
      const a = state.nodes.get(e.from);
      const b = state.nodes.get(e.to);
      if (!a || !b) continue;
      const ai = e.kind !== "main";
      let d;
      if (ai) {
        const x1 = a.position[0] + BOX / 2, y1 = a.position[1];
        const x2 = b.position[0] + BOX / 2, y2 = b.position[1] + BOX;
        const my = (y1 + y2) / 2;
        d = `M${x1} ${y1} C${x1} ${my} ${x2} ${my} ${x2} ${y2}`;
      } else {
        const spread = e.total > 1 ? (e.index - (e.total - 1) / 2) * 16 : 0;
        const x1 = a.position[0] + BOX, y1 = a.position[1] + BOX / 2 + spread;
        const x2 = b.position[0], y2 = b.position[1] + BOX / 2;
        const bend = Math.max(40, Math.abs(x2 - x1) / 2);
        d = `M${x1} ${y1} C${x1 + bend} ${y1} ${x2 - bend} ${y2} ${x2} ${y2}`;
      }
      edgeLayer.append(svg("path", { d, class: `edge${ai ? " ai" : ""}` }));
    }

    for (const n of nodes) {
      const kind = KINDS[kindOf(n.type)];
      const g = svg("g", { class: "node", transform: `translate(${n.position[0]} ${n.position[1]})`, tabindex: "0", role: "button", "aria-label": n.name, "data-name": n.name });
      g.append(svg("rect", { class: "box", width: BOX, height: BOX, rx: 13 }));
      const glyph = svg("text", { class: "glyph", x: BOX / 2, y: BOX / 2, fill: kind.color });
      glyph.textContent = kind.glyph;
      g.append(glyph);
      const words = wrap(n.name);
      words.forEach((line, i) => {
        const t = svg("text", { class: "label", x: BOX / 2, y: BOX + 16 + i * 14 });
        t.textContent = line;
        g.append(t);
      });
      g.addEventListener("click", () => selectNode(n.name));
      g.addEventListener("keydown", (ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); selectNode(n.name); } });
      nodeLayer.append(g);
    }
    fit();
  }

  function wrap(name) {
    if (name.length <= 16) return [name];
    const parts = name.split(/(?<=[ _-])/);
    const lines = [""];
    for (const p of parts) {
      if ((lines[lines.length - 1] + p).length > 16 && lines[lines.length - 1]) lines.push(p);
      else lines[lines.length - 1] += p;
    }
    if (lines.length > 2) return [lines[0], `${lines[1].slice(0, 13)}…`];
    return lines.map((l) => l.trim());
  }

  function bounds() {
    const xs = [...state.nodes.values()].map((n) => n.position);
    return {
      x: Math.min(...xs.map((p) => p[0])) - 50,
      y: Math.min(...xs.map((p) => p[1])) - 50,
      w: Math.max(...xs.map((p) => p[0])) - Math.min(...xs.map((p) => p[0])) + BOX + 100,
      h: Math.max(...xs.map((p) => p[1])) - Math.min(...xs.map((p) => p[1])) + BOX + 100,
    };
  }
  function setView(v) {
    state.view = v;
    $("canvas").setAttribute("viewBox", `${v.x} ${v.y} ${v.w} ${v.h}`);
  }
  function fit() { setView(bounds()); }
  function zoom(f, cx, cy) {
    const v = state.view;
    const px = cx ?? v.x + v.w / 2, py = cy ?? v.y + v.h / 2;
    const w = Math.min(Math.max(v.w * f, 200), 9000), h = v.h * (w / v.w);
    setView({ x: px - ((px - v.x) * w) / v.w, y: py - ((py - v.y) * h) / v.h, w, h });
  }
  function focusOn(name) {
    const n = state.nodes.get(name);
    if (!n) return;
    const b = bounds();
    const w = Math.min(b.w, 1300);
    const r = $("canvas").getBoundingClientRect();
    const h = w * (r.height / Math.max(r.width, 1));
    animateView({ x: n.position[0] + BOX / 2 - w / 2, y: n.position[1] + BOX / 2 - h / 2, w, h });
  }
  let viewAnim;
  function animateView(to) {
    cancelAnimationFrame(viewAnim);
    if (reduced) return setView(to);
    const from = { ...state.view };
    const start = performance.now();
    const tick = (t) => {
      const p = Math.min((t - start) / 450, 1);
      const e = 1 - (1 - p) ** 3;
      setView({ x: from.x + (to.x - from.x) * e, y: from.y + (to.y - from.y) * e, w: from.w + (to.w - from.w) * e, h: from.h + (to.h - from.h) * e });
      if (p < 1) viewAnim = requestAnimationFrame(tick);
    };
    viewAnim = requestAnimationFrame(tick);
  }

  function initPanZoom() {
    const c = $("canvas");
    let drag = null;
    const pointers = new Map();
    let pinch = 0;
    c.addEventListener("pointerdown", (e) => {
      pointers.set(e.pointerId, [e.clientX, e.clientY]);
      if (e.target.closest(".node") && pointers.size === 1) return;
      drag = { x: e.clientX, y: e.clientY, view: { ...state.view } };
      c.setPointerCapture(e.pointerId);
      c.classList.add("dragging");
    });
    c.addEventListener("pointermove", (e) => {
      if (pointers.has(e.pointerId)) pointers.set(e.pointerId, [e.clientX, e.clientY]);
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
        if (pinch) zoom(pinch / d);
        pinch = d;
        return;
      }
      if (!drag) return;
      const r = c.getBoundingClientRect();
      const s = Math.max(drag.view.w / r.width, drag.view.h / r.height);
      setView({ ...drag.view, x: drag.view.x - (e.clientX - drag.x) * s, y: drag.view.y - (e.clientY - drag.y) * s });
    });
    const end = (e) => {
      pointers.delete(e.pointerId);
      pinch = 0;
      drag = null;
      c.classList.remove("dragging");
    };
    c.addEventListener("pointerup", end);
    c.addEventListener("pointercancel", end);
    c.addEventListener("wheel", (e) => {
      e.preventDefault();
      const r = c.getBoundingClientRect();
      const v = state.view;
      const s = Math.max(v.w / r.width, v.h / r.height);
      const cx = v.x + v.w / 2 + (e.clientX - r.left - r.width / 2) * s;
      const cy = v.y + v.h / 2 + (e.clientY - r.top - r.height / 2) * s;
      zoom(e.deltaY > 0 ? 1.12 : 0.89, cx, cy);
    }, { passive: false });
    $("zoomIn").onclick = () => zoom(0.8);
    $("zoomOut").onclick = () => zoom(1.25);
    $("fit").onclick = fit;
  }

  /* ---------- node panel ---------- */
  function readable(node) {
    const p = node.parameters || {};
    const out = [];
    const add = (title, v) => { if (typeof v === "string" && v.trim()) out.push([title, v.replace(/^=/, "")]); };
    add("System prompt", p.options?.systemMessage);
    add("Tool description", p.toolDescription || p.description);
    add("Input", p.text);
    add("Message", p.message);
    add("Code", p.jsCode);
    return out;
  }

  function selectNode(name, opts = {}) {
    state.selected = name;
    document.querySelectorAll(".node.selected").forEach((n) => n.classList.remove("selected"));
    document.querySelector(`.node[data-name="${CSS.escape(name)}"]`)?.classList.add("selected");
    const node = state.nodes.get(name);
    if (!node) return;
    const panel = $("panel");
    panel.replaceChildren();
    const k = KINDS[kindOf(node.type)];
    panel.append(el("span", { class: "badge" }, k.label));
    panel.append(el("h3", {}, node.name));
    panel.append(el("div", { class: "type" }, node.type));

    const edges = edgesOf(state.wf);
    const linkRow = (title, names) => {
      if (!names.length) return;
      panel.append(el("h4", {}, title));
      const row = el("div", { class: "links" });
      for (const n of [...new Set(names)]) row.append(el("button", { onclick: () => selectNode(n) }, n));
      panel.append(row);
    };
    linkRow("Receives from", edges.filter((e) => e.to === name).map((e) => e.from));
    linkRow("Sends to", edges.filter((e) => e.from === name).map((e) => e.to));

    const texts = readable(node);
    for (const [title, value] of texts) {
      panel.append(el("h4", {}, title));
      panel.append(el("pre", {}, value));
    }
    panel.append(el("h4", {}, "All parameters"));
    const det = el("details");
    det.append(el("summary", {}, "Show JSON"));
    det.append(el("pre", {}, JSON.stringify(node.parameters || {}, null, 2)));
    panel.append(det);
    if (!opts.keepScroll) panel.scrollTop = 0;
  }

  function panelHome() {
    const panel = $("panel");
    panel.replaceChildren();
    panel.append(el("h3", {}, "Click any node"));
    panel.append(el("p", {}, "You'll see what it does, what it connects to, and its real prompt or code. Drag to move around, and scroll or pinch to zoom."));
    const note = state.wf.nodes.find((n) => n.type.endsWith("stickyNote"));
    if (note) {
      panel.append(el("h4", {}, "My build notes (Arabic)"));
      panel.append(el("pre", { dir: "rtl" }, note.parameters.content.trim()));
    }
  }

  /* ---------- traces ---------- */
  function renderPicks() {
    const box = $("tracePicks");
    box.replaceChildren();
    state.project.traces.forEach((t, i) => {
      box.append(el("button", { "aria-pressed": String(state.trace === t), onclick: () => pickTrace(i, true) }, t.label));
    });
  }
  function pickTrace(i, autoplay) {
    stop();
    state.trace = state.project.traces[i];
    state.step = -1;
    renderPicks();
    clearMarks();
    renderCaption();
    if (autoplay) play();
  }
  function clearMarks() {
    document.querySelectorAll(".node").forEach((n) => n.classList.remove("active", "visited"));
    document.querySelectorAll(".packet").forEach((p) => p.remove());
    $("canvas").classList.remove("dim");
  }
  function renderCaption() {
    const c = $("caption");
    c.replaceChildren();
    const t = state.trace;
    $("count").textContent = state.step >= 0 ? `${state.step + 1}/${t.steps.length}` : `${t.steps.length} steps`;
    if (state.step < 0) {
      c.append(el("span", { class: "ask", dir: "auto" }, `“${t.ask}”`));
      c.append(el("span", {}, "Press play to follow this message through the workflow."));
      return;
    }
    const [name, note] = t.steps[state.step];
    c.append(el("span", { class: "who" }, name));
    c.append(el("span", {}, note));
  }
  function goto(i, animate = true) {
    const t = state.trace;
    if (i < 0 || i >= t.steps.length) return;
    const prev = state.step;
    state.step = i;
    clearMarks();
    $("canvas").classList.add("dim");
    const seen = new Set(t.steps.slice(0, i).map((s) => s[0]));
    for (const name of seen) document.querySelector(`.node[data-name="${CSS.escape(name)}"]`)?.classList.add("visited");
    const name = t.steps[i][0];
    const g = document.querySelector(`.node[data-name="${CSS.escape(name)}"]`);
    g?.classList.remove("visited");
    g?.classList.add("active");
    if (animate && prev === i - 1 && prev >= 0) packet(t.steps[prev][0], name);
    focusOn(name);
    selectNode(name);
    renderCaption();
  }
  function packet(from, to) {
    if (reduced) return;
    const a = state.nodes.get(from), b = state.nodes.get(to);
    if (!a || !b) return;
    const dot = svg("circle", { r: 7, class: "packet" });
    $("world").append(dot);
    const start = performance.now();
    const tick = (t) => {
      const p = Math.min((t - start) / 450, 1);
      dot.setAttribute("cx", a.position[0] + BOX / 2 + (b.position[0] - a.position[0]) * p);
      dot.setAttribute("cy", a.position[1] + BOX / 2 + (b.position[1] - a.position[1]) * p);
      if (p < 1) requestAnimationFrame(tick);
      else dot.remove();
    };
    requestAnimationFrame(tick);
  }
  function setPlayLabel(on) { $("play").textContent = on ? "❚❚ Pause" : "▶ Play"; }
  function stop() { clearInterval(state.timer); state.timer = null; setPlayLabel(false); }
  function play() {
    if (state.timer) return stop();
    if (state.step >= state.trace.steps.length - 1) state.step = -1;
    setPlayLabel(true);
    goto(state.step + 1);
    state.timer = setInterval(() => {
      if (state.step >= state.trace.steps.length - 1) return stop();
      goto(state.step + 1);
    }, 2600);
  }

  /* ---------- story ---------- */
  function renderStory() {
    const p = state.project;
    const story = $("story");
    story.replaceChildren();
    const sec = (title, cls = "") => {
      const s = el("div", { class: cls });
      s.append(el("h3", {}, title));
      story.append(s);
      return s;
    };
    sec("The problem").append(el("p", { style: "margin:0;color:var(--muted)" }, p.problem));
    const chips = el("div", { class: "chips" });
    p.stack.forEach((t) => chips.append(el("span", {}, t)));
    sec("Built with").append(chips);

    const d = el("ul", { class: "list" });
    p.decisions.forEach(([a, b]) => d.append(el("li", {}, el("b", {}, a), el("span", {}, b))));
    sec("Design decisions").append(d);

    const l = el("ul", { class: "list" });
    p.lessons.forEach(([a, b]) => l.append(el("li", {}, el("span", {}, a), el("span", { class: "fix" }, b))));
    sec("What broke, and the fix").append(l);

    const steps = el("ol", { class: "steps" });
    p.setup.forEach((s) => {
      const li = el("li");
      s.split(/(YOUR_[A-Z_]+|content_calendar|best_times|campaign_metrics|match_documents|documents)/).forEach((part, i) => {
        li.append(i % 2 ? el("code", {}, part) : part);
      });
      steps.append(li);
    });
    const run = sec("Run it yourself", "wide");
    run.append(steps);
    run.append(el("a", { class: "btn solid dl", href: "workflow.json", download: `${p.slug}.json` }, "Download the n8n JSON"));
  }

  /* ---------- the idea unique to this project ---------- */
  function renderSignature() {
    const sig = state.project.signature;
    const box = $("signature");
    box.replaceChildren(el("h2", {}, sig.title), el("p", { class: "sig-sub" }, sig.sub));
    const grid = el("div", { class: `sig-grid ${sig.style}` });
    const result = el("div", { class: "sig-result", "aria-live": "polite" }, sig.prompt);
    sig.items.forEach((item) => {
      const b = el("button", { class: "sig-card", "aria-pressed": "false" });
      if (item.time) b.append(el("span", { class: "sig-time" }, item.time));
      b.append(el("span", { class: "sig-label", dir: "auto" }, item.label));
      b.addEventListener("click", () => {
        grid.querySelectorAll(".sig-card").forEach((c) => c.setAttribute("aria-pressed", "false"));
        b.setAttribute("aria-pressed", "true");
        const follow = el("button", { class: "btn solid", onclick: () => {
          pickTrace(item.trace, true);
          document.querySelector(".stage").scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
        } }, "▶ Watch it in the workflow");
        result.replaceChildren(el("span", { class: "sig-tag" }, item.tag), el("p", {}, item.text), follow);
      });
      grid.append(b);
    });
    box.append(grid, result);
    if (sig.note) box.append(el("p", { class: "sig-note" }, sig.note));
  }

  function legend() {
    const box = $("legend");
    box.replaceChildren();
    const present = new Set(state.wf.nodes.filter((n) => !n.type.endsWith("stickyNote")).map((n) => kindOf(n.type)));
    for (const [key, k] of Object.entries(KINDS)) {
      if (!present.has(key)) continue;
      const item = el("span");
      const dot = el("i", { style: `background:${k.color}` });
      item.append(dot, k.label);
      box.append(item);
    }
  }

  /* ---------- projects ---------- */
  async function init() {
    state.project = window.PROJECT;
    state.wf = await load();
    state.trace = state.project.traces[0];
    $("prev").onclick = () => { stop(); goto(state.step - 1, false); };
    $("next").onclick = () => { stop(); goto(state.step + 1); };
    $("play").onclick = play;
    initPanZoom();
    renderSignature();
    renderStory();
    drawCanvas();
    legend();
    renderPicks();
    renderCaption();
    panelHome();

    const real = state.wf.nodes.filter((n) => !n.type.endsWith("stickyNote"));
    const agents = real.filter((n) => kindOf(n.type) === "agent").length;
    const stats = $("stats");
    for (const [v, k] of [[real.length, "nodes to open"], [agents, agents === 1 ? "AI agent" : "AI agents"], [state.project.traces.length, "paths to follow"]]) {
      stats.append(el("div", {}, el("dt", {}, k), el("dd", {}, String(v))));
    }
  }

  init().catch((err) => {
    $("caption").textContent = `The workflows couldn't load: ${err.message}`;
  });
})();
