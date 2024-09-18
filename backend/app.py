import pandas as pd
from flask import Flask, jsonify
from flask_cors import CORS

app = Flask(__name__)

# Load your Excel data dynamically
def load_tree_data():
    file_path = 'data/map_v4.xlsx'  # Replace with your actual file path
    df = pd.read_excel(file_path, sheet_name='Sheet1', dtype=object)

    # Define the roots dynamically where syncSolution == "Local to GM"
    roots = df[df['syncSolution'] == 'Local to GM']['SiteID'].tolist()

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

# Add additional APIs for other reports as needed

if __name__ == '__main__':
    CORS(app)
    app.run(debug=True, port=5000)

