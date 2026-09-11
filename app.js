(function () {
  "use strict";

  var SLOT_COUNT = 8;
  var LS_KEY = "selectionWall.v1";
  var COVER_CACHE_KEY = "selectionWall.coverCache.v1";

  var THEMES = [
    { id: "summer", label: "Summer", desc: "Sun-drenched, upbeat, warm-weather listening.", seasons: ["summer"], moods: ["energetic", "uplifting", "dreamy"] },
    { id: "fall", label: "Fall", desc: "Amber light, reflective, sweater-weather indie & folk.", seasons: ["fall"], moods: ["nostalgic", "mellow", "reflective"] },
    { id: "winter", label: "Winter", desc: "Cozy, slow, fireplace-and-snow listening.", seasons: ["winter"], moods: ["cozy", "mellow", "dreamy"] },
    { id: "spring", label: "Spring", desc: "Fresh, light, hopeful.", seasons: ["spring"], moods: ["uplifting", "dreamy", "romantic"] },
    { id: "date-night", label: "Date Night", desc: "Romantic, low-lit, slow-dance records.", seasons: [], moods: ["romantic", "cool", "mellow"] },
    { id: "late-night", label: "Late Night", desc: "Dark, moody, after-hours.", seasons: [], moods: ["dark", "cool", "dreamy"] },
    { id: "high-energy", label: "High Energy", desc: "Loud, fast, get-the-store-moving.", seasons: [], moods: ["energetic"] },
    { id: "instrumental-focus", label: "Instrumental & Ambient", desc: "Post-rock, ambient, no vocals to talk over.", seasons: [], genres: ["post-rock", "ambient", "instrumental"] },
    { id: "hiphop-rnb", label: "Hip-Hop & R&B", desc: "Rap, soul, and rhythm & blues staples.", seasons: [], genres: ["hiphop", "rap", "rnb", "soul"] },
    { id: "jazz-classic", label: "Jazz & Classics", desc: "Timeless jazz and classic-era records.", seasons: [], genres: ["jazz", "classic"] },
    { id: "worship", label: "Worship & Gospel", desc: "Christian worship, gospel, and hymn-forward records.", seasons: [], genres: ["worship", "gospel"] },
    { id: "holiday", label: "Holiday", desc: "Christmas and seasonal records.", seasons: [], genres: ["holiday"] }
  ];

  var catalogMap = {};      // id -> album (from data/catalog.json, plus manual coverUrl override)
  var wallState = { slots: new Array(SLOT_COUNT).fill(null), theme: "" };
  var coverCache = {};      // albumId -> {url, source, checkedAt} ; source: "itunes" | "manual" | "none"
  var inFlight = {};        // albumId -> true while an iTunes lookup is running

  // ---------- persistence ----------

  function loadLocal() {
    try {
      var raw = localStorage.getItem(LS_KEY);
      if (raw) {
        var parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.slots)) {
          wallState.slots = parsed.slots.slice(0, SLOT_COUNT);
          while (wallState.slots.length < SLOT_COUNT) wallState.slots.push(null);
        }
        if (parsed && typeof parsed.theme === "string") wallState.theme = parsed.theme;
      }
    } catch (e) { /* ignore */ }
    try {
      var rawCache = localStorage.getItem(COVER_CACHE_KEY);
      if (rawCache) coverCache = JSON.parse(rawCache) || {};
    } catch (e) { coverCache = {}; }
  }

  function saveWall() {
    try { localStorage.setItem(LS_KEY, JSON.stringify(wallState)); } catch (e) { /* ignore */ }
  }

  function saveCoverCache() {
    try { localStorage.setItem(COVER_CACHE_KEY, JSON.stringify(coverCache)); } catch (e) { /* ignore */ }
  }

  // ---------- helpers ----------

  function el(tag, cls, html) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html !== undefined) e.innerHTML = html;
    return e;
  }

  function escapeHtml(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function placeholderColorFor(id) {
    var h = 0;
    for (var i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 360;
    return "hsl(" + h + " 38% 34%)";
  }

  function allAlbums() {
    return Object.keys(catalogMap).map(function (k) { return catalogMap[k]; })
      .sort(function (a, b) {
        if (a.artist === b.artist) return a.album.localeCompare(b.album);
        return a.artist.localeCompare(b.artist);
      });
  }

  function matchesTheme(album, theme) {
    if (!theme) return false;
    var seasonHit = theme.seasons && theme.seasons.length && album.seasons &&
      album.seasons.some(function (s) { return theme.seasons.indexOf(s) !== -1; });
    var moodHit = theme.moods && theme.moods.length && album.moods &&
      album.moods.some(function (m) { return theme.moods.indexOf(m) !== -1; });
    var genreHit = theme.genres && theme.genres.length && album.genres &&
      album.genres.some(function (g) { return theme.genres.indexOf(g) !== -1; });
    return !!(seasonHit || moodHit || genreHit);
  }

  function currentTheme() {
    return THEMES.find(function (t) { return t.id === wallState.theme; }) || null;
  }

  function coverUrlFor(albumId) {
    var album = catalogMap[albumId];
    if (album && album.manualCoverUrl) return album.manualCoverUrl;
    var cached = coverCache[albumId];
    if (cached && cached.url) return cached.url;
    return null;
  }

  // ---------- iTunes cover lookup ----------

  function fetchCoverFromItunes(album) {
    if (inFlight[album.id]) return;
    inFlight[album.id] = true;
    var term = encodeURIComponent(album.artist + " " + album.album);
    var url = "https://itunes.apple.com/search?term=" + term + "&entity=album&limit=3";
    fetch(url).then(function (res) {
      if (!res.ok) throw new Error("bad response");
      return res.json();
    }).then(function (data) {
      var results = (data && data.results) || [];
      var best = results[0];
      // prefer a result whose artist name roughly matches
      var artistLower = album.artist.toLowerCase();
      for (var i = 0; i < results.length; i++) {
        if (results[i].artistName && results[i].artistName.toLowerCase().indexOf(artistLower.split(" ")[0]) !== -1) {
          best = results[i];
          break;
        }
      }
      if (best && best.artworkUrl100) {
        var hiRes = best.artworkUrl100.replace("100x100bb", "600x600bb");
        coverCache[album.id] = { url: hiRes, source: "itunes", checkedAt: Date.now() };
      } else {
        coverCache[album.id] = { url: null, source: "none", checkedAt: Date.now() };
      }
      saveCoverCache();
      delete inFlight[album.id];
      renderAll();
    }).catch(function () {
      coverCache[album.id] = { url: null, source: "none", checkedAt: Date.now() };
      saveCoverCache();
      delete inFlight[album.id];
      renderAll();
    });
  }

  function ensureCoverLookup(album) {
    if (!album) return;
    if (album.manualCoverUrl) return; // manual override wins, no lookup needed
    if (album.skipCoverLookup) return; // local/small label not on iTunes, don't bother
    var cached = coverCache[album.id];
    if (cached) return; // already resolved (found or confirmed none) or being resolved
    fetchCoverFromItunes(album);
  }

  // ---------- rendering: art ----------

  function renderPlaceholder(container, album) {
    container.innerHTML = "";
    var wrapDiv = el("div", "placeholder-art" + (album ? "" : " empty"));
    if (album) {
      var c = placeholderColorFor(album.id);
      wrapDiv.style.color = c;
      wrapDiv.style.background = "color-mix(in srgb, " + c + " 14%, var(--sleeve))";
      wrapDiv.appendChild(el("div", "pa-ring"));
      wrapDiv.appendChild(el("div", "pa-artist", escapeHtml(album.artist)));
      wrapDiv.appendChild(el("div", "pa-album", escapeHtml(album.album)));
    } else {
      wrapDiv.appendChild(el("div", "pa-artist", "Empty slot"));
      wrapDiv.appendChild(el("div", "pa-album", "Choose an album below"));
    }
    container.appendChild(wrapDiv);
  }

  function renderArt(container, album) {
    container.innerHTML = "";
    if (!album) { renderPlaceholder(container, null); return; }

    var url = coverUrlFor(album.id);
    if (url) {
      var img = document.createElement("img");
      img.src = url;
      img.alt = album.artist + " — " + album.album + " cover";
      img.loading = "lazy";
      img.onerror = function () { renderPlaceholder(container, album); };
      container.appendChild(img);
      return;
    }

    var cached = coverCache[album.id];
    if (!album.manualCoverUrl && !cached) {
      ensureCoverLookup(album);
      renderPlaceholder(container, album);
      var dot = el("div", "loading-dot");
      container.appendChild(dot);
      return;
    }

    renderPlaceholder(container, album);
  }

  // ---------- rendering: wall ----------

  function buildOptionsHtml(selectedId, theme) {
    var albums = allAlbums();
    var matched = [], rest = [];
    albums.forEach(function (a) {
      if (theme && matchesTheme(a, theme)) matched.push(a); else rest.push(a);
    });
    var out = '<option value="">&mdash; empty &mdash;</option>';
    function opt(a) {
      return '<option value="' + a.id + '"' + (a.id === selectedId ? " selected" : "") + '>' +
        escapeHtml(a.artist) + " — " + escapeHtml(a.album) + "</option>";
    }
    if (theme && matched.length) {
      out += '<optgroup label="Suggested for ' + escapeHtml(theme.label) + '">';
      matched.forEach(function (a) { out += opt(a); });
      out += '</optgroup><optgroup label="Everything else">';
      rest.forEach(function (a) { out += opt(a); });
      out += "</optgroup>";
    } else {
      albums.forEach(function (a) { out += opt(a); });
    }
    return out;
  }

  function setSlot(index, albumId) {
    wallState.slots[index] = albumId || null;
    saveWall();
    renderAll();
  }

  function clearWall() {
    wallState.slots = new Array(SLOT_COUNT).fill(null);
    saveWall();
    renderAll();
  }

  function addToFirstEmptySlot(albumId) {
    var i = wallState.slots.indexOf(null);
    if (i === -1) i = wallState.slots.length - 1;
    setSlot(i, albumId);
  }

  function renderWall() {
    var wall = document.getElementById("wall");
    wall.innerHTML = "";
    var theme = currentTheme();

    for (var i = 0; i < SLOT_COUNT; i++) {
      (function (i) {
        var albumId = wallState.slots[i];
        var album = albumId ? catalogMap[albumId] : null;

        var slot = el("div", "slot");

        var sleeve = el("div", "sleeve");
        sleeve.appendChild(el("span", "slot-index", (i + 1) + "/8"));
        var artHolder = el("div");
        artHolder.style.width = "100%";
        artHolder.style.height = "100%";
        sleeve.appendChild(artHolder);
        renderArt(artHolder, album);
        slot.appendChild(sleeve);

        var meta = el("div", "slot-meta");
        var select = document.createElement("select");
        select.className = "slot-select";
        select.setAttribute("aria-label", "Album for slot " + (i + 1));
        select.innerHTML = buildOptionsHtml(albumId, theme);
        select.addEventListener("change", function () { setSlot(i, select.value || null); });
        meta.appendChild(select);

        if (album) {
          var titles = el("div", "slot-titles");
          titles.appendChild(el("div", "slot-artist", escapeHtml(album.artist)));
          titles.appendChild(el("div", "slot-album", escapeHtml(album.album)));
          var tags = el("div", "slot-tags");
          (album.seasons || []).concat(album.moods || []).slice(0, 4).forEach(function (t) {
            var isMatch = theme && ((theme.seasons || []).indexOf(t) !== -1 || (theme.moods || []).indexOf(t) !== -1 || (theme.genres || []).indexOf(t) !== -1);
            tags.appendChild(el("span", "tag" + (isMatch ? " match" : ""), escapeHtml(t)));
          });
          titles.appendChild(tags);
          meta.appendChild(titles);

          var actions = el("div", "slot-actions");
          var photoBtn = el("button", "ghost", "Photo");
          photoBtn.type = "button";
          photoBtn.title = "Upload your own photo of this cover";
          photoBtn.addEventListener("click", function () { triggerUpload(album.id); });
          actions.appendChild(photoBtn);

          var clearBtn = el("button", "ghost", "Remove");
          clearBtn.type = "button";
          clearBtn.addEventListener("click", function () { setSlot(i, null); });
          actions.appendChild(clearBtn);
          meta.appendChild(actions);
        }

        slot.appendChild(meta);
        wall.appendChild(slot);
      })(i);
    }
  }

  // ---------- rendering: catalog table ----------

  function renderCatalog() {
    var body = document.getElementById("catalog-body");
    var q = (document.getElementById("search-input").value || "").toLowerCase().trim();
    var all = allAlbums();
    var albums = all.filter(function (a) {
      if (!q) return true;
      return a.artist.toLowerCase().indexOf(q) !== -1 || a.album.toLowerCase().indexOf(q) !== -1;
    });
    document.getElementById("catalog-count").textContent = albums.length + " of " + all.length + " records";
    body.innerHTML = "";
    var theme = currentTheme();

    albums.forEach(function (a) {
      var tr = document.createElement("tr");
      tr.appendChild(el("td", "td-artist", escapeHtml(a.artist)));
      tr.appendChild(el("td", "td-album", escapeHtml(a.album)));

      var tdT = document.createElement("td");
      var tagWrap = el("div", "td-tags");
      (a.genres || []).concat(a.seasons || []).slice(0, 5).forEach(function (t) {
        var isMatch = theme && matchesTheme(a, theme) && ((theme.seasons || []).indexOf(t) !== -1 || (theme.genres || []).indexOf(t) !== -1);
        tagWrap.appendChild(el("span", "tag" + (isMatch ? " match" : ""), escapeHtml(t)));
      });
      tdT.appendChild(tagWrap);
      tr.appendChild(tdT);

      var tdCover = document.createElement("td");
      var url = coverUrlFor(a.id);
      if (url) {
        var thumb = document.createElement("img");
        thumb.className = "td-cover-thumb";
        thumb.src = url;
        thumb.alt = "";
        thumb.onerror = function () { thumb.style.visibility = "hidden"; };
        tdCover.appendChild(thumb);
      } else {
        ensureCoverLookup(a);
        tdCover.appendChild(el("div", "td-cover-thumb"));
      }
      tr.appendChild(tdCover);

      var tdBtn = document.createElement("td");
      var btnWrap = el("div", "row-btns");
      var addBtn = el("button", "secondary row-add-btn", "Add");
      addBtn.type = "button";
      addBtn.addEventListener("click", function () { addToFirstEmptySlot(a.id); });
      btnWrap.appendChild(addBtn);
      var fixBtn = el("button", "ghost row-fix-btn", "Fix cover");
      fixBtn.type = "button";
      fixBtn.addEventListener("click", function () { promptManualCover(a.id); });
      btnWrap.appendChild(fixBtn);
      tdBtn.appendChild(btnWrap);
      tr.appendChild(tdBtn);

      body.appendChild(tr);
    });
  }

  function promptManualCover(albumId) {
    var album = catalogMap[albumId];
    if (!album) return;
    var current = album.manualCoverUrl || "";
    var input = window.prompt("Paste a direct image URL for " + album.artist + " — " + album.album + " (leave blank to clear and re-try automatic lookup):", current);
    if (input === null) return;
    input = input.trim();
    if (input) {
      album.manualCoverUrl = input;
    } else {
      delete album.manualCoverUrl;
      delete coverCache[albumId];
      saveCoverCache();
    }
    saveManualCovers();
    renderAll();
  }

  // ---------- manual cover overrides + uploads persisted in localStorage ----------

  var MANUAL_COVERS_KEY = "selectionWall.manualCovers.v1";

  function loadManualCovers() {
    try {
      var raw = localStorage.getItem(MANUAL_COVERS_KEY);
      var map = raw ? JSON.parse(raw) : {};
      Object.keys(map).forEach(function (id) {
        if (catalogMap[id]) catalogMap[id].manualCoverUrl = map[id];
      });
    } catch (e) { /* ignore */ }
  }

  function saveManualCovers() {
    var map = {};
    Object.keys(catalogMap).forEach(function (id) {
      if (catalogMap[id].manualCoverUrl) map[id] = catalogMap[id].manualCoverUrl;
    });
    try { localStorage.setItem(MANUAL_COVERS_KEY, JSON.stringify(map)); } catch (e) { /* ignore */ }
  }

  function triggerUpload(albumId) {
    var input = document.getElementById("hidden-upload-input");
    input.dataset.albumId = albumId;
    input.click();
  }

  function handleUploadChange(e) {
    var file = e.target.files && e.target.files[0];
    var albumId = e.target.dataset.albumId;
    e.target.value = "";
    if (!file || !albumId) return;
    if (file.size > 3 * 1024 * 1024) {
      alert("That photo is a bit large for browser storage (over 3MB). Try a smaller image, or use a hosted image link with \"Fix cover\" instead.");
      return;
    }
    var reader = new FileReader();
    reader.onload = function () {
      var album = catalogMap[albumId];
      if (!album) return;
      album.manualCoverUrl = reader.result; // data: URL, stored in localStorage
      saveManualCovers();
      renderAll();
    };
    reader.readAsDataURL(file);
  }

  // ---------- theme controls ----------

  function renderThemeSelect() {
    var sel = document.getElementById("theme-select");
    var html = '<option value="">No theme &mdash; browse freely</option>';
    THEMES.forEach(function (t) {
      html += '<option value="' + t.id + '"' + (t.id === wallState.theme ? " selected" : "") + ">" + escapeHtml(t.label) + "</option>";
    });
    sel.innerHTML = html;
  }

  function renderThemeNote() {
    var note = document.getElementById("theme-note");
    var theme = currentTheme();
    if (!theme) { note.innerHTML = "&nbsp;"; return; }
    var count = allAlbums().filter(function (a) { return matchesTheme(a, theme); }).length;
    note.innerHTML = escapeHtml(theme.desc) + ' <strong>' + count + " album" + (count === 1 ? "" : "s") + " in the crates match.</strong> Suggested picks float to the top of each dropdown.";
  }

  // ---------- export / import ----------

  function exportData() {
    var manual = {};
    Object.keys(catalogMap).forEach(function (id) {
      if (catalogMap[id].manualCoverUrl) manual[id] = catalogMap[id].manualCoverUrl;
    });
    var payload = {
      exportedAt: new Date().toISOString(),
      wall: wallState,
      manualCovers: manual
    };
    var blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = "selection-wall-data.json";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  function importData(file) {
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var payload = JSON.parse(reader.result);
        if (payload.wall && Array.isArray(payload.wall.slots)) {
          wallState.slots = payload.wall.slots.slice(0, SLOT_COUNT);
          while (wallState.slots.length < SLOT_COUNT) wallState.slots.push(null);
          wallState.theme = typeof payload.wall.theme === "string" ? payload.wall.theme : "";
          saveWall();
        }
        if (payload.manualCovers) {
          Object.keys(payload.manualCovers).forEach(function (id) {
            if (catalogMap[id]) catalogMap[id].manualCoverUrl = payload.manualCovers[id];
          });
          saveManualCovers();
        }
        renderAll();
      } catch (e) {
        alert("That file doesn't look like a Selection Wall export.");
      }
    };
    reader.readAsText(file);
  }

  // ---------- boot ----------

  function renderAll() {
    renderThemeSelect();
    renderThemeNote();
    renderWall();
    renderCatalog();
  }

  function wireControls() {
    document.getElementById("theme-select").addEventListener("change", function (e) {
      wallState.theme = e.target.value;
      saveWall();
      renderAll();
    });
    document.getElementById("search-input").addEventListener("input", renderCatalog);
    document.getElementById("clear-wall-btn").addEventListener("click", clearWall);
    document.getElementById("hidden-upload-input").addEventListener("change", handleUploadChange);
    document.getElementById("export-btn").addEventListener("click", exportData);
    document.getElementById("import-input").addEventListener("change", function (e) {
      var file = e.target.files && e.target.files[0];
      if (file) importData(file);
      e.target.value = "";
    });
  }

  function boot() {
    loadLocal();
    fetch("data/catalog.json").then(function (res) { return res.json(); }).then(function (list) {
      var map = {};
      list.forEach(function (a) { map[a.id] = a; });
      catalogMap = map;
      loadManualCovers();
      wireControls();
      renderAll();
    }).catch(function (err) {
      console.error("failed to load catalog", err);
      document.getElementById("wall").innerHTML = "<p style='color:var(--danger)'>Couldn't load data/catalog.json &mdash; make sure you're serving this folder over HTTP (see README) rather than opening index.html directly from disk.</p>";
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
