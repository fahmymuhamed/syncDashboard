import pandas as pd
from flask import Flask, jsonify, send_file, request
from flask_cors import CORS
import io
import csv

app = Flask(__name__)

# Load your Excel data dynamically
def load_tree_data():
    file_path = 'data/map_v4.xlsx'  # Replace with your actual file path
    df = pd.read_excel(file_path, sheet_name='Sheet1', dtype=object)

    # Define the roots dynamically where syncSolution == "Local to GM"
    roots = df[df['syncSolution'] == 'Local to GM']['SiteID'].tolist()

    # Define the regions dynamically where syncSolution == "Local to GM"
    regions = df[df['syncSolution'] == 'Local to GM']['Region'].tolist()

    # Create a function to build the hierarchical structure dynamically
    def build_tree(root_name):
        children_df = df[df['SyncSource'] == root_name]
        children = children_df['SiteID'].tolist()
        site_info = df[df['SiteID'] == root_name].iloc[0].to_dict()
        node = {
            'name': root_name,
            'children': [build_tree(child) for child in children]
        }
        for key, value in site_info.items():
            if key != 'SyncSource' and key != 'SiteID':
                node[key] = value
        return node

    tree_data = {
        'name': 'GPS',
        'localSiteDoability': True,
        'children': [build_tree(root) for root in roots]
    }
    return tree_data

# API to serve tree data
@app.route('/api/tree', methods=['GET'])
def get_tree():
    tree_data = load_tree_data()
    return jsonify(tree_data)

# API to serve progress metrics
@app.route('/api/progress', methods=['GET'])
def get_progress():
    # Example of dynamic progress data, can be updated based on actual logic
    return jsonify({
        "sow_issued": 120,
        "sow_pending": 80,
        "blocked_sites": 60
    })


# Report generation endpoint
@app.route('/api/report', methods=['GET'])
def get_report():
    report_type = request.args.get('type')

    # Simulate different reports (you'll replace this with your actual logic)
    if report_type == 'blockedByParent':
        data = [['Site A', 'Blocked By Parent 1'], ['Site B', 'Blocked By Parent 2']]
    elif report_type == 'sowIssuedNoParent':
        data = [['Site C', 'SOW Issued, No Parent']]
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

