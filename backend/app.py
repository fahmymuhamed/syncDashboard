import pandas as pd
from anytree import Node, PreOrderIter, LevelOrderIter, RenderTree
from anytree.exporter import JsonExporter
from flask import Flask, jsonify, send_file, request
from flask_cors import CORS
import io
import csv

app = Flask(__name__)
CORS(app)

# Build the main GPS root node
gps_root = Node("GPS", local_site_domain="DWDM", local_transmission_in_sync=True, local_site_doable=True, design_color='black', implementation_color='black')

# Load the Excel data once at startup to avoid loading repeatedly
data_file_path = 'data/map_v4.2.xlsx'  # Replace with your actual file path
df = pd.read_excel(data_file_path, sheet_name='Sheet1', dtype=object)

# Create JsonExporter to export tree in JSON format
exporter = JsonExporter(indent=4, sort_keys=True, default=lambda obj: getattr(obj, '__dict__', str(obj)))

# Define the roots dynamically where local_sync_solution == 'Local to GM'
roots = df[df['local_sync_solution'] == 'Local to GM']['local_site_name'].tolist()
regions = df[df['local_sync_solution'] == 'Local to GM']['local_site_region'].unique().tolist()

region_nodes = {}

# Create region nodes under GPS
for region in regions:
    region_nodes[region] = Node(region, parent=gps_root, local_site_domain="REGION", local_sync_solution= "Imaginary Link", local_transmission_in_sync=True, local_site_doable=True, design_color='black', implementation_color='black')

# Create a function to build the hierarchical structure dynamically using anytree
def build_tree(grand_master_site_name, root_name, parent_node=None):
    # Get information for the current root node
    site_info = df[df['local_site_name'] == root_name].iloc[0].to_dict()
    # Create a node for the current site with attributes
    node = Node(root_name, parent=parent_node, grand_master_site_name= grand_master_site_name, design_color='black', implementation_color='black', **{k: v for k, v in site_info.items()})
    # Recursively build child nodes
    children_df = df[df['upper_sync_source_site_name'] == root_name]
    children = children_df['local_site_name'].tolist()
    for child in children:
        build_tree(grand_master_site_name, child, node)
    return node

# Build the tree for each root and attach it under GPS
for root in roots:
    region = df[df['local_site_name'] == root]['local_site_region'].values[0]
    # Attach the root under the appropriate region node
    build_tree(root, root, region_nodes[region])

# Function to determine if a node is blocked by its parent
def is_blocked_by_parent_sync(node):
    current_node = node
    while current_node.parent:
        parent = current_node.parent
        if (not getattr(parent, 'local_ip_transport_in_sync', False) and getattr(parent, 'local_site_domain', None) == "IPMPLS" and
                (getattr(current_node, 'local_sync_solution', None) in ["Dedicated DF", "In-Band"] or getattr(parent, 'local_sync_solution', None) in ["Dedicated DF", "In-Band"])):
            return True
        current_node = parent
    return False

# Function to determine if a node is blocked by its parent
def is_blocked_by_parent_design(node):
    current_node = node
    while current_node.parent:
        parent = current_node.parent
        if (not getattr(parent, 'local_site_doable', False) and getattr(parent, 'local_site_domain', None) == "IPMPLS" and
                (getattr(current_node, 'local_sync_solution', None) in ["Dedicated DF", "In-Band"] or getattr(parent, 'local_sync_solution', None) in ["Dedicated DF", "In-Band"])):
            return True
        current_node = parent
    return False

# Function to apply colors to the nodes based on certain criteria
def apply_node_colors(root):

    for node in LevelOrderIter(root):
        if getattr(node, 'local_site_domain', None) == "IPMPLS" and getattr(node, 'local_ip_transport_in_sync', False):
            node.implementation_color = 'LimeGreen'  # In Sync
            node.design_color = 'LimeGreen'  # In Sync
        elif getattr(node, 'local_site_domain', None) == "IPMPLS" and not getattr(node, 'local_site_doable', False):
            node.implementation_color = 'red'  # Blocked
            node.design_color = 'red'  # Blocked
        elif getattr(node, 'local_site_domain', None) == "IPMPLS" and is_blocked_by_parent_design(node):
            node.implementation_color = 'red'  # Blocked by Parent
            node.design_color = 'RoyalBlue'  # Blocked by Parent
        elif getattr(node, 'local_site_domain', None) == "IPMPLS" and is_blocked_by_parent_sync(node):
            node.implementation_color = 'Gray'  # Blocked by Parent
            node.design_color = 'RoyalBlue'  # Blocked by Parent
        elif getattr(node, 'local_site_domain', None) == "IPMPLS":
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
        if current_solution in ["Dedicated DF", "In-Band"]  and getattr(current_node, 'local_site_domain', None) == "IPMPLS":
            return True
        elif parent_solution in ["Dedicated DF", "In-Band"] and getattr(parent, 'local_site_domain', None) == "IPMPLS":
            return True
        current_node = parent
    return False


