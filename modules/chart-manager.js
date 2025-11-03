/* -------------------------------------------------------------
 *  chart-manager.js – Centralise la gestion des graphiques Chart.js
 *  Expose un objet window.ChartManager
 * ------------------------------------------------------------- */
window.ChartManager = (function () {
    'use strict';
    const charts = {}; // nom -> instance Chart

    /* ---------------------------------------------------------
     *  Détruit un graphique existant
     * --------------------------------------------------------- */
    function destroyChart(name) {
        if (charts[name]) {
            try { charts[name].destroy(); } catch (e) { /* ignore */ }
            delete charts[name];
        }
    }

    /* ---------------------------------------------------------
     *  Crée ou Met à jour un graphique.
     *  @param {string} name   identifiant (ex: "theme")
     *  @param {object} data   data Chart.js
     *  @param {object} opts   options Chart.js (fusionnées)
     *  @param {string} type   type de graphique (line, bar, doughnut, …)
     * --------------------------------------------------------- */
    function renderChart(name, data, opts = {}, type = 'bar') {
        destroyChart(name);
        const canvas = document.getElementById(name + 'Chart');
        if (!canvas) {
            console.warn('Canvas #' + name + 'Chart introuvable');
            return;
        }
        const ctx = canvas.getContext('2d');

        const defaultOptions = {
            responsive: true,
            maintainAspectRatio: false,
            animation: false,
            plugins: {
                legend: { position: 'bottom', labels: { font: { size: 12 } } }
            },
            scales: {
                x: { grid: { color: 'rgba(0,0,0,.05)' }, ticks: { color: '#334155' } },
                y: { grid: { color: 'rgba(0,0,0,.05)' }, ticks: { color: '#334155' } }
            }
        };

        const finalOptions = Object.assign(defaultOptions, opts);

        charts[name] = new Chart(ctx, {
            type,
            data,
            options: finalOptions
        });
    }

    /* ---------------------------------------------------------
     *  Helpers dédiés (plus lisibles dans app.js)
     * --------------------------------------------------------- */
    function updateThemeChart(themeCounts) {
        const labels = Object.keys(themeCounts);
        const dataVals = Object.values(themeCounts);
        const colors = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#06b6d4', '#84cc16', '#f97316', '#6366f1', '#ec4899'];
        renderChart('theme', {
            labels,
            datasets: [{ data: dataVals, backgroundColor: colors }]
        }, {
            plugins: {
                tooltip: {
                    callbacks: {
                        label: ctx => {
                            const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
                            const pct = total ? Math.round((ctx.raw / total) * 100) : 0;
                            return `${ctx.label}: ${ctx.raw} (${pct}%)`;
                        }
                    }
                }
            }
        }, 'doughnut');
    }

    function updateSentimentChart(sentimentCounts) {
        const labels = ['Positif Fort 😊', 'Positif Faible 🙂', 'Neutre 😐', 'Négatif Faible 🙁', 'Négatif Fort 😞'];
        const vals = [
            sentimentCounts.positive_strong || 0,
            sentimentCounts.positive_weak || 0,
            sentimentCounts.neutral || 0,
            sentimentCounts.negative_weak || 0,
            sentimentCounts.negative_strong || 0
        ];
        renderChart('sentiment', {
            labels,
            datasets: [{ data: vals, backgroundColor: ['#10b981', '#34d399', '#6b7280', '#f59e0b', '#ef4444'] }]
        }, {
            plugins: { legend: { display: false } },
            scales: { y: { beginAtZero: true } }
        }, 'bar');
    }

    function updateTimelineChart(days) {
        // days : { 'YYYY-MM-DD': count }
        const dates = Object.keys(days).sort();
        const labels = dates.map(d => {
            const dt = new Date(d);
            return dt.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
        });
        const values = dates.map(d => days[d] || 0);
        renderChart('timeline', {
            labels,
            datasets: [{
                label: 'Articles publiés',
                data: values,
                borderColor: '#3b82f6',
                backgroundColor: 'rgba(59,130,246,0.15)',
                fill: true,
                tension: 0.3
            }]
        }, {
            plugins: { legend: { display: false } },
            scales: { x: { grid: { display: false } }, y: { beginAtZero: true } }
        }, 'line');
    }

    function updateKeywordCorrelationChart(result) {
        // result = { keyword, correlation, strength, sampleSize, interpretation }
        const val = result.correlation;
        const color = val > 0 ? '#10b981' : '#ef4444';
        renderChart('pearson', {
            labels: ['Corrélation'],
            datasets: [{
                label: `Corrélation "${result.keyword}"`,
                data: [val],
                backgroundColor: [color]
            }]
        }, {
            plugins: { legend: { display: false } },
            scales: { y: { min: -1, max: 1 } }
        }, 'bar');
    }

    function updateThemeCorrelationsChart(list) {
        // list : [ {theme1, theme2, correlation, interpretation} ]
        const labels = list.map(x => `${x.theme1} ↔ ${x.theme2}`);
        const values = list.map(x => x.correlation);
        const colors = values.map(v => v > 0 ? '#10b981' : '#ef4444');
        renderChart('themeCorrelations', {
            labels,
            datasets: [{
                label: 'Corrélations entre thèmes',
                data: values,
                backgroundColor: colors
            }]
        }, {
            plugins: { legend: { display: false } },
            scales: { y: { min: -1, max: 1 } }
        }, 'bar');
    }

    function updateFactorZChart(factorZData) {
        if (!factorZData) return;

        const data = {
            labels: ['Médias RSS', 'Réseaux Sociaux'],
            datasets: [{
                label: 'Sentiment moyen',
                data: [factorZData.rssSentiment.avg, factorZData.socialSentiment.avg],
                backgroundColor: ['#3b82f6', '#ef4444'],
                borderColor: ['#2563eb', '#dc2626'],
                borderWidth: 2
            }]
        };

        const options = {
            plugins: {
                title: {
                    display: true,
                    text: `Facteur Z: ${factorZData.value.toFixed(2)} - ${factorZData.interpretation}`
                },
                tooltip: {
                    callbacks: {
                        afterLabel: function (context) {
                            const source = context.dataIndex === 0 ? 'rss' : 'social';
                            const data = source === 'rss' ? factorZData.rssSentiment : factorZData.socialSentiment;
                            return `Total: ${data.total} articles/posts\nVariance: ${data.variance.toFixed(3)}`;
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    min: -1,
                    max: 1,
                    title: {
                        display: true,
                        text: 'Score de sentiment'
                    }
                }
            }
        };

        renderChart('factorZ', data, options, 'bar');
    }

    function updateSocialPostsChart(socialPosts) {
        if (!socialPosts || socialPosts.length === 0) return;

        // Comptage par source
        const sourceCounts = {};
        socialPosts.forEach(post => {
            sourceCounts[post.source] = (sourceCounts[post.source] || 0) + 1;
        });

        const labels = Object.keys(sourceCounts);
        const data = Object.values(sourceCounts);

        renderChart('socialPosts', {
            labels: labels,
            datasets: [{
                label: 'Posts par source',
                data: data,
                backgroundColor: ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6']
            }]
        }, {
            plugins: {
                legend: { display: false }
            }
        }, 'doughnut');
    }

    // Fonctions pour les graphiques des flux sociaux
    function updateSocialThemeChart(themeCounts) {
        const labels = Object.keys(themeCounts);
        const dataVals = Object.values(themeCounts);
        const colors = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#06b6d4', '#84cc16', '#f97316', '#6366f1', '#ec4899'];
        renderChart('socialTheme', {
            labels,
            datasets: [{ data: dataVals, backgroundColor: colors }]
        }, {
            plugins: {
                tooltip: {
                    callbacks: {
                        label: ctx => {
                            const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
                            const pct = total ? Math.round((ctx.raw / total) * 100) : 0;
                            return `${ctx.label}: ${ctx.raw} (${pct}%)`;
                        }
                    }
                }
            }
        }, 'doughnut');
    }

    function updateSocialSentimentChart(sentimentCounts) {
        const labels = ['Positif Fort 😊', 'Positif Faible 🙂', 'Neutre 😐', 'Négatif Faible 🙁', 'Négatif Fort 😞'];
        const vals = [
            sentimentCounts.positive_strong || 0,
            sentimentCounts.positive_weak || 0,
            sentimentCounts.neutral || 0,
            sentimentCounts.negative_weak || 0,
            sentimentCounts.negative_strong || 0
        ];
        renderChart('socialSentiment', {
            labels,
            datasets: [{ data: vals, backgroundColor: ['#10b981', '#34d399', '#6b7280', '#f59e0b', '#ef4444'] }]
        }, {
            plugins: { legend: { display: false } },
            scales: { y: { beginAtZero: true } }
        }, 'bar');
    }

    function updateSocialKeywordCorrelationChart(result) {
        // result = { keyword, correlation, strength, sampleSize, interpretation }
        const val = result.correlation;
        const color = val > 0 ? '#10b981' : '#ef4444';
        renderChart('socialPearson', {
            labels: ['Corrélation'],
            datasets: [{
                label: `Corrélation "${result.keyword}"`,
                data: [val],
                backgroundColor: [color]
            }]
        }, {
            plugins: { legend: { display: false } },
            scales: { y: { min: -1, max: 1 } }
        }, 'bar');
    }

    function updateSocialThemeCorrelationsChart(list) {
        // list : [ {theme1, theme2, correlation, interpretation} ]
        const labels = list.map(x => `${x.theme1} ↔ ${x.theme2}`);
        const values = list.map(x => x.correlation);
        const colors = values.map(v => v > 0 ? '#10b981' : '#ef4444');
        renderChart('socialThemeCorrelations', {
            labels,
            datasets: [{
                label: 'Corrélations entre thèmes',
                data: values,
                backgroundColor: colors
            }]
        }, {
            plugins: { legend: { display: false } },
            scales: { y: { min: -1, max: 1 } }
        }, 'bar');
    }

    return {
        renderChart,
        destroyChart,
        updateThemeChart,
        updateSentimentChart,
        updateTimelineChart,
        updateKeywordCorrelationChart,
        updateThemeCorrelationsChart,
        updateFactorZChart,
        updateSocialPostsChart,
        updateSocialThemeChart,
        updateSocialSentimentChart,
        updateSocialKeywordCorrelationChart,
        updateSocialThemeCorrelationsChart,
        _charts: charts // pour debug
    };
})();
