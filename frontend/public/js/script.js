let currentView = 'blockTypes';
let treeDataCache = null; // Store the tree data for updating nodes
let projectStats = null; // Store the tree data for updating nodes
let overallChartInstance = null; // Chart.js instance for the overall progress chart
let regionChartInstances = []; // Array to store Chart.js instances for region-wise pie charts

// Color mapping for Soln values
const solnColorMap = {
    'Local to GM': '#000000',       // black
    'Dedicated DF': '#808080',      // Gray
    'In-Band': '#008000',           // Green
    'Local to DWDM': '#FFA500',     // Orange
    // Add more soln types as needed
};

// Color mapping for Soln Legend values
const solnLegnedColorMap = {
    'Dedicated DF (New)': '#808080',      // Gray
    'DF Uplink (Existing)': '#008000',           // Green
    'DWDM': '#FFA500',     // Orange
    // Add more soln types as needed
};

function setView(view) {
    currentView = view;
    updateViewName();
    d3.select("svg").remove();
    fetchProjectStats();
    fetchTreeData();

    // Show the tree visualization
    document.getElementById('diagram').style.display = 'block';
    document.getElementById('chart-container').style.display = 'none';
    document.getElementById('main-content-title').innerText = 'Tree Visualization';

}

function updateViewName() {
    const viewName = currentView === 'blockTypes' ? 'Block Types' : 'SOW Issuance & Tech Data';
}

function fetchTreeData() {
    fetch('http://localhost:5000/api/tree')
        .then(response => response.json())
        .then(data => {
            treeDataCache = data; // Store data in treeDataCache for potential updates
            createTree(data)
        })
        .catch(error => console.error('Error fetching tree data:', error));
}

function fetchProjectStats() {
    fetch('http://localhost:5000/api/project_stats')
        .then(response => response.json())
        .then(data => {
            projectStats = data; // Store data in treeDataCache for potential updates
        })
        .catch(error => console.error('Error fetching tree data:', error));
}

function generateReport() {
    const reportType = document.getElementById('report-dropdown').value;
    window.open(`http://localhost:5000/api/report?type=${reportType}`, '_blank');
}

// Function to find all ancestors (roots) of a node
function getAncestors(node) {
    const ancestors = [];
    let current = node;
    while (current) {
        ancestors.push(current);
        current = current.parent;
    }
    return ancestors;
}

// Function to find all descendants (children) of a node
function getDescendants(node) {
    const descendants = [];
    function recurse(currentNode) {
        if (currentNode.children) {
            currentNode.children.forEach(child => {
                descendants.push(child);
                recurse(child); // Recursively collect all descendants
            });
        }
    }
    recurse(node);
    return descendants;
}

// Handle Node Fetch Button Click
document.getElementById('fetch-node-data').addEventListener('click', function () {
    const nodeId = document.getElementById('node-id').value;
    if (nodeId) {
        fetchNodeData(nodeId);
    }
});

// Handle Node Update Form Submission
document.getElementById('update-node-form').addEventListener('submit', function (e) {
    e.preventDefault(); // Prevent form from submitting the default way

    const nodeId = document.getElementById('node-id').value;
    const transportSyncStatus = document.getElementById('transport-sync-status').value;
    const transmissionSyncStatus = document.getElementById('transmission-sync-status').value;
    const siteDoableStatus = document.getElementById('site-doable-status').value;

    updateNodeInformation(nodeId, transportSyncStatus, transmissionSyncStatus, siteDoableStatus);
});

