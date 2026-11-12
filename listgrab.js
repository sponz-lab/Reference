(function () {
  var APP = "__APP_URL__";

  function txt(el) {
    return (el ? el.textContent : "").replace(/ /g, " ").replace(/\s+/g, " ").trim();
  }
  function docs(win) {
    var D;
    try { D = (win || window).document; } catch (e) { return []; }
    if (!D) return [];
    var out = [D];
    var ifr = D.getElementsByTagName("iframe");
    for (var i = 0; i < ifr.length; i++) {
      try { if (ifr[i].contentDocument) out.push(ifr[i].contentDocument); } catch (e) {}
    }
    return out;
  }

  /* ───────── 열 이름 판별 ───────── */
  var HEAD = {
    bc:   /^(바코드|barcode|bar\s*code)$/i,
    qty:  /^(수량|요청수량|출고수량|반품수량|처리수량|반품요청수량|출고요청수량|qty)$/i,
    nm:   /^(상품명|제품명|품명)$/,
    code: /(전표\s*번호|반품\s*코드)/
  };

  /* ───────── ① ag-Grid (이 회사 시스템이 쓰는 방식) ───────── */
  function agGrids(win) {
    /* { api, columnApi, options } 묶음으로 모은다 */
    var out = [], ds = docs(win), seen = [];
    for (var d = 0; d < ds.length; d++) {
      var roots = ds[d].querySelectorAll(".ag-root-wrapper, .ag-root");
      for (var i = 0; i < roots.length; i++) {
        var c = roots[i].__agComponent;
        if (!c) continue;
        var go = c.gridOptions || c, api = null, capi = null;
        try { api = go.api || go.gridApi || c.api || null; } catch (e) {}
        try { capi = go.columnApi || c.columnApi || null; } catch (e) {}
        if (!api || typeof api.forEachNode !== "function") continue;
        if (seen.indexOf(api) >= 0) continue;
        seen.push(api);
        out.push({ api: api, capi: capi, opts: go });
      }
    }
    return out;
  }

  function flatDefs(defs, out) {
    out = out || [];
    for (var i = 0; defs && i < defs.length; i++) {
      var d = defs[i];
      if (d && d.children) flatDefs(d.children, out);
      else if (d) out.push(d);
    }
    return out;
  }

  function agColumns(g) {
    /* colId(=데이터 열쇠) ↔ 화면에 보이는 열 이름 */
    var map = [], i;
    try {
      var cols = g.capi && g.capi.getAllGridColumns ? g.capi.getAllGridColumns()
               : (g.api.getColumns ? g.api.getColumns() : null);
      if (cols && cols.length) {
        for (i = 0; i < cols.length; i++) {
          var cd = cols[i].getColDef ? (cols[i].getColDef() || {}) : {};
          map.push({ id: cols[i].getColId ? cols[i].getColId() : (cd.field || ""), head: cd.headerName || cd.field || "" });
        }
        return map;
      }
    } catch (e) {}
    try {
      /* 처음 정의해 둔 열 목록 — 위 경로가 막혔을 때의 대비책 */
      var defs = flatDefs(g.opts && g.opts.columnDefs);
      for (i = 0; i < defs.length; i++) {
        map.push({ id: defs[i].colId || defs[i].field || "", head: defs[i].headerName || defs[i].field || "" });
      }
    } catch (e) {}
    return map;
  }

  function pick(map, re) {
    for (var i = 0; i < map.length; i++) if (re.test(String(map[i].head).trim())) return map[i].id;
    return "";
  }

  function cell(node, field) {
    var v = node && node.data ? node.data[field] : undefined;
    return v === undefined || v === null ? "" : String(v).replace(/\s+/g, " ").trim();
  }

  function fromAg(win) {
    var gs = agGrids(win), best = null;
    for (var a = 0; a < gs.length; a++) {
      var g = gs[a], map = agColumns(g);
      var fBc = pick(map, HEAD.bc), fQty = pick(map, HEAD.qty);
      if (!fBc || !fQty) continue;
      var fNm = pick(map, HEAD.nm), fCode = pick(map, HEAD.code);

      var lines = [], codes = {};
      var api = g.api;
      var walk = api.forEachNodeAfterFilterAndSort ? "forEachNodeAfterFilterAndSort" : "forEachNode";
      api[walk](function (node) {
        if (!node || node.group) return;
        var bc = cell(node, fBc);
        if (!bc) return;
        var q = parseInt(cell(node, fQty).replace(/[^0-9.\-]/g, ""), 10);
        if (isNaN(q) || q <= 0) q = 1;
        var nm = fNm ? cell(node, fNm) : "";
        lines.push(bc + "\t" + q + (nm ? "\t" + nm : ""));
        if (fCode) {
          var cv = cell(node, fCode);
          if (cv) codes[cv] = (codes[cv] || 0) + 1;
        }
      });

      var code = "", top = 0;
      for (var k in codes) if (codes[k] > top) { top = codes[k]; code = k; }
      if (lines.length && (!best || lines.length > best.lines.length)) {
        best = { lines: lines, code: code, how: "grid" };
      }
    }
    return best;
  }

  /* ───────── ② 일반 <table> (다른 화면 대비) ───────── */
  function tables() {
    var out = [], ds = docs();
    for (var d = 0; d < ds.length; d++) {
      var t = ds[d].getElementsByTagName("table");
      for (var j = 0; j < t.length; j++) out.push(t[j]);
    }
    return out;
  }
  function findCols(table) {
    var rows = table.rows;
    for (var r = 0; r < Math.min(rows.length, 12); r++) {
      var cells = rows[r].cells, got = { bc: -1, qty: -1, nm: -1, row: r };
      for (var c = 0; c < cells.length; c++) {
        var v = txt(cells[c]);
        if (got.bc < 0 && HEAD.bc.test(v)) got.bc = c;
        else if (got.qty < 0 && HEAD.qty.test(v)) got.qty = c;
        else if (got.nm < 0 && HEAD.nm.test(v)) got.nm = c;
      }
      if (got.bc >= 0 && got.qty >= 0) return got;
    }
    return null;
  }
  function looksBarcode(v) { return /^[A-Za-z][A-Za-z0-9]{7,}$/.test(v); }

  function fromTable() {
    var ts = tables(), lines = [], seen = 0;
    for (var t = 0; t < ts.length; t++) {
      var col = findCols(ts[t]);
      if (!col) continue;
      seen++;
      var rows = ts[t].rows;
      for (var r = col.row + 1; r < rows.length; r++) {
        var cells = rows[r].cells;
        if (!cells || cells.length <= col.bc) continue;
        var bc = txt(cells[col.bc]);
        if (!looksBarcode(bc)) continue;
        var q = parseInt(txt(cells[col.qty]).replace(/[^0-9.\-]/g, ""), 10);
        if (isNaN(q) || q <= 0) q = 1;
        var nm = col.nm >= 0 && cells.length > col.nm ? txt(cells[col.nm]) : "";
        lines.push(bc + "\t" + q + (nm ? "\t" + nm : ""));
      }
    }
    return lines.length ? { lines: lines, code: "", how: "table" } : null;
  }

  /* ───────── 전표번호·매장 ───────── */
  function findCode() {
    var LABEL = /(전표\s*번호|반품\s*코드)/;
    var ins = document.querySelectorAll("input[type=text], input:not([type])");
    for (var i = 0; i < ins.length; i++) {
      var el = ins[i], v = String(el.value || "").trim();
      if (!v) continue;
      var box = el.closest ? el.closest("td, th, div, label") : null;
      var prev = box && box.previousElementSibling ? txt(box.previousElementSibling) : "";
      var own = box ? txt(box).replace(v, "") : "";
      var lab = (el.getAttribute("placeholder") || "") + " " + (el.getAttribute("title") || "") +
                " " + (el.id || "") + " " + (el.name || "");
      if (LABEL.test(prev) || LABEL.test(own) || LABEL.test(lab) || /dc_num|rtn_?cd|return_?code/i.test(lab)) return v;
    }
    return "";
  }
  function findStore() {
    var body = document.body ? (document.body.innerText || "") : "";
    var m = body.match(/([가-힣A-Za-z0-9·\s]{2,20}?점)\s*[\/(]\s*([A-Za-z]{2,6}\s*\d{3,6})\s*\)?/);
    if (m) return { code: m[2].replace(/\s+/g, "").toUpperCase(), name: m[1].trim() };
    var c = body.match(/\b([A-Za-z]{2,6}\d{3,6})\b/);
    var n = body.match(/([가-힣]{2,12}점)/);
    if (c) return { code: c[1].toUpperCase(), name: n ? n[1] : "" };
    return null;
  }

  /* ───────── 진단 메시지 ───────── */
  function why() {
    var gs = agGrids();
    if (!gs.length) return "이 화면에서 리스트(표)를 찾지 못했습니다.\n상품입고관리 또는 매장반품관리의 리스트 화면에서 눌러 주세요.";
    var heads = [], rows = 0;
    for (var a = 0; a < gs.length; a++) {
      var map = agColumns(gs[a]);
      for (var i = 0; i < map.length; i++) if (map[i].head) heads.push(map[i].head);
      gs[a].api.forEachNode(function () { rows++; });
    }
    if (!rows) return "리스트가 비어 있습니다.\n전표번호(또는 반품코드)로 먼저 검색해서 제품이 화면에 나온 뒤 눌러 주세요.";
    var hasBc = heads.some(function (h) { return HEAD.bc.test(h.trim()); });
    var hasQ = heads.some(function (h) { return HEAD.qty.test(h.trim()); });
    return "리스트는 찾았지만 필요한 열이 없습니다.\n" +
           "바코드 열: " + (hasBc ? "있음" : "없음") + " / 수량 열: " + (hasQ ? "있음" : "없음") +
           "\n\n화면의 열 이름: " + heads.slice(0, 40).join(", ");
  }

  /* ───────── 매장간 이동(매장RT관리) ─────────
     이 화면은 목록 자체에 제품이 한 줄씩 들어 있다. 다만 같은 기간에
     받는 매장이 여럿 섞여 나오므로, 받는 매장별로 묶어서 고르게 한다.
     화면에서 걸러 둔 조건(구분·상태·기간)은 그대로 따른다. */
  function rtGrid() {
    var gs = agGrids();
    for (var i = 0; i < gs.length; i++) {
      var map = agColumns(gs[i]);
      var fRecv = pick(map, /^받는\s*매장$/), fBc = pick(map, HEAD.bc);
      var fQty = pick(map, /^(요청수량|이동요청수량)$/);
      if (!fRecv || !fBc || !fQty) continue;
      return { g: gs[i], map: map, recv: fRecv, bc: fBc, qty: fQty,
               send: pick(map, /^보내는\s*매장$/), nm: pick(map, HEAD.nm),
               doc: pick(map, /^전표\s*번호$/) };
    }
    return null;
  }

  function fromRt() {
    var rt = rtGrid();
    if (!rt) return null;

    /* 화면에 보이는(걸러진) 줄만 받는 매장별로 묶는다 */
    var groups = {}, order = [];
    var walk = rt.g.api.forEachNodeAfterFilterAndSort ? "forEachNodeAfterFilterAndSort" : "forEachNode";
    rt.g.api[walk](function (node) {
      if (!node || node.group || !node.data) return;
      var d = node.data;
      var bc = String(d[rt.bc] == null ? "" : d[rt.bc]).trim();
      if (!bc) return;
      var to = String(d[rt.recv] == null ? "" : d[rt.recv]).trim() || "(받는 매장 없음)";
      if (!groups[to]) { groups[to] = { lines: [], qty: 0, docs: {}, from: "" }; order.push(to); }
      var q = parseInt(String(d[rt.qty] == null ? "" : d[rt.qty]).replace(/[^0-9.\-]/g, ""), 10);
      if (isNaN(q) || q <= 0) q = 1;
      var nm = rt.nm ? String(d[rt.nm] == null ? "" : d[rt.nm]).replace(/\s+/g, " ").trim() : "";
      groups[to].lines.push(bc + "\t" + q + (nm ? "\t" + nm : ""));
      groups[to].qty += q;
      if (rt.doc && d[rt.doc]) groups[to].docs[d[rt.doc]] = 1;
      if (!groups[to].from && rt.send && d[rt.send]) groups[to].from = String(d[rt.send]).trim();
    });
    if (!order.length) return null;

    /* 이 화면에는 우리가 보내는 것과 우리가 받는 것이 섞여 나온다.
       포장해서 내보낼 것은 '보내는 매장'이 우리 매장인 줄이다. */
    var me = findStore();
    var myName = me && me.name ? me.name : "";
    var isOut = function (to) {
      var f = groups[to].from;
      return !!(myName && f && f.indexOf(myName) >= 0);
    };
    order.sort(function (a, b) {
      var oa = isOut(a) ? 0 : 1, ob = isOut(b) ? 0 : 1;
      if (oa !== ob) return oa - ob;
      return groups[b].qty - groups[a].qty;
    });

    var to = order[0];
    if (order.length > 1) {
      var lines = [];
      for (var i = 0; i < order.length && i < 30; i++) {
        var gg = groups[order[i]];
        lines.push((i + 1) + ") " + (isOut(order[i]) ? "[보냄] " : "[받음] ") + order[i] +
                   "  " + gg.lines.length + "품목 " + gg.qty + "개" +
                   (gg.from ? "  (" + gg.from + " →)" : ""));
      }
      var ans = prompt("받는 매장이 여럿입니다. 어느 매장 것을 가져올까요?\n\n" +
                       "[보냄] = 우리가 포장해서 내보낼 것\n[받음] = 다른 매장이 우리에게 보내는 것\n\n" +
                       lines.join("\n") +
                       "\n\n한 번에 한 매장씩 담아야 상자를 섞지 않습니다.", "1");
      if (ans === null) return { cancelled: true };
      var k = parseInt(ans, 10);
      if (!(k >= 1 && k <= order.length)) return { cancelled: true };
      to = order[k - 1];
    }

    var g = groups[to];
    var docs = Object.keys(g.docs).sort(function (a, b) { return (parseFloat(a) || 0) - (parseFloat(b) || 0); });
    var code = docs.length ? "RT" + (docs.length <= 6 ? docs.join("-") : docs[0] + "-" + docs[docs.length - 1] + "x" + docs.length) : "";
    return { lines: g.lines, code: code, dest: to, mode: "transfer", how: "rt" };
  }

  /* ───────── 반품: 상세가 별도 창으로 열리는 화면 ─────────
     매장반품관리의 목록에는 반품코드만 있고 제품 리스트는
     window.open 으로 뜨는 다른 창에 들어 있다. 그 창은 주소창도
     북마크바도 없어서 거기서는 북마크릿을 누를 수가 없다.
     그래서 목록 화면에서 눌렀을 때 상세 창을 직접 열어 읽고 닫는다. */
  var RETURN_CODE = /^반품\s*코드$/;

  function returnList() {
    var gs = agGrids();
    for (var i = 0; i < gs.length; i++) {
      var map = agColumns(gs[i]), f = pick(map, RETURN_CODE);
      if (!f) continue;
      var nodes = [];
      var walk = gs[i].api.forEachNodeAfterFilterAndSort ? "forEachNodeAfterFilterAndSort" : "forEachNode";
      gs[i].api[walk](function (n) { if (n && !n.group && n.data) nodes.push(n); });
      if (nodes.length) return { api: gs[i].api, field: f, nodes: nodes };
    }
    return null;
  }

  function codeText(rl, node) {
    /* 화면에 보이는 반품코드 — 안 보이면 자료로 만든다 */
    try {
      var cell = document.querySelector('[role="row"][row-index="' + node.rowIndex + '"] [col-id="' + rl.field + '"]');
      var t = txt(cell);
      if (t) return t;
    } catch (e) {}
    var d = node.data || {};
    var day = String(d.sr_date || "").replace(/[^0-9]/g, "");
    if (d.store_cd && day && d[rl.field]) return d.store_cd + "_" + day + "_" + d[rl.field];
    return String(d[rl.field] || "");
  }

  function detailId(rl, node) {
    var v = node.data[rl.field];
    if (/^\d+$/.test(String(v))) return Number(v);
    var m = String(v).match(/(\d+)\s*$/);          // BSDR0001_20261107_1871 → 1871
    return m ? Number(m[1]) : null;
  }

  function chooseRow(rl) {
    var sel = [];
    try { sel = rl.api.getSelectedNodes() || []; } catch (e) {}
    if (sel.length === 1) return sel[0];
    if (rl.nodes.length === 1) return rl.nodes[0];
    var lines = [];
    for (var i = 0; i < rl.nodes.length && i < 30; i++) {
      var d = rl.nodes[i].data || {};
      lines.push((i + 1) + ") " + codeText(rl, rl.nodes[i]) +
                 (d.sr_qty ? "  요청 " + d.sr_qty + "개" : "") +
                 (d.sr_state_nm ? "  " + d.sr_state_nm : ""));
    }
    var ans = prompt("어느 반품을 가져올까요? 번호를 입력하세요.\n\n" + lines.join("\n"), "1");
    if (ans === null) return null;
    var k = parseInt(ans, 10);
    return (k >= 1 && k <= rl.nodes.length) ? rl.nodes[k - 1] : null;
  }

  function fromReturnDetail(cb) {
    var rl = returnList();
    if (!rl) return false;
    if (typeof window.openDetailPopup !== "function") return false;

    var node = chooseRow(rl);
    if (!node) { cb(null, "취소했습니다."); return true; }
    var id = detailId(rl, node);
    if (id === null) { cb(null, "반품코드를 읽지 못했습니다."); return true; }
    var shown = codeText(rl, node);

    var child = null, orig = window.open;
    window.open = function () { var w = orig.apply(window, arguments); child = w; return w; };
    try { window.openDetailPopup(id); } catch (e) {} finally { window.open = orig; }

    if (!child) {
      cb(null, "상세 창이 열리지 않았습니다.\n주소창 오른쪽의 팝업 차단을 허용으로 바꾼 뒤 다시 눌러 주세요.");
      return true;
    }

    var tries = 0;
    (function wait() {
      tries++;
      var doc = null;
      try { doc = child.document; } catch (e) {
        try { child.close(); } catch (e2) {}
        cb(null, "상세 창을 읽을 수 없습니다."); return;
      }
      var got = null;
      try { got = fromAg(child); } catch (e) {}
      if (got && got.lines.length) {
        try { child.close(); } catch (e) {}
        got.code = shown || got.code;
        cb(got); return;
      }
      if (tries > 60) {                       // 30초
        try { child.close(); } catch (e) {}
        cb(null, "상세 창에서 제품 리스트를 읽지 못했습니다.\n창이 다 뜬 뒤 다시 눌러 주세요.");
        return;
      }
      setTimeout(wait, 500);
    })();
    return true;
  }

  /* ───────── 실행 ───────── */
  var text = "", code = "", store = findStore(), got = null, appWin = null;

  function start() {
    /* 매장RT관리는 목록에 제품이 들어 있으므로 먼저 본다 */
    var rt = fromRt();
    if (rt && rt.cancelled) return;
    if (rt) { got = rt; finish(); return; }

    got = fromAg() || fromTable();
    if (got) { finish(); return; }

    if (returnList() && typeof window.openDetailPopup === "function") {
      /* 반품은 상세 창을 읽느라 몇 초가 걸린다. 그 사이에 창을 열면
         브라우저가 '사용자가 누른 것이 아니다'로 보고 막아 버리므로,
         누른 지금 이 순간에 앱 창을 먼저 잡아 둔다. */
      appWin = window.open(APP, "_blank");
      if (!appWin) {
        alert("새 창이 막혔습니다.\n주소창 오른쪽의 팝업 차단 표시를 눌러 이 사이트를 허용으로 바꾼 뒤 다시 눌러 주세요.");
        return;
      }
      fromReturnDetail(function (g, err) {
        if (!g) {
          try { appWin.close(); } catch (e) {}
          alert(err || why());
          return;
        }
        got = g; finish();
      });
      return;
    }
    alert(why());
  }

  function copyOld() {
    var ta = document.createElement("textarea");
    ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
    document.body.appendChild(ta); ta.select();
    try { document.execCommand("copy"); } catch (e) {}
    document.body.removeChild(ta);
  }

  function finish() {
    text = got.lines.join("\n");
    code = got.code || findCode();
    try { window.focus(); } catch (e) {}

    /* 상세 창이 떴다 닫히는 사이 이 창이 포커스를 잃으면
       클립보드 복사가 응답 없이 멈춘다. 1.2초를 넘기면 옛 방식으로 돌린다. */
    var settled = false;
    var go = function () { if (settled) return; settled = true; done(); };
    var fallback = setTimeout(function () { if (settled) return; copyOld(); go(); }, 1200);
    var ok = function () { clearTimeout(fallback); go(); };
    var no = function () { clearTimeout(fallback); copyOld(); go(); };

    if (navigator.clipboard && navigator.clipboard.writeText) {
      try { navigator.clipboard.writeText(text).then(ok, no); } catch (e) { no(); }
    } else no();
  }

  function openApp() {
    var payload = JSON.stringify({ code: code, text: text, store: store,
                                   dest: got.dest || "", mode: got.mode || "" });
    var packed = "";
    try { packed = btoa(unescape(encodeURIComponent(payload))); } catch (e) { packed = ""; }

    if (!packed || packed.length > 120000) {
      alert("리스트가 길어 자동으로 넘기지 못했습니다.\n복사해 두었으니 검수 프로그램에 붙여넣기 하세요.");
      if (appWin) { try { appWin.focus(); } catch (e) {} } else window.open(APP, "_blank");
      return;
    }

    var url = APP + "#d=" + encodeURIComponent(packed);

    /* 미리 잡아 둔 창이 있으면 그 창을 쓴다 (반품 경로).
       해시만 바꾸면 페이지가 다시 읽히지 않아 리스트가 들어가지 않는다.
       물음표 뒤에 값을 하나 붙여 반드시 새로 읽히게 한다. */
    if (appWin && !appWin.closed) {
      var fresh = APP + (APP.indexOf("?") < 0 ? "?" : "&") + "h=" + Date.now() +
                  "#d=" + encodeURIComponent(packed);
      try { appWin.location.replace(fresh); appWin.focus(); return; } catch (e) {}
    }
    var w = window.open(url, "_blank");
    if (w) { try { w.focus(); } catch (e) {} return; }
    alert("새 창이 막혔습니다.\n주소창 오른쪽의 팝업 차단 표시를 눌러 이 사이트를 허용으로 바꿔 주세요.\n리스트는 복사해 두었으니 검수 프로그램에 붙여넣기 하셔도 됩니다.");
  }

  function done() {
    /* 묻지 않고 바로 연다 — 가져온 줄 수는 검수 프로그램 화면에 나온다 */
    if (APP.indexOf("__APP") !== 0) { openApp(); return; }
    alert(got.lines.length + "줄을 가져왔습니다."
      + (store ? "\n매장: " + (store.name || store.code) + " (" + store.code + ")" : "")
      + (got.dest ? "\n받는 매장: " + got.dest : "")
      + (code ? "\n번호: " + code : "")
      + "\n\n검수 프로그램에 붙여넣기 하세요.");
  }

  start();
})();
