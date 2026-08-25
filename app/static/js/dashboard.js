(function attachDashboard() {
  const state = {
    report: null,
    health: null,
    loading: false,
    liveEvents: [],
  };

  function formatNumber(value) {
    return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(value || 0);
  }

  function setText(selector, value) {
    const node = document.querySelector(selector);
    if (node) node.textContent = value;
  }

  function renderStats(report, statisticsPayload) {
    const summary = report?.summary || {};
    const statistics = statisticsPayload?.statistics || statisticsPayload || {};
    setText("[data-stat-entities]", formatNumber(summary.verified_entities));
    setText("[data-stat-patterns]", formatNumber(summary.patterns_loaded));
    setText("[data-stat-p1]", formatNumber(summary.priorities?.P1));
    setText("[data-stat-highest]", formatNumber(summary.highest_score));
    setText("[data-stat-anomalies]", formatNumber(statistics.total_anomalies));
    setText("[data-stat-alerts]", formatNumber(statistics.active_alerts));
    setText("[data-stat-avg]", `${formatNumber(statistics.avg_severity)}%`);
    setText("[data-stat-top]", statistics.top_entity || "none");
    setText("#timestamp", statistics.timestamp || report?.generated_at || "pending");
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
      renderChart([]);
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
          SAR ${formatNumber(finding.forensics?.sar_screen?.weighted_score || finding.score)} /
          Custody ${escapeHtml((finding.chain_of_custody_hash || "").slice(0, 12))}
        </div>
        <div class="meta">
          References: ${escapeHtml((finding.forensics?.legal_reference_hints || []).join(", ") || "none")}
        </div>
        <div class="hits">${hitMarkup || '<span class="hit">No active metric pattern hits</span>'}</div>
        <div class="hits">${vectorMarkup || '<span class="hit">No forensic vector hits</span>'}</div>
      `;
      fragment.appendChild(card);
    });
    container.appendChild(fragment);
    renderChart(state.liveEvents.length ? state.liveEvents : findings);
  }

  function renderChart(items) {
    const canvas = document.querySelector("#anomalyChart");
    if (!canvas) return;

    const context = canvas.getContext("2d");
    const width = canvas.width;
    const height = canvas.height;
    context.clearRect(0, 0, width, height);
    context.fillStyle = "rgba(255, 255, 255, 0.04)";
    context.fillRect(0, 0, width, height);

    const chartItems = (items || []).slice(0, 8);
    if (!chartItems.length) {
      context.fillStyle = "#94a3b8";
      context.font = "18px sans-serif";
      context.fillText("No verified anomaly data loaded", 24, 48);
      return;
    }

    const padding = 36;
    const barGap = 14;
    const barWidth = (width - padding * 2 - barGap * (chartItems.length - 1)) / chartItems.length;
    context.font = "13px sans-serif";

    chartItems.forEach((item, index) => {
      const score = Math.max(0, Math.min(100, Number(item.score ?? item.severity) || 0));
      const barHeight = ((height - 88) * score) / 100;
      const x = padding + index * (barWidth + barGap);
      const y = height - padding - barHeight;
      const gradient = context.createLinearGradient(0, y, 0, height - padding);
      gradient.addColorStop(0, "#00d9ff");
      gradient.addColorStop(1, "#21e6a8");
      context.fillStyle = gradient;
      context.fillRect(x, y, barWidth, barHeight);
      context.fillStyle = "#edf4ff";
      context.fillText(String(Math.round(score)), x, y - 8);
      context.fillStyle = "#94a3b8";
      const label = item.entity?.name || item.entity_name || item.entity?.id || item.id || "entity";
      context.fillText(label.slice(0, 14), x, height - 12);
    });
  }

  function addAnomalyToFeed(anomaly) {
    const container = document.querySelector("#anomalyList");
    if (!container || !anomaly) return;

    const item = document.createElement("article");
    item.className = "anomaly-item";
    const severity = Number(anomaly.severity) || 0;
    const severityClass = severity >= 80 ? "critical" : severity >= 60 ? "elevated" : "watch";
    const flags = (anomaly.forensic_flags || [])
      .slice(0, 8)
      .map((flag) => `<span class="flag">${escapeHtml(flag)}</span>`)
      .join("");
    const coordinate = anomaly.coordinates?.[0];

    item.innerHTML = `
      <div class="anomaly-header">
        <span class="anomaly-id">${escapeHtml(anomaly.id || "unknown")}</span>
        <span class="anomaly-type">${escapeHtml(String(anomaly.type || "verified").toUpperCase())}</span>
        <span class="anomaly-severity ${severityClass}">${formatNumber(severity)}%</span>
      </div>
      <div class="anomaly-details">
        <div>Entity: ${escapeHtml(anomaly.entity_name || anomaly.entity_id || "unknown")}</div>
        <div>Location: ${escapeHtml(coordinate ? `${coordinate.lat}, ${coordinate.lon}` : "none")}</div>
        <div>Custody: ${escapeHtml((anomaly.chain_of_custody_hash || "").slice(0, 12))}</div>
        <div class="forensic-flags">${flags || '<span class="flag">no flags</span>'}</div>
      </div>
      <div class="anomaly-timestamp">${escapeHtml(new Date(anomaly.timestamp).toLocaleString())}</div>
    `;

    container.prepend(item);
    while (container.children.length > 50) {
      container.removeChild(container.lastChild);
    }
  }

  function updateChart(anomaly) {
    if (!anomaly) return;
    state.liveEvents.unshift(anomaly);
    state.liveEvents = state.liveEvents.slice(0, 20);
    renderChart(state.liveEvents);
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
      const [health, scan, statistics] = await Promise.all([
        fetchJson("/api/health"),
        fetchJson("/api/scan"),
        fetchJson("/api/statistics"),
      ]);
      state.health = health;
      state.report = scan;
      renderStats(scan, statistics);
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

  function connectAnomalyStream() {
    if (!("EventSource" in window)) return;
    const source = new EventSource("/api/anomalies/stream");
    source.onopen = () => {
      setText("#connectionStatus", "connected");
    };
    source.addEventListener("new_anomaly", (event) => {
      const anomaly = JSON.parse(event.data);
      addAnomalyToFeed(anomaly);
      updateChart(anomaly);
    });
    source.addEventListener("statistics", (event) => {
      renderStats(state.report, JSON.parse(event.data));
    });
    source.onerror = () => {
      setText("#connectionStatus", "reconnecting");
    };
  }

  document.addEventListener("DOMContentLoaded", () => {
    bindActions();
    refresh();
    connectAnomalyStream();
    if (window.TelemetryClient) window.TelemetryClient.start();
  });
})();
