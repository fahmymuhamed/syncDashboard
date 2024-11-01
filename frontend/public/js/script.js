// Configuration and Constants
const API_BASE_URL = 'http://127.0.0.1:5000/api';
const VIEWS = {
    TREE_VIEW: 'treeView',
    REPORT_VIEW: 'reportView'
};


// Cache Frequently Used Elements
const diagram = document.getElementById('diagram');
const chartContainer = document.getElementById('chart-container');
const mainContentTitle = document.getElementById('main-content-title');
const sidePane = document.getElementById('fixed-column');

let currentView = VIEWS.TREE_VIEW;
let treeDataCache = null;
let projectStats = null;
let overallChartInstance = null;
let regionChartInstances = [];

// Color Mappings
const solnColorMap = {
    'DWDM': '#DC143C',
    'Local to GM': '#FFA500',       // DarkSlateGrey
    'Dedicated DF': '#808080',      // Gray
    'In-Band': '#008000',           // Green
    'Local to DWDM': '#FFA500',     // Orange
    'MPLS Collocated': '#00008B',     // Orange
};

const solnLegendColorMap = {
    'Dedicated DF To MPLS': '#808080', // Gray
    'MPLS Collocated': '#00008B', // DarkBlue
    'Local to DWDM': '#FFA500', // Orange
    'DF Uplink (Existing)': '#008000', // Green
    'Inside Transmission': '#DC143C', // Internal Transmission
};

// Debounce Function
function debounce(func, delay) {
    let timerId;
    return (...args) => {
        if (timerId) {
            clearTimeout(timerId);
        }
        timerId = setTimeout(() => {
            func(...args);
        }, delay);
    };
}

// Generic Fetch Data Function
async function fetchData(url) {
    try {
        const response = await fetch(url);
        return await response.json();
    } catch (error) {
        console.error(`Error fetching data from ${url}:`, error);
        return null;
    }
}

async function fetchTreeData() {
    treeDataCache = await fetchData(`${API_BASE_URL}/tree`);
    if (treeDataCache) createTree(treeDataCache);
}

async function fetchProjectStats() {
    projectStats = await fetchData(`${API_BASE_URL}/project_stats`);
    populateProjectStats();
}

function setView(view) {
    currentView = view;
    updateViewName();
    d3.select('svg').remove();
    fetchProjectStats(); // Fetch project stats for both views
    if (currentView === VIEWS.TREE_VIEW) {
        fetchTreeData();
        showTreeVisualization();
    } else if (currentView === VIEWS.REPORT_VIEW) {
        showReportView();
        displayProjectStats(projectStats);
    }
}


function updateViewName() {
    const viewName = currentView === VIEWS.TREE_VIEW ? 'Tree View' : 'Project Status Report';
    //document.getElementById('view-selection').innerText = viewName;
    mainContentTitle.innerText = viewName;
}

function showTreeVisualization() {
    diagram.style.display = 'block';
    chartContainer.style.display = 'none';
    sidePane.style.display = 'block';
}

function showReportView() {
    diagram.style.display = 'none';
    chartContainer.style.display = 'block';
    sidePane.style.display = 'block';
}

function showLoading() {
    document.getElementById('loading-indicator').style.display = 'block';
}

function hideLoading() {
    document.getElementById('loading-indicator').style.display = 'none';
}

function generateReport() {
    const reportType = document.getElementById('report-dropdown').value;
    window.open(`${API_BASE_URL}/report?type=${reportType}`, '_blank');
}

function getAncestors(node) {
    const ancestors = [];
    let current = node;
    while (current) {
        ancestors.push(current);
        current = current.parent;
    }
    return ancestors;
}

function getDescendants(node) {
    const descendants = [];
    function recurse(currentNode) {
        if (currentNode.children) {
            currentNode.children.forEach(child => {
                descendants.push(child);
                recurse(child);
            });
        }
    }
    recurse(node);
    return descendants;
}

