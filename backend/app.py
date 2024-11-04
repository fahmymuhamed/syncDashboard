from pickle import FALSE

import pandas as pd
from anytree import Node, LevelOrderIter
from anytree.exporter import JsonExporter
from anytree import Node, PreOrderIter, LevelOrderIter, RenderTree
import pandas as pd
from anytree import Node, PreOrderIter, LevelOrderIter, RenderTree
from anytree.exporter import JsonExporter
from flask import Flask, jsonify, send_file, request
from flask_cors import CORS
from copy import deepcopy
import logging
import os
import io
import csv

# Set up logging
logging.basicConfig(level=logging.INFO)

app = Flask(__name__)
CORS(app)

import json
import os

# Load configuration from environment variables
data_file_path = os.getenv('DATA_FILE_PATH', 'data/map_v4.6.xlsx')  # Default to 'data/map_v4.2.xlsx' if not set

# Load the Excel data once at startup to avoid loading repeatedly
df = pd.read_excel(data_file_path, sheet_name='Sheet1', dtype=object)

# Build the main GPS root node
gps_root = Node("GPS", local_node_domain="DWDM", local_transmission_in_sync=True, local_node_doable=True,
                design_color='black', level=0, implementation_color='black', total_radio_site_count=0)

# Create JsonExporter to export tree in JSON format
exporter = JsonExporter(indent=4, sort_keys=True, default=lambda obj: getattr(obj, '__dict__', str(obj)))


# Define the roots dynamically where local_sync_solution == 'Local to GM'
roots = df[df['local_sync_solution'] == 'GNSS']['local_node_name'].tolist()
regions = df[df['local_sync_solution'] == 'GNSS']['local_node_region'].unique().tolist()
blockages_list = df[df['local_node_domain'] == 'IPMPLS']['local_node_high_level_cat'].unique().tolist()

region_nodes = {}

# Create a function to build the hierarchical structure dynamically using anytree
def build_tree():
    global gps_root, region_nodes
    gps_root = Node("GPS", local_node_domain="DWDM", local_transmission_in_sync=True, local_node_doable=True, design_color='black', implementation_color='black', total_radio_site_count=0)
    region_nodes = {}
    for region in regions:
        region_nodes[region] = Node(region, parent=gps_root, local_node_domain="REGION", local_sync_solution="Imaginary Link", local_transmission_in_sync=True, local_node_doable=True, design_color='black', implementation_color='black', total_radio_site_count=0)
    for root in roots:
        region = df[df['local_node_name'] == root]['local_node_region'].values[0]
        # Get information for the current root node
        node_info = df[df['local_node_name'] == root].iloc[0].to_dict()
        # Create a node for the current site with attributes
        node = Node(root, parent=region_nodes[region], grand_master_site_name=root, design_color='black', implementation_color='black', total_radio_site_count=0, **{k: v for k, v in node_info.items()})
        # Recursively build child nodes
        children_df = df[df['upper_sync_source_node_name'] == root]
        children = children_df['local_node_name'].tolist()
        for child in children:
            build_subtree(root, child, node)

def build_subtree(grand_master_site_name, root_name, parent_node):
    # Get information for the current root node
    node_info = df[df['local_node_name'] == root_name].iloc[0].to_dict()
    # Create a node for the current site with attributes
    node = Node(root_name, parent=parent_node, grand_master_site_name=grand_master_site_name, design_color='black', implementation_color='black', total_radio_site_count=0, **{k: v for k, v in node_info.items()})
    # Recursively build child nodes
    children_df = df[df['upper_sync_source_node_name'] == root_name]
    children = children_df['local_node_name'].tolist()
    for child in children:
        build_subtree(grand_master_site_name, child, node)

# Initial tree build
build_tree()


def assign_phases(root):
    # Recursive function to traverse the nodes by phases
    def traverse_node(node, current_phase, first_not_doable_encountered=False):
        if not hasattr(node, 'local_node_doable'):
            return  # Skip nodes without the required attribute

        # Set the phase attribute for the current node
        if node.local_node_doable:
            node.phase = current_phase
            node.is_first_not_doable = False
            # Continue with the same phase for doable children
            for child in node.children:
                traverse_node(child, current_phase, first_not_doable_encountered=False)
        else:
            # Mark as first "not doable" node if this is the first in the phase
            if not first_not_doable_encountered:
                node.is_first_not_doable = True
                first_not_doable_encountered = True
            else:
                node.is_first_not_doable = False

            # Increment the phase for non-doable nodes and their children
            next_phase = current_phase + 1
            node.phase = next_phase
            for child in node.children:
                traverse_node(child, next_phase, first_not_doable_encountered=False)

    # Start traversing from the root
    traverse_node(root, current_phase=1)


