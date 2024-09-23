import os

class Config:
    """Configuration class for Flask application."""
    SECRET_KEY = os.environ.get('SECRET_KEY', 'your_secret_key_here')
    SQLALCHEMY_DATABASE_URI = os.environ.get(
        'DATABASE_URL',
        'postgresql://username:password@localhost/sync_project_db'
    )
    SQLALCHEMY_TRACK_MODIFICATIONS = False