// Handle Node Fetch Button Click
/*
document.getElementById('fetch-node-data').addEventListener('click', () => {
    const nodeId = document.getElementById('node-id').value;
    if (nodeId) {
        fetchNodeData(nodeId);
    }
});

// Handle Node Update Form Submission
document.getElementById('update-node-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const nodeId = document.getElementById('node-id').value;
    const transportSyncStatus = document.getElementById('transport-sync-status').value === 'true';
    const transmissionSyncStatus = document.getElementById('transmission-sync-status').value === 'true';
    const siteDoableStatus = document.getElementById('site-doable-status').value === 'true';
    updateNodeInformation(nodeId, transportSyncStatus, transmissionSyncStatus, siteDoableStatus);
});
*/
async function fetchNodeData(nodeId) {
    if (!treeDataCache) {
        console.error('Tree data not loaded.');
        return;
    }
    const node = findNodeById(treeDataCache, nodeId);
    if (node) {
        document.getElementById('transport-sync-status').value = node.local_ip_transport_in_sync || 'false';
        document.getElementById('transmission-sync-status').value = node.local_transmission_in_sync || 'false';
        document.getElementById('site-doable-status').value = node.local_site_doable || 'false';
        document.getElementById('update-fields').style.display = 'block';
    } else {
        console.error('Node not found');
    }
}

async function updateNodeInformation(nodeId, transportSyncStatus, transmissionSyncStatus, siteDoableStatus) {
    if (!treeDataCache) {
        console.error('Tree data not loaded.');
        return;
    }
    const node = findNodeById(treeDataCache, nodeId);
    if (node) {
        node.local_ip_transport_in_sync = transportSyncStatus;
        node.local_transmission_in_sync = transmissionSyncStatus;
        node.local_site_doable = siteDoableStatus;
        setView(currentView);
        const payload = {
            local_site_name: nodeId,
            local_ip_transport_in_sync: transportSyncStatus,
            local_transmission_in_sync: transmissionSyncStatus,
            local_site_doable: siteDoableStatus
        };
        try {
            const response = await fetch(`${API_BASE_URL}/update`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });
            if (!response.ok) {
                throw new Error(`Server error: ${response.statusText}`);
            }
            const responseData = await response.json();
            console.log('Update successful:', responseData);
        } catch (error) {
            console.error('Failed to update node information:', error);
        }
    } else {
        console.error('Node not found');
    }
}

function findNodeById(node, id) {
    if (node.name.toLowerCase().includes(id.toLowerCase())) {
        return node;
    }
    if (node.children) {
        for (const child of node.children) {
            const found = findNodeById(child, id);
            if (found) {
                return found;
            }
        }
    }
    return null;
}