# Assign phases to nodes
assign_phases(gps_root)

# Function to determine if a node is blocked by its parent
def is_blocked_by_parent_sync(node):
    current_node = node
    while current_node.parent:
        parent = current_node.parent
        if (not getattr(parent, 'local_ip_transport_in_sync', False) and getattr(parent, 'local_node_domain', None) == "IPMPLS" and
                (getattr(current_node, 'local_sync_solution', None) in ["Dedicated DF", "In-Band", "MPLS Collocated"] or getattr(parent, 'local_sync_solution', None) in ["Dedicated DF", "In-Band", "MPLS Collocated"])):
            return True
        current_node = parent
    return False

# Function to determine if a node is blocked by its parent
def is_blocked_by_parent_design(node):
    current_node = node
    while current_node.parent:
        parent = current_node.parent
        if (not getattr(parent, 'local_node_doable', False) and getattr(parent, 'local_node_domain', None) == "IPMPLS" and
                (getattr(current_node, 'local_sync_solution', None) in ["Dedicated DF", "In-Band", "MPLS Collocated"] or getattr(parent, 'local_sync_solution', None) in ["Dedicated DF", "In-Band", "MPLS Collocated"])):
            return True
        current_node = parent
    return False

# Function to get descendants up to a certain level, optionally with a specific attribute,
# and excluding blocked nodes and their children if block_attr is set.
def get_descendants(node, attribute=None, block_attr=None):
    descendants = []
    for child in node.children:
        # Skip if block_attr is set and the node is blocked
        if block_attr and not getattr(child, block_attr, False):
            continue
        # Include the attribute if specified, otherwise include the child node itself
        if attribute and hasattr(child, attribute):
            descendants.append(getattr(child, attribute))
        else:
            descendants.append(child)
        # Recursively add the descendants based on block_attr
        descendants.extend(get_descendants(child, attribute, block_attr))
    return descendants

# Function to get ancestors up to a certain level
def get_ancestors(node, attribute=None):
    ancestors = []
    current = node
    level = 0
    while current.parent is not None:
        ancestors.append(current.parent)
        current = current.parent
    ancestors.reverse()
    # Return specific attribute if requested
    if attribute:
        return [getattr(ancestor, attribute, None) for ancestor in ancestors]
    return ancestors

# Function to apply colors to the nodes based on certain criteria
def apply_node_colors(tree_root):

    for node in LevelOrderIter(tree_root):
        if getattr(node, 'local_node_domain', None) == "IPMPLS":
            node.total_indirect_site_count = sum(get_descendants(node, attribute="local_node_radio_sites_count"))
        if getattr(node, 'local_node_domain', None) == "IPMPLS" and getattr(node, 'local_ip_transport_in_sync', False):
            node.implementation_color = 'LimeGreen'  # In Sync
            node.design_color = 'LimeGreen'  # In Sync
        elif getattr(node, 'local_node_domain', None) == "IPMPLS" and not getattr(node, 'local_node_doable', False):
            node.implementation_color = 'red'  # Blocked
            node.design_color = 'red'  # Blocked
        elif getattr(node, 'local_node_domain', None) == "IPMPLS" and is_blocked_by_parent_design(node):
            node.implementation_color = 'red'  # Blocked by Parent
            node.design_color = 'RoyalBlue'  # Blocked by Parent
        elif getattr(node, 'local_node_domain', None) == "IPMPLS" and is_blocked_by_parent_sync(node):
            node.implementation_color = 'Gray'  # Blocked by Parent
            node.design_color = 'RoyalBlue'  # Blocked by Parent
        elif getattr(node, 'local_node_domain', None) == "IPMPLS":
            if getattr(node, 'local_sync_solution', None) in ["Local to DWDM", "Local to GM"] and not getattr(node, 'local_transmission_in_sync', False):
                node.implementation_color = 'Orange'  # Doable
                node.design_color = 'RoyalBlue'  # Doable
            elif getattr(node, 'local_sync_solution', None) == "Dedicated DF" and getattr(node, 'upper_sync_source_site_domain', None) == "DWDM" and not getattr(node.parent, 'local_transmission_in_sync', False):
                node.implementation_color = 'Orange'  # Doable
                node.design_color = 'RoyalBlue'  # Doable
            else:
                node.implementation_color = 'RoyalBlue'  # Doable
                node.design_color = 'RoyalBlue'  # Doable
        else:
            node.implementation_color = 'Black'  # Dropped from logic
            node.design_color = 'Black'  # Dropped from logic


