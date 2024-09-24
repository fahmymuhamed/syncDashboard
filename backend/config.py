# config.py
import os

class Config:
    # PostgreSQL database URI
    SQLALCHEMY_DATABASE_URI = os.getenv('DATABASE_URL', 'postgresql+psycopg2://backend_user:backend_pass@localhost:5432/sync_project_db')
    SQLALCHEMY_TRACK_MODIFICATIONS = False
