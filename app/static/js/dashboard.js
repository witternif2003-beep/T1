(function attachDashboard() {
  const state = {
    report: null,
    health: null,
    loading: false,
  };

  function formatNumber(value) {
    return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(value || 0);
  }

  function setText(selector, value) {
    const node = document.querySelector(selector);
    if (node) node.textContent = value;
  }

  function renderStats(report) {
    const summary = report?.summary || {};
    setText("[data-stat-entities]", formatNumber(summary.verified_entities));
    setText("[data-stat-patterns]", formatNumber(summary.patterns_loaded));
    setText("[data-stat-p1]", formatNumber(summary.priorities?.P1));
    setText("[data-stat-highest]", formatNumber(summary.highest_score));
  }

  function renderNotice(report) {
    const notice = document.querySelector("[data-notice]");
    if (!notice) return;
    if (report?.notice) {
      notice.hidden = false;
      notice.textContent = report.notice;
      return;
    }
    notice.hidden = true;
    notice.textContent = "";
  }

  function renderFindings(report) {
    const container = document.querySelector("[data-findings]");
    if (!container) return;
    container.innerHTML = "";

    const findings = report?.findings || [];
    if (!findings.length) {
      container.innerHTML = '<div class="notice">No anomaly findings are available because no verified entity records are loaded.</div>';
      return;
    }

    const fragment = document.createDocumentFragment();
    findings.forEach((finding) => {
      const card = document.createElement("article");
      card.className = "finding";

      const entity = finding.entity || {};
      const hitMarkup = (finding.pattern_hits || [])
        .slice(0, 6)
        .map((hit) => `<span class="hit">${escapeHtml(hit.name)}: ${formatNumber(hit.value)}</span>`)
        .join("");
      const vectorMarkup = (finding.forensic_vectors || [])
        .slice(0, 6)
        .map((hit) => `<span class="hit">${escapeHtml(hit.vector_id)} ${escapeHtml(hit.name)}</span>`)
        .join("");

      card.innerHTML = `
        <div class="finding-head">
          <div>
            <h3>${escapeHtml(entity.name || entity.id || "Unknown entity")}</h3>
            <div class="meta">
              ${escapeHtml(entity.category || "uncategorized")} /
              ${escapeHtml(entity.source?.name || "unknown source")} /
              observed ${escapeHtml(entity.observed_at || "unknown")}
            </div>
          </div>
          <div>
            <div class="score">${formatNumber(finding.score)}</div>
            <span class="priority ${escapeHtml(finding.priority)}">${escapeHtml(finding.priority)}</span>
          </div>
        </div>
        <div class="meta">
          Confidence ${formatNumber((finding.confidence || 0) * 100)}% /
          Integrity ${escapeHtml(finding.forensics?.integrity || "unknown")} /
          Risk ${escapeHtml(finding.forensics?.risk_band || "unknown")} /
          Custody ${escapeHtml((finding.chain_of_custody_hash || "").slice(0, 12))}
        </div>
        <div class="hits">${hitMarkup || '<span class="hit">No active metric pattern hits</span>'}</div>
        <div class="hits">${vectorMarkup || '<span class="hit">No forensic vector hits</span>'}</div>
      `;
      fragment.appendChild(card);
    });
    container.appendChild(fragment);
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  async function fetchJson(path) {
    const response = await fetch(path, { cache: "no-store" });
    const payload = await response.json();
    if (!response.ok || payload.ok === false) {
      throw new Error(payload.error || `request failed: ${path}`);
    }
    return payload;
  }

  async function refresh() {
    if (state.loading) return;
    state.loading = true;
    setText("[data-refresh-state]", "Refreshing");

    try {
      const [health, scan] = await Promise.all([
        fetchJson("/api/health"),
        fetchJson("/api/scan"),
      ]);
      state.health = health;
      state.report = scan;
      renderStats(scan);
      renderNotice(scan);
      renderFindings(scan);
      setText("[data-refresh-state]", "Current");
      setText("[data-last-update]", scan.generated_at || health.timestamp);
    } catch (error) {
      setText("[data-refresh-state]", "Error");
      const notice = document.querySelector("[data-notice]");
      if (notice) {
        notice.hidden = false;
        notice.textContent = error.message;
      }
    } finally {
      state.loading = false;
    }
  }

  function bindActions() {
    const refreshButton = document.querySelector("[data-action-refresh]");
    if (refreshButton) refreshButton.addEventListener("click", refresh);

    const reportButton = document.querySelector("[data-action-report]");
    if (reportButton) {
      reportButton.addEventListener("click", async () => {
        const payload = await fetchJson("/api/reports/latest");
        const reportNode = document.querySelector("[data-report]");
        if (reportNode) reportNode.textContent = JSON.stringify(payload.report, null, 2);
      });
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    bindActions();
    refresh();
    if (window.TelemetryClient) window.TelemetryClient.start();
  });
})();
