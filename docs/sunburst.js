// USEEIO Sector Disaggregation – Interactive Sunburst
// - Loads CSV from GitHub Release assets (preferred) with fallbacks
// - Lets user select a Disaggregated_Commodity
// - Builds hierarchy: Tier -> SectorGroup (selectable) -> Scope with value = sum of Relative_Contribution

// Repo / Release configuration
const OWNER = "DecarbNexus";
const REPO = "useeio_sectors_disaggregation";
const TAG = "v1.0";
const DATA_FILENAME = "SEF_v1.3.0__disaggregation_factors__GHG2022_IO2017.csv";
const CLASS_FILENAME = "sector_classification.csv";

// Preferred: Release assets
const RELEASE_CSV_URL = `https://github.com/${OWNER}/${REPO}/releases/download/${TAG}/${DATA_FILENAME}`;
const RELEASE_CLASS_URL = `https://github.com/${OWNER}/${REPO}/releases/download/${TAG}/${CLASS_FILENAME}`;

// Raw file at the tagged version (preferred over main)
const RAW_CSV_URL = `https://raw.githubusercontent.com/${OWNER}/${REPO}/${TAG}/outputs/${DATA_FILENAME}`;

// Optional: sector classification CSV exported from the Excel tab. If missing, second ring defaults to Sector code.
const CLASS_CSV_URL = `https://raw.githubusercontent.com/${OWNER}/${REPO}/${TAG}/outputs/${CLASS_FILENAME}`;

// dynamic sizing computed at render time
let WIDTH = 700;
let RADIUS = WIDTH / 2;

const formatPct = d3.format(".1%");
const formatNum = d3.format(",.4f");

const tooltip = d3.select("#tooltip");

// Simple scale factor to reduce chart size relative to the previous (too big) version
const CHART_SCALE = 0.75; // 75% of previous size

async function loadCSV() {
  const candidates = [
    // Prefer same-origin bundle (downloaded into docs/data by GitHub Actions)
    "data/" + DATA_FILENAME,
    // Then Release asset, raw main, and local outputs
    RELEASE_CSV_URL,
    RAW_CSV_URL,
    "../outputs/" + DATA_FILENAME,
  ];
  let lastErr;
  for (const url of candidates) {
    try {
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) throw new Error(`fetch failed ${res.status}`);
      const text = await res.text();
      const data = d3.csvParse(text);
      console.log(`Loaded main data from: ${url} (rows: ${data.length})`);
      return data;
    } catch (e) {
      lastErr = e;
      continue;
    }
  }
  throw new Error("Failed to load CSV from any candidate URL: " + lastErr);
}

// Per-commodity JSONs and slim CSV removed; we load the full CSV once and filter client-side.

async function tryLoadClassification() {
  // Attempt Release first, then raw main, then repo-relative path
  const candidates = [
    // Prefer same-origin bundle
    "data/" + CLASS_FILENAME,
    // Then Release asset, raw main, then repo-relative fallback
    RELEASE_CLASS_URL,
    CLASS_CSV_URL,
    "../outputs/" + CLASS_FILENAME,
  ];
  let lastErr;
  for (const url of candidates) {
    try {
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) throw new Error(`fetch failed ${res.status}`);
      const text = await res.text();
      const csv = d3.csvParse(text);

    const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
    const findExact = (cands) =>
      csv.columns.find((c) => cands.some((k) => norm(c) === norm(k)));
    const findLoose = (needle) =>
      csv.columns.find((c) => norm(c).includes(norm(needle)));

    // Key by Sector code explicitly; avoid matching Category Code by mistake
    const keyCol =
      findExact(["Sector code"]) ||
      findExact(["Embedded_Sector_Code", "Embedded Sector Code"]) ||
      findLoose("sector code") || csv.columns[0];
    const sectorNameCol = findExact(["Sector name"]) || findLoose("sector name") || null;
    const commodityNameCol = findExact(["Commodity name"]) || findLoose("commodity name") || null;
    const categoryNameCol = findExact(["Category Name"]) || findLoose("category name") || null;
    const subcatCodeCol = findExact(["Subcategory Code"]) || findLoose("subcategory code") || null;
    const subcatNameCol = findExact(["Subcategory Name"]) || findLoose("subcategory name") || null;

      const map = new Map();
      for (const row of csv) {
        const code = row[keyCol];
        if (!code) continue;
        map.set(code, {
          sector_name: sectorNameCol ? row[sectorNameCol] : undefined,
          commodity_name: commodityNameCol ? row[commodityNameCol] : undefined,
          category_name: categoryNameCol ? row[categoryNameCol] : undefined,
          subcategory_code: subcatCodeCol ? row[subcatCodeCol] : undefined,
          subcategory_name: subcatNameCol ? row[subcatNameCol] : undefined,
        });
      }

      console.log(`Loaded sector classification from: ${url} (rows: ${map.size})`);
      return { map };
    } catch (e) {
      lastErr = e;
      continue;
    }
  }
  console.warn("Classification CSV not found via any candidate URL; defaulting to sector codes.", lastErr);
  return { map: new Map() };
}