# Function to determine if a node is blocked by its parent
def has_dependency_on_parent(node):
    current_node = node
    while current_node.parent:
        parent = current_node.parent
        current_solution = getattr(current_node, 'local_sync_solution', None)
        parent_solution = getattr(parent, 'local_sync_solution', None)
        if current_solution in ["Dedicated DF", "In-Band", "MPLS Collocated"]  and getattr(current_node, 'local_node_domain', None) == "IPMPLS":
            return True
        elif parent_solution in ["Dedicated DF", "In-Band", "MPLS Collocated"] and getattr(parent, 'local_node_domain', None) == "IPMPLS":
            return True
        current_node = parent
    return False


# Function to determine the dependencies list
def dependencies_list(node):
    current_node = node
    local_node_name = getattr(node, 'local_node_name', None)
    local_node_domain = getattr(node, 'local_node_domain', None)
    local_sync_solution = getattr(current_node, 'local_sync_solution', None)
    dwdm_dependency = None
    dwdm_rediness = None
    ipmpls_dependency = None
    ipmpls_rediness = None

    if local_node_domain == "IPMPLS":
        if getattr(current_node, 'Upper_sync_source_domain', None) == "DWDM" and not has_dependency_on_parent(current_node):
            dwdm_dependency = f"{getattr(current_node, 'direct_parent', None)}"
            dwdm_rediness = f"{getattr(current_node, 'local_transmission_in_sync', FALSE)}"
        elif has_dependency_on_parent(current_node):
            if getattr(current_node, 'Upper_sync_source_domain', None) == "DWDM":
                dwdm_dependency = f"{getattr(current_node, 'direct_parent', None)}"
                dwdm_rediness = f"{getattr(current_node, 'local_transmission_in_sync', FALSE)}"
            while current_node.parent:
                parent = current_node.parent
                current_solution = getattr(current_node, 'local_sync_solution', None)
                parent_solution = getattr(parent, 'local_sync_solution', None)
                if current_solution in ["Dedicated DF", "In-Band", "MPLS Collocated"] and getattr(parent, 'local_node_domain', None) == "IPMPLS":
                    ipmpls_dependency = f"{getattr(parent, 'local_node_name', None)}"
                    ipmpls_rediness = f"{getattr(parent, 'local_node_doable', None)}"
                    break
                elif parent_solution in ["Dedicated DF", "In-Band", "MPLS Collocated"] and getattr(parent, 'local_node_domain', None) == "IPMPLS":
                    ipmpls_dependency = f"{getattr(parent, 'local_node_name', None)}"
                    ipmpls_rediness = f"{getattr(parent, 'local_node_doable', None)}"
                    break
                current_node = parent

    return [local_node_name, dwdm_dependency, dwdm_rediness, ipmpls_dependency, ipmpls_rediness]


# Define a template for the statistics dictionary
stats_template = {
    "total_nodes": 0,
    "in_sync_sites_count": 0,
    "pending_parents_sync": 0,
    "blocked_by_parents_design": 0,
    "pending_transmission": 0,
    "blocked_issued_sow": 0,
    "ready_by_design": 0,
    "total_blocked_locally": 0,
    "total_blocked_sites": 0,
    "total_affected_by_parent": 0,
    "total_sow_and_tech_data": 0,
    "total_sow_no_tech_data": 0,
    "total_doable_no_sow": 0
}

