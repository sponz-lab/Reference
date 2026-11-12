(function () {
  /* 반품 입력하기 — 검수 결과를 전산의 박스번호·처리수량 칸에 넣는다.
     저장은 하지 않는다. 값만 채우고, 임시저장과 반품처리중은 사람이 누른다. */

  var REJECT = "상태불량(DP)";   // 처리수량이 요청보다 적을 때 고를 사유
  var MEMO   = "확인중";          // 반품거부메모에 남길 말

  function docs(win) {
    var D;
    try { D = (win || window).document; } catch (e) { return []; }
    if (!D) return [];
    var out = [D], ifr = D.getElementsByTagName("iframe");
    for (var i = 0; i < ifr.length; i++) {
      try { if (ifr[i].contentDocument) out.push(ifr[i].contentDocument); } catch (e) {}
    }
    return out;
  }

  function agGrids(win) {
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

  function colMap(g) {
    var map = {};
    try {
      var cols = g.capi.getAllGridColumns();
      for (var i = 0; i < cols.length; i++) {
        var cd = cols[i].getColDef() || {};
        if (cd.headerName) map[String(cd.headerName).replace(/\s+/g, "")] = cols[i].getColId();
      }
    } catch (e) {}
    return map;
  }

  /* 전산에서 제품 리스트가 들어 있는 격자를 찾는다 */
  function detailGrid(win) {
    var gs = agGrids(win);
    for (var i = 0; i < gs.length; i++) {
      var m = colMap(gs[i]);
      if (m["바코드"] && m["처리수량"] && m["박스번호"]) {
        var n = 0; gs[i].api.forEachNode(function () { n++; });
        if (n) return { g: gs[i], m: m, rows: n };
      }
    }
    return null;
  }

  /* 매장RT관리 — 목록에 제품이 한 줄씩 있고, 맨 왼쪽 네모는 ag-Grid 기본 선택이다 */
  function rtGrid() {
    var gs = agGrids();
    for (var i = 0; i < gs.length; i++) {
      var m = colMap(gs[i]);
      if (m["바코드"] && m["처리수량"] && m["요청수량"] && m["받는매장"]) {
        var n = 0; gs[i].api.forEachNode(function () { n++; });
        if (n) return { g: gs[i], m: m, rows: n };
      }
    }
    return null;
  }

  function fillRt(rt, data) {
    var m = rt.m, api = rt.g.api;
    var fBc = m["바코드"], fQty = m["처리수량"], fReq = m["요청수량"], fRecv = m["받는매장"];
    var hit = 0, ticked = 0, mismatch = [], miss = 0, dests = {};
    var picked = [];

    api.forEachNode(function (node) {
      var d = node.data || {};
      var bc = String(d[fBc] == null ? "" : d[fBc]).trim();
      var got = data[bc];
      if (!got) { miss++; return; }
      hit++;
      dests[String(d[fRecv] || "")] = 1;

      var req = Number(d[fReq]) || 0;
      var qty = got.qty;
      if (Number(d[fQty]) !== qty) node.setDataValue(fQty, qty);

      if (qty === req && req > 0) { picked.push(node); ticked++; }
      else mismatch.push(bc + " (요청 " + req + " · 실물 " + qty + ")");
    });

    /* 수량이 맞는 줄만 체크한다 */
    try { api.deselectAll(); } catch (e) {}
    for (var i = 0; i < picked.length; i++) { try { picked[i].setSelected(true); } catch (e) {} }

    return { hit: hit, ticked: ticked, mismatch: mismatch, miss: miss, dests: Object.keys(dests) };
  }

  function reportRt(r, rt) {
    var msg = "매장RT관리에 넣었습니다.\n\n" +
      "· 처리수량을 넣은 줄 : " + r.hit + " / " + rt.rows + "\n" +
      "· 요청과 수량이 맞아 체크한 줄 : " + r.ticked + "\n";
    if (r.mismatch.length) {
      msg += "· 수량이 달라 체크하지 않은 줄 : " + r.mismatch.length + "\n   " +
             r.mismatch.slice(0, 6).join("\n   ") + (r.mismatch.length > 6 ? "\n   …" : "") + "\n";
    }
    if (r.miss) msg += "· 검수 자료에 없던 줄 : " + r.miss + " — 건드리지 않았습니다\n";
    if (r.dests.length > 1) msg += "\n※ 받는 매장이 " + r.dests.length + "곳 섞여 있습니다: " + r.dests.join(", ") + "\n";
    msg += "\n보내지 않았습니다.\n체크된 줄을 확인하신 뒤 「처리」를 직접 눌러 주세요.";
    alert(msg);
  }

  /* 목록 화면이면 상세 창을 직접 연다 */
  function returnListGrid() {
    var gs = agGrids();
    for (var i = 0; i < gs.length; i++) {
      var m = colMap(gs[i]);
      if (m["반품코드"]) {
        var nodes = [];
        gs[i].api.forEachNode(function (n) { if (n && n.data) nodes.push(n); });
        if (nodes.length) return { g: gs[i], field: m["반품코드"], nodes: nodes };
      }
    }
    return null;
  }

  function codeText(rl, node) {
    try {
      var cell = document.querySelector('[role="row"][row-index="' + node.rowIndex + '"] [col-id="' + rl.field + '"]');
      var t = cell ? (cell.textContent || "").trim() : "";
      if (t) return t;
    } catch (e) {}
    var d = node.data || {};
    var day = String(d.sr_date || "").replace(/[^0-9]/g, "");
    if (d.store_cd && day && d[rl.field]) return d.store_cd + "_" + day + "_" + d[rl.field];
    return String(d[rl.field] || "");
  }

  function chooseRow(rl) {
    var sel = [];
    try { sel = rl.g.api.getSelectedNodes() || []; } catch (e) {}
    if (sel.length === 1) return sel[0];
    if (rl.nodes.length === 1) return rl.nodes[0];
    var lines = [];
    for (var i = 0; i < rl.nodes.length && i < 30; i++) {
      var d = rl.nodes[i].data || {};
      lines.push((i + 1) + ") " + codeText(rl, rl.nodes[i]) + (d.sr_qty ? "  요청 " + d.sr_qty + "개" : ""));
    }
    var ans = prompt("어느 반품에 입력할까요? 번호를 넣으세요.\n\n" + lines.join("\n"), "1");
    if (ans === null) return null;
    var k = parseInt(ans, 10);
    return (k >= 1 && k <= rl.nodes.length) ? rl.nodes[k - 1] : null;
  }

  function detailId(rl, node) {
    var v = node.data[rl.field];
    if (/^\d+$/.test(String(v))) return Number(v);
    var m = String(v).match(/(\d+)\s*$/);
    return m ? Number(m[1]) : null;
  }

  /* ───────── 검수 결과 받기 ───────── */
  function parseData(text) {
    var out = {}, lines = String(text || "").split(/\r?\n/), n = 0;
    for (var i = 0; i < lines.length; i++) {
      var L = lines[i].trim();
      if (!L) continue;
      var p = L.split("\t");
      if (p.length < 2) p = L.split(/\s{2,}|,/);
      var bc = (p[0] || "").trim();
      if (!bc) continue;
      var q = parseInt(String(p[1] || "").replace(/[^0-9-]/g, ""), 10);
      if (isNaN(q)) q = 0;
      out[bc] = { qty: q, box: (p[2] || "").trim() };
      n++;
    }
    return n ? out : null;
  }

  function askPaste(cb) {
    var wrap = document.createElement("div");
    wrap.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:2147483647;display:flex;align-items:center;justify-content:center";
    var box = document.createElement("div");
    box.style.cssText = "background:#fff;border-radius:12px;padding:18px;width:min(560px,92vw);font:14px/1.5 sans-serif;box-shadow:0 10px 40px rgba(0,0,0,.3)";
    box.innerHTML = "<div style='font-weight:700;font-size:16px;margin-bottom:6px'>검수 결과 붙여넣기</div>" +
      "<div style='color:#555;margin-bottom:10px'>검수 프로그램의 <b>박스별 반품 리포트 → 전산 입력용 복사</b>를 누른 뒤, 아래에 붙여넣으세요.</div>";
    var ta = document.createElement("textarea");
    ta.style.cssText = "width:100%;height:170px;font:12px/1.4 monospace;border:1px solid #bbb;border-radius:8px;padding:8px;box-sizing:border-box";
    var row = document.createElement("div");
    row.style.cssText = "display:flex;gap:8px;justify-content:flex-end;margin-top:12px";
    var no = document.createElement("button"), ok = document.createElement("button");
    no.textContent = "취소"; ok.textContent = "적용";
    no.style.cssText = "padding:9px 16px;border:1px solid #bbb;background:#fff;border-radius:8px;cursor:pointer";
    ok.style.cssText = "padding:9px 16px;border:0;background:#1b5e20;color:#fff;border-radius:8px;cursor:pointer;font-weight:700";
    row.appendChild(no); row.appendChild(ok);
    box.appendChild(ta); box.appendChild(row); wrap.appendChild(box);
    document.body.appendChild(wrap);
    ta.focus();
    no.onclick = function () { wrap.remove(); cb(null); };
    ok.onclick = function () { var v = ta.value; wrap.remove(); cb(parseData(v)); };
  }

  function getData(cb) {
    try { window.focus(); } catch (e) {}
    if (!navigator.clipboard || !navigator.clipboard.readText) { askPaste(cb); return; }
    var settled = false;
    var t = setTimeout(function () { if (!settled) { settled = true; askPaste(cb); } }, 1500);
    navigator.clipboard.readText().then(function (txt) {
      if (settled) return;
      settled = true; clearTimeout(t);
      var d = parseData(txt);
      if (d) cb(d); else askPaste(cb);
    }, function () {
      if (settled) return;
      settled = true; clearTimeout(t); askPaste(cb);
    });
  }

  /* ───────── 채워 넣기 ───────── */
  function fill(dg, data) {
    var m = dg.m, api = dg.g.api;
    var fBc = m["바코드"], fBox = m["박스번호"], fQty = m["처리수량"],
        fReq = m["요청수량"], fWhy = m["반품거부사유"], fMemo = m["반품거부메모"];

    var hit = 0, miss = [], short = 0, over = [], same = 0;
    api.forEachNode(function (node) {
      var d = node.data || {};
      var bc = String(d[fBc] == null ? "" : d[fBc]).trim();
      var got = data[bc];
      if (!got) { miss.push(bc); return; }
      hit++;

      var req = Number(d[fReq]) || 0;
      var qty = got.qty;
      if (qty > req) { over.push(bc + " (요청 " + req + " · 실물 " + qty + ")"); qty = req; }

      if (String(d[fBox] || "") !== got.box) node.setDataValue(fBox, got.box);
      if (Number(d[fQty]) !== qty) node.setDataValue(fQty, qty); else same++;

      if (qty < req) {
        short++;
        if (fWhy && !d[fWhy]) node.setDataValue(fWhy, REJECT);
        if (fMemo && !String(d[fMemo] || "").trim()) node.setDataValue(fMemo, MEMO);
      }
    });
    return { hit: hit, miss: miss, short: short, over: over, same: same };
  }

  function report(r, dg) {
    var msg = "전산에 넣었습니다.\n\n" +
      "· 입력한 줄 : " + r.hit + " / " + dg.rows + "\n" +
      "· 모자란 줄 : " + r.short + " (사유 「" + REJECT + "」 · 메모 「" + MEMO + "」 자동 입력)\n";
    if (r.miss.length) msg += "· 검수 자료에 없던 줄 : " + r.miss.length + "개 — 건드리지 않았습니다\n";
    if (r.over.length) {
      msg += "\n※ 요청보다 많이 찍힌 품목은 요청 수량으로 맞췄습니다 (" + r.over.length + "건)\n   " +
             r.over.slice(0, 5).join("\n   ") + (r.over.length > 5 ? "\n   …" : "") + "\n";
    }
    msg += "\n저장은 하지 않았습니다.\n화면을 확인하신 뒤 「임시저장」을 직접 눌러 주세요.";
    alert(msg);
  }

  /* ───────── 실행 ───────── */
  var rt = rtGrid();                // 매장RT관리 — 목록에서 바로 처리
  if (rt) {
    getData(function (data) {
      if (!data) return;
      reportRt(fillRt(rt, data), rt);
    });
    return;
  }

  var here = detailGrid(window);
  if (here) {                       // 반품 상세 창에서 직접 눌렀을 때
    getData(function (data) {
      if (!data) return;
      report(fill(here, data), here);
    });
    return;
  }

  var rl = returnListGrid();
  if (!rl || typeof window.openDetailPopup !== "function") {
    alert("입력할 화면이 아닙니다.\n\n· 물류 반품 — 매장반품관리에서 반품을 조회한 목록 화면\n· 매장간 이동 — 매장RT관리에서 조회한 목록 화면\n\n둘 중 한 곳에서 눌러 주세요.");
    return;
  }

  getData(function (data) {
    if (!data) return;
    var node = chooseRow(rl);
    if (!node) return;
    var id = detailId(rl, node);
    if (id === null) { alert("반품코드를 읽지 못했습니다."); return; }

    var child = null, orig = window.open;
    window.open = function () { var w = orig.apply(window, arguments); child = w; return w; };
    try { window.openDetailPopup(id); } catch (e) {} finally { window.open = orig; }
    if (!child) {
      alert("상세 창이 열리지 않았습니다.\n주소창 오른쪽의 팝업 차단을 허용으로 바꾼 뒤 다시 눌러 주세요.");
      return;
    }

    var tries = 0;
    (function wait() {
      tries++;
      var dg = null;
      try { dg = detailGrid(child); } catch (e) {
        alert("상세 창을 읽을 수 없습니다."); return;
      }
      if (dg) {
        var r = fill(dg, data);
        try { child.focus(); } catch (e) {}
        report(r, dg);
        return;
      }
      if (tries > 60) { alert("상세 창에서 제품 리스트를 읽지 못했습니다.\n창이 다 뜬 뒤 다시 눌러 주세요."); return; }
      setTimeout(wait, 500);
    })();
  });
})();