function getColumnsMap(columns) {
  // Map likely column names robustly
  const find = (needle) =>
    columns.find((c) => c.toLowerCase().includes(needle.toLowerCase()));
  return {
    commodity: find("Disaggregated_Commodity") || find("Commodity"),
    sectorCode: find("Embedded_Sector_Code") || find("Sector_Code"),
    scope: find("Scope"),
    tier: find("Tier"),
    rel: find("Relative_Contribution") || find("Relative") || find("Share"),
    abs: columns.find((c) => c.startsWith("Absolute contribution")) || null,
  };
}

function normalizeTier(val){
  if (!val) return val;
  const v = String(val).toLowerCase();
  if (v.includes("tier 1")) return "Economic tier 1";
  if (v.includes("tier 2")) return "Economic tier 2";
  if (v.includes("tier 3")) return "Economic tier 3+";
  if (v.includes("3+")) return "Economic tier 3+";
  // Fallback: return the original value
  return val;
}

function buildHierarchy(rows, cols, sectorLookup, secondRingField) {
  // Helper: choose second-ring grouping label from code and lookup
  const getGroup = (code) => {
    const rec = sectorLookup.get(code) || {};
    if (secondRingField === "code" || !rec[secondRingField]) return code;
    return rec[secondRingField];
  };

  // Aggregate: Tier -> SectorGroup -> Scope
  const byKey = d3.rollup(
    rows,
    (v) => d3.sum(v, (d) => +d[cols.rel]),
    (d) => normalizeTier(d[cols.tier]),
    (d) => getGroup(d[cols.sectorCode]),
    (d) => d[cols.scope]
  );

  function children(map) {
    return Array.from(map, ([name, value]) =>
      value instanceof Map
        ? { name, children: children(value) }
        : { name, value }
    );
  }

  // Build tree with requested order
  let root = { name: "Scope 3", children: children(byKey) };
  return root;
}

