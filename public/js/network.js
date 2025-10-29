class NetworkVisualization {
    constructor() {
        this.networkData = null;
        this.selectedCountry = null;
        this.autoRefresh = false;
        this.init();
    }

    async init() {
        await this.loadD3();
        this.setupEventListeners();
        await this.loadNetworkData();
        this.startAutoRefresh();
    }

    async loadD3() {
        if (typeof d3 === 'undefined') {
            console.error('D3.js non chargé');
            return;
        }
    }

    setupEventListeners() {
        // Boutons de contrôle
        document.getElementById('refreshBtn').addEventListener('click', () => {
            this.loadNetworkData();
        });

        document.getElementById('autoRefreshBtn').addEventListener('click', () => {
            this.toggleAutoRefresh();
        });

        document.getElementById('viewSelect').addEventListener('change', (e) => {
            this.changeView(e.target.value);
        });

        // Recherche
        document.getElementById('countrySearch').addEventListener('input', (e) => {
            this.searchCountries(e.target.value);
        });

        // Redimensionnement
        window.addEventListener('resize', () => {
            this.debounce(this.renderNetwork.bind(this), 250);
        });
    }

    async loadNetworkData() {
        try {
            this.setLoadingState(true);
            
            const response = await fetch('/api/network/demo');
            const data = await response.json();
            
            if (data.success) {
                this.networkData = data;
                this.updateMetrics();
                this.renderNetwork();
                this.updateRecentRelations();
                this.setLoadingState(false);
            } else {
                throw new Error(data.error || 'Erreur de chargement');
            }
        } catch (error) {
            console.error('Erreur chargement réseau:', error);
            this.showError('Erreur de connexion au serveur');
            this.setLoadingState(false);
        }
    }

    updateMetrics() {
        const metrics = this.networkData.metrics;
        
        document.getElementById('countriesCount').textContent = metrics.totalCountries;
        document.getElementById('relationsCount').textContent = metrics.totalRelations;
        document.getElementById('cooperationRatio').textContent = 
            Math.round(metrics.cooperationRatio * 100) + '%';
        document.getElementById('lastUpdate').textContent = 
            new Date(metrics.lastAnalysis).toLocaleTimeString();
    }

    renderNetwork() {
        const container = document.getElementById('networkGraph');
        container.innerHTML = '';
        
        if (!this.networkData || this.networkData.network.length === 0) {
            container.innerHTML = `
                <div style="display: flex; justify-content: center; align-items: center; height: 100%; color: #888;">
                    <div style="text-align: center;">
                        <h3>🌍 Aucune donnée de réseau</h3>
                        <p>Les relations géopolitiques apparaîtront ici après analyse des articles</p>
                        <button onclick="networkVisualization.loadNetworkData()" 
                                style="margin-top: 1rem; padding: 0.5rem 1rem; background: #4facfe; border: none; border-radius: 5px; color: white; cursor: pointer;">
                            Actualiser
                        </button>
                    </div>
                </div>
            `;
            return;
        }

        const width = container.clientWidth;
        const height = container.clientHeight;

        const svg = d3.select('#networkGraph')
            .append('svg')
            .attr('width', width)
            .attr('height', height);

        // Simulation de forces
        const simulation = d3.forceSimulation()
            .force('link', d3.forceLink().id(d => d.id).distance(100))
            .force('charge', d3.forceManyBody().strength(-300))
            .force('center', d3.forceCenter(width / 2, height / 2));

        // Création des données pour D3
        const nodes = this.createNodes();
        const links = this.createLinks();

        // Dessin des liens
        const link = svg.append('g')
            .selectAll('line')
            .data(links)
            .enter().append('line')
            .attr('stroke', d => this.getLinkColor(d.type))
            .attr('stroke-width', d => Math.abs(d.strength) * 3 + 1)
            .attr('stroke-opacity', 0.6);

        // Dessin des nœuds
        const node = svg.append('g')
            .selectAll('circle')
            .data(nodes)
            .enter().append('circle')
            .attr('r', d => this.getNodeSize(d.influence))
            .attr('fill', d => this.getNodeColor(d.influence))
            .attr('stroke', '#fff')
            .attr('stroke-width', 1.5)
            .call(d3.drag()
                .on('start', dragstarted)
                .on('drag', dragged)
                .on('end', dragended))
            .on('click', (event, d) => this.selectCountry(d))
            .on('mouseover', (event, d) => this.showTooltip(event, d))
            .on('mouseout', () => this.hideTooltip());

        // Étiquettes des pays
        const label = svg.append('g')
            .selectAll('text')
            .data(nodes)
            .enter().append('text')
            .text(d => d.name)
            .attr('font-size', '10px')
            .attr('fill', '#fff')
            .attr('text-anchor', 'middle')
            .attr('dy', 3);

        // Simulation
        simulation.nodes(nodes).on('tick', ticked);
        simulation.force('link').links(links);

        function ticked() {
            link
                .attr('x1', d => d.source.x)
                .attr('y1', d => d.source.y)
                .attr('x2', d => d.target.x)
                .attr('y2', d => d.target.y);

            node
                .attr('cx', d => d.x)
                .attr('cy', d => d.y);

            label
                .attr('x', d => d.x)
                .attr('y', d => d.y);
        }

        function dragstarted(event, d) {
            if (!event.active) simulation.alphaTarget(0.3).restart();
            d.fx = d.x;
            d.fy = d.y;
        }

        function dragged(event, d) {
            d.fx = event.x;
            d.fy = event.y;
        }

        function dragended(event, d) {
            if (!event.active) simulation.alphaTarget(0);
            d.fx = null;
            d.fy = null;
        }
    }

    createNodes() {
        const countries = new Set();
        this.networkData.network.forEach(relation => {
            countries.add(relation.countries[0]);
            countries.add(relation.countries[1]);
        });

        return Array.from(countries).map(country => ({
            id: country,
            name: this.formatCountryName(country),
            influence: this.networkData.metrics.avgStrength
        }));
    }

    createLinks() {
        return this.networkData.network.map(relation => ({
            source: relation.countries[0],
            target: relation.countries[1],
            strength: relation.currentStrength,
            type: relation.type
        }));
    }

    getLinkColor(relationType) {
        const colors = {
            'cooperative': '#00ff88',
            'alliance': '#00cc66',
            'conflict': '#ff4444',
            'hostile': '#cc0000',
            'tense': '#ffaa00',
            'neutral': '#8884d8'
        };
        return colors[relationType] || '#8884d8';
    }

    getNodeColor(influence) {
        if (influence > 0.7) return '#4facfe';
        if (influence > 0.4) return '#00f2fe';
        return '#8884d8';
    }

    getNodeSize(influence) {
        return Math.max(influence * 20, 8);
    }

    formatCountryName(countryCode) {
        const names = {
            'france': 'France',
            'usa': 'USA',
            'china': 'Chine',
            'russia': 'Russie',
            'germany': 'Allemagne',
            'uk': 'Royaume-Uni',
            'japan': 'Japon',
            'india': 'Inde',
            'brazil': 'Brésil',
            'canada': 'Canada'
        };
        return names[countryCode] || countryCode;
    }

    selectCountry(countryData) {
        this.selectedCountry = countryData.id;
        this.showCountryDetails(countryData.id);
    }

    async showCountryDetails(countryCode) {
        try {
            const response = await fetch(`/api/network/country/${countryCode}`);
            const data = await response.json();
            
            if (data.success) {
                this.renderCountryDetails(data);
            }
        } catch (error) {
            console.error('Erreur détails pays:', error);
        }
    }

    renderCountryDetails(countryData) {
        const container = document.getElementById('countryDetails');
        const influenceScore = (countryData.influenceScore * 100).toFixed(1);
        
        container.innerHTML = `
            <div class="country-header">
                <h3>${this.formatCountryName(countryData.country)}</h3>
                <div class="influence-score">
                    Score d'influence: <span class="score-value">${influenceScore}%</span>
                </div>
            </div>
            <div class="relations-count">
                ${countryData.relationCount} relation(s) géopolitique(s)
            </div>
            <div class="relations-list">
                ${countryData.relations.map(rel => {
                    const otherCountry = rel.countries.find(c => c !== countryData.country);
                    const strengthPercent = Math.abs(rel.currentStrength * 100).toFixed(1);
                    return `
                        <div class="relation-item ${rel.type}">
                            <div class="relation-countries">
                                ${this.formatCountryName(countryData.country)} - ${this.formatCountryName(otherCountry)}
                            </div>
                            <div class="relation-type">
                                ${this.getRelationLabel(rel.type)} • Force: ${strengthPercent}%
                            </div>
                            <div class="relation-confidence">
                                Confiance: ${Math.round(rel.confidence * 100)}%
                            </div>
                        </div>
                    `;
                }).join('')}
            </div>
        `;
    }

    getRelationLabel(type) {
        const labels = {
            'cooperative': '🤝 Coopération',
            'alliance': '⚔️ Alliance',
            'conflict': '⚡ Conflit',
            'hostile': '💥 Hostilité',
            'tense': '⚠️ Tension',
            'neutral': '⚖️ Neutre'
        };
        return labels[type] || type;
    }

    updateRecentRelations() {
        const container = document.getElementById('recentRelationsList');
        const recentRelations = this.networkData.network
            .slice(0, 5)
            .sort((a, b) => new Date(b.lastUpdated) - new Date(a.lastUpdated));
        
        container.innerHTML = recentRelations.map(rel => `
            <div class="relation-item ${rel.type}">
                <div class="relation-countries">
                    ${this.formatCountryName(rel.countries[0])} - ${this.formatCountryName(rel.countries[1])}
                </div>
                <div class="relation-type">
                    ${this.getRelationLabel(rel.type)}
                </div>
                <div class="relation-strength">
                    Force: ${Math.abs(rel.currentStrength * 100).toFixed(1)}%
                </div>
            </div>
        `).join('');
    }

    searchCountries(query) {
        // Implémentation simplifiée de la recherche
        const resultsContainer = document.getElementById('searchResults');
        
        if (query.length < 2) {
            resultsContainer.innerHTML = '';
            return;
        }

        const filtered = Array.from(this.networkData?.countries || [])
            .filter(country => 
                this.formatCountryName(country).toLowerCase().includes(query.toLowerCase())
            )
            .slice(0, 5);

        resultsContainer.innerHTML = filtered.map(country => `
            <div class="search-result-item" onclick="networkVisualization.selectCountry({id: '${country}'})">
                ${this.formatCountryName(country)}
            </div>
        `).join('');
    }

    changeView(viewType) {
        // Implémentation des différentes vues
        console.log('Changement de vue:', viewType);
        // À compléter avec les différentes visualisations
    }

    toggleAutoRefresh() {
        this.autoRefresh = !this.autoRefresh;
        const button = document.getElementById('autoRefreshBtn');
        
        if (this.autoRefresh) {
            button.textContent = '⏹️ Arrêter auto-actualisation';
            button.style.background = '#ff4444';
            this.autoRefreshInterval = setInterval(() => {
                this.loadNetworkData();
            }, 30000); // 30 secondes
        } else {
            button.textContent = '🔄 Auto-actualisation';
            button.style.background = '';
            clearInterval(this.autoRefreshInterval);
        }
    }

    startAutoRefresh() {
        // Auto-actualisation toutes les 2 minutes
        setInterval(() => {
            if (this.autoRefresh) {
                this.loadNetworkData();
            }
        }, 120000);
    }

    setLoadingState(loading) {
        const elements = document.querySelectorAll('.metric .value, #networkGraph');
        elements.forEach(el => {
            el.classList.toggle('updating', loading);
        });
    }

    showError(message) {
        // Afficher une erreur élégante
        const container = document.getElementById('networkGraph');
        container.innerHTML = `
            <div style="display: flex; justify-content: center; align-items: center; height: 100%; color: #ff4444;">
                <div style="text-align: center;">
                    <h3>❌ Erreur</h3>
                    <p>${message}</p>
                </div>
            </div>
        `;
    }

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

    showTooltip(event, data) {
        // À implémenter - tooltip avec infos détaillées
    }

    hideTooltip() {
        // À implémenter - cacher tooltip
    }
}

// Initialisation au chargement de la page
let networkVisualization;

document.addEventListener('DOMContentLoaded', () => {
    networkVisualization = new NetworkVisualization();
});