# Calculate project statistics based on the nodes
def calculate_project_stats(tree_root, region_nodes):
    # Initialize result dictionary for overall stats and region-specific stats
    result = {}
    result["overall"] = {}  # To store region-specific stats
    result["overall"] = deepcopy(stats_template)
    result["regions"] = {}  # To store region-specific stats

    # Define a function to update stats for a given node and stats dictionary
    def update_stats(node, stats):
        stats["total_nodes"] += 1 if getattr(node, 'local_node_domain', None) == "IPMPLS" else 0
        if getattr(node, 'local_node_domain', None) == "IPMPLS" and getattr(node, 'local_ip_transport_in_sync', False):
            stats["in_sync_sites_count"] += 1
        elif getattr(node, 'local_node_domain', None) == "IPMPLS" and not getattr(node, 'local_node_doable', False):
            stats["total_blocked_locally"] += 1
            stats["total_blocked_sites"] += 1
            if getattr(node, 'scope_of_work_issued', False):
                stats["blocked_issued_sow"] += 1
        elif getattr(node, 'local_node_domain', None) == "IPMPLS" and is_blocked_by_parent_design(node):
            stats["total_affected_by_parent"] += 1
            stats["total_blocked_sites"] += 1
            stats["blocked_by_parents_design"] += 1
        elif getattr(node, 'local_node_domain', None) == "IPMPLS" and is_blocked_by_parent_sync(node):
            stats["total_affected_by_parent"] += 1
            stats["total_blocked_sites"] += 1
            stats["pending_parents_sync"] += 1
            if getattr(node, 'scope_of_work_issued', False):
                stats["blocked_issued_sow"] += 1
        elif getattr(node, 'local_node_domain', None) == "IPMPLS" and getattr(node, 'local_sync_solution', None) in ["Local to DWDM", "Local to GM"] and not getattr(node, 'local_transmission_in_sync', False):
            stats['pending_transmission'] += 1
        elif getattr(node, 'local_sync_solution', None) == "Dedicated DF" and getattr(node, 'upper_sync_source_site_domain', None) == "DWDM" and not getattr(node.parent, 'local_transmission_in_sync', False):
            stats['pending_transmission'] += 1
        elif getattr(node, 'local_node_domain', None) == "IPMPLS":
            stats["ready_by_design"] += 1
            if getattr(node, 'scope_of_work_issued', False) and getattr(node, 'tech_data_provided', False):
                stats["total_sow_and_tech_data"] += 1
            elif getattr(node, 'scope_of_work_issued', False) and not getattr(node, 'tech_data_provided', False):
                stats["total_sow_no_tech_data"] += 1
            else:
                stats["total_doable_no_sow"] += 1

    # Calculate stats for the entire tree
    for node in LevelOrderIter(tree_root):
        update_stats(node, result["overall"])

    # Calculate stats for each region using region_nodes
    for region, nodes in region_nodes.items():
        region_stats = deepcopy(stats_template)
        for node in LevelOrderIter(nodes):
            update_stats(node, region_stats)

        # Store region stats in the result dictionary under the region name
        result["regions"][region] = region_stats

    return result


# API to serve tree data
@app.route('/api/tree', methods=['GET'])
def get_tree():
    try:
        apply_node_colors(gps_root)
        return exporter.export(gps_root)
    except Exception as e:
        logging.error(f"Error exporting tree: {e}")
        return jsonify({"error": "Unable to export tree"}), 500


# API to serve region-specific nodes
@app.route('/api/tree/region/<region>', methods=['GET'])
def get_region_nodes(region):
    try:
        if region in region_nodes:
            # Exporting the specified region node
            return exporter.export(region_nodes[region])
        else:
            return jsonify({"error": "Region not found"}), 404
    except Exception as e:
        logging.error(f"Error exporting region nodes: {e}")
        return jsonify({"error": "Unable to export region nodes"}), 500

