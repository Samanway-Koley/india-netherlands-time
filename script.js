(function () {
  "use strict";

  var TZ_IN = "Asia/Kolkata", TZ_NL = "Europe/Amsterdam";
  var use12 = true;

  /* ---------- Intl formatters ---------- */
  function formatParts(tz) {
    return new Intl.DateTimeFormat("en-GB", {
      timeZone: tz, hourCycle: "h23",
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit"
    });
  }
  function formatDate(tz) {
    return new Intl.DateTimeFormat("en-GB", {
      timeZone: tz, weekday: "long", day: "numeric", month: "long", year: "numeric"
    });
  }
  function formatName(tz) {
    return new Intl.DateTimeFormat("en-GB", {
      timeZone: tz, hour: "2-digit", timeZoneName: "short"
    });
  }
  var fPartsIN = formatParts(TZ_IN), fPartsNL = formatParts(TZ_NL);
  var fDateIN = formatDate(TZ_IN), fDateNL = formatDate(TZ_NL);
  var fNameIN = formatName(TZ_IN), fNameNL = formatName(TZ_NL);

  function parts(d, fmt) {
    var o = { y: 0, mo: 0, d: 0, h: 0, m: 0, s: 0 };
    fmt.formatToParts(d).forEach(function (p) { o[p.type] = p.value; });
    return { y: +o.year, mo: +o.month, d: +o.day, h: +o.hour, m: +o.minute, s: +o.second };
  }
  function offsetMinutes(d, tz) {
    var t = new Date(Math.floor(d.getTime() / 1000) * 1000);
    var p = parts(t, tz === TZ_IN ? fPartsIN : fPartsNL);
    return Math.round((Date.UTC(p.y, p.mo - 1, p.d, p.h, p.m, p.s) - t.getTime()) / 60000);
  }
  function tzAbbrev(d, fmt) {
    var n = "";
    fmt.formatToParts(d).forEach(function (p) { if (p.type === "timeZoneName") n = p.value; });
    return n.replace("GMT", "UTC");
  }
  function longDate(d, fmt) {
    var o = {};
    fmt.formatToParts(d).forEach(function (p) { o[p.type] = p.value; });
    return o.weekday + ", " + o.day + " " + o.month + " " + o.year;
  }
  function isoWeek(p) {
    var dt = new Date(Date.UTC(p.y, p.mo - 1, p.d));
    dt.setUTCDate(dt.getUTCDate() - ((dt.getUTCDay() + 6) % 7) + 3);
    var ft = new Date(Date.UTC(dt.getUTCFullYear(), 0, 4));
    ft.setUTCDate(ft.getUTCDate() - ((ft.getUTCDay() + 6) % 7) + 3);
    return 1 + Math.round((dt - ft) / (7 * 86400000));
  }
  function dayOfYear(p) {
    return Math.floor((Date.UTC(p.y, p.mo - 1, p.d) - Date.UTC(p.y, 0, 1)) / 86400000) + 1;
  }
  function pad(n) { return (n < 10 ? "0" : "") + n; }

  /* ---------- 12/24 helpers ---------- */
  function hourText(h) { return use12 ? pad(((h + 11) % 12) + 1) : pad(h); }
  function merText(h) { return use12 ? (h < 12 ? "AM" : "PM") : ""; }
  function fromMinutes(total) {
    var suffix = "";
    while (total < 0) { total += 1440; suffix = " (prev day)"; }
    while (total >= 1440) { total -= 1440; suffix = " (next day)"; }
    var hh = Math.floor(total / 60), mm = total % 60;
    return (use12 ? hourText(hh) : pad(hh)) + ":" + pad(mm) + (use12 ? " " + merText(hh) : "") + suffix;
  }

  /* ---------- DOM refs ---------- */
  function $(id) { return document.getElementById(id); }
  var cardIST = $("cardIST"), cardNL = $("cardNL");
  function pack(card, k) {
    return {
      hh: card.querySelector(".hh"), mm: card.querySelector(".mm"),
      mer: card.querySelector(".mer"), sec: card.querySelector(".sec"),
      date: $("date" + k), off: $("off" + k), doy: $("doy" + k),
      prog: $("prog" + k), elap: $("elap" + k), mark: $("mark" + k),
      hhH: $("hh" + k), mhH: $("mh" + k), shH: $("sh" + k),
      pill: card.querySelector(".pill")
    };
  }
  var el = { utc: $("utcTime"), ist: pack(cardIST, "IST"), nl: pack(cardNL, "NL") };

  /* ---------- analog ticks ---------- */
  function buildTicks(id) {
    var g = $(id), NS = "http://www.w3.org/2000/svg";
    for (var i = 0; i < 60; i += 5) {
      var major = (i % 15 === 0);
      var ln = document.createElementNS(NS, "line");
      var r1 = major ? 46 : 49.5, a = (i * 6 - 90) * Math.PI / 180;
      ln.setAttribute("x1", 60 + r1 * Math.cos(a)); ln.setAttribute("y1", 60 + r1 * Math.sin(a));
      ln.setAttribute("x2", 60 + 53 * Math.cos(a)); ln.setAttribute("y2", 60 + 53 * Math.sin(a));
      ln.setAttribute("class", "tickln" + (major ? " major" : ""));
      g.appendChild(ln);
    }
  }
  buildTicks("ticksIST"); buildTicks("ticksNL");

  function setHands(g, h, m, sFrac) {
    g.shH.setAttribute("transform", "rotate(" + (sFrac * 6) + " 60 60)");
    g.mhH.setAttribute("transform", "rotate(" + ((m + sFrac / 60) * 6) + " 60 60)");
    g.hhH.setAttribute("transform", "rotate(" + (((h % 12) + m / 60 + sFrac / 3600) * 30) + " 60 60)");
  }
  function setPill(pill, h) {
    var day = (h >= 6 && h < 18);
    pill.querySelector(".sun").style.display = day ? "" : "none";
    pill.querySelector(".moon").style.display = day ? "none" : "";
    pill.querySelector(".pill-label").textContent = day ? "Daylight" : "Night";
  }

  /* ---------- render ---------- */
  var lastDayKey = "";
  function tickSecond(d) {
    var pIN = parts(d, fPartsIN), pNL = parts(d, fPartsNL);

    el.ist.hh.textContent = hourText(pIN.h);
    el.ist.mm.textContent = pad(pIN.m);
    el.nl.hh.textContent = hourText(pNL.h);
    el.nl.mm.textContent = pad(pNL.m);
    el.ist.mer.textContent = merText(pIN.h);
    el.nl.mer.textContent = merText(pNL.h);
    el.ist.sec.textContent = pad(pIN.s);
    el.nl.sec.textContent = pad(pNL.s);

    /* tick animation on seconds */
    [el.ist.sec, el.nl.sec].forEach(function (s) {
      s.classList.remove("tick"); void s.offsetWidth; s.classList.add("tick");
    });

    /* day change detection */
    var key = pIN.d + "/" + pIN.mo + "/" + pIN.y + "|" + pNL.d + "|" + (use12 ? "12" : "24");
    if (key !== lastDayKey) {
      lastDayKey = key;
      el.ist.date.textContent = longDate(d, fDateIN);
      el.nl.date.textContent = longDate(d, fDateNL);
      el.ist.off.textContent = tzAbbrev(d, fNameIN);
      el.nl.off.textContent = tzAbbrev(d, fNameNL);
      el.ist.doy.textContent = "Day " + pad(dayOfYear(pIN)) + " · Wk " + pad(isoWeek(pIN));
      el.nl.doy.textContent = "Day " + pad(dayOfYear(pNL)) + " · Wk " + pad(isoWeek(pNL));
      updateDelta(d);
      updateOverlap(d);
      updateAxis();
    }

    var fIN = (pIN.h * 3600 + pIN.m * 60 + pIN.s) / 86400;
    var fNL = (pNL.h * 3600 + pNL.m * 60 + pNL.s) / 86400;
    el.ist.prog.style.width = (fIN * 100).toFixed(3) + "%";
    el.nl.prog.style.width = (fNL * 100).toFixed(3) + "%";
    el.ist.elap.textContent = (fIN * 100).toFixed(1) + "%";
    el.nl.elap.textContent = (fNL * 100).toFixed(1) + "%";
    el.ist.mark.style.left = (fIN * 100).toFixed(4) + "%";
    el.nl.mark.style.left = (fNL * 100).toFixed(4) + "%";

    setPill(el.ist.pill, pIN.h);
    setPill(el.nl.pill, pNL.h);

    /* UTC chip */
    var iso = d.toISOString();
    var uH = +iso.slice(11, 13), uM = +iso.slice(14, 16), uS = +iso.slice(17, 19);
    el.utc.textContent = use12
      ? hourText(uH) + ":" + pad(uM) + ":" + pad(uS) + " " + merText(uH)
      : iso.slice(11, 19);
  }

  function updateDelta(d) {
    var diff = offsetMinutes(d, TZ_IN) - offsetMinutes(d, TZ_NL);
    var a = Math.abs(diff);
    $("deltaNum").innerHTML = " " + Math.floor(a / 60) + "<i>h</i>" + pad(a % 60) + "<i>m</i>";
    $("deltaLabel").textContent = diff > 0 ? "India is ahead of the Netherlands"
      : diff < 0 ? "Netherlands is ahead of India"
        : "Both clocks in sync";
    var nlTag = document.querySelector(".card.nl .tag");
    if (nlTag) nlTag.textContent = "Nº 02 — " + (offsetMinutes(d, TZ_NL) === 120 ? "CEST" : "CET");
  }

  function updateOverlap(d) {
    var diff = offsetMinutes(d, TZ_IN) - offsetMinutes(d, TZ_NL);
    var a1 = 9 * 60, a2 = 17 * 60;
    var b1 = 9 * 60 + diff, b2 = 17 * 60 + diff;
    var from = Math.max(a1, b1), to = Math.min(a2, b2);
    var html;
    if (to > from) {
      html = "Shared 9–5 window: <b class='o-in'>" + fromMinutes(from) + " – " + fromMinutes(to) + " IST</b>" +
        " &nbsp;=&nbsp; <b class='o-nl'>" + fromMinutes(from - diff) + " – " + fromMinutes(to - diff) + " Tilburg</b>" +
        " · " + ((to - from) / 60) + " h of overlap.";
    } else {
      html = "The two 9–5 working windows do not overlap today.";
    }
    $("overlapNote").innerHTML = html +
      "<br><span style='color:var(--faint)'>Tilburg 9 AM–5 PM lands at <b class='o-in'>" +
      fromMinutes(9 * 60 + diff) + " – " + fromMinutes(17 * 60 + diff) + " IST</b>" +
      " · India 9 AM–5 PM lands at <b class='o-nl'>" +
      fromMinutes(9 * 60 - diff) + " – " + fromMinutes(17 * 60 - diff) + " Tilburg</b></span>";
  }

  function updateAxis() {
    var labels = use12
      ? ["12 AM", "6 AM", "12 PM", "6 PM", "12 AM"]
      : ["00:00", "06:00", "12:00", "18:00", "24:00"];
    document.querySelectorAll("[data-axis]").forEach(function (ax) {
      ax.querySelectorAll("span").forEach(function (s, i) { s.textContent = labels[i]; });
    });
    var legendEl = document.querySelector(".legend");
    if (legendEl) {
      legendEl.innerHTML = "shaded = night <em>" +
        (use12 ? "7 PM – 6 AM" : "19:00 – 06:00") + "</em> · marker = now";
    }
  }

  /* ---------- format toggle (12H / 24H) ---------- */
  function applyFormat() {
    /* show/hide meridiems */
    document.querySelectorAll(".mer").forEach(function (m) {
      m.style.display = use12 ? "" : "none";
    });
    /* also show/hide seconds? nope — we keep seconds always visible */
    lastDayKey = ""; /* force full refresh */
    tickSecond(new Date());
  }

  $("fmtToggle").addEventListener("click", function () {
    use12 = !use12;
    $("f12").classList.toggle("on", use12);
    $("f24").classList.toggle("on", !use12);
    applyFormat();
  });

  /* ---------- copy buttons ---------- */
  document.querySelectorAll(".copy").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var tz = btn.getAttribute("data-tz"), now = new Date();
      var p = parts(now, tz === TZ_IN ? fPartsIN : fPartsNL);
      var text = (use12 ? hourText(p.h) : pad(p.h)) + ":" + pad(p.m) + ":" + pad(p.s) +
        (use12 ? " " + merText(p.h) : "") + " · " +
        longDate(now, tz === TZ_IN ? fDateIN : fDateNL) + " · " + tz;
      function done() {
        var old = btn.textContent;
        btn.textContent = "Copied ✓"; btn.classList.add("done");
        setTimeout(function () { btn.textContent = old; btn.classList.remove("done"); }, 1400);
      }
      function fallback() {
        var ta = document.createElement("textarea");
        ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
        ta.setAttribute("aria-hidden", "true");
        document.body.appendChild(ta); ta.select();
        try { document.execCommand("copy"); done(); } catch (e) { }
        document.body.removeChild(ta);
      }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(done, fallback);
      } else { fallback(); }
    });
  });

  /* ---------- cursor glow — smooth RAF-driven transform ---------- */
  var glow = $("cursorGlow");
  var glowX = -9999, glowY = -9999;
  window.addEventListener("pointermove", function (e) {
    glowX = e.clientX; glowY = e.clientY;
  }, { passive: true });
  function updateGlow() {
    /* translate(-50%, -50%) centers the glow on the cursor */
    glow.style.transform = "translate3d(" +
      (glowX - 260) + "px, " + (glowY - 260) + "px, 0)";
    requestAnimationFrame(updateGlow);
  }
  requestAnimationFrame(updateGlow);

  /* ---------- scroll reveals ---------- */
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); }
    });
  }, { threshold: 0.10 });
  document.querySelectorAll(".reveal").forEach(function (n) { io.observe(n); });

  /* ---------- main loop ---------- */
  var lastSec = -1;
  function frame() {
    var now = new Date(), ms = now.getMilliseconds() / 1000;
    var pIN = parts(now, fPartsIN), pNL = parts(now, fPartsNL);
    setHands(el.ist, pIN.h, pIN.m, pIN.s + ms);
    setHands(el.nl, pNL.h, pNL.m, pNL.s + ms);
    if (now.getSeconds() !== lastSec) {
      lastSec = now.getSeconds();
      tickSecond(now);
    }
    requestAnimationFrame(frame);
  }
  updateAxis();
  applyFormat();
  requestAnimationFrame(frame);
})();