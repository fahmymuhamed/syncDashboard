from flask_sqlalchemy import SQLAlchemy
from flask_login import UserMixin

db = SQLAlchemy()

# Association Tables (if needed for many-to-many relationships)

# 1. Grand Masters (GMs)
class GrandMaster(db.Model):
    """Model representing a Grand Master device."""
    __tablename__ = 'grand_masters'
    gm_id = db.Column(db.Integer, primary_key=True)
    gm_name = db.Column(db.String(100), nullable=False)
    location_site_id = db.Column(db.String, db.ForeignKey('sites.site_id'))
    status = db.Column(db.String(50), nullable=False)
    gm_type = db.Column(db.String(100))
    ip_address = db.Column(db.String(45), unique=True)
    installation_date = db.Column(db.Date)

    # Relationships
    location_site = db.relationship('Site', back_populates='grand_master')
    synchronization_routes = db.relationship('SynchronizationRoute', back_populates='grand_master')

# 2. Sites
class Site(db.Model):
    """Model representing a network site."""
    __tablename__ = 'sites'
    site_id = db.Column(db.String, primary_key=True)
    region = db.Column(db.String(100))
    site_name = db.Column(db.String(100), nullable=False)
    local_site_domain = db.Column(db.String(100))
    site_devices_count = db.Column(db.Integer)
    b2b_link_available = db.Column(db.Boolean, default=False)
    parent_site_id = db.Column(db.String, db.ForeignKey('sites.site_id'), nullable=True)
    nearest_transmission_site_id = db.Column(db.String, db.ForeignKey('sites.site_id'), nullable=True)
    has_ipmpls = db.Column(db.Boolean, default=False)
    has_transmission = db.Column(db.Boolean, default=False)

    # Relationships
    devices = db.relationship('Device', back_populates='site')
    dependencies = db.relationship('Dependency', back_populates='site')
    grand_master = db.relationship('GrandMaster', back_populates='location_site', uselist=False)
    synchronization_route_steps_source = db.relationship(
        'SynchronizationRouteStep',
        foreign_keys='SynchronizationRouteStep.source_site_id',
        back_populates='source_site'
    )
    synchronization_route_steps_destination = db.relationship(
        'SynchronizationRouteStep',
        foreign_keys='SynchronizationRouteStep.destination_site_id',
        back_populates='destination_site'
    )
    parent_site = db.relationship('Site', remote_side=[site_id], backref='child_sites')
    nearest_transmission_site = db.relationship('Site', remote_side=[site_id], backref='nearest_transmission_sites')

# 3. Devices
class Device(db.Model):
    """Model representing a network device."""
    __tablename__ = 'devices'
    device_id = db.Column(db.Integer, primary_key=True)
    site_id = db.Column(db.String, db.ForeignKey('sites.site_id'), nullable=False)
    device_type = db.Column(db.String(100), nullable=False)  # e.g., 'IPMPLS Device'
    platform = db.Column(db.String(100))  # e.g., 'ASR-9922'
    layer = db.Column(db.String(100))  # e.g., 'PE-Agg22'
    ipmpls_readiness = db.Column(db.Boolean, default=False)
    ipmpls_sync_done = db.Column(db.Boolean, default=False)
    dwdm_sync_done = db.Column(db.Boolean, default=False)

    # Relationships
    site = db.relationship('Site', back_populates='devices')
    synchronization_route_steps_source = db.relationship(
        'SynchronizationRouteStep',
        foreign_keys='SynchronizationRouteStep.source_device_id',
        back_populates='source_device'
    )
    synchronization_route_steps_destination = db.relationship(
        'SynchronizationRouteStep',
        foreign_keys='SynchronizationRouteStep.destination_device_id',
        back_populates='destination_device'
    )

# 4. Synchronization Routes
class SynchronizationRoute(db.Model):
    """Model representing a synchronization route originating from a Grand Master."""
    __tablename__ = 'synchronization_routes'
    route_id = db.Column(db.Integer, primary_key=True)
    gm_id = db.Column(db.Integer, db.ForeignKey('grand_masters.gm_id'), nullable=False)
    destination_site_id = db.Column(db.String, db.ForeignKey('sites.site_id'), nullable=False)
    status = db.Column(db.String(50))
    description = db.Column(db.String(255))

    # Relationships
    grand_master = db.relationship('GrandMaster', back_populates='synchronization_routes')
    destination_site = db.relationship('Site')
    route_steps = db.relationship('SynchronizationRouteStep', back_populates='route')