# API to update the dataframe and Excel file
@app.route('/api/update', methods=['POST'])
def update_data():
    try:
        data = request.get_json()
        local_site_name = data.get("local_site_name")
        local_transmission_in_sync = data.get("local_transmission_in_sync")
        local_ip_transport_in_sync = data.get("local_ip_transport_in_sync")
        local_node_doable = data.get("local_node_doable")

        # Validate input
        if not local_site_name or local_transmission_in_sync is None or local_node_doable is None:
            return jsonify({"error": "Invalid input data"}), 400

        if not isinstance(local_transmission_in_sync, bool) or not isinstance(local_node_doable, bool):
            return jsonify({"error": "Invalid data type for boolean fields"}), 400

        # Update the dataframe
        if local_site_name in df["local_site_name"].values:
            df.loc[df["local_site_name"] == local_site_name, "local_transmission_in_sync"] = local_transmission_in_sync
            df.loc[df["local_site_name"] == local_site_name, "local_ip_transport_in_sync"] = local_ip_transport_in_sync
            df.loc[df["local_site_name"] == local_site_name, "local_node_doable"] = local_node_doable

            # Rewrite the updated dataframe to Excel
            df.to_excel(data_file_path, sheet_name='Sheet1', index=False)

            # Log the update
            logging.info(f"Data updated for site: {local_site_name}")

            # Update only the relevant part of the tree
            update_tree_node(local_site_name, local_ip_transport_in_sync, local_transmission_in_sync, local_node_doable)

            return jsonify({"message": "Data updated successfully"}), 200
        else:
            return jsonify({"error": "Site not found"}), 404
    except Exception as e:
        logging.error(f"Error updating data: {e}")
        return jsonify({"error": str(e)}), 500


def update_tree_node(local_site_name, local_ip_transport_in_sync, local_transmission_in_sync, local_node_doable):
    try:
        # Find the node to update
        node_to_update = next(node for node in gps_root.descendants if node.name == local_site_name)
        node_to_update.local_transmission_in_sync = local_transmission_in_sync
        node_to_update.local_ip_transport_in_sync = local_ip_transport_in_sync
        node_to_update.local_node_doable = local_node_doable
        logging.info(f"Tree node updated for site: {local_site_name}")
    except StopIteration:
        logging.error(f"Node not found in tree for site: {local_site_name}")

# API to serve progress metrics
@app.route('/api/project_stats', methods=['GET'])
def get_progress():
    return jsonify(calculate_project_stats (gps_root, region_nodes))

