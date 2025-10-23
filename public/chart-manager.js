// chart-manager.js
// Gestion centralisée des graphiques Chart.js dans GEOPOL

import Chart from "chart.js/auto";

const state = {
    charts: {}, // ex: { timeline: ChartInstance, stats: ChartInstance }
};

/**
 * Détruit le graphique existant pour un nom donné.
 */
function destroyChart(name) {
    if (state.charts[name]) {
        try {
            state.charts[name].destroy();
            delete state.charts[name];
        } catch (err) {
            console.warn(`⚠️ Impossible de détruire le graphique ${name}:`, err);
        }
    }
}

/**
 * Prépare un nouveau canvas vierge avant la création du graphique.
 */
function resetChartContainer(name) {
    const container = document.getElementById(`${name}ChartContainer`);
    if (container) {
        container.innerHTML = `<canvas id="${name}Chart"></canvas>`;
    }
    const canvas = document.getElementById(`${name}Chart`);
    return canvas ? canvas.getContext("2d") : null;
}

/**
 * Crée ou met à jour un graphique.
 * @param {string} name - nom du graphique (timeline, stats, etc.)
 * @param {object} data - données Chart.js
 * @param {object} options - options Chart.js
 * @param {string} type - type de graphique ('line', 'bar', 'pie', etc.)
 */
export function renderChart(name, data, options = {}, type = "line") {
    destroyChart(name);
    const ctx = resetChartContainer(name);
    if (!ctx) {
        console.error(`❌ Impossible d'initialiser le graphique '${name}'`);
        return;
    }

    // Fusionne les options par défaut avec celles fournies
    const finalOptions = Object.assign(
        {
            responsive: true,
            maintainAspectRatio: false,
            animation: false,
            plugins: {
                legend: {
                    position: "bottom",
                    labels: { font: { size: 12 } },
                },
            },
            scales: {
                x: {
                    grid: { color: "rgba(0,0,0,0.05)" },
                    ticks: { color: "#334155" },
                },
                y: {
                    grid: { color: "rgba(0,0,0,0.05)" },
                    ticks: { color: "#334155" },
                },
            },
        },
        options
    );

    // Création du graphique
    state.charts[name] = new Chart(ctx, {
        type,
        data,
        options: finalOptions,
    });
}

/**
 * Exemple : mise à jour du graphique de chronologie (timeline)
 */
export function updateTimelineChart(labels, values) {
    const data = {
        labels,
        datasets: [
            {
                label: "Articles publiés",
                data: values,
                borderColor: "#2563eb",
                backgroundColor: "rgba(37,99,235,0.15)",
                tension: 0.3,
                fill: true,
            },
        ],
    };

    renderChart("timeline", data, { aspectRatio: 2 }, "line");
}

/**
 * Exemple : graphique de répartition des sources
 */
export function updateSourceChart(labels, values) {
    const data = {
        labels,
        datasets: [
            {
                data: values,
                backgroundColor: ["#2563eb", "#16a34a", "#f59e0b", "#dc2626", "#7c3aed"],
                hoverOffset: 8,
            },
        ],
    };

    renderChart("sources", data, {}, "doughnut");
}
