// Configuration and Constants
const API_BASE_URL = 'http://localhost:5000/api';
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
    sidePane.style.display = 'none';
}

function displayProjectStats(stats) {
    // Logic to display project stats in the report view
    chartContainer.innerHTML = JSON.stringify(stats, null, 2); // Placeholder for actual chart rendering logic
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
    if (node.name === id) {
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
    // Define the dimensions for A1 size paper at 300 DPI (dots per inch)
    // 300 DPI is standard for high-quality prints
    const dpi = 600;
    const widthInches = 33.1;
    const heightInches = 23.4;
    const width = widthInches * dpi;
    const height = heightInches * dpi;
    const margin = { top: 50, right: 200, bottom: 50, left: 200 };

    // Create the tree layout with adjusted size
    const tree = d3.tree().size([height - margin.top - margin.bottom, width - margin.left - margin.right]);

    const svg = d3.select('#diagram').append('svg')
        .attr('width', width)
        .attr('height', height)
        .append('g')
        .attr('transform', `translate(${margin.left},${margin.top})`);

    let nodes = d3.hierarchy(data, d => d.children);
    nodes = tree(nodes);

    // Adjust the link paths
    const link = svg.append('g')
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
    const node = svg.append('g')
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
        .text(d => d.data.name);

    // Implement zoom and pan for better navigation
    const zoom = d3.zoom()
        .scaleExtent([0.5, 2]) // Adjust scale extent for print size
        .on('zoom', function (event) {
            svg.attr('transform', event.transform);
        });

    d3.select('#diagram').select('svg').call(zoom);

    // Optional: Fit the tree to the viewport
    // This ensures the entire tree fits within the SVG area
    const bounds = svg.node().getBBox();
    const fullWidth = bounds.width + margin.left + margin.right;
    const fullHeight = bounds.height + margin.top + margin.bottom;
    const scale = Math.min(width / fullWidth, height / fullHeight);
    const translateX = (width - fullWidth * scale) / 2;
    const translateY = (height - fullHeight * scale) / 2;

    d3.select('#diagram').select('svg')
        .attr('width', width)
        .attr('height', height)
        .call(zoom.transform, d3.zoomIdentity.translate(translateX, translateY).scale(scale));

    // Interactivity for nodes
    node.on('mouseover', function (event, d) {
        // Update information display
        document.getElementById('search-result').innerText = `Node Name: ${d.data.name}\nSync Solution: ${d.data.local_sync_solution || 'N/A'}\nRouter Platform: ${d.data.local_ip_transport_site_router_platform || 'N/A'}\nRouter Layer: ${d.data.local_ip_transport_site_router_layer || 'N/A'}\nUpper Sync Source: ${d.data.upper_sync_source_site_name || 'N/A'}`;

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

        const nodeLegend = svg.selectAll(".node-legend")
        .data([
            { label: `IPMPLS Router: `, color: 'Red' },
            { label: 'Grand Master Clock', color: 'RoyalBlue' },
            { label: 'DWDM', color: 'RoyalBlue' }
        ])
        .enter().append("g")
        .attr("class", "legend")
        .attr("transform", (d, i) => `translate(${width - 850},${height - 660 + i * 35})`);

    nodeLegend.append("path")
        .attr("d", d => {
            if (d.label === 'Grand Master Clock') {
                return d3.symbol().type(d3.symbolSquare).size(200)();  // Diamond for Grand Master Clock
            } else if (d.label === 'DWDM') {
                return d3.symbol().type(d3.symbolTriangle).size(250)();  // Square for DWDM
            } else {
                return d3.symbol().type(d3.symbolCircle).size(250)();  // Circle for other labels
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
        .attr("x", width - 850)
        .attr("y", height - 700)
        .attr("dy", ".35em")
        .style("text-anchor", "start")
        .style("font-weight", "bold")
        .text("Node Legend:");

    const linkLegend = svg.selectAll(".link-legend")
        .data(Object.keys(solnLegendColorMap))
        .enter().append("g")
        .attr("class", "legend")
        .attr("transform", (d, i) => `translate(${width - 850},${height - 660 + (i + 7) * 30})`);

    linkLegend.append("line")
        .attr("x1", 0)
        .attr("y1", 0)
        .attr("x2", 18)
        .attr("y2", 0)
        .style("stroke-width", 6)
        .style("stroke", d => solnLegendColorMap[d]);

    linkLegend.append("text")
        .attr("x", 25)
        .attr("y", 5)
        .attr("dy", ".35em")
        .style("text-anchor", "start")
        .text(d => d);

    svg.append("text")
        .attr("x", width - 850)
        .attr("y", height - 490)
        .attr("dy", ".35em")
        .style("text-anchor", "start")
        .style("font-weight", "bold")
        .text("Link Legend:");
}

// Handle Node Search Form Submission
document.getElementById('search-node-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const nodeName = document.getElementById('search-node').value;
    if (!treeDataCache) {
        console.error('Tree data not loaded.');
        return;
    }
    const node = findNodeById(treeDataCache, nodeName);
    const searchResultDiv = document.getElementById('search-result');
    if (node) {
        searchResultDiv.innerText = `Node Name: ${node.name}\nSync Solution: ${node.local_sync_solution || 'N/A'}\nRouter Platform: ${node.local_ip_transport_site_router_platform || 'N/A'}\nRouter Layer: ${node.local_ip_transport_site_router_layer || 'N/A'}\nUpper Sync Source: ${node.upper_sync_source_site_name || 'N/A'}`;
    } else {
        searchResultDiv.innerText = 'Node not found';
    }
});

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