function createTree(data) {
    // Define the dimensions for A0 size paper at 900 DPI (dots per inch)
    const dpi = 300;
    const widthInches = 46.8;
    const heightInches = 33.1;
    const width = widthInches * dpi;
    const height = heightInches * dpi;
    const margin = { top: 50, right: 200, bottom: 50, left: 200 };

    // Create the SVG and apply zoom behavior
    const svg = d3.select('#diagram').append('svg')
        .attr('width', width)
        .attr('height', height)
        .call(d3.zoom()
            .scaleExtent([0.1, 3]) // Adjust the zoom scale limits for a wider zoom range
            .on('zoom', (event) => {
                g.attr('transform', event.transform); // Apply both zoom and pan transformations
            }))
        .append('g')
        .attr('transform', `translate(${margin.left},${margin.top})`);

    const g = svg.append('g'); // Create a group to hold all elements of the tree

    // Create the tree layout with adjusted size
    const tree = d3.tree().size([height - margin.top - margin.bottom, width - margin.left - margin.right]);

    let nodes = d3.hierarchy(data, d => d.children);
    nodes = tree(nodes);

    // Adjust the link paths
    const link = g.append('g')
        .selectAll('.link')
        .data(nodes.links().filter(d => d.source.data.name !== 'GPS'))
        .enter().append('path')
        .attr('class', 'link')
        .attr('id', (d, i) => 'linkPath' + i) // Give each link an ID for the text path
        .attr('d', d3.linkHorizontal().x(d => d.y).y(d => d.x))
        .style('stroke', d => solnColorMap[d.target.data.local_sync_solution] || '#888')
        .style('stroke-width', 2) // Adjust stroke width for better visibility
        .style('fill', 'none');

    // Adjust the nodes
    const node = g.append('g')
        .selectAll('.node')
        .data(nodes.descendants().filter(d => d.data.name !== 'GPS'))
        .enter().append('g')
        .attr('class', d => 'node' + (d.children ? ' node--internal' : ' node--leaf'))
        .attr('transform', d => `translate(${d.y},${d.x})`);

    node.append('circle')
        .attr('r', d => d.data.local_node_domain !== 'IPMPLS' ? 0 : 12) // Adjust node radius for better visibility
        .style('fill', d => d.data.implementation_color);

    // Add symbols for specific nodes
    node.filter(d => d.data.local_node_domain === 'DWDM' && d.data.local_sync_solution === 'GNSS')
        .append('path')
        .attr('d', d3.symbol().type(d3.symbolSquare).size(250))
        .style('fill', 'RoyalBlue');

    node.filter(d => d.data.local_node_domain === 'DWDM' && d.data.local_sync_solution !== 'GNSS')
        .append('path')
        .attr('d', d3.symbol().type(d3.symbolTriangle).size(250))
        .style('fill', 'RoyalBlue');

    // Add text labels to nodes
    node.append('text')
        .attr('dy', 3)
        .attr('x', d => d.children ? -10 : 10)
        .attr('text-anchor', d => d.children ? 'end' : 'start')
        .style('font-size', '24px') // Adjust font size for print
        .text(d => `${d.data.name} (${d.data.local_node_radio_sites_count}RF)_(${d.data.total_radio_site_count}TRF)`);

    // Optional: Fit the tree to the viewport
    const bounds = g.node().getBBox();
    const fullWidth = bounds.width + margin.left + margin.right;
    const fullHeight = bounds.height + margin.top + margin.bottom;
    const scale = Math.min(width / fullWidth, height / fullHeight);
    const translateX = (width - fullWidth * scale) / 2;
    const translateY = (height - fullHeight * scale) / 2;

    svg.attr('transform', `translate(${translateX},${translateY}) scale(${scale})`);

    // Interactivity for nodes
    node.on('mouseover', function (event, d) {
        // Update information display
        const searchResultDiv = document.getElementById('search-result');
        if (searchResultDiv) {
            // Convert the node data to match our fields map
            updateSearchResult(d.data); // Pass the searchResultDiv and node data or null
        }

        // Highlight related nodes and links
        const ancestors = getAncestors(d);
        const descendants = getDescendants(d);
        const relatedNodes = [...ancestors, d, ...descendants];
        node.style('opacity', o => relatedNodes.includes(o) ? 1 : 0.2);
        link.style('opacity', o => relatedNodes.includes(o.source) && relatedNodes.includes(o.target) ? 1 : 0.2);
    }).on('mouseout', function () {
        node.style('opacity', 1);
        link.style('opacity', 1);
    });

    addBlockTypesLegend(g, height, width, projectStats.overall.total_blocked_locally, projectStats.overall.blocked_by_parents_design, projectStats.overall.pending_parents_sync, projectStats.overall.pending_transmission, projectStats.overall.total_affected_by_parent, projectStats.overall.ready_by_design, projectStats.overall.in_sync_sites_count);
}

// Function to update search results with a data map or clear it if data is null
function updateSearchResult(node) {
    const data = node
    ? {
          name: node.local_node_name,
          sync_solution: node.local_sync_solution,
          router_platform: node.local_ip_transport_site_router_platform,
          router_layer: node.local_ip_transport_site_router_layer,
          upper_sync_source: node.upper_sync_source_site_name,
      }
    : null;
    // Map of result fields to their corresponding element IDs
    const fields = {
        name: 'result-node-name',
        sync_solution: 'result-sync-solution',
        router_platform: 'result-router-platform',
        router_layer: 'result-router-layer',
        upper_sync_source: 'result-upper-sync-source',
    };
    if (data) {
        // Populate each field with data or "N/A" if data is missing
        for (const [key, elementId] of Object.entries(fields)) {
            const element = document.getElementById(elementId);
            if (element) {
                element.textContent = data[key] || 'N/A';
            } else {
                console.warn(`Element with ID "${elementId}" not found in the DOM.`);
            }
        }
    } else {
        // Set "Node not found" message and reset other fields to "N/A"
        const nameElement = document.getElementById(fields.name);
        if (nameElement) nameElement.textContent = 'Node not found';

        for (const elementId of Object.values(fields)) {
            const element = document.getElementById(elementId);
            if (element && element !== nameElement) {
                element.textContent = 'N/A';
            }
        }
    }
}

// Debounced Search Node Function

// Event listener for the search form

document.getElementById('search-node-form').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        e.preventDefault();
        const nodeName = document.getElementById('search-node').value.trim();
        if (!treeDataCache) {
            console.error('Tree data not loaded.');
            return;
        }
        const searchResultDiv = document.getElementById('search-result');
        if (nodeName && searchResultDiv) {
            const node = findNodeById(treeDataCache, nodeName);
            // Convert the node data to match our fields map
            updateSearchResult(node); // Pass the searchResultDiv and node data or null
        }
    }
});

