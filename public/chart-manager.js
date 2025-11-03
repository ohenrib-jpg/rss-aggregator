/* chart-manager.js - thin wrapper that delegates to ChartsManager class in charts.js */
(function () {
    'use strict';
    function ensureClass() {
        if (!window.ChartsManagerClass) {
            console.error("ChartsManagerClass not found. Make sure charts.js is loaded before chart-manager.js");
            return null;
        }
        if (!window._chartsManagerInstance) {
            try {
                window._chartsManagerInstance = new window.ChartsManagerClass();
            } catch (e) {
                console.error("Failed to instantiate ChartsManagerClass:", e);
                return null;
            }
        }
        return window._chartsManagerInstance;
    }

    // Map of methods to delegate names (update* -> create*/update*)
    const delegateMap = {
        renderChart: 'createChart',
        destroyChart: 'destroyChart',
        destroyAllCharts: 'destroyAllCharts',
        debugCharts: 'debugCharts',
        updateThemeChart: 'createThemeChart',
        updateSentimentChart: 'createSentimentChart',
        updateTimelineChart: 'createTimelineChart',
        updateKeywordCorrelationChart: 'createCorrelationChart',
        updateThemeCorrelationsChart: 'createThemeCorrelationsChart',
        updateFactorZChart: 'createFactorZChart',
        updateSocialPostsChart: 'createSocialPostsChart',
        updateSocialThemeChart: 'createSocialThemeChart',
        updateSocialSentimentChart: 'createSocialSentimentChart',
        updateSocialKeywordCorrelationChart: 'createSocialKeywordCorrelationChart',
        updateSocialThemeCorrelationsChart: 'createSocialThemeCorrelationsChart'
    };

    const API = {};

    Object.keys(delegateMap).forEach(function(name) {
        API[name] = function(...args) {
            const inst = ensureClass();
            if (!inst) return;
            const target = delegateMap[name];
            if (typeof inst[target] === 'function') {
                return inst[target].apply(inst, args);
            } else if (typeof inst.updateChart === 'function') {
                // fallback to generic updateChart if specific not found
                return inst.updateChart.apply(inst, args);
            } else {
                console.warn("No method", target, "on ChartsManagerClass");
            }
        };
    });

    // expose
    if (typeof window !== 'undefined') {
        window.ChartManager = API;
    }
})();