function fetchNodeData(nodeId) {
    if (!treeDataCache) {
        console.error('Tree data not loaded.');
        return;
    }

    // Find the node by ID and populate the form with its information
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

function updateNodeInformation(nodeId, transportSyncStatus, transmissionSyncStatus, siteDoableStatus) {
    if (!treeDataCache) {
        console.error('Tree data not loaded.');
        return;
    }

    // Find the node by ID and update its information
    const node = findNodeById(treeDataCache, nodeId);
    if (node) {
        node.local_ip_transport_in_sync = transportSyncStatus;
        node.local_transmission_in_sync = transmissionSyncStatus;
        node.local_site_doable = siteDoableStatus;

        // Re-render the tree with updated data
        d3.select("svg").remove();
        const svg = d3.select("#diagram").append("svg")
            .attr("width", 3000)
            .attr("height", 3000);

        createTree(treeDataCache);
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
    const width = 3000;
    const height = 3000;
    const radius = Math.min(width, height) / 2;

    const tree = d3.tree()
        .size([2 * Math.PI, radius - 300])
        .separation((a, b) => (a.parent == b.parent ? 1 : 2) / a.depth);

    const svg = d3.select("#diagram").append("svg")
        .attr("width", width)
        .attr("height", height)
        .call(d3.zoom().on("zoom", function (event) {
            svg.attr("transform", event.transform);
        }))
        .append("g")
        .attr("transform", `translate(${width / 2},${height / 2})`);

    let nodes = d3.hierarchy(data, d => d.children);

    nodes = tree(nodes);

    const link = svg.append("g")
        .selectAll(".link")
        .data(nodes.links().filter(d => d.source.data.name !== "GPS"))  // Exclude links from the virtual root
        .enter().append("path")
        .attr("class", "link")
        .attr("d", d3.linkRadial()
            .angle(d => d.x)
            .radius(d => d.y))
        .style("stroke", d => solnColorMap[d.target.data.local_sync_solution] || '#888')
        .style("stroke-opacity", 1)  // Solid lines
        .style("fill", "none");


    const node = svg.append("g")
        .selectAll(".node")
        .data(nodes.descendants().filter(d => d.data.name !== "GPS"))  // Exclude the virtual root node
        .enter().append("g")
        .attr("class", d => "node" + (d.children ? " node--internal" : " node--leaf"))
        .attr("transform", d => `
            rotate(${d.x * 180 / Math.PI - 90})
            translate(${d.y},0)
        `);

    // Add circles to represent nodes
    node.append("circle")
        .attr("r", d => d.data.local_site_domain === 'DWDM' ? 0 : 5)  // Set circle radius to 0 for DWDM domain
        .style("fill", d => currentView === 'blockTypes' ? d.data.implementation_color : d.data.design_color );

    // Add a distinct symbol (e.g., star) for nodes "Local to DWDM" to represent the Grand Master clock
    node.filter(d => d.data.local_site_domain === 'DWDM')  // Filter nodes with "Local to DWDM"
        .append("path")
        .attr("d", d3.symbol().type(d3.symbolTriangle).size(60))  // Triangle symbol
        .attr("transform", "translate(0, 0)")  // Position the symbol to the right of the circle
        .style("fill", d => d.data.local_transmission_in_sync ? "LimeGreen" : "RoyalBlue")  // Dedicated color for the DWDM
        .style("stroke", "steelblue")
        .style("stroke-width", 0.01);

    // Add a distinct symbol (e.g., star) for nodes "Local to GM" to represent the Grand Master clock
    node.filter(d => d.data.local_sync_solution === 'Local to GM' && d.data.local_site_domain === 'IPMPLS')  // Filter nodes with "Local to GM"
        .append("path")
        .attr("d", d3.symbol().type(d3.symbolSquare).size(200))  // Square symbol
        .attr("transform", "translate(-20, 0)")  // Position the symbol to the right of the circle
        .style("fill", d => d.data.local_transmission_in_sync ? "LimeGreen" : "RoyalBlue")  // Dedicated color for the Grand Master clock
        .style("stroke", "steelblue")
        .style("stroke-width", 0.01);

    // Add a distinct symbol (e.g., star) for nodes "Local to DWDM" to represent the Grand Master clock
    node.filter(d => d.data.local_sync_solution === 'Local to DWDM' && d.data.local_site_domain === 'IPMPLS')  // Filter nodes with "Local to DWDM"
        .append("path")
        .attr("d", d3.symbol().type(d3.symbolTriangle).size(60))  // Triangle symbol
        .attr("transform", "translate(-15, 0)" )  // Position the symbol to the right of the circle
        //.attr("transform",  d => 'rotate(270) translate(-15,0)')
        .style("fill", d => d.data.local_transmission_in_sync ? "LimeGreen" : "RoyalBlue")  // Dedicated color for the DWDM
        .style("stroke", "steelblue")
        .style("stroke-width", 0.01);

    // Add text labels to the nodes
    node.append("text")
        .attr("dy", "0.31em")
        .attr("x", d => d.x < Math.PI ? 6 : -6)
        .attr("text-anchor", d => d.x < Math.PI ? "start" : "end")
        .attr("transform", d => d.x >= Math.PI ? "rotate(180)" : null)
        .text(d => d.data.name);

    // Add node info and highlight logic
    node.on("mouseover", function(event, d) {
        // Populate the ode info  with the node's data
        document.getElementById('search-result').innerText = `Node Name: ${d.data.name}\nSync Solution: ${d.data.local_sync_solution || 'N/A'}\nRouter Platform: ${d.data.local_ip_transport_site_router_platform || 'N/A'}\nRouter Layer: ${d.data.local_ip_transport_site_router_layer || 'N/A'}\nUpper Sync Source: ${d.data.upper_sync_source_site_name || 'N/A'}`;

        // Get all ancestors and descendants of the hovered node
        const ancestors = getAncestors(d);
        const descendants = getDescendants(d);
        const relatedNodes = [...ancestors, d, ...descendants];

        // Fade out all unrelated nodes
        node.style("opacity", function(o) {
            return relatedNodes.includes(o) ? 1 : 0.2;
        });

        // Fade out all unrelated links
        link.style("opacity", function(o) {
            return relatedNodes.includes(o.source) && relatedNodes.includes(o.target) ? 1 : 0.2;
        });

    })
    .on("mousemove", function(event) {
        // Update tooltip position as the mouse moves

    })
    .on("mouseout", function() {
        // Restore full opacity for all nodes
        node.style("opacity", 1);
        link.style("opacity", 1);
    });

    // Add legends based on the current view
    if (currentView === 'blockTypes') {
        addBlockTypesLegend(svg, radius, projectStats.total_blocked_locally, projectStats.blocked_by_parents_design, projectStats.pending_parents_sync, projectStats.pending_transmission, projectStats.total_affected_by_parent, projectStats.ready_by_design, projectStats.in_sync_sites_count);
    } else if (currentView === 'sowAndTech') {
        addSowAndTechLegend(svg, radius, projectStats.total_sow_and_tech_data, projectStats.total_sow_no_tech_data, projectStats.total_doable_no_sow, projectStats.total_blocked_sites);
    }
}

// Handle Node Search Form Submission
document.getElementById('search-node-form').addEventListener('submit', function (e) {
    e.preventDefault(); // Prevent form from submitting the default way

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

function addBlockTypesLegend(svg, radius, totalBlockedLocally, blockedByParentsDesign, pendingParentsSync, pendingTransmission, totalAffectedByParent, readyByDesign, inSyncSitesCount) {

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
        .attr("transform", (d, i) => `translate(${radius - 650},${radius - 680 + i * 25})`);

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
        .attr("x", radius - 650)
        .attr("y", radius - 700)
        .attr("dy", ".35em")
        .style("text-anchor", "start")
        .style("font-weight", "bold")
        .text("Node Legend:");

    const linkLegend = svg.selectAll(".link-legend")
        .data(Object.keys(solnLegnedColorMap))
        .enter().append("g")
        .attr("class", "legend")
        .attr("transform", (d, i) => `translate(${radius - 650},${radius - 610 + (i + 7) * 20})`);

    linkLegend.append("line")
        .attr("x1", 0)
        .attr("y1", 0)
        .attr("x2", 18)
        .attr("y2", 0)
        .style("stroke-width", 4)
        .style("stroke", d => solnLegnedColorMap[d]);

    linkLegend.append("text")
        .attr("x", 25)
        .attr("y", 5)
        .attr("dy", ".35em")
        .style("text-anchor", "start")
        .text(d => d);

    svg.append("text")
        .attr("x", radius - 650)
        .attr("y", radius - 500)
        .attr("dy", ".35em")
        .style("text-anchor", "start")
        .style("font-weight", "bold")
        .text("Link Legend:");
}

function addSowAndTechLegend(svg, radius, totalSowAndTechData, totalSowNoTechData, totalDoableNoSow, totalBlockedSites) {
    const nodeLegend = svg.selectAll(".node-legend")
        .data([
            { label: `Blocked Sites: ${totalBlockedSites}`, color: 'red' },
            { label: `SOW Issued, Tech Data Not Provided: ${totalSowNoTechData}`, color: 'LightGreen' },
            { label: `SOW Issued & Tech Data Provided: ${totalSowAndTechData}`, color: 'green' },
            { label: `Pending SOW Issuance: ${totalDoableNoSow}`, color: 'orange' },
            { label: 'Grand Master Clock', color: 'RoyalBlue' }
        ])
        .enter().append("g")
        .attr("class", "legend")
        .attr("transform", (d, i) => `translate(${radius - 250},${radius - 180 + i * 20})`);

    nodeLegend.append("path")
        .attr("d", d => d.label === 'Grand Master Clock' ? d3.symbol().type(d3.symbolSquare).size(200)() : d3.symbol().type(d3.symbolCircle).size(100)())
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
        .attr("x", radius - 250)
        .attr("y", radius - 200)
        .attr("dy", ".35em")
        .style("text-anchor", "start")
        .style("font-weight", "bold")
        .text("Node Legend:");

    const linkLegend = svg.selectAll(".link-legend")
        .data(Object.keys(solnLegnedColorMap))
        .enter().append("g")
        .attr("class", "legend")
        .attr("transform", (d, i) => `translate(${radius - 250},${radius - 145 + (i + 4) * 20})`);

    linkLegend.append("line")
        .attr("x1", 0)
        .attr("y1", 0)
        .attr("x2", 18)
        .attr("y2", 0)
        .style("stroke-width", 4)
        .style("stroke", d => solnLegnedColorMap[d]);

    linkLegend.append("text")
        .attr("x", 25)
        .attr("y", 5)
        .attr("dy", ".35em")
        .style("text-anchor", "start")
        .text(d => d);

    svg.append("text")
        .attr("x", radius - 250)
        .attr("y", radius - 85)
        .attr("dy", ".35em")
        .style("text-anchor", "start")
        .style("font-weight", "bold")
        .text("Link Legend:");
}


function exportSVG() {
    const svgElement = document.querySelector("svg");
    const serializer = new XMLSerializer();
    let source = serializer.serializeToString(svgElement);

    // Add XML declaration
    if (!source.match(/^<svg[^>]+xmlns="http:\/\/www\.w3\.org\/2000\/svg"/)) {
        source = source.replace(/^<svg/, '<svg xmlns="http://www.w3.org/2000/svg"');
    }
    if (!source.match(/^<svg[^>]+"http:\/\/www\.w3\.org\/1999\/xlink"/)) {
        source = source.replace(/^<svg/, '<svg xmlns:xlink="http://www.w3.org/1999/xlink"');
    }

    // Create a file blob of our SVG.
    const blob = new Blob([source], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);

    // Create a link to download the SVG
    const downloadLink = document.createElement("a");
    downloadLink.href = url;
    downloadLink.download = "tree_visualization.svg";

    // Simulate a click on the link to trigger the download
    document.body.appendChild(downloadLink);
    downloadLink.click();

    // Clean up the URL object
    document.body.removeChild(downloadLink);
    URL.revokeObjectURL(url);
}

function showSection(sectionId) {
    // Hide all sections
    const sections = document.querySelectorAll('.section');
    sections.forEach(section => {
        section.style.display = 'none';
    });

    // Show the selected section
    document.getElementById(sectionId).style.display = 'block';

    if (sectionId === 'reports') {
        // Show charts in main content instead of tree visualization
        document.getElementById('diagram').style.display = 'none';
        document.getElementById('chart-container').style.display = 'block';
        document.getElementById('main-content-title').innerText = 'Project Progress Charts';

        // Generate progress charts
        generateProgressCharts();
    } else {
        // Show the tree visualization for other views
        document.getElementById('diagram').style.display = 'block';
        document.getElementById('chart-container').style.display = 'none';
        document.getElementById('main-content-title').innerText = 'Tree Visualization';
    }
}

function generateProgressCharts() {
    const ctxOverall = document.getElementById('overall-progress-chart').getContext('2d');
    const regionChartsContainer = document.getElementById('region-charts-container');

    // Destroy existing charts if they exist
    if (overallChartInstance) {
        overallChartInstance.destroy();
    }
    regionChartInstances.forEach(chart => chart.destroy());
    regionChartInstances = [];

    // Generate overall progress chart (Bar chart)
    overallChartInstance = new Chart(ctxOverall, {
        type: 'bar',
        data: {
            labels: ['Implemented Sites', 'Ready', 'Blocked'],
            datasets: [{
                label: 'Overall Project Progress',
                data: [projectStats.in_sync_sites_count, projectStats.ready_by_design, projectStats.total_blocked_sites],
                backgroundColor: [
                    'rgba(75, 192, 192, 0.2)',  // Implemented Sites
                    'rgba(54, 162, 235, 0.2)',  // Ready
                    'rgba(255, 159, 64, 0.2)',  // Blocked by Parent
                ],
                borderColor: [
                    'rgba(75, 192, 192, 1)',
                    'rgba(54, 162, 235, 1)',
                    'rgba(255, 159, 64, 1)',
                ],
                borderWidth: 1
            }]
        },
        options: {
            scales: {
                y: {
                    beginAtZero: true
                }
            }
        }
    });

    // Generate pie charts per region (one for each region)
    const regions = ['Region 1', 'Region 2', 'Region 3', 'Region 4', 'Region 5'];
    const regionData = [
        { "implemented_sites_count": 1, "ready": 20, "total_blocked_by_parent": 40, "total_blocked_locally": 10 },
        { "implemented_sites_count": 0, "ready": 15, "total_blocked_by_parent": 50, "total_blocked_locally": 5 },
        { "implemented_sites_count": 1, "ready": 18, "total_blocked_by_parent": 30, "total_blocked_locally": 8 },
        { "implemented_sites_count": 0, "ready": 10, "total_blocked_by_parent": 60, "total_blocked_locally": 15 },
        { "implemented_sites_count": 0, "ready": 9, "total_blocked_by_parent": 33, "total_blocked_locally": 15 }
    ];

    regionChartsContainer.innerHTML = ''; // Clear previous region charts

    regions.forEach((region, index) => {
        const canvas = document.createElement('canvas');
        canvas.id = `region-progress-chart-${index}`;
        regionChartsContainer.appendChild(canvas);

        const ctx = canvas.getContext('2d');
        const regionInfo = regionData[index];

        const chart = new Chart(ctx, {
            type: 'pie',
            data: {
                labels: ['Implemented Sites', 'Ready', 'Blocked by Parent', 'Blocked Locally'],
                datasets: [{
                    label: `${region} Site Distribution`,
                    data: [regionInfo.implemented_sites_count, regionInfo.ready, regionInfo.total_blocked_by_parent, regionInfo.total_blocked_locally],
                    backgroundColor: [
                        'rgba(75, 192, 192, 0.6)',  // Implemented Sites
                        'rgba(54, 162, 235, 0.6)',  // Ready
                        'rgba(255, 159, 64, 0.6)',  // Blocked by Parent
                        'rgba(255, 99, 132, 0.6)'   // Blocked Locally
                    ],
                    borderColor: [
                        'rgba(75, 192, 192, 1)',
                        'rgba(54, 162, 235, 1)',
                        'rgba(255, 159, 64, 1)',
                        'rgba(255, 99, 132, 1)'
                    ],
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    legend: {
                        position: 'bottom',
                    },
                    tooltip: {
                        enabled: true
                    }
                }
            }
        });

        regionChartInstances.push(chart);
    });
}

window.onload = setView('blockTypes');
