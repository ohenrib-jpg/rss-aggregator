
document.addEventListener('DOMContentLoaded', async () => {
  const canvasId = 'metrics-chart';
  let canvas = document.getElementById(canvasId);
  if (!canvas) {
    const main = document.querySelector('main') || document.body;
    canvas = document.createElement('canvas');
    canvas.id = canvasId;
    canvas.style.maxWidth = '600px';
    main.appendChild(canvas);
  }
  try {
    const res = await fetch('/api/metrics');
    if (!res.ok) throw new Error('No metrics');
    const data = await res.json();
    const labels = data.labels || (data.map? data.map(d=>d.label): []);
    const series = data.series || (data.map? data.map(d=>d.value): []);
    if (window.Chart) {
      const ct = new Chart(canvas.getContext('2d'), {
        type: 'line',
        data: { labels: labels, datasets: [{ label: 'Metrics', data: series }] },
        options: { plugins: { zoom: { zoom: { wheel: { enabled: true }, pinch: { enabled: true }, mode: 'x' }, pan: { enabled: true, mode:'x' } } } }
      });
      // add reset button
      const btn = document.createElement('button');
      btn.className='btn btn-ghost';
      btn.innerText='Reset Zoom';
      btn.addEventListener('click', ()=>{ if(ct) ct.resetZoom(); });
      canvas.parentNode.insertBefore(btn, canvas.nextSibling);
    }
  } catch (e) {
    console.warn('chart-manager:', e);
  }
});
