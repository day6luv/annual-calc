/*!
 * annual-calc · 돌림판 & 사다리 타기
 * 외부 라이브러리 없이 Canvas 2D로만 동작합니다.
 */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var qsa = function (sel) { return Array.prototype.slice.call(document.querySelectorAll(sel)); };
  var reduceMotion = window.matchMedia
    ? window.matchMedia('(prefers-reduced-motion: reduce)')
    : { matches: false };

  function clamp(n, lo, hi) { return n < lo ? lo : (n > hi ? hi : n); }

  /* =========================================================
     탭 내비게이션
     ========================================================= */
  var tabButtons = qsa('.tab');

  function activate(name, updateHash) {
    if (!document.getElementById('panel-' + name)) name = 'calc';

    tabButtons.forEach(function (btn) {
      var key = btn.getAttribute('data-panel');
      var on = key === name;
      btn.setAttribute('aria-selected', on ? 'true' : 'false');
      btn.tabIndex = on ? 0 : -1;
      var panel = document.getElementById('panel-' + key);
      if (!panel) return;
      if (on) {
        panel.removeAttribute('hidden');
        panel.classList.add('active');
      } else {
        panel.classList.remove('active');
        panel.setAttribute('hidden', '');
      }
    });

    if (updateHash && window.history && history.replaceState) {
      var url = name === 'calc' ? location.pathname + location.search : '#' + name;
      history.replaceState(null, '', url);
    }

    Roulette.setVisible(name === 'roulette');
    Ladder.setVisible(name === 'ladder');

    window.scrollTo({ top: 0, behavior: reduceMotion.matches ? 'auto' : 'smooth' });
  }

  /* =========================================================
     돌림판
     ========================================================= */
  var Roulette = (function () {
    var MIN = 2;
    var MAX = 20;

    /* 채도 높은 짝수 교대 팔레트 (인접 섹터끼리 항상 다른 색) */
    var PALETTE = [
      ['#1E6B4E', '#FFFFFF'],
      ['#F0A63B', '#4A2E00'],
      ['#4C9B7B', '#FFFFFF'],
      ['#F7D9A8', '#5A3A00'],
      ['#0F4531', '#FFFFFF'],
      ['#E0883D', '#3A2200'],
      ['#8CC7A8', '#12412C'],
      ['#EBC06A', '#4A3000']
    ];

    var PRESETS = {
      lunch: ['김치찌개', '돈까스', '짜장면', '마라탕', '샐러드', '샌드위치'],
      coffee: ['당첨', '꽝'],
      penalty: ['1', '2', '3', '4', '5', '6']
    };

    var items = PRESETS.lunch.slice();
    var angle = -Math.PI / 2;     // 라디안, 첫 섹터가 12시에서 살짝 비껴 시작
    var spinning = false;
    var winIdx = -1;
    var pendingIdx = -1;
    var rafId = 0;
    var anim = { from: 0, to: 0, dur: 0, t0: 0 };
    var canvas = null;
    var ctx = null;
    var cssSize = 0;
    var dpr = 1;

    function label(i) {
      var v = (items[i] || '').trim();
      return v || '항목 ' + (i + 1);
    }

    function setFont(px) {
      ctx.font = '700 ' + px + 'px "Pretendard Variable", Pretendard, -apple-system, "Malgun Gothic", sans-serif';
    }

    function fitText(txt, maxW) {
      if (ctx.measureText(txt).width <= maxW) return txt;
      var s = txt;
      while (s.length > 1 && ctx.measureText(s + '…').width > maxW) s = s.slice(0, -1);
      return s + '…';
    }

    function ensureCanvas() {
      if (!canvas) {
        canvas = $('wheelCanvas');
        if (!canvas) return false;
        ctx = canvas.getContext('2d');
      }
      var stage = canvas.parentElement;
      var size = Math.round(stage.getBoundingClientRect().width);
      if (!size) return false;
      dpr = Math.min(window.devicePixelRatio || 1, 3);
      if (cssSize !== size) {
        cssSize = size;
        canvas.width = Math.round(size * dpr);
        canvas.height = Math.round(size * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      return true;
    }

    function draw() {
      if (!ensureCanvas()) return;

      var S = cssSize;
      var c = S / 2;
      var R = S / 2 - 11;
      var n = items.length;
      var seg = (Math.PI * 2) / n;

      ctx.clearRect(0, 0, S, S);

      // 테두리 링
      ctx.beginPath();
      ctx.arc(c, c, R + 3.5, 0, Math.PI * 2);
      ctx.fillStyle = '#0F4531';
      ctx.fill();

      for (var i = 0; i < n; i++) {
        var a0 = angle + i * seg;
        var a1 = a0 + seg;
        var pal = PALETTE[i % PALETTE.length];

        ctx.beginPath();
        ctx.moveTo(c, c);
        ctx.arc(c, c, R, a0, a1);
        ctx.closePath();
        ctx.fillStyle = pal[0];
        ctx.fill();

        if (i === winIdx) {
          ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
          ctx.fill();
        }

        ctx.lineWidth = 1.5;
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
        ctx.stroke();

        // 라벨 (방사형, 왼쪽 반원은 뒤집어 읽히게)
        var mid = a0 + seg / 2;
        var norm = ((mid % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
        var flip = norm > Math.PI / 2 && norm < Math.PI * 1.5;
        var fs = n <= 6 ? Math.round(S * 0.046)
          : n <= 10 ? Math.round(S * 0.04)
            : n <= 14 ? Math.round(S * 0.034)
              : Math.round(S * 0.029);

        ctx.save();
        ctx.translate(c, c);
        ctx.rotate(flip ? mid + Math.PI : mid);
        ctx.textBaseline = 'middle';
        ctx.textAlign = flip ? 'left' : 'right';
        ctx.fillStyle = pal[1];
        setFont(fs);
        var txt = fitText(label(i), R * 0.8);
        ctx.fillText(txt, flip ? -R * 0.9 : R * 0.9, 0);
        ctx.restore();
      }

      // 중앙 허브 (버튼이 올라갈 자리)
      ctx.beginPath();
      ctx.arc(c, c, R * 0.22, 0, Math.PI * 2);
      ctx.fillStyle = '#FFFFFF';
      ctx.fill();
    }

    function setBtn(text, disabled) {
      var b = $('spinBtn');
      if (!b) return;
      b.textContent = text;
      b.disabled = !!disabled;
    }

    function setResult(text, busy) {
      var box = $('rResult');
      if (!box) return;
      box.innerHTML = '';
      box.classList.remove('win');

      if (!text) {
        var hint = document.createElement('span');
        hint.className = 'label';
        hint.textContent = busy ? '돌아가는 중…' : '돌리기를 눌러 주세요';
        box.appendChild(hint);
        return;
      }

      var small = document.createElement('span');
      small.className = 'label';
      small.textContent = '오늘의 선택은';
      var big = document.createElement('span');
      big.className = 'winner';
      big.textContent = '🎉 ' + text;
      box.appendChild(small);
      box.appendChild(big);
      // 애니메이션 재시작
      box.offsetWidth;
      box.classList.add('win');
    }

    function tick(ts) {
      if (!anim.t0) anim.t0 = ts;
      var t = clamp((ts - anim.t0) / anim.dur, 0, 1);
      var eased = 1 - Math.pow(1 - t, 3.4);
      angle = anim.from + (anim.to - anim.from) * eased;
      draw();

      if (t < 1) {
        rafId = requestAnimationFrame(tick);
        return;
      }

      spinning = false;
      angle = anim.to % (Math.PI * 2);
      winIdx = pendingIdx;
      draw();
      setBtn('한 번 더', false);
      setResult(label(winIdx), false);
    }

    function spin() {
      if (spinning || items.length < 2) return;

      var n = items.length;
      var seg = (Math.PI * 2) / n;
      winIdx = -1;
      pendingIdx = Math.floor(Math.random() * n);

      // 당첨 섹터의 한가운데가 12시 포인터에 오도록 회전각 계산
      var jitter = (Math.random() - 0.5) * seg * 0.62;
      var desired = -Math.PI / 2 - (pendingIdx + 0.5) * seg + jitter;
      var base = ((desired - angle) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
      var turns = reduceMotion.matches ? 1 : 5 + Math.random() * 2.5;

      anim.from = angle;
      anim.to = angle + turns * Math.PI * 2 + base;
      anim.dur = reduceMotion.matches ? 650 : 4300;
      anim.t0 = 0;

      spinning = true;
      cancelAnimationFrame(rafId);
      setBtn('돌아가는 중…', true);
      setResult(null, true);
      draw();
      rafId = requestAnimationFrame(tick);
    }

    function stopSpin() {
      if (!spinning) return;
      spinning = false;
      cancelAnimationFrame(rafId);
      setBtn('돌리기', false);
      draw();
    }

    function resetWheel() {
      winIdx = -1;
      draw();
      setResult(null, false);
      setBtn('돌리기', false);
    }

    function syncCount() {
      var n = items.length;
      $('rCount').textContent = String(n);
      $('rRange').value = String(n);
      $('rMinus').disabled = n <= MIN;
      $('rPlus').disabled = n >= MAX;
    }

    function renderItems() {
      var wrap = $('rItems');
      wrap.innerHTML = '';
      items.forEach(function (val, i) {
        var row = document.createElement('div');
        row.className = 'item has-dot';

        var idx = document.createElement('span');
        idx.className = 'idx';
        idx.textContent = String(i + 1);

        var input = document.createElement('input');
        input.type = 'text';
        input.value = val;
        input.maxLength = 14;
        input.setAttribute('data-i', String(i));
        input.setAttribute('aria-label', (i + 1) + '번 항목');

        var dot = document.createElement('span');
        dot.className = 'dot';
        dot.style.background = PALETTE[i % PALETTE.length][0];

        row.appendChild(idx);
        row.appendChild(input);
        row.appendChild(dot);
        wrap.appendChild(row);
      });
    }

    function setCount(next) {
      next = clamp(Math.round(next), MIN, MAX);
      if (next === items.length) { syncCount(); return; }
      while (items.length < next) items.push('항목 ' + (items.length + 1));
      if (items.length > next) items.length = next;
      syncCount();
      renderItems();
      resetWheel();
    }

    function markPreset(key) {
      qsa('.chip').forEach(function (ch) {
        ch.classList.toggle('active', ch.getAttribute('data-preset') === key);
      });
    }

    function applyPreset(key) {
      var list = PRESETS[key];
      if (!list) return;
      stopSpin();
      items = list.slice();
      winIdx = -1;
      syncCount();
      renderItems();
      draw();
      setResult(null, false);
      setBtn('돌리기', false);
      markPreset(key);
    }

    function bind() {
      $('rRange').addEventListener('input', function () {
        stopSpin();
        setCount(Number(this.value));
      });
      $('rMinus').addEventListener('click', function () {
        stopSpin();
        setCount(items.length - 1);
      });
      $('rPlus').addEventListener('click', function () {
        stopSpin();
        setCount(items.length + 1);
      });
      $('spinBtn').addEventListener('click', spin);

      $('rItems').addEventListener('input', function (e) {
        var input = e.target;
        if (!input || input.tagName !== 'INPUT') return;
        var i = Number(input.getAttribute('data-i'));
        if (!(i >= 0 && i < items.length)) return;
        items[i] = input.value;
        markPreset(null);
        if (!spinning) {
          winIdx = -1;
          draw();
        }
      });

      qsa('.chip').forEach(function (ch) {
        ch.addEventListener('click', function () {
          applyPreset(ch.getAttribute('data-preset'));
        });
      });

      var onResize = function () { draw(); };
      window.addEventListener('resize', onResize);
      window.addEventListener('orientationchange', onResize);
    }

    function init() {
      bind();
      syncCount();
      renderItems();
      draw();
    }

    return {
      init: init,
      setVisible: function (visible) {
        if (visible) requestAnimationFrame(draw);
      }
    };
  })();

  /* =========================================================
     사다리 타기
     ========================================================= */
  var Ladder = (function () {
    var MIN = 2;
    var MAX = 20;
    var ROWS = 12;
    var RESULT_CYCLE = ['당첨', '커피 쏘기', '꽝'];

    var PATH_COLORS = [
      '#1E6B4E', '#E0883D', '#3E8E6E', '#C9A227', '#4C7FA8',
      '#B0563F', '#6C8F3E', '#8A6FBF', '#2E8B7A', '#D2683C'
    ];

    var names = [];
    var results = [];
    var rungs = [];
    var cw = 60;
    var rowH = 30;
    var boardW = 0;
    var boardH = 0;
    var canvas = null;
    var ctx = null;
    var dpr = 1;
    var revealed = false;
    var trace = null;      // { idx, pts, p, raf, end }

    function defaultName(i) { return '참가자 ' + (i + 1); }
    function defaultResult(i) { return RESULT_CYCLE[i % RESULT_CYCLE.length]; }

    function nameOf(i) {
      var v = (names[i] || '').trim();
      return v || defaultName(i);
    }
    function resultOf(i) {
      var v = (results[i] || '').trim();
      return v || defaultResult(i);
    }

    function cx(i) { return (i + 0.5) * cw; }

    function generate() {
      rungs = [];
      for (var r = 0; r < ROWS; r++) {
        var set = new Set();
        for (var c = 0; c < names.length - 1; c++) {
          if (set.has(c - 1)) continue;             // 같은 층에서 가로줄이 붙지 않게
          if (Math.random() < 0.42) set.add(c);
        }
        rungs.push(set);
      }
    }

    function pathFor(start) {
      var pts = [{ x: cx(start), y: 0 }];
      var c = start;
      for (var r = 0; r < ROWS; r++) {
        var y = (r + 0.5) * rowH;
        if (rungs[r].has(c - 1)) {
          pts.push({ x: cx(c), y: y });
          c -= 1;
          pts.push({ x: cx(c), y: y });
        } else if (rungs[r].has(c)) {
          pts.push({ x: cx(c), y: y });
          c += 1;
          pts.push({ x: cx(c), y: y });
        }
      }
      pts.push({ x: cx(c), y: ROWS * rowH });
      return { pts: pts, end: c };
    }

    function layout() {
      var scroll = $('lScroll');
      if (!scroll) return false;
      var avail = scroll.clientWidth;
      if (!avail) return false;

      var n = names.length;
      var minCw = 46;
      boardW = Math.max(avail, n * minCw);
      cw = boardW / n;
      rowH = n > 14 ? 26 : 30;
      boardH = ROWS * rowH;

      dpr = Math.min(window.devicePixelRatio || 1, 3);

      var inner = $('lInner');
      inner.style.width = boardW + 'px';

      canvas.width = Math.round(boardW * dpr);
      canvas.height = Math.round(boardH * dpr);
      canvas.style.width = boardW + 'px';
      canvas.style.height = boardH + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      return true;
    }

    function drawPolyline(pts, progress, color, width) {
      var lens = [];
      var total = 0;
      var i;
      for (i = 1; i < pts.length; i++) {
        var d = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
        lens.push(d);
        total += d;
      }

      var remain = total * clamp(progress, 0, 1);

      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (i = 1; i < pts.length; i++) {
        var len = lens[i - 1];
        if (remain >= len) {
          ctx.lineTo(pts[i].x, pts[i].y);
          remain -= len;
        } else {
          var f = len ? remain / len : 0;
          ctx.lineTo(
            pts[i - 1].x + (pts[i].x - pts[i - 1].x) * f,
            pts[i - 1].y + (pts[i].y - pts[i - 1].y) * f
          );
          break;
        }
      }
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.stroke();
    }

    function draw() {
      if (!ctx || !boardW || !boardH) return;
      var n = names.length;

      ctx.clearRect(0, 0, boardW, boardH);

      // 세로 기둥
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      ctx.strokeStyle = '#CBDDD3';
      for (var i = 0; i < n; i++) {
        ctx.beginPath();
        ctx.moveTo(cx(i), 0);
        ctx.lineTo(cx(i), boardH);
        ctx.stroke();
      }

      // 가로 발판
      ctx.strokeStyle = '#B7CDBF';
      for (var r = 0; r < ROWS; r++) {
        var y = (r + 0.5) * rowH;
        var row = rungs[r];
        if (!row) continue;
        row.forEach(function (c) {
          ctx.beginPath();
          ctx.moveTo(cx(c), y);
          ctx.lineTo(cx(c + 1), y);
          ctx.stroke();
        });
      }

      if (revealed) {
        for (var k = 0; k < n; k++) {
          ctx.globalAlpha = 0.85;
          drawPolyline(pathFor(k).pts, 1, PATH_COLORS[k % PATH_COLORS.length], 3.2);
          ctx.globalAlpha = 1;
        }
        return;
      }

      if (trace) {
        var color = PATH_COLORS[trace.idx % PATH_COLORS.length];
        ctx.save();
        ctx.shadowColor = 'rgba(15, 69, 49, 0.22)';
        ctx.shadowBlur = 6;
        drawPolyline(trace.pts, trace.p, color, 4.5);
        ctx.restore();
        // 출발점 표시
        ctx.beginPath();
        ctx.arc(cx(trace.idx), 0, 4, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
      }
    }

    function setToast(text, cls) {
      var el = $('lToast');
      if (!el) return;
      el.textContent = text || '';
      el.className = 'ladder-toast' + (cls ? ' ' + cls : '');
    }

    function markActive(idx) {
      qsa('.lname').forEach(function (el) {
        el.classList.toggle('active', Number(el.getAttribute('data-i')) === idx);
      });
    }

    function markResult(idx) {
      qsa('.lres').forEach(function (el, i) {
        el.classList.toggle('hit', i === idx);
      });
    }

    function clearMarks() {
      qsa('.lname').forEach(function (el) { el.classList.remove('active'); });
      qsa('.lres').forEach(function (el) { el.classList.remove('hit'); });
    }

    function cancelTrace() {
      if (trace && trace.raf) cancelAnimationFrame(trace.raf);
      trace = null;
    }

    function traceFrom(idx) {
      cancelTrace();
      revealed = false;
      $('lResultTable').hidden = true;
      $('lReveal').textContent = '전체 결과 한눈에 보기';

      var path = pathFor(idx);
      trace = { idx: idx, pts: path.pts, end: path.end, p: 0, raf: 0 };

      clearMarks();
      markActive(idx);
      setToast('', '');
      draw();

      var dur = reduceMotion.matches ? 260 : 1250;
      var t0 = 0;

      function step(ts) {
        if (!trace) return;
        if (!t0) t0 = ts;
        var t = clamp((ts - t0) / dur, 0, 1);
        trace.p = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
        draw();
        if (t < 1) {
          trace.raf = requestAnimationFrame(step);
          return;
        }
        trace.p = 1;
        trace.raf = 0;
        draw();
        setToast(nameOf(idx) + ' → ' + resultOf(trace.end), 'ok');
        markResult(trace.end);
      }

      trace.raf = requestAnimationFrame(step);
    }

    function renderTable() {
      var box = $('lResultTable');
      box.innerHTML = '';
      names.forEach(function (_, i) {
        var end = pathFor(i).end;
        var row = document.createElement('div');
        row.className = 'res-row';

        var who = document.createElement('span');
        who.className = 'who';
        who.textContent = nameOf(i);

        var arw = document.createElement('span');
        arw.className = 'arw';
        arw.textContent = '→';

        var what = document.createElement('span');
        what.className = 'what';
        what.textContent = resultOf(end);

        row.appendChild(who);
        row.appendChild(arw);
        row.appendChild(what);
        box.appendChild(row);
      });
    }

    function toggleReveal() {
      cancelTrace();
      clearMarks();

      if (revealed) {
        revealed = false;
        $('lResultTable').hidden = true;
        $('lReveal').textContent = '전체 결과 한눈에 보기';
        setToast('', '');
        draw();
        return;
      }

      revealed = true;
      renderTable();
      $('lResultTable').hidden = false;
      $('lReveal').textContent = '결과 접기';
      setToast('', '');
      draw();
    }

    function syncCount() {
      var n = names.length;
      $('lCount').textContent = String(n);
      $('lRange').value = String(n);
      $('lMinus').disabled = n <= MIN;
      $('lPlus').disabled = n >= MAX;
    }

    function renderInputs() {
      var n = names.length;

      var nameWrap = $('lNames');
      nameWrap.innerHTML = '';
      names.forEach(function (val, i) {
        var row = document.createElement('div');
        row.className = 'item';

        var idx = document.createElement('span');
        idx.className = 'idx';
        idx.textContent = String(i + 1);

        var input = document.createElement('input');
        input.type = 'text';
        input.value = val;
        input.maxLength = 12;
        input.setAttribute('data-kind', 'name');
        input.setAttribute('data-i', String(i));
        input.setAttribute('aria-label', (i + 1) + '번 참가자 이름');

        row.appendChild(idx);
        row.appendChild(input);
        nameWrap.appendChild(row);
      });

      var resWrap = $('lResults');
      resWrap.innerHTML = '';
      results.slice(0, n).forEach(function (val, i) {
        var row = document.createElement('div');
        row.className = 'item';

        var idx = document.createElement('span');
        idx.className = 'idx';
        idx.textContent = String(i + 1);

        var input = document.createElement('input');
        input.type = 'text';
        input.value = val;
        input.maxLength = 12;
        input.setAttribute('data-kind', 'result');
        input.setAttribute('data-i', String(i));
        input.setAttribute('aria-label', (i + 1) + '번 결과');

        row.appendChild(idx);
        row.appendChild(input);
        resWrap.appendChild(row);
      });
    }

    function renderRows() {
      var n = names.length;
      var cols = 'repeat(' + n + ', minmax(0, 1fr))';

      var top = $('lNameRow');
      top.style.gridTemplateColumns = cols;
      top.innerHTML = '';
      names.forEach(function (_, i) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'lname';
        b.textContent = nameOf(i);
        b.title = nameOf(i);
        b.setAttribute('data-i', String(i));
        b.addEventListener('click', function () { traceFrom(i); });
        top.appendChild(b);
      });

      var bot = $('lResultRow');
      bot.style.gridTemplateColumns = cols;
      bot.innerHTML = '';
      results.slice(0, n).forEach(function (_, i) {
        var d = document.createElement('div');
        d.className = 'lres';
        d.textContent = resultOf(i);
        d.title = resultOf(i);
        bot.appendChild(d);
      });
    }

    function reset() {
      cancelTrace();
      revealed = false;
      clearMarks();
      setToast('', '');
      $('lResultTable').hidden = true;
      $('lReveal').textContent = '전체 결과 한눈에 보기';
      generate();
      layout();
      renderRows();
      draw();
    }

    function setCount(next) {
      next = clamp(Math.round(next), MIN, MAX);
      if (next === names.length) { syncCount(); return; }
      while (names.length < next) {
        var i = names.length;
        names.push(defaultName(i));
        results.push(defaultResult(i));
      }
      names.length = next;
      results.length = next;
      syncCount();
      renderInputs();
      reset();
    }

    function shuffleBoard() {
      cancelTrace();
      revealed = false;
      clearMarks();
      setToast('', '');
      $('lResultTable').hidden = true;
      $('lReveal').textContent = '전체 결과 한눈에 보기';
      generate();
      draw();
    }

    function bind() {
      $('lRange').addEventListener('input', function () { setCount(Number(this.value)); });
      $('lMinus').addEventListener('click', function () { setCount(names.length - 1); });
      $('lPlus').addEventListener('click', function () { setCount(names.length + 1); });
      $('lReveal').addEventListener('click', toggleReveal);
      $('lShuffle').addEventListener('click', shuffleBoard);

      var onInput = function (e) {
        var input = e.target;
        if (!input || input.tagName !== 'INPUT') return;
        var i = Number(input.getAttribute('data-i'));
        var kind = input.getAttribute('data-kind');
        if (kind === 'name' && i >= 0 && i < names.length) {
          names[i] = input.value;
          var btn = qsa('.lname')[i];
          if (btn) {
            btn.textContent = nameOf(i);
            btn.title = nameOf(i);
          }
        } else if (kind === 'result' && i >= 0 && i < results.length) {
          results[i] = input.value;
          var cell = qsa('.lres')[i];
          if (cell) {
            cell.textContent = resultOf(i);
            cell.title = resultOf(i);
          }
        }
        // 이름·결과가 바뀌면 미리 보여준 결과는 감춥니다
        if (revealed) {
          revealed = false;
          $('lResultTable').hidden = true;
          $('lReveal').textContent = '전체 결과 한눈에 보기';
          draw();
        }
        if (trace && !trace.raf) {
          // 이미 끝난 경로의 도착 결과가 바뀌었을 수 있으니 표시를 갱신
          var t = $('lToast');
          if (t && t.textContent) setToast(nameOf(trace.idx) + ' → ' + resultOf(trace.end), 'ok');
        }
      };

      $('lNames').addEventListener('input', onInput);
      $('lResults').addEventListener('input', onInput);

      var onResize = function () {
        cancelTrace();
        clearMarks();
        if (layout()) {
          renderRows();
          draw();
        }
      };
      window.addEventListener('resize', onResize);
      window.addEventListener('orientationchange', onResize);
    }

    function init() {
      for (var i = 0; i < 4; i++) {
        names.push(defaultName(i));
        results.push(defaultResult(i));
      }
      canvas = $('ladderCanvas');
      ctx = canvas.getContext('2d');
      bind();
      syncCount();
      renderInputs();
      generate();
      layout();
      renderRows();
      draw();
    }

    return {
      init: init,
      setVisible: function (visible) {
        if (!visible) return;
        requestAnimationFrame(function () {
          if (layout()) {
            renderRows();
            draw();
          }
        });
      }
    };
  })();

  /* =========================================================
     시작
     ========================================================= */
  function boot() {
    try { Roulette.init(); } catch (e) { /* 돌림판 초기화 실패가 탭 전환을 막지 않도록 */ }
    try { Ladder.init(); } catch (e) { /* 사다리 초기화 실패와 무관하게 나머지는 동작 */ }

    tabButtons.forEach(function (btn) {
      btn.addEventListener('click', function () {
        activate(btn.getAttribute('data-panel'), true);
      });
      btn.addEventListener('keydown', function (e) {
        if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
        var i = tabButtons.indexOf(btn);
        var dir = e.key === 'ArrowRight' ? 1 : -1;
        var next = tabButtons[(i + dir + tabButtons.length) % tabButtons.length];
        next.focus();
        activate(next.getAttribute('data-panel'), true);
        e.preventDefault();
      });
    });

    window.addEventListener('hashchange', function () {
      activate((location.hash || '').replace('#', '') || 'calc', false);
    });

    var initial = (location.hash || '').replace('#', '');
    if (initial && initial !== 'calc') activate(initial, false);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