function addBlockTypesLegend(svg,  height, width, totalBlockedLocally, blockedByParentsDesign, pendingParentsSync, pendingTransmission, totalAffectedByParent, readyByDesign, inSyncSitesCount) {

    const nodeLegend = svg.selectAll(".node-legend")
        .data([
            { label: `IPMPLS InSync: ${inSyncSitesCount}`, color: 'LimeGreen' },
            { label: `IPMPLS Blocked: ${totalBlockedLocally} + Blocked by Parent: ${blockedByParentsDesign}`, color: 'red' },
            { label: `Pending Parent Sync: ${pendingParentsSync}`, color: 'Gray' },
            { label: `Pending Transmission: ${pendingTransmission}`, color: 'Orange' },
            { label: `IPMPLS Ready: ${readyByDesign}`, color: 'RoyalBlue' },
            { label: 'Grand Master Clock', color: 'RoyalBlue' },
            { label: 'DWDM', color: 'RoyalBlue' }
        ])
        .enter().append("g")
        .attr("class", "legend")
        .attr("transform", (d, i) => `translate(${width - 650},${height - 680 + i * 25})`);

    nodeLegend.append("path")
        .attr("d", d => {
            if (d.label === 'Grand Master Clock') {
                return d3.symbol().type(d3.symbolSquare).size(150)();  // Diamond for Grand Master Clock
            } else if (d.label === 'DWDM') {
                return d3.symbol().type(d3.symbolTriangle).size(100)();  // Square for DWDM
            } else {
                return d3.symbol().type(d3.symbolCircle).size(100)();  // Circle for other labels
            }
        })
        .attr("fill", d => d.color)
        .attr("cx", 9)
        .attr("cy", 0);

    nodeLegend.append("text")
        .attr("x", 25)
        .attr("y", 5)
        .attr("dy", ".35em")
        .style("text-anchor", "start")
        .text(d => d.label);

    svg.append("text")
        .attr("x", width - 650)
        .attr("y", height - 700)
        .attr("dy", ".35em")
        .style("text-anchor", "start")
        .style("font-weight", "bold")
        .text("Node Legend:");

    const linkLegend = svg.selectAll(".link-legend")
        .data(Object.keys(solnColorMap))
        .enter().append("g")
        .attr("class", "legend")
        .attr("transform", (d, i) => `translate(${width - 650},${height - 610 + (i + 7) * 20})`);

    linkLegend.append("line")
        .attr("x1", 0)
        .attr("y1", 0)
        .attr("x2", 18)
        .attr("y2", 0)
        .style("stroke-width", 4)
        .style("stroke", d => solnColorMap[d]);

    linkLegend.append("text")
        .attr("x", 25)
        .attr("y", 5)
        .attr("dy", ".35em")
        .style("text-anchor", "start")
        .text(d => d);

    svg.append("text")
        .attr("x", width - 650)
        .attr("y", height - 500)
        .attr("dy", ".35em")
        .style("text-anchor", "start")
        .style("font-weight", "bold")
        .text("Link Legend:");
}

