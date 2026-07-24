export function initMetricsStream() {
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const socket = new WebSocket(`${protocol}//${location.host}/ws/metrics`);

  const cpuBar = document.getElementById('cpu-bar-fill');
  const cpuVal = document.getElementById('cpu-val');

  const ramBar = document.getElementById('ram-bar-fill');
  const ramVal = document.getElementById('ram-val');

  const gpuBar = document.getElementById('gpu-bar-fill');
  const gpuVal = document.getElementById('gpu-val');

  socket.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);

      // CPU Metric
      if (cpuBar && cpuVal) {
        cpuBar.style.width = `${Math.min(100, Math.max(0, data.cpu))}%`;
        cpuVal.textContent = `${data.cpu}%`;
      }

      // RAM Metric
      if (ramBar && ramVal) {
        ramBar.style.width = `${Math.min(100, Math.max(0, data.ram_pct))}%`;
        ramVal.textContent = `${data.ram_used_gb}/${data.ram_total_gb} GB (${data.ram_pct}%)`;
      }

      // GPU Metric
      if (gpuBar && gpuVal) {
        if (data.has_gpu) {
          gpuBar.style.width = `${Math.min(100, Math.max(0, data.gpu_pct))}%`;
          gpuVal.textContent = `${data.gpu_used_gb}/${data.gpu_total_gb} GB (${data.gpu_pct}%)`;
        } else {
          gpuBar.style.width = `0%`;
          gpuVal.textContent = `N/A`;
        }
      }
    } catch (e) {
      console.error("Metrics stream error:", e);
    }
  };

  socket.onclose = () => {
    setTimeout(initMetricsStream, 1000);
  };
}