# Function to determine the dependencies list
def dependencies_list(node):
    current_node = node
    local_site_name = getattr(node, 'local_site_name', None)
    local_site_domain = getattr(node, 'local_site_domain', None)
    local_sync_solution = getattr(current_node, 'local_sync_solution', None)
    dwdm_dependency = None
    ipmpls_dependency = None

    if local_site_domain == "IPMPLS":
        if local_sync_solution in ["Local to GM", "Local to DWDM"] and not has_dependency_on_parent(current_node):
            dwdm_dependency = f"{getattr(current_node, 'local_site_name', None)}_DWDM"
        elif has_dependency_on_parent(current_node):
            if local_sync_solution in ["Local to GM", "Local to DWDM"]:
                dwdm_dependency = f"{getattr(current_node, 'local_site_name', None)}_DWDM"
            elif local_sync_solution in ["Dedicated DF"] and getattr(current_node.parent, 'local_site_domain', None) == "DWDM":
                dwdm_dependency = f"{getattr(current_node.parent, 'local_site_name', None)}_DWDM"
            while current_node.parent:
                parent = current_node.parent
                current_solution = getattr(current_node, 'local_sync_solution', None)
                parent_solution = getattr(parent, 'local_sync_solution', None)
                if current_solution in ["Dedicated DF", "In-Band"] and getattr(parent, 'local_site_domain', None) == "IPMPLS":
                    ipmpls_dependency = f"{getattr(parent, 'local_site_name', None)}_IPMPLS"
                    break
                elif parent_solution in ["Dedicated DF", "In-Band"] and getattr(parent, 'local_site_domain', None) == "IPMPLS":
                    ipmpls_dependency = f"{getattr(parent, 'local_site_name', None)}_IPMPLS"
                    break
                current_node = parent

    return local_site_name, dwdm_dependency, ipmpls_dependency

# Calculate project statistics based on the nodes
def calculate_project_stats(root):
    result = {
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

    for node in LevelOrderIter(root):

        if getattr(node, 'local_site_domain', None) == "IPMPLS" and getattr(node, 'local_ip_transport_in_sync', False):
            result["in_sync_sites_count"] += 1
        elif getattr(node, 'local_site_domain', None) == "IPMPLS" and not getattr(node, 'local_site_doable', False):
            result["total_blocked_locally"] += 1
            result["total_blocked_sites"] += 1
            if getattr(node, 'scope_of_work_issued', False):
                result["blocked_issued_sow"] += 1
        elif getattr(node, 'local_site_domain', None) == "IPMPLS" and is_blocked_by_parent_design(node):
            result["total_affected_by_parent"] += 1
            result["total_blocked_sites"] += 1
            result["blocked_by_parents_design"] += 1
        elif getattr(node, 'local_site_domain', None) == "IPMPLS" and is_blocked_by_parent_sync(node):
            result["total_affected_by_parent"] += 1
            result["total_blocked_sites"] += 1
            result["pending_parents_sync"] += 1
            if getattr(node, 'scope_of_work_issued', False):
                result["blocked_issued_sow"] += 1
        elif getattr(node, 'local_site_domain', None) == "IPMPLS" and getattr(node, 'local_sync_solution', None) in ["Local to DWDM", "Local to GM"] and not getattr(node, 'local_transmission_in_sync', False):
            result['pending_transmission'] += 1
        elif getattr(node, 'local_sync_solution', None) == "Dedicated DF" and getattr(node, 'upper_sync_source_site_domain', None) == "DWDM" and not getattr(node.parent, 'local_transmission_in_sync', False):
            result['pending_transmission'] += 1
        elif getattr(node, 'local_site_domain', None) == "IPMPLS":
            result["ready_by_design"] += 1
            if getattr(node, 'scope_of_work_issued', False) and getattr(node, 'tech_data_provided', False):
                result["total_sow_and_tech_data"] += 1
            elif getattr(node, 'scope_of_work_issued', False) and not getattr(node, 'tech_data_provided', False):
                result["total_sow_no_tech_data"] += 1
            else:
                result["total_doable_no_sow"] += 1

    return result

# API to serve tree data
@app.route('/api/tree', methods=['GET'])
def get_tree():
    apply_node_colors(gps_root)
    return exporter.export(gps_root)

# API to serve progress metrics
@app.route('/api/project_stats', methods=['GET'])
def get_progress():
    result = calculate_project_stats (gps_root)
    return jsonify(result)

# Report generation endpoint
@app.route('/api/report', methods=['GET'])
def get_report():
    report_type = request.args.get('type')

    # Simulate different reports (you'll replace this with your actual logic)
    if report_type == 'blockedByParent':
        data = [[item for item in dependencies_list(node)] for node in LevelOrderIter(gps_root) if getattr(node, 'local_site_domain', None)=="IPMPLS" ]
    elif report_type == 'masterSheet':
        data = [[getattr(node, 'local_site_region', None), getattr(node, 'local_site_name', None), getattr(node, 'local_sync_solution', None),
                 getattr(node, 'upper_sync_source_site_name', None), getattr(node, 'grand_master_site_name', None)] for node in LevelOrderIter(gps_root) if getattr(node, 'local_site_domain', None)=="IPMPLS" ]
    elif report_type == 'sowIssuedBlockedParent':
        data = [['Site D', 'SOW Issued, Blocked Parent']]
    elif report_type == 'noBlockageNoInBand':
        data = [['Site E', 'No Blockage, No In-Band']]
    elif report_type == 'transportPorts':
        data = [['Site F', 'Transport Ports']]

    # Create a CSV in memory
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(['SiteID', 'Issue'])
    writer.writerows(data)

    # Return CSV file
    output.seek(0)
    return send_file(io.BytesIO(output.getvalue().encode()), mimetype='text/csv', as_attachment=True, download_name=f'{report_type}_report.csv')

if __name__ == '__main__':
    CORS(app)
    app.run(debug=True, port=5000)