# Report generation endpoint
@app.route('/api/report', methods=['GET'])
def get_report():
    report_type = request.args.get('type')

    # Simulate different reports (you'll replace this with your actual logic)
    data = [['Default', 'Default']]
    header_row = ['SiteID', 'Issue']
    if report_type == 'blockedByParent':
        data = [['Default', 'Default']]
    elif report_type == 'radioAffectedPerCat':
        header_row = ['Category', 'phase', 'direct_nodes#', 'direct_RF', 'indirect_nodes#', 'indirect_RF',
                      'local_impacted_nodes#', 'local_impacted_RF', 'total_nodes#', 'total_RF']
        data = []
        # Iterate over each blockage category in blockages_list
        for phase_no in range(1, 6):
            for blockage_cat in blockages_list:
                node_cat_set = set()
                directly_impacted_cat_set = set()
                salek_cat_set = set()
                indirect_cat_set = set()
                total_cat_set = set()
                # Iterate over each descendant of the gps_root
                for node in gps_root.descendants:
                    # Check if the node's 'local_node_high_level_cat' matches the blockage category
                    if getattr(node, 'local_node_high_level_cat', None) == blockage_cat and getattr(node, 'local_node_domain', None)=="IPMPLS" and getattr(node, 'phase', None)==phase_no:
                        # Add the node itself to the set
                        node_cat_set.add(node)
                total_cat_set.update(node_cat_set)
                for node_cat in node_cat_set:
                    total_cat_set.update(node_cat.descendants)

                    if getattr(node_cat, 'phase', None) == phase_no and getattr(node_cat, 'is_first_not_doable', None):
                        directly_impacted_cat_set.add(node_cat)

                for total_cat in total_cat_set:
                    if not getattr(total_cat, 'phase', None) == phase_no:
                        indirect_cat_set.add(total_cat)


                data.append(
                    [
                        #blockage_cat, [getattr(node_cat, 'local_node_name', 0) for node_cat in node_cat_set]
                        blockage_cat, f"{phase_no}", len(node_cat_set),
                        sum(
                            getattr(node_cat, 'local_node_radio_sites_count', 0) for node_cat in node_cat_set
                        ),len(indirect_cat_set),
                        sum(
                            getattr(indirect_cat, 'local_node_radio_sites_count', 0) for indirect_cat in indirect_cat_set
                        ),len(directly_impacted_cat_set),
                        sum(
                            getattr(directly_impacted_cat, 'local_node_radio_sites_count', 0) for directly_impacted_cat in directly_impacted_cat_set
                        ),len(total_cat_set),
                        sum(
                            getattr(total_cat, 'local_node_radio_sites_count', 0) for total_cat in total_cat_set
                        )
                    ]
                )

    elif report_type == 'masterSheet':
        data = [[getattr(node, 'local_site_region', None), getattr(node, 'local_node_name', None), getattr(node, 'local_sync_solution', None),
                 getattr(node, 'upper_sync_source_site_name', None), getattr(node, 'grand_master_site_name', None)] for node in LevelOrderIter(gps_root) if getattr(node, 'local_node_domain', None)=="IPMPLS" ]
    elif report_type == 'readyNodes':
        data = [ [getattr(node, 'local_node_name', None), None] for node in LevelOrderIter(gps_root) if getattr(node, 'local_node_doable', None) and getattr(node, 'local_node_domain', None)=="IPMPLS" and not is_blocked_by_parent_design(node) ]
    elif report_type == 'dependenciesMap':
        data = [dependencies_list(node) for node in LevelOrderIter(gps_root) if getattr(node, 'local_node_domain', None)=="IPMPLS" ]
    elif report_type == 'radioAffectedPerNode':
        header_row = ['NodeID', 'parent|leaf', 'Hop#', 'first_not_doable', 'lcoal_node_status', 'parent_node_status', 'local_RF_count',
                      'total_pending_radio_sites_by_local_node','indirect_radio_sites_by_parent_node_sum','salek_radio_sites_by_local_node_sum', 'total_RF_count']
        data = []
        for node in gps_root.descendants:
            if getattr(node, 'local_node_domain', None) == "IPMPLS":
                radioAffectedPerNode_lcoal_node_status = "local_doable" if getattr(node, 'local_node_doable', False) else "local_blockage"
                radioAffectedPerNode_parent_node_status = "parent(s)_blockage" if is_blocked_by_parent_design(node) else "parent(s)_doable"
                local_radio_sites_count = getattr(node, 'local_node_radio_sites_count', 0)
                node_descendants = get_descendants(node)
                total_pending_radio_sites_by_local_node_sum = (
                    sum(
                        get_descendants(node, attribute="local_node_radio_sites_count")
                    )
                )
                indirect_radio_sites_by_parent_node_sum = (
                    sum(
                        getattr(descendant_node, 'local_node_radio_sites_count', 0) for descendant_node in node_descendants if getattr(descendant_node, 'phase', 0) != getattr(node, 'phase', 0)
                    )
                )if is_blocked_by_parent_design(node) else 0

                salek_radio_sites_by_local_node_sum = (
                    sum(
                        getattr(descendant_node, 'local_node_radio_sites_count', 0) for descendant_node in node_descendants if getattr(descendant_node, 'phase', False) == getattr(node, 'phase', True)
                    )
                )if not getattr(node, 'local_node_doable', False) else 0

                data.append(
                    [
                        getattr(node, 'local_node_name', None),
                        "parent" if node.children else "leaf",
                        getattr(node, 'phase', 0),
                        "yes" if getattr(node, 'is_first_not_doable', None) else "no",
                        radioAffectedPerNode_lcoal_node_status,
                        radioAffectedPerNode_parent_node_status,
                        local_radio_sites_count,
                        total_pending_radio_sites_by_local_node_sum,
                        indirect_radio_sites_by_parent_node_sum,
                        salek_radio_sites_by_local_node_sum,
                        local_radio_sites_count + sum(get_descendants(node, attribute="local_node_radio_sites_count")),
                        getattr(node, 'local_node_high_level_cat', None)
                    ]
                )
    elif report_type == 'nodeParentsMap':
        data = [
            [getattr(node, 'local_node_name', None)] + [getattr(node, 'local_node_doable', False)] + [
                getattr(ancestor, 'local_node_name', None)
                for ancestor in get_ancestors(node) if not getattr(ancestor, 'local_node_doable', False)
            ]
            for node in LevelOrderIter(gps_root)
            if getattr(node, 'local_node_domain', None) == "IPMPLS"
        ]
    # Create a CSV in memory
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(header_row)
    writer.writerows(data)

    # Return CSV file
    output.seek(0)
    return send_file(io.BytesIO(output.getvalue().encode()), mimetype='text/csv', as_attachment=True, download_name=f'{report_type}_report.csv')

if __name__ == '__main__':
    CORS(app)
    app.run(debug=True, host='0.0.0.0', port=5000)

