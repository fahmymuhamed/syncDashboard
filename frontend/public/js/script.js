// Configuration and Constants
const API_BASE_URL = 'http://localhost:5000/api';
const VIEWS = {
    BLOCK_TYPES: 'blockTypes',
    SOW_TECH: 'sowAndTech'
};

// Cache Frequently Used Elements
const diagram = document.getElementById('diagram');
const chartContainer = document.getElementById('chart-container');
const mainContentTitle = document.getElementById('main-content-title');

let currentView = VIEWS.BLOCK_TYPES;
let treeDataCache = null;
let projectStats = null;
let overallChartInstance = null;
let regionChartInstances = [];

// Color Mappings
const solnColorMap = {
    'Local to GM': '#DCDCDC',       // black
    'Dedicated DF': '#808080',      // Gray
    'In-Band': '#008000',           // Green
    'Local to DWDM': '#FFA500',     // Orange
};

const solnLegendColorMap = {
    'Dedicated DF (New)': '#808080', // Gray
    'DF Uplink (Existing)': '#008000', // Green
    'DWDM': '#FFA500', // Orange
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
    fetchProjectStats();
    fetchTreeData();
    showTreeVisualization();
}

function updateViewName() {
    const viewName = currentView === VIEWS.BLOCK_TYPES ? 'Block Types' : 'SOW Issuance & Tech Data';
    //document.getElementById('view-selection').innerText = viewName;
}

function showTreeVisualization() {
    diagram.style.display = 'block';
    chartContainer.style.display = 'none';
    mainContentTitle.innerText = 'Tree Visualization';
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
    const width = 12000;
    const height = 12000;
    const radius = Math.min(width, height) / 2;
    const tree = d3.tree().size([2 * Math.PI, radius - 300]).separation((a, b) => {
        if (a.data.local_site_name && b.data.local_site_name && a.data.local_site_name === b.data.local_site_name) {
            return 0.5; // Decrease separation for nodes in the same location
        }
        return (a.parent === b.parent ? 1 : 2) / a.depth;
    });
    const svg = d3.select('#diagram').append('svg')
        .attr('width', width)
        .attr('height', height)
        .call(d3.zoom().on('zoom', (event) => {
            svg.attr('transform', event.transform);
        }))
        .append('g')
        .attr('transform', `translate(${width / 2},${height / 2})`);
    let nodes = d3.hierarchy(data, d => d.children);
    nodes = tree(nodes);
    const link = svg.append('g')
        .selectAll('.link')
        .data(nodes.links().filter(d => d.source.data.name !== 'GPS'))
        .enter().append('path')
        .attr('class', 'link')
        .attr('id', (d, i) => 'linkPath' + i) // Give each link an ID for the text path
        .attr('d', d3.linkRadial().angle(d => d.x).radius(d => d.y))
        .style('stroke', d => solnColorMap[d.target.data.local_sync_solution] || '#888')
        .style('stroke-opacity', 1)
        .style('fill', 'none');

    // Append the text to follow the path
    svg.append('g')
        .selectAll('.link-text')
        .data(nodes.links().filter(d => d.source.data.name !== 'GPS'))
        .enter().append('text')
        .attr('class', 'link-text')
        .attr('dy', -3) // Adjust the vertical position relative to the path
        .append('textPath')
        .attr('xlink:href', (d, i) => '#linkPath' + i) // Reference the link path
        .attr('startOffset', '50%') // Center the text along the path.attr('dy', '0.31em')
        .style('text-anchor', 'middle') // Center the text at the offset
        .text(d => `${d.target.data.upper_sync_source_port} <> ${d.target.data.local_node_port}`);

    const node = svg.append('g')
        .selectAll('.node')
        .data(nodes.descendants().filter(d => d.data.name !== 'GPS'))
        .enter().append('g')
        .attr('class', d => 'node' + (d.children ? ' node--internal' : ' node--leaf'))
        .attr('transform', d => {
            if (d.data.local_site_name && d.parent && d.parent.data.local_site_name === d.data.local_site_name) {
                // Adjust the position for nodes in the same location
                return `rotate(${d.x * 180 / Math.PI - 90}) translate(${d.y - 0},0)`;
            }
            return `rotate(${d.x * 180 / Math.PI - 90}) translate(${d.y},0)`;
        });
    node.append('circle')
        .attr('r', d => d.data.local_node_domain !== 'IPMPLS' ? 0 : 5)
        .style('fill', d => currentView === VIEWS.BLOCK_TYPES ? d.data.implementation_color : d.data.design_color);

    node.filter(d => d.data.local_node_domain === 'DWDM' && d.data.local_sync_solution === 'GNSS')  // Filter nodes with "Local to GM"
        .append("path")
        .attr("d", d3.symbol().type(d3.symbolSquare).size(200))  // Square symbol
        .attr('transform', 'translate(0, 0)')
        .style('fill', 'RoyalBlue')
        .style('stroke', 'steelblue')
        .style('stroke-width', 0.01);
    node.filter(d => d.data.local_node_domain === 'DWDM')
        .append('path')
        .attr('d', d3.symbol().type(d3.symbolTriangle).size(60))
        .attr('transform', 'translate(0, 0)')
        .style('fill', 'RoyalBlue')
        .style('stroke', 'steelblue')
        .style('stroke-width', 0.01);
    node.append('text')
        .attr('dy', '0.31em')
        .attr('x', d => d.x < Math.PI ? 6 : -6)
        .attr('text-anchor', d => d.x < Math.PI ? 'start' : 'end')
        .attr('transform', d => d.x >= Math.PI ? 'rotate(180)' : null)
        .text(d => d.data.name);
    node.on('mouseover', function (event, d) {
        document.getElementById('search-result').innerText = `Node Name: ${d.data.name}\nSync Solution: ${d.data.local_sync_solution || 'N/A'}\nRouter Platform: ${d.data.local_ip_transport_site_router_platform || 'N/A'}\nRouter Layer: ${d.data.local_ip_transport_site_router_layer || 'N/A'}\nUpper Sync Source: ${d.data.upper_sync_source_site_name || 'N/A'}`;
        const ancestors = getAncestors(d);
        const descendants = getDescendants(d);
        const relatedNodes = [...ancestors, d, ...descendants];
        node.style('opacity', o => relatedNodes.includes(o) ? 1 : 0.2);
        link.style('opacity', o => relatedNodes.includes(o.source) && relatedNodes.includes(o.target) ? 1 : 0.2);
    }).on('mousemove', debounce(function (event) {
        // Tooltip logic here
    }, 100)).on('mouseout', function () {
        node.style('opacity', 1);
        link.style('opacity', 1);
    });
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

window.onload = setView(VIEWS.BLOCK_TYPES);