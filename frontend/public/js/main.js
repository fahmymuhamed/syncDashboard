
// Color mapping for Soln values
const solnColorMap = {
    'Local to GM': '#000000',       // black
    'Dedicated DF': '#808080',      // Gray
    'In-Band': '#008000',           // Green
    'Local to DWDM': '#FFA500',     // Orange
    // Add more soln types as needed
};

let currentView = 'blockTypes'; // Default view

// Function to set the current view, update the view name, and re-render the tree
function setView(view) {
    currentView = view;
    updateViewName();
    d3.select("svg").remove(); // Remove existing tree
    d3.json("tree_data.json").then(function(data) {
        createTree(data);
    });
}

// Function to update the view name displayed on the page
function updateViewName() {
    const viewName = currentView === 'blockTypes' ? 'Block Types' : 'SOW Issuance & Tech Data';
    document.getElementById('view-name').innerText = `Current View: ${viewName}`;
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


// Function to determine if a node is blocked by a parent
function isBlockedByParent(node) {
    let currentNode = node;
    while (currentNode.parent) {
        if (!currentNode.parent.data.localSiteDoability && currentNode.parent.data.localSiteDomain === "IPMPLS" && (['Dedicated DF', 'In-Band' ].includes(currentNode.data.syncSolution) || ['Dedicated DF', 'In-Band'].includes(currentNode.parent.data.syncSolution))) {
            return true;
        }
        currentNode = currentNode.parent;
    }
    return false;
}

// Function to determine the parents with no SOW if any
function noSowParents(node) {
    let noSowParentscount = 0;
    let noSowParentsnames = [];
    let currentNode = node;
    while (currentNode.parent) {
        if (!currentNode.parent.data.ScopeOfWork  && currentNode.parent.data.localSiteDomain === "IPMPLS") {
            noSowParentscount += 1;
            noSowParentsnames.push(currentNode.parent.data.name);
        }
        currentNode = currentNode.parent;
    }
    return {
        noSowParentscount,
        noSowParentsnames
    };
}

// Function to determine if a node has a parent with no SOW
function hasnoSowParents(node) {
    let currentNode = node;
    while (currentNode.parent) {
        if (!currentNode.parent.data.ScopeOfWork  && currentNode.parent.data.localSiteDomain === "IPMPLS" && (['Dedicated DF', 'In-Band' ].includes(currentNode.data.syncSolution) || ['Dedicated DF', 'In-Band'].includes(currentNode.parent.data.syncSolution))) {
            return true;
        }
        currentNode = currentNode.parent;
    }
    return false;
}

// Function to determine if a node or any of its parents has an "In-Band" solution
function hasInBandSoln(node) {
    let currentNode = node;
    while (currentNode) {
        if (currentNode.data.syncSolution === 'In-Band') {
            return true;
        }
        currentNode = currentNode.parent;
    }
    return false;
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


function createTree(treeData) {
    const width = 3000;
    const height = 3000;
    const radius = Math.min(width, height) / 2;

    const tree = d3.tree()
        .size([2 * Math.PI, radius - 300])
        .separation((a, b) => (a.parent === b.parent ? 1 : 2) / a.depth);

    const svg = d3.select("#diagram").append("svg")
        .attr("width", width)
        .attr("height", height)
        .call(d3.zoom().on("zoom", function (event) {
            svg.attr("transform", event.transform);
        }))
        .append("g")
        .attr("transform", `translate(${width / 2},${height / 2})`);

    // Append a tooltip div to the body (initially hidden)
    const tooltip = d3.select("body")
        .append("div")
        .attr("class", "tooltip");

    let nodes = d3.hierarchy(treeData, d => d.children);
    applyDoabilityColor(nodes);
    nodes = tree(nodes);

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

    // Add tooltip functionality and highlight logic
    node.on("mouseover", function(event, d) {
        // Populate the tooltip with the node's data
        tooltip.html(`
            <strong>SiteID</strong> ${d.data.name} <br/>
            <strong>Devices Per Site</strong> ${d.data.siteDevicesCount || 'N/A'} <br/>
            <strong>Platform</strong> ${d.data.localSiteRouterPlatform || 'N/A'} <br/>
            <strong>Doability</strong> ${d.data.localSiteDoability || 'N/A'}
        `)
        .style("visibility", "visible");

        // Position the tooltip near the cursor
        tooltip.style("left", (event.pageX + 10) + "px")
               .style("top", (event.pageY - 30) + "px");

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
        tooltip.style("left", (event.pageX + 10) + "px")
               .style("top", (event.pageY - 30) + "px");
    })
    .on("mouseout", function() {
        // Hide the tooltip when the mouse leaves the node
        tooltip.style("visibility", "hidden");

        // Restore full opacity for all nodes
        node.style("opacity", 1);
        link.style("opacity", 1);
    });


}

// Load tree data on page load
d3.json("http://localhost:5000/api/tree").then(function(data) {
    createTree(data);
});