function renderSunburst(rootData, centerLabel, minShare) {
  const color = d3.scaleOrdinal()
    .domain(["Economic tier 1", "Economic tier 2", "Economic tier 3+"])
    .range(["#0099CC", "#9C27B0", "#20576E"]);

  // compute container size (width-driven) and scale down
  const container = document.getElementById("chart");
  const maxW = Math.min(900, (container.clientWidth || 700));
  const size = Math.max(315, Math.floor(maxW * CHART_SCALE));
  WIDTH = size;
  RADIUS = size / 2;

  const partition = d3.partition().size([2 * Math.PI, RADIUS]);

  const root = d3.hierarchy(rootData)
    .sum((d) => d.value || 0)
    .sort((a, b) => {
      // sort only among siblings
      if (a.parent && b.parent && a.parent === b.parent) {
        // Depth 1 (Tier ring): fixed order Economic tier 1, 2, 3+
        if (a.depth === 1) {
          const order = new Map([["Economic tier 1",0],["Economic tier 2",1],["Economic tier 3+",2]]);
          return d3.ascending(order.get(a.data.name) ?? 99, order.get(b.data.name) ?? 99);
        }
        // Depth 2 (second ring): by descending contribution
        if (a.depth === 2) {
          return d3.descending(a.value || 0, b.value || 0);
        }
        // Depth 3 (scope ring): Scope 1 first, then Scope 2
        if (a.depth === 3) {
          const order = new Map([["Scope 1",0],["Scope 2",1],["Scope 3",2]]);
          return d3.ascending(order.get(a.data.name) ?? 99, order.get(b.data.name) ?? 99);
        }
      }
      return 0;
    });

  partition(root);

  d3.select("#chart").selectAll("svg").remove();

  const svg = d3
    .select("#chart")
    .append("svg")
    .attr("viewBox", [0, 0, WIDTH, WIDTH])
    .style("width", WIDTH + "px")
    .style("height", WIDTH + "px");

  const g = svg.append("g").attr("transform", `translate(${RADIUS},${RADIUS})`);

  const arc = d3
    .arc()
    .startAngle((d) => d.x0)
    .endAngle((d) => d.x1)
  .padAngle(1 / RADIUS)
  .padRadius(RADIUS / 3)
    .innerRadius((d) => d.y0)
    .outerRadius((d) => d.y1 - 1);

  const total = root.value || 1;

  const isVisible = (d) => {
    if (d.depth <= 1) return true; // always show center and tier rings
    const share = (d.value || 0) / total;
    return share >= (minShare || 0);
  };

  const path = g
    .append("g")
    .selectAll("path")
    .data(root.descendants().filter((d) => d.depth))
    .join("path")
    .attr("display", (d) => (d.depth && isVisible(d) ? null : "none"))
    .attr("d", arc)
    .attr("fill", (d) => {
      // Color by top-level Tier ancestor
      let cur = d;
      while (cur.depth > 1) cur = cur.parent;
      const tier = cur.data.name;
      return color(tier) || "#93c5fd";
    })
    .attr("fill-opacity", 0.9)
    .on("mousemove", (event, d) => {
      const seq = d.ancestors().map((n) => n.data.name).reverse().slice(1);
      tooltip
        .style("opacity", 1)
        .html(
          `<strong>${seq.join(" ▸ ")}</strong><br/>Value: ${formatPct(
            (d.value || 0)
          )}`
        )
        .style("left", event.pageX + 10 + "px")
        .style("top", event.pageY + 10 + "px");
    })
    .on("mouseleave", () => tooltip.style("opacity", 0));

  // White center disc to prevent label overlap with the first ring
  const firstRing = root.descendants().find((d) => d.depth === 1);
  const innerR = firstRing ? firstRing.y0 : RADIUS * 0.33;
  const panelColor = getComputedStyle(document.documentElement)
    .getPropertyValue('--panel') || '#111111';
  g.append("circle").attr("r", innerR - 1).attr("fill", panelColor.trim());
  // No center label; figure title is displayed above the chart

  // No arc labels (per request)
}