let regionComparisonChart = null;
function displayProjectStats(stats) {
    const ctxOverall = document.getElementById('overall-progress-chart').getContext('2d');
    const regionSelect = document.getElementById('region-select');

    // Function to destroy an existing chart
    function destroyChart(chartInstance) {
        if (chartInstance) {
            chartInstance.destroy();
            chartInstance = null;
        }
    }

    // Destroy existing charts if they exist
    destroyChart(overallChartInstance);
    if (regionComparisonChart) {
        regionComparisonChart.destroy();
        regionComparisonChart = null;
    }

    // Function to update chart data based on selected region
    function updateChart(region) {
        destroyChart(overallChartInstance);

        const data = region ? stats.regions[region] : stats.overall;

        overallChartInstance = new Chart(ctxOverall, {
            type: 'pie',
            data: {
                labels: ['Blocked by Parents Design', 'Pending Parents Sync', 'Ready by Design'],
                datasets: [{
                    label: 'Project Progress',
                    data: [data.blocked_by_parents_design, data.pending_parents_sync, data.ready_by_design],
                    backgroundColor: [
                        'rgba(255, 99, 132, 0.2)',   // Blocked by Parents Design
                        'rgba(255, 206, 86, 0.2)',    // Pending Parents Sync
                        'rgba(75, 192, 192, 0.2)'     // Ready by Design
                    ],
                    borderColor: [
                        'rgba(255, 99, 132, 1)',
                        'rgba(255, 206, 86, 1)',
                        'rgba(75, 192, 192, 1)'
                    ],
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    legend: {
                        position: 'top',
                    },
                    tooltip: {
                        callbacks: {
                            label: function(tooltipItem) {
                                return tooltipItem.label + ': ' + tooltipItem.raw + ' sites';
                            }
                        }
                    }
                }
            }
        });
    }

    // Event listener for region selection
    regionSelect.addEventListener('change', function() {
        const selectedRegion = regionSelect.value;
        updateChart(selectedRegion);
    });

    // Initial chart display (Overall data)
    updateChart();

    // Generate regional comparison chart (Stacked Bar Chart)
    const ctxRegionComparison = document.getElementById('region-comparison-chart').getContext('2d');
    const regions = Object.keys(stats.regions);
    const blockedData = regions.map(region => stats.regions[region].blocked_by_parents_design);
    const pendingData = regions.map(region => stats.regions[region].pending_parents_sync);
    const readyData = regions.map(region => stats.regions[region].ready_by_design);

    destroyChart(regionComparisonChart);
    regionComparisonChart = new Chart(ctxRegionComparison, {
        type: 'bar',
        data: {
            labels: regions,
            datasets: [
                {
                    label: 'Blocked by Parents Design',
                    data: blockedData,
                    backgroundColor: 'rgba(255, 99, 132, 0.2)',
                    borderColor: 'rgba(255, 99, 132, 1)',
                    borderWidth: 1
                },
                {
                    label: 'Pending Parents Sync',
                    data: pendingData,
                    backgroundColor: 'rgba(255, 206, 86, 0.2)',
                    borderColor: 'rgba(255, 206, 86, 1)',
                    borderWidth: 1
                },
                {
                    label: 'Ready by Design',
                    data: readyData,
                    backgroundColor: 'rgba(75, 192, 192, 0.2)',
                    borderColor: 'rgba(75, 192, 192, 1)',
                    borderWidth: 1
                }
            ]
        },
        options: {
            responsive: true,
            plugins: {
                legend: {
                    position: 'top',
                },
                tooltip: {
                    callbacks: {
                        label: function(tooltipItem) {
                            return tooltipItem.dataset.label + ': ' + tooltipItem.raw + ' sites';
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true
                }
            }
        }
    });
}

// projectStats.overall.js

// Function to populate project stats in the DOM
function populateProjectStats() {
    // Assuming projectStats is available globally or received via an API
    if (typeof projectStats !== 'undefined' && projectStats) {
        document.getElementById('totalNodes').textContent = projectStats.overall.total_nodes;
        document.getElementById('inSyncSitesCount').textContent = projectStats.overall.in_sync_sites_count;
        document.getElementById('totalBlockedLocally').textContent = projectStats.overall.total_blocked_locally;
        document.getElementById('blockedByParentsDesign').textContent = projectStats.overall.blocked_by_parents_design;
        document.getElementById('pendingParentsSync').textContent = projectStats.overall.pending_parents_sync;
        document.getElementById('pendingTransmission').textContent = projectStats.overall.pending_transmission;
        document.getElementById('readyByDesign').textContent = projectStats.overall.ready_by_design;
    } else {
        console.error("projectStats is not defined or unavailable.");
    }
}
function exportSVG() {
    const svgElement = document.querySelector('svg');
    const serializer = new XMLSerializer();
    let source = serializer.serializeToString(svgElement);
    if (!source.match(/^<svg[^>]+xmlns="http:\/\/www\.w3\.org\/2000\/svg"/)) {
        source = source.replace(/^<svg/, '<svg xmlns="http://www.w3.org/2000/svg"');
    }
    if (!source.match(/^<svg[^>]+"http:\/\/www\.w3\.org\/1999\/xlink"/)) {
        source = source.replace(/^<svg/, '<svg xmlns:xlink="http://www.w3.org/1999/xlink"');
    }
    const blob = new Blob([source], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const downloadLink = document.createElement('a');
    downloadLink.href = url;
    downloadLink.download = 'tree_visualization.svg';
    document.body.appendChild(downloadLink);
    downloadLink.click();
    document.body.removeChild(downloadLink);
    URL.revokeObjectURL(url);
}

window.onload = setView(VIEWS.TREE_VIEW);
