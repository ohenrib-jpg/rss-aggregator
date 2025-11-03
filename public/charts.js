// charts.js - Gestion des visualisations de données
class ChartsManager {
    constructor() {
        this.charts = {};
        this.init();
    }

    init() {
        // Initialisation des écouteurs d'événements
        this.setupEventListeners();
    }

    setupEventListeners() {
        // Écouteur pour le redimensionnement de la fenêtre
        window.addEventListener('resize', () => {
            this.debounce(this.resizeCharts.bind(this), 250);
        });
    }

    // Création d'un graphique
    createChart(canvasId, config) {
        const canvas = document.getElementById(canvasId);
        if (!canvas) {
            console.warn(`Canvas #${canvasId} introuvable`);
            return null;
        }

        const ctx = canvas.getContext('2d');
        const chart = new Chart(ctx, config);
        this.charts[canvasId] = chart;
        return chart;
    }

    // Mise à jour d'un graphique existant
    updateChart(canvasId, newData, newOptions = {}) {
        const chart = this.charts[canvasId];
        if (!chart) {
            console.warn(`Chart #${canvasId} non trouvé`);
            return;
        }

        // Mise à jour des données
        if (newData) {
            chart.data = { ...chart.data, ...newData };
        }

        // Mise à jour des options
        if (newOptions) {
            chart.options = Chart.helpers.merge(chart.options, newOptions);
        }

        chart.update();
    }

    // Destruction d'un graphique
    destroyChart(canvasId) {
        const chart = this.charts[canvasId];
        if (chart) {
            chart.destroy();
            delete this.charts[canvasId];
        }
    }

    // Redimensionnement de tous les graphiques
    resizeCharts() {
        Object.values(this.charts).forEach(chart => {
            chart.resize();
        });
    }

    // Débounce pour éviter les appels trop fréquents
    debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    // Graphique en secteurs pour les thèmes
    createThemeChart(canvasId, themeData) {
        const data = {
            labels: Object.keys(themeData),
            datasets: [{
                data: Object.values(themeData),
                backgroundColor: [
                    '#3b82f6', '#ef4444', '#10b981', '#f59e0b', 
                    '#8b5cf6', '#06b6d4', '#84cc16', '#f97316'
                ]
            }]
        };

        const config = {
            type: 'doughnut',
            data: data,
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'bottom'
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                const total = context.dataset.data.reduce((a, b) => a + b, 0);
                                const percentage = Math.round((context.raw / total) * 100);
                                return `${context.label}: ${context.raw} (${percentage}%)`;
                            }
                        }
                    }
                }
            }
        };

        return this.createChart(canvasId, config);
    }

    // Graphique en barres pour les sentiments
    createSentimentChart(canvasId, sentimentData) {
        const data = {
            labels: ['Positif Fort', 'Positif Faible', 'Neutre', 'Négatif Faible', 'Négatif Fort'],
            datasets: [{
                label: 'Nombre d\'articles',
                data: [
                    sentimentData.positive_strong || 0,
                    sentimentData.positive_weak || 0,
                    sentimentData.neutral || 0,
                    sentimentData.negative_weak || 0,
                    sentimentData.negative_strong || 0
                ],
                backgroundColor: [
                    '#10b981', '#34d399', '#6b7280', '#f59e0b', '#ef4444'
                ]
            }]
        };

        const config = {
            type: 'bar',
            data: data,
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: false
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true
                    }
                }
            }
        };

        return this.createChart(canvasId, config);
    }

    // Graphique linéaire pour l'évolution temporelle
    createTimelineChart(canvasId, timelineData) {
        const labels = Object.keys(timelineData).map(date => {
            const d = new Date(date);
            return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
        });
        
        const data = {
            labels: labels,
            datasets: [{
                label: 'Articles publiés',
                data: Object.values(timelineData),
                borderColor: '#3b82f6',
                backgroundColor: 'rgba(59, 130, 246, 0.1)',
                fill: true,
                tension: 0.3
            }]
        };

        const config = {
            type: 'line',
            data: data,
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: false
                    }
                },
                scales: {
                    x: {
                        grid: {
                            display: false
                        }
                    },
                    y: {
                        beginAtZero: true
                    }
                }
            }
        };

        return this.createChart(canvasId, config);
    }

    // Graphique en barres pour le facteur Z
    createFactorZChart(canvasId, factorZData) {
        const data = {
            labels: ['Médias RSS', 'Réseaux Sociaux'],
            datasets: [{
                label: 'Sentiment moyen',
                data: [factorZData.rssSentiment.avg, factorZData.socialSentiment.avg],
                backgroundColor: ['#3b82f6', '#ef4444']
            }]
        };

        const config = {
            type: 'bar',
            data: data,
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    title: {
                        display: true,
                        text: `Facteur Z: ${factorZData.value.toFixed(2)} - ${factorZData.interpretation}`
                    },
                    legend: {
                        display: false
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        min: -1,
                        max: 1
                    }
                }
            }
        };

        return this.createChart(canvasId, config);
    }

    // Graphique en barres pour les corrélations
    createCorrelationChart(canvasId, correlationData) {
        const data = {
            labels: [correlationData.keyword],
            datasets: [{
                label: 'Corrélation',
                data: [correlationData.correlation],
                backgroundColor: correlationData.correlation > 0 ? '#10b981' : '#ef4444'
            }]
        };

        const config = {
            type: 'bar',
            data: data,
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: false
                    }
                },
                scales: {
                    y: {
                        min: -1,
                        max: 1
                    }
                }
            }
        };

        return this.createChart(canvasId, config);
    }

    // Graphique en barres pour les corrélations de thèmes
    createThemeCorrelationsChart(canvasId, correlations) {
        const labels = correlations.map(c => `${c.theme1} ↔ ${c.theme2}`);
        const data = correlations.map(c => c.correlation);
        const backgroundColors = data.map(val => val > 0 ? '#10b981' : '#ef4444');

        const chartData = {
            labels: labels,
            datasets: [{
                label: 'Corrélation',
                data: data,
                backgroundColor: backgroundColors
            }]
        };

        const config = {
            type: 'bar',
            data: chartData,
            options: {
                responsive: true,
                maintainAspectRatio: false,
                indexAxis: 'y',
                plugins: {
                    legend: {
                        display: false
                    }
                },
                scales: {
                    x: {
                        min: -1,
                        max: 1
                    }
                }
            }
        };

        return this.createChart(canvasId, config);
    }
}

// Initialisation du gestionnaire de graphiques
let chartsManager;

document.addEventListener('DOMContentLoaded', () => {
    chartsManager = new ChartsManager();
    
    // Exposition globale pour l'utilisation dans d'autres scripts
    window.chartsManager = chartsManager;
});


// Expose ChartsManager class to global scope for chart-manager wrapper
if (typeof window !== 'undefined') {
    window.ChartsManagerClass = ChartsManager;
}