async function init() {
  const classData = await tryLoadClassification();
  const allRows = await loadCSV();
  const cols = getColumnsMap(allRows.columns);

  const toName = (code) => {
    const rec = classData.map.get(code);
    return (rec && rec.commodity_name) ? rec.commodity_name : code;
  };

  const uniqueCodes = Array.from(new Set(allRows.map((d) => d[cols.commodity])));
  let commodities = uniqueCodes.map((code) => ({ code, name: toName(code) }));
  commodities.sort((a, b) => d3.ascending(a.name, b.name));
  const allCommodities = commodities.slice();

  const select = document.getElementById("commoditySelect");
  const search = document.getElementById("commoditySearch");
  function populateSelect(items, keepValue) {
    const prev = keepValue || select.value;
    while (select.firstChild) select.removeChild(select.firstChild);
    for (const c of items) {
      const opt = document.createElement("option");
      opt.value = c.code;
      opt.textContent = c.name; // display names only per request
      opt.dataset.code = c.code;
      opt.dataset.name = c.name;
      select.appendChild(opt);
    }
    // Try to keep previous value if still present
    if (prev && items.some(it => it.code === prev)) {
      select.value = prev;
    } else if (items.length > 0) {
      select.selectedIndex = 0;
    }
  }

  populateSelect(allCommodities);

  // Fuzzy search across name and code; prefers code exact/startsWith, then name
  const norm = (s) => (s || "").toLowerCase();
  const isSubsequence = (q, s) => {
    let i = 0;
    for (let c of s) if (c === q[i]) i++;
    return i === q.length;
  };
  const scoreMatch = (q, name, code) => {
    if (!q) return 0;
    // exact code match highest
    if (code === q) return 100;
    // code startswith
    if (code.startsWith(q)) return 90;
    // name startswith token
    if (name.startsWith(q)) return 80;
    // substring matches
    let sc = 0;
    if (code.includes(q)) sc = Math.max(sc, 75);
    if (name.includes(q)) sc = Math.max(sc, 70);
    // tokenized contains (all tokens present somewhere)
    const tokens = q.split(/\s+/).filter(Boolean);
    if (tokens.length > 1) {
      const allIn = tokens.every(t => name.includes(t) || code.includes(t));
      if (allIn) sc = Math.max(sc, 65);
    }
    // subsequence (e.g., acm -> Agricultural Chemical Manufacturing)
    if (isSubsequence(q, name.replace(/\s+/g, ''))) sc = Math.max(sc, 55);
    return sc;
  };

  // Debounce redraw to avoid excessive renders while typing
  let searchTimer = null;
  const triggerRedraw = () => {
    if (searchTimer) clearTimeout(searchTimer);
    searchTimer = setTimeout(() => select.dispatchEvent(new Event('change')), 120);
  };

  if (search) {
    search.addEventListener('input', (e) => {
      const qRaw = (e.target.value || '').trim();
      const q = norm(qRaw);
      if (!q) {
        // Reset to full list when query is empty, keep current selection if possible
        populateSelect(allCommodities, /*keepValue*/select.value);
        triggerRedraw();
        return;
      }

      // STRICT filter: only include commodities where name or code contains the query substring
      const contains = (c) => {
        const nameL = norm(c.name);
        const codeL = norm(c.code);
        return nameL.includes(q) || codeL.includes(q);
      };
      const filtered = allCommodities.filter(contains);

      // Order: code startsWith > name startsWith > name contains > code contains, then name ASC
      const rank = (c) => {
        const nameL = norm(c.name);
        const codeL = norm(c.code);
        if (codeL.startsWith(q)) return 0;
        if (nameL.startsWith(q)) return 1;
        if (nameL.includes(q)) return 2;
        if (codeL.includes(q)) return 3;
        return 4;
      };

      filtered.sort((a, b) => {
        const ra = rank(a), rb = rank(b);
        if (ra !== rb) return ra - rb;
        return d3.ascending(a.name, b.name);
      });

      populateSelect(filtered);
      triggerRedraw();
    });

    search.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        search.value = '';
        search.dispatchEvent(new Event('input'));
        select.focus();
      }
      if (e.key === 'Enter') {
        select.focus();
      }
    });
  }

  const secondSel = document.getElementById("secondRingField");
  // Disable non-code options if classification missing
  if (!classData.map || classData.map.size === 0) {
    for (const opt of Array.from(secondSel.options)) {
      if (opt.value !== "code") opt.disabled = true;
    }
    secondSel.value = "code";
  }

  function redraw() {
    const chosen = select.value;
    setLoading(true);
    const rows = allRows.filter((d) => d[cols.commodity] === chosen);
    const second = secondSel.value;

    // Update figure title
    const secondLabel = secondSel.options[secondSel.selectedIndex].textContent;
    const title = `${toName(chosen)} disaggregated by Economic tier, ${secondLabel}, and Scope (% of total supply chain emissions without margins)`;
    const titleEl = document.getElementById("figureTitle");
    if (titleEl) titleEl.textContent = title;

    // Render legend
    renderLegend();

    const tree = buildHierarchy(rows, cols, classData.map, second);
    const label = `Disaggregated ${toName(chosen)} emissions`;
    const minPct = Math.max(0, (+document.getElementById("minPct").value || 0) / 100);
    renderSunburst(tree, label, minPct);
    setLoading(false);
  }

  document.getElementById("redrawBtn").addEventListener("click", redraw);
  select.addEventListener("change", redraw);
  secondSel.addEventListener("change", redraw);
  document.getElementById("minPct").addEventListener("change", redraw);

  // Initial render with first commodity and prefer names when available
  select.selectedIndex = 0;
  redraw();

  // Optional: simple redraw on resize so width-driven size updates
  let resizeTimer = null;
  window.addEventListener('resize', () => {
    if (resizeTimer) clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => redraw(), 150);
  });

  
}

init().catch((err) => {
  console.error(err);
  d3.select("#chart").append("p").text("Failed to load or render the chart.");
});

function renderLegend(){
  const container = d3.select('#legend');
  if (container.empty()) return;
  container.selectAll('*').remove();
  const items = [
    {label:'Economic tier 1', color:'#0099CC'},
    {label:'Economic tier 2', color:'#9C27B0'},
    {label:'Economic tier 3+', color:'#20576E'},
  ];
  const sel = container.selectAll('div.item').data(items).join('div').attr('class','item');
  sel.append('span').attr('class','swatch').style('background-color', d=>d.color);
  sel.append('span').text(d=>d.label);
}

function setLoading(isLoading){
  const chart = d3.select('#chart');
  let el = chart.select('.loading');
  if (isLoading){
    if (el.empty()){
      el = chart.append('div').attr('class','loading').text('Loading…');
    }
  } else {
    el.remove();
  }
}
