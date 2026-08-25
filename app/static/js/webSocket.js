(function attachTelemetryClient() {
  function writeTelemetry(payload) {
    const node = document.querySelector("[data-telemetry]");
    if (!node) return;
    node.textContent = JSON.stringify(payload, null, 2);

    const status = document.querySelector("[data-live-status]");
    const dot = document.querySelector("[data-live-dot]");
    if (status) status.textContent = payload.service?.state || "unknown";
    if (dot) {
      dot.classList.remove("online", "error");
      dot.classList.add(payload.service?.state === "online" ? "online" : "error");
    }
  }

  async function pollTelemetry() {
    const response = await fetch("/api/telemetry", { cache: "no-store" });
    if (!response.ok) throw new Error("telemetry request failed");
    const payload = await response.json();
    writeTelemetry(payload.telemetry);
  }

  function start() {
    if ("EventSource" in window) {
      const source = new EventSource("/api/telemetry/stream");
      source.addEventListener("telemetry", (event) => {
        writeTelemetry(JSON.parse(event.data));
      });
      source.onerror = () => {
        source.close();
        pollTelemetry().catch(() => undefined);
        window.setInterval(() => pollTelemetry().catch(() => undefined), 5000);
      };
      return source;
    }

    pollTelemetry().catch(() => undefined);
    window.setInterval(() => pollTelemetry().catch(() => undefined), 5000);
    return null;
  }

  window.TelemetryClient = { start };
})();
