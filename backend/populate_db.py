import os
from datetime import date
from flask import Flask
from flask_sqlalchemy import SQLAlchemy
from sqlalchemy import false
from sqlalchemy.dialects.postgresql import insert
import click
from models import db, GrandMaster, Site, Device, SynchronizationRoute, SynchronizationRouteStep, Dependency
import pandas as pd
from flask_migrate import Migrate

app = Flask(__name__)

# PostgreSQL database configuration
app.config['SQLALCHEMY_DATABASE_URI'] = 'postgresql+psycopg2://backend_user:backend_pass@localhost:5432/sync_project_db'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

# Initialize the database with the Flask app
db.init_app(app)

file_path = 'data/map_v4.1.xlsx'  # Replace with your actual file path
df = pd.read_excel(file_path, sheet_name='Sheet1', dtype=object)

# Define the roots dynamically where syncSolution == "Local to GM"
roots = df[df['syncSolution'] == 'Local to GM']['SiteID'].tolist()

# Initialize an empty list to store the sorted nodes
sorted_sites = []
gm_sites = []

# Create a function to build the sorted list only for root nodes
def build_gm_list(root_name):
    # Dynamically get all the columns from the Excel sheet for this root site
    site_info = df[df['SiteID'] == root_name].iloc[0].to_dict()

    # Add the current root to the sorted list (without processing children)
    gm_sites.append(site_info)

# Create a function to build the hierarchical structure and generate a sorted list
def build_sorted_list(root_name):
    # Filter for the children of the current root
    children_df = df[df['SyncSource'] == root_name]
    children = children_df['SiteID'].tolist()

    # Dynamically get all the columns from the Excel sheet for this root site
    site_info = df[df['SiteID'] == root_name].iloc[0].to_dict()

    # Add the current root to the sorted list
    sorted_sites.append(site_info)

    # Recursively process each child, ensuring they are added after their parent
    for child in children:
        build_sorted_list(child)

# Iterate over each root and build the sorted list
for root in roots:
    build_sorted_list(root)
    build_gm_list(root)
# Populate the database with some data
def populate_sites_table():

    for site_data in sorted_sites:
        site_model_data = {
            'site_id': "{}".format(site_data.get("SiteID")),
            'region': "{}".format(site_data.get("Region")),
            'site_name': "{}".format(site_data.get("SiteID")),
            'sync_solution': "{}".format(site_data.get("syncSolution")),
            'site_devices_count': "{}".format(site_data.get("siteDevicesCount")),
            'b2b_link_available': site_data.get("b2bLinkAvailalble"),
            'parent_site_id': "{}".format(site_data.get("SyncSource")) if site_data.get("SyncSource") != "GM" else None,
            'has_ipmpls': site_data.get("has_ipmpls"),
            'has_transmission': site_data.get("has_transmission")
        }
        """Insert or update the site if it already exists."""
        stmt = insert(Site).values(**site_model_data)
        update_fields = {
            'region': site_model_data['region'],
            'site_name': site_model_data['site_name'],
            'sync_solution': site_model_data['sync_solution'],
            'site_devices_count': site_model_data['site_devices_count'],
            'b2b_link_available': site_model_data['b2b_link_available'],
            'parent_site_id': site_model_data['parent_site_id'],
            'has_ipmpls': site_model_data['has_ipmpls'],
            'has_transmission': site_model_data['has_transmission']
        }
        stmt = stmt.on_conflict_do_update(
            index_elements=['site_id'],  # Conflict on site_id
            set_=update_fields  # Update the existing row with new data
        )

        db.session.execute(stmt)

    print("sites sessions added")
    # Commit all changes
    db.session.commit()
    print("sites sessions committed")

# Populate the database with some data
def populate_gm_table():
    gm_data_list = []
    for gm_data in gm_sites:
        gm_data_list.append(GrandMaster(
            gm_name = "{}_GM".format(gm_data.get("SiteID")),
            location_site_id = "{}".format(gm_data.get("SiteID")),
            status = "{}".format(gm_data.get("SiteID")),
            gm_type = "Cesiem",
            installation_date = date(2023, 1, 15)
        ))
    db.session.add_all(gm_data_list)
    # Commit all changes
    db.session.commit()

def initialize_db():
    """Initialize and populate the database on startup."""
    db.create_all()

if __name__ == '__main__':
    # Initialize and populate the database automatically on startup
    with app.app_context():
        initialize_db()
        #populate_sites_table()
        #populate_gm_table()
    app.run(debug=False)