# 5. Synchronization Route Steps
class SynchronizationRouteStep(db.Model):
    """Model representing each step in a synchronization route."""
    __tablename__ = 'synchronization_route_steps'
    route_step_id = db.Column(db.Integer, primary_key=True)
    route_id = db.Column(db.Integer, db.ForeignKey('synchronization_routes.route_id'), nullable=False)
    sequence_number = db.Column(db.Integer, nullable=False)
    source_site_id = db.Column(db.String, db.ForeignKey('sites.site_id'), nullable=False)
    source_device_id = db.Column(db.Integer, db.ForeignKey('devices.device_id'), nullable=True)
    destination_site_id = db.Column(db.String, db.ForeignKey('sites.site_id'), nullable=False)
    destination_device_id = db.Column(db.Integer, db.ForeignKey('devices.device_id'), nullable=True)
    delivery_method = db.Column(db.String(100), nullable=False)  # e.g., 'Local Transmission'
    delivery_network = db.Column(db.String(100), nullable=False)  # e.g., 'IPMPLS'
    link_type = db.Column(db.String(100))  # e.g., 'Dedicated DF Link'
    description = db.Column(db.String(255))
    owned_by = db.Column(db.String(100), nullable=False)  # 'Transmission Project', 'IPMPLS Project'

    # Relationships
    route = db.relationship('SynchronizationRoute', back_populates='route_steps')
    source_site = db.relationship('Site', foreign_keys=[source_site_id], back_populates='synchronization_route_steps_source')
    destination_site = db.relationship('Site', foreign_keys=[destination_site_id], back_populates='synchronization_route_steps_destination')
    source_device = db.relationship('Device', foreign_keys=[source_device_id], back_populates='synchronization_route_steps_source')
    destination_device = db.relationship('Device', foreign_keys=[destination_device_id], back_populates='synchronization_route_steps_destination')

# 6. Dependencies
class Dependency(db.Model):
    """Model representing dependencies between networks and sites."""
    __tablename__ = 'dependencies'
    dependency_id = db.Column(db.Integer, primary_key=True)
    site_id = db.Column(db.String, db.ForeignKey('sites.site_id'), nullable=False)
    dependency_type = db.Column(db.String(100), nullable=False)  # e.g., 'GM Integration'
    dependent_network = db.Column(db.String(100), nullable=False)  # e.g., 'IPMPLS'
    dependency_network = db.Column(db.String(100), nullable=False)  # e.g., 'Transmission'
    dependent_on_site_id = db.Column(db.String, db.ForeignKey('sites.site_id'), nullable=True)
    dependent_on_gm_id = db.Column(db.Integer, db.ForeignKey('grand_masters.gm_id'), nullable=True)
    status = db.Column(db.String(50), nullable=False)  # e.g., 'Pending', 'Resolved'
    description = db.Column(db.String(255))
    is_critical = db.Column(db.Boolean, default=False)
    dependency_level = db.Column(db.String(50), nullable=False)  # 'Local', 'Parent', 'Transmission'
    owned_by = db.Column(db.String(100), nullable=False)  # 'Transmission Project', 'IPMPLS Project'
    assigned_to_user_id = db.Column(db.Integer, db.ForeignKey('users.user_id'), nullable=True)

    # Relationships
    site = db.relationship('Site', back_populates='dependencies')
    dependent_on_site = db.relationship('Site', foreign_keys=[dependent_on_site_id])
    dependent_on_gm = db.relationship('GrandMaster')
    assigned_to_user = db.relationship('User', back_populates='dependencies')

# 7. Users and Roles
class User(UserMixin, db.Model):
    """Model representing a user with roles."""
    __tablename__ = 'users'
    user_id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(100), unique=True, nullable=False)
    password_hash = db.Column(db.String(255), nullable=False)
    role = db.Column(db.String(50), nullable=False)  # e.g., 'Admin', 'Engineer'
    email = db.Column(db.String(100), unique=True, nullable=False)

    # Relationships
    dependencies = db.relationship('Dependency', back_populates='assigned_to_user')
