let currentView = 'blockTypes';
let treeDataCache = null; // Store the tree data for updating nodes
let barChartInstance = null; // Chart.js instance for bar chart
let pieChartInstance = null; // Chart.js instance for pie chart

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
    fetchTreeData();

    // Show the tree visualization
    document.getElementById('diagram').style.display = 'block';
    document.getElementById('progress-bar-chart').style.display = 'none';
    document.getElementById('completion-pie-chart').style.display = 'none';
    document.getElementById('main-content-title').innerText = 'Tree Visualization';

}

function updateViewName() {
    const viewName = currentView === 'blockTypes' ? 'Block Types' : 'SOW Issuance & Tech Data';
}

// Function to determine if a node is blocked by a parent
function isBlockedByParent(node) {
    let currentNode = node;
    while (currentNode.parent) {
        if (!currentNode.parent.data.IPMPLSsyncDone && currentNode.parent.data.localSiteDomain === "IPMPLS" && (['Dedicated DF', 'In-Band' ].includes(currentNode.data.syncSolution) || ['Dedicated DF', 'In-Band'].includes(currentNode.parent.data.syncSolution))) {
            return true;
        }
        currentNode = currentNode.parent;
    }
    return false;
}

// Recursive function to apply colors based on the current view
function applyDoabilityColor(node) {
    if (currentView === 'blockTypes') {
        if (!node.data.localSiteDoability) {
            node.color = 'red';  // Blocked
        } else if (node.data.IPMPLSsyncDone) {
                node.color = 'LimeGreen';  // Blocked by Parent
        } else if (isBlockedByParent(node)) {
                node.color = 'RoyalBlue';  // Blocked by Parent
        } else {
            node.color = 'RoyalBlue';  // Doable
        }
    } else if (currentView === 'sowAndTech') {
        // In this view, all blocked sites and those blocked by a parent are treated as blocked
        if (!node.data.localSiteDoability) {
            node.color = 'red';  // Treat as blocked
        } else if (isBlockedByParent(node)) {
            node.color = 'red';  // Blocked by Parent
        } else {
            if (node.data.ScopeOfWork && node.data.techDataProvided) {
                node.color = 'green';  // SOW Issued and Tech Data Provided
            } else if (node.data.ScopeOfWork && !node.data.techDataProvided) {
                node.color = 'LightGreen';  // SOW Issued but Tech Data Not Provided
            } else {
                node.color = 'orange';  // Pending SOW Issuance
            }
        }
    }

    // Recursively apply this logic to all children
    if (node.children) {
        node.children.forEach(child => applyDoabilityColor(child));
    }
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

function generateReport() {
    const reportType = document.getElementById('report-dropdown').value;
    window.open(`http://localhost:5000/api/report?type=${reportType}`, '_blank');
}


// Function to count blocked root sites, affected leaves, and categorized doable sites
function countBlockedAndAffectedNodes(nodes) {
    let allRootSitesCount = 0;
    let allRootSitesNames = [];
    let inSyncSitesCount = 0;
    let blockedRootSitesCount = 0;
    let blockedRootSitesNames = [];
    let blockedLeaves = 0;
    let blockedIssuedSow = 0;
    let readyByDesign = 0;
    let totalBlockedLocally = 0;
    let totalBlockedSites = 0;
    let totalAffectedByParent = 0;
    let totalSowAndTechData = 0;
    let totalSowNoTechData = 0;
    let totalDoableNoSow = 0;

    nodes.each(function(node) {
        if (node.data.IPMPLSsyncDone){
            inSyncSitesCount += 1;
        }
        if (node.children && node.children.length > 0) {
            let childNodeList = node.children;
            for (let childNode of childNodeList) {
                if (['Dedicated DF', 'In-Band' ].includes(childNode.data.syncSolution)) {
                    allRootSitesCount += 1;
                    allRootSitesNames.push(node.data.name);
                }
            }
        }
        if (node.data.localSiteDomain === 'IPMPLS' && !node.data.localSiteDoability) {
            totalBlockedLocally += 1;
            totalBlockedSites += 1;
            if (node.children && node.children.length > 0 && ['Dedicated DF', 'In-Band' ].includes(node.data.syncSolution)) {
                for (let childNode of node.children) {
                    if (['Dedicated DF', 'In-Band' ].includes(childNode.syncSolution)) {
                        blockedRootSitesCount += 1;
                        blockedRootSitesNames.push(node.data.name);
                    }
                }
            } else {
                blockedLeaves += 1;
            }
            if (node.data.ScopeOfWork) {
                blockedIssuedSow += 1;
            }
        } else if (node.data.localSiteDomain === 'IPMPLS' && node.data.localSiteDoability && isBlockedByParent(node)) {
            // Node is Doable but has a blocked parent
            totalAffectedByParent += 1;
            totalBlockedSites += 1;
            if (node.data.ScopeOfWork) {
                blockedIssuedSow += 1;
            }
        } else if (node.data.localSiteDomain === 'IPMPLS' && node.data.localSiteDoability && !isBlockedByParent(node)) {
            readyByDesign += 1;
            if (node.data.localSiteDomain === 'IPMPLS' && node.data.ScopeOfWork && node.data.techDataProvided) {
                totalSowAndTechData += 1;
            } else if (node.data.ScopeOfWork && !node.data.techDataProvided) {
                totalSowNoTechData += 1;
            } else {
                totalDoableNoSow += 1;
            }
        }
    });
    return {
        allRootSitesCount,
        allRootSitesNames,
        inSyncSitesCount,
        blockedRootSitesCount,
        blockedRootSitesNames,
        blockedLeaves,
        blockedIssuedSow,
        totalBlockedLocally,
        totalBlockedSites,
        readyByDesign,
        totalAffectedByParent,
        totalSowAndTechData,
        totalSowNoTechData,
        totalDoableNoSow
    };
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

// Handle Node Update Form Submission
document.getElementById('update-node-form').addEventListener('submit', function (e) {
    e.preventDefault(); // Prevent form from submitting the default way

    const nodeId = document.getElementById('node-id').value;
    const newName = document.getElementById('node-name').value;
    const newType = document.getElementById('node-type').value;

    updateNodeInformation(nodeId, newName, newType);
});

function updateNodeInformation(nodeId, newName, newType) {
    if (!treeDataCache) {
        console.error('Tree data not loaded.');
        return;
    }

    // Find the node by ID and update its information
    const node = findNodeById(treeDataCache, nodeId);
    if (node) {
        node.name = newName || node.name;
        node.type = newType || node.type;

        // Re-render the tree with updated data
        d3.select("svg").remove();
        const svg = d3.select("#diagram").append("svg")
            .attr("width", 1000)
            .attr("height", 1000);

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
    applyDoabilityColor(nodes);

    nodes = tree(nodes);


    // Calculate the summary counts
    const {
        allRootSitesCount,
        allRootSitesNames,
        inSyncSitesCount,
        blockedRootSitesCount,
        blockedRootSitesNames,
        blockedLeaves,
        blockedIssuedSow,
        totalBlockedLocally,
        totalBlockedSites,
        readyByDesign,
        totalAffectedByParent,
        totalSowAndTechData,
        totalSowNoTechData,
        totalDoableNoSow
    } = countBlockedAndAffectedNodes(nodes);

    const link = svg.append("g")
        .selectAll(".link")
        .data(nodes.links().filter(d => d.source.data.name !== "GPS"))  // Exclude links from the virtual root
        .enter().append("path")
        .attr("class", "link")
        .attr("d", d3.linkRadial()
            .angle(d => d.x)
            .radius(d => d.y))
        .style("stroke", d => solnColorMap[d.target.data.syncSolution] || '#888')
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
        .attr("r", d => d.data.localSiteDomain === 'DWDM' ? 0 : 5)  // Set circle radius to 0 for DWDM domain
        .style("fill", d => d.color);

    // Add a distinct symbol (e.g., star) for nodes "Local to DWDM" to represent the Grand Master clock
    node.filter(d => d.data.localSiteDomain === 'DWDM')  // Filter nodes with "Local to DWDM"
        .append("path")
        .attr("d", d3.symbol().type(d3.symbolTriangle).size(60))  // Triangle symbol
        .attr("transform", "translate(0, 0)")  // Position the symbol to the right of the circle
        .style("fill", d => d.data.DWDMSyncDone ? "LimeGreen" : "RoyalBlue")  // Dedicated color for the DWDM
        .style("stroke", "steelblue")
        .style("stroke-width", 0.01);

    // Add a distinct symbol (e.g., star) for nodes "Local to GM" to represent the Grand Master clock
    node.filter(d => d.data.syncSolution === 'Local to GM' && d.data.localSiteDomain === 'IPMPLS')  // Filter nodes with "Local to GM"
        .append("path")
        .attr("d", d3.symbol().type(d3.symbolSquare).size(200))  // Square symbol
        .attr("transform", "translate(-20, 0)")  // Position the symbol to the right of the circle
        .style("fill", d => d.data.DWDMSyncDone ? "LimeGreen" : "RoyalBlue")  // Dedicated color for the Grand Master clock
        .style("stroke", "steelblue")
        .style("stroke-width", 0.01);

    // Add a distinct symbol (e.g., star) for nodes "Local to DWDM" to represent the Grand Master clock
    node.filter(d => d.data.syncSolution === 'Local to DWDM' && d.data.localSiteDomain === 'IPMPLS')  // Filter nodes with "Local to DWDM"
        .append("path")
        .attr("d", d3.symbol().type(d3.symbolTriangle).size(60))  // Triangle symbol
        .attr("transform", "translate(-15, 0)" )  // Position the symbol to the right of the circle
        //.attr("transform",  d => 'rotate(270) translate(-15,0)')
        .style("fill", d => d.data.DWDMSyncDone ? "LimeGreen" : "RoyalBlue")  // Dedicated color for the DWDM
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
        document.getElementById('node-info-content').innerText = `Node Name: ${d.data.name}\nType: ${d.data.type || 'N/A'}`;

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
        addBlockTypesLegend(svg, radius, totalBlockedLocally, totalAffectedByParent, readyByDesign, inSyncSitesCount);
    } else if (currentView === 'sowAndTech') {
        addSowAndTechLegend(svg, radius, totalSowAndTechData, totalSowNoTechData, totalDoableNoSow, totalBlockedSites);
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
        searchResultDiv.innerText = `Node Name: ${node.name}\nType: ${node.type || 'N/A'}`;
    } else {
        searchResultDiv.innerText = 'Node not found';
    }
});

function addBlockTypesLegend(svg, radius, totalBlockedLocally, totalAffectedByParent, readyByDesign, inSyncSitesCount) {

    const nodeLegend = svg.selectAll(".node-legend")
        .data([
            { label: `IPMPLS InSync: ${inSyncSitesCount}`, color: 'LimeGreen' },
            { label: `IPMPLS Blocked: ${totalBlockedLocally}`, color: 'red' },
            { label: `IPMPLS Ready: ${readyByDesign - inSyncSitesCount} + Blocked by Parent: ${totalAffectedByParent}`, color: 'RoyalBlue' },
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
        .attr("transform", (d, i) => `translate(${radius - 650},${radius - 660 + (i + 7) * 20})`);

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
        .attr("y", radius - 550)
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
        document.getElementById('progress-bar-chart').style.display = 'block';
        document.getElementById('completion-pie-chart').style.display = 'block';
        document.getElementById('main-content-title').innerText = 'Project Progress Charts';

        // Generate progress charts
        generateProgressBarChart();
        generateCompletionPieChart();
    } else {
        // Show the tree visualization for other views
        document.getElementById('diagram').style.display = 'block';
        document.getElementById('progress-bar-chart').style.display = 'none';
        document.getElementById('completion-pie-chart').style.display = 'none';
        document.getElementById('main-content-title').innerText = 'Tree Visualization';
    }
}

function generateProgressBarChart() {
    const ctx = document.getElementById('progress-bar-chart').getContext('2d');

    if (barChartInstance) {
        barChartInstance.destroy(); // Destroy existing chart if it exists
    }

    barChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: ['Blocked Sites', 'SOW Issued No Parent', 'SOW Issued Blocked Parent', 'No Blockage', 'Transport Ports'],
            datasets: [{
                label: 'Project Progress',
                data: [12, 19, 3, 5, 2], // Sample data, replace with dynamic data as needed
                backgroundColor: [
                    'rgba(255, 99, 132, 0.2)',
                    'rgba(54, 162, 235, 0.2)',
                    'rgba(255, 206, 86, 0.2)',
                    'rgba(75, 192, 192, 0.2)',
                    'rgba(153, 102, 255, 0.2)'
                ],
                borderColor: [
                    'rgba(255, 99, 132, 1)',
                    'rgba(54, 162, 235, 1)',
                    'rgba(255, 206, 86, 1)',
                    'rgba(75, 192, 192, 1)',
                    'rgba(153, 102, 255, 1)'
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
}

function generateCompletionPieChart() {
    const ctx = document.getElementById('completion-pie-chart').getContext('2d');

    if (pieChartInstance) {
        pieChartInstance.destroy(); // Destroy existing chart if it exists
    }

    pieChartInstance = new Chart(ctx, {
        type: 'pie',
        data: {
            labels: ['Completed', 'In Progress', 'Pending'],
            datasets: [{
                label: 'Completion Status',
                data: [25, 50, 25], // Sample data, replace with dynamic data as needed
                backgroundColor: [
                    'rgba(75, 192, 192, 0.6)',
                    'rgba(255, 159, 64, 0.6)',
                    'rgba(255, 99, 132, 0.6)'
                ],
                borderColor: [
                    'rgba(75, 192, 192, 1)',
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
                    position: 'top',
                }
            }
        }
    });
}

window.onload = setView('blockTypes');
