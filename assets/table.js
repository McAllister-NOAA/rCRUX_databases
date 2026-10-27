/* Maintain all individual database records in data/records.csv.
   Required CSV columns: assay_name, nt_database_date, doi.
   Other columns are retained and shown in the assay's detail table. */
(() => {
  const searchInput = document.getElementById("globalSearch");
  const resultCount = document.getElementById("resultCount");
  const dataStatus = document.getElementById("dataStatus");
  const clearButton = document.getElementById("clearFilters");
  const downloadButton = document.getElementById("downloadCsv");
  const backButton = document.getElementById("backButton");
  const viewTitle = document.getElementById("viewTitle");
  const viewDescription = document.getElementById("viewDescription");
  const tableTip = document.getElementById("tableTip");
  const repoLink = document.getElementById("repoLink");

  // Set this to your actual GitHub repository URL.
  const REPOSITORY_URL = "https://github.com/";
  repoLink.href = REPOSITORY_URL;

  let allRows = [];
  let summaryRows = [];
  let table = null;
  let currentAssay = null;
  let currentMode = "summary";
  let columnsByField = [];

  const clean = value => String(value ?? "").trim();
  const norm = value => clean(value).toLocaleLowerCase();

  function dateValue(value) {
    const raw = clean(value);
    if (!raw) return Number.NEGATIVE_INFINITY;
    const parsed = Date.parse(raw);
    // ISO-like dates are recommended in the CSV (YYYY-MM-DD).
    return Number.isNaN(parsed) ? Number.NEGATIVE_INFINITY : parsed;
  }

  function doiUrl(value) {
    const doi = clean(value);
    if (!doi) return "";
    if (/^https?:\/\//i.test(doi)) return doi;
    return "https://doi.org/" + doi.replace(/^doi:\s*/i, "").replace(/^\/+/, "");
  }

  function doiFormatter(cell) {
    const value = clean(cell.getValue());
    if (!value) return "—";
    const url = doiUrl(value);
    const label = value.replace(/^https?:\/\/(dx\.)?doi\.org\//i, "").replace(/^doi:\s*/i, "");
    return `<a class="doi-link" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(label)} ↗</a>`;
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, ch => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[ch]));
  }

  function getLatestRecord(records) {
    return records.slice().sort((a, b) => dateValue(b.nt_database_date) - dateValue(a.nt_database_date))[0];
  }

  function makeSummary(rows) {
    const groups = new Map();
    rows.forEach(row => {
      const assay = clean(row.assay_name);
      if (!assay) return;
      if (!groups.has(assay)) groups.set(assay, []);
      groups.get(assay).push(row);
    });

    return Array.from(groups.entries()).map(([assay_name, records]) => {
      const latest = getLatestRecord(records);
      const distinctDates = new Set(records.map(r => clean(r.nt_database_date)).filter(Boolean));
      return {
        assay_name,
        available_dates: distinctDates.size,
        latest_nt_database_date: clean(latest?.nt_database_date),
        latest_doi: clean(latest?.doi),
        _records: records
      };
    }).sort((a, b) => a.assay_name.localeCompare(b.assay_name, undefined, {numeric: true, sensitivity: "base"}));
  }

  function releaseCountFormatter(cell) {
    const row = cell.getRow().getData();
    const count = Number(row.available_dates) || 0;
    return `<button class="count-link" type="button" data-assay="${escapeHtml(row.assay_name)}" aria-label="Show ${count} available dates for ${escapeHtml(row.assay_name)}">${count} <span aria-hidden="true">↗</span></button>`;
  }

  function makeColumns(fields, mode) {
    if (mode === "summary") {
      return [
        { title: "Assay name", field: "assay_name", frozen: true, minWidth: 220, width: 280, headerFilter: "input", headerFilterPlaceholder: "Filter…", headerFilterFunc: "like" },
        { title: "Available dates", field: "available_dates", hozAlign: "center", width: 155, sorter: "number", formatter: releaseCountFormatter, headerSort: true },
        { title: "Most recent database date", field: "latest_nt_database_date", minWidth: 210, headerFilter: "input", headerFilterPlaceholder: "Filter…", headerFilterFunc: "like" },
        { title: "Latest DOI", field: "latest_doi", minWidth: 220, formatter: doiFormatter, headerFilter: "input", headerFilterPlaceholder: "Filter DOI…", headerFilterFunc: "like" }
      ];
    }

    return fields.map((field, index) => {
      const col = {
        title: field,
        field,
        minWidth: index === 0 ? 190 : 145,
        width: index === 0 ? 220 : undefined,
        frozen: index === 0,
        headerFilter: "input",
        headerFilterPlaceholder: "Filter…",
        headerFilterFunc: "like",
        headerSort: true,
        sorter: field === "nt_database_date" ? "string" : "string",
        tooltip: true,
        formatter: cell => {
          const value = clean(cell.getValue());
          if (!value) return "—";
          if (field.toLowerCase() === "doi") {
            const el = document.createElement("span");
            el.innerHTML = doiFormatter(cell);
            return el.innerHTML;
          }
          if (/url|link/i.test(field) && /^https?:\/\//i.test(value)) {
            return `<a class="doi-link" href="${escapeHtml(value)}" target="_blank" rel="noopener noreferrer">${escapeHtml(value)} ↗</a>`;
          }
          return escapeHtml(value);
        }
      };
      return col;
    });
  }

  function updateCount() {
    if (!table) return;
    const shown = table.getData("active").length;
    const total = currentMode === "summary" ? summaryRows.length : allRows.filter(r => clean(r.assay_name) === currentAssay).length;
    resultCount.textContent = `${shown.toLocaleString()} of ${total.toLocaleString()} ${currentMode === "summary" ? "assays" : "database records"}`;
  }

  function applyGlobalSearch() {
    if (!table) return;
    const query = norm(searchInput.value);
    if (!query) {
      table.clearFilter(false);
      updateCount();
      return;
    }
    // Named filter is used so clearing global search doesn't remove header filters.
    table.setFilter((row) => {
      const searchable = currentMode === "summary"
        ? [row.assay_name, row.available_dates, row.latest_nt_database_date, row.latest_doi]
        : Object.values(row);
      return searchable.some(value => norm(value).includes(query));
    });
    updateCount();
  }

  function buildTable(mode, rows) {
    currentMode = mode;
    if (table) {
      table.destroy();
      table = null;
    }
    document.getElementById("table").innerHTML = "";
    const fields = mode === "summary"
      ? ["assay_name", "available_dates", "latest_nt_database_date", "latest_doi"]
      : (Papa.parse(document.__csvText, {header: true, preview: 1}).meta.fields || []);

    table = new Tabulator("#table", {
      data: rows,
      columns: makeColumns(fields, mode),
      layout: "fitDataStretch",
      responsiveLayout: false,
      movableColumns: true,
      resizableColumnFit: true,
      height: "min(68vh, 760px)",
      placeholder: "No records match the current filters.",
      pagination: true,
      paginationSize: 25,
      paginationSizeSelector: [10, 25, 50, 100],
      paginationCounter: "rows",
      columnDefaults: { vertAlign: "middle" },
      initialSort: mode === "summary"
        ? [{column: "assay_name", dir: "asc"}]
        : [{column: "nt_database_date", dir: "desc"}],
      tableBuilt: () => {
        dataStatus.textContent = `${fields.length} columns · CSV source`;
        updateCount();
        if (searchInput.value.trim()) applyGlobalSearch();
      },
      dataFiltered: updateCount
    });

    // Delegate clicks because the count buttons are created by a formatter.
    document.getElementById("table").onclick = event => {
      const button = event.target.closest("button[data-assay]");
      if (button) showAssay(button.getAttribute("data-assay"));
    };
  }

  function showSummary() {
    currentAssay = null;
    currentMode = "summary";
    searchInput.value = "";
    backButton.hidden = true;
    viewTitle.textContent = "Available assays";
    viewDescription.textContent = "Each row represents an assay. Select a release count to inspect all database records for that assay.";
    tableTip.textContent = "The count is the number of distinct non-empty nt_database_date values for the assay.";
    buildTable("summary", summaryRows);
  }

  function showAssay(assay) {
    currentAssay = assay;
    searchInput.value = "";
    backButton.hidden = false;
    viewTitle.textContent = assay;
    viewDescription.textContent = "All database records associated with this assay_name. Use the filters to narrow the records.";
    tableTip.textContent = "Use “All assays” to return to the summary table.";
    const rows = allRows.filter(row => clean(row.assay_name) === assay);
    buildTable("detail", rows);
  }

  fetch("data/records.csv")
    .then(response => {
      if (!response.ok) throw new Error(`Could not load data/records.csv (${response.status})`);
      return response.text();
    })
    .then(csvText => {
      document.__csvText = csvText;
      const parsed = Papa.parse(csvText, {
        header: true,
        skipEmptyLines: "greedy",
        transformHeader: header => header.trim(),
        transform: value => value.trim()
      });
      if (parsed.errors.length) console.warn("CSV parsing warnings:", parsed.errors);
      const fields = (parsed.meta.fields || []).filter(Boolean);
      const required = ["assay_name", "nt_database_date", "doi"];
      const missing = required.filter(field => !fields.includes(field));
      if (missing.length) throw new Error("CSV is missing required column(s): " + missing.join(", "));

      allRows = parsed.data.filter(row => Object.values(row).some(value => clean(value) !== ""));
      summaryRows = makeSummary(allRows);
      dataStatus.textContent = `${allRows.length.toLocaleString()} database records loaded`;
      showSummary();

      searchInput.addEventListener("input", applyGlobalSearch);
      clearButton.addEventListener("click", () => {
        searchInput.value = "";
        if (table) {
          table.clearFilter(true);
          table.clearSort();
          if (currentMode === "summary") table.setSort([{column: "assay_name", dir: "asc"}]);
          else table.setSort([{column: "nt_database_date", dir: "desc"}]);
          table.getColumns().forEach(column => column.clearHeaderFilter());
          updateCount();
        }
      });
      downloadButton.addEventListener("click", () => {
        if (table) table.download("csv", currentMode === "summary" ? "assay-summary.csv" : "assay-database-records.csv");
      });
      backButton.addEventListener("click", showSummary);
    })
    .catch(error => {
      console.error(error);
      dataStatus.textContent = "Could not load data";
      document.getElementById("table").innerHTML =
        `<div style="padding:24px;color:#9b2c2c">Unable to load the table data. ${escapeHtml(error.message)} Check that <code>data/records.csv</code> exists and that the site is served over HTTP (for example, with GitHub Pages).</div>`;
      resultCount.textContent = "0 records";
    });

  document.addEventListener("keydown", event => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
      event.preventDefault();
      searchInput.focus();
    }
    if (event.key === "Escape" && document.activeElement === searchInput) {
      searchInput.value = "";
      applyGlobalSearch();
    }
  });
})();
