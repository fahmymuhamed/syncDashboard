# models.py

from flask_sqlalchemy import SQLAlchemy
from sqlalchemy.orm import relationship
from sqlalchemy import UniqueConstraint

db = SQLAlchemy()


# Association table for synchronization step dependencies
class SynchronizationStepDependency(db.Model):
    """
    Association table representing dependencies between synchronization route steps.
    Each entry indicates that a step depends on another step.
    """
    __tablename__ = 'synchronization_step_dependencies'
    id = db.Column(db.Integer, primary_key=True)
    step_id = db.Column(db.Integer, db.ForeignKey('synchronization_route_steps.route_step_id'), nullable=False)
    depends_on_step_id = db.Column(db.Integer, db.ForeignKey('synchronization_route_steps.route_step_id'),
                                   nullable=False)

    # Relationships
    step = relationship('SynchronizationRouteStep', foreign_keys=[step_id], back_populates='dependencies')
    depends_on_step = relationship('SynchronizationRouteStep', foreign_keys=[depends_on_step_id])


class Site(db.Model):
    """Model representing a network site."""
    __tablename__ = 'sites'
    site_id = db.Column(db.String, primary_key=True)
    region = db.Column(db.String(100), nullable=False)
    site_name = db.Column(db.String(100), nullable=False)
    local_site_domain = db.Column(db.String(100), nullable=True)
    sync_solution = db.Column(db.String(100),
                              nullable=False)  # e.g., 'Local to Transmission', 'New Dedicated Dark Fiber', etc.
    site_devices_count = db.Column(db.Integer, nullable=True)
    b2b_link_available = db.Column(db.Boolean, default=False)
    parent_site_id = db.Column(db.String, db.ForeignKey('sites.site_id'), nullable=True)
    nearest_transmission_site_id = db.Column(db.String, db.ForeignKey('sites.site_id'), nullable=True)
    has_ipmpls = db.Column(db.Boolean, default=False)
    has_transmission = db.Column(db.Boolean, default=False)

    # Site-Level Synchronization Attributes
    ipmpls_readiness = db.Column(db.Boolean, default=False)
    ipmpls_sync_done = db.Column(db.Boolean, default=False)
    dwdm_sync_done = db.Column(db.Boolean, default=False)

    # Relationships
    devices = relationship('Device', back_populates='site')
    grand_master = relationship('GrandMaster', back_populates='location_site', uselist=False)

    # Parent-Child Relationships
    parent_site = relationship(
        'Site',
        remote_side=[site_id],
        backref='child_sites',
        foreign_keys=[parent_site_id]
    )
    nearest_transmission_site = relationship(
        'Site',
        remote_side=[site_id],
        backref='nearest_transmission_sites',
        foreign_keys=[nearest_transmission_site_id]
    )

    dependencies = relationship('Dependency', back_populates='site', foreign_keys='Dependency.site_id')

    synchronization_route_steps_source = relationship(
        'SynchronizationRouteStep',
        foreign_keys='SynchronizationRouteStep.source_site_id',
        back_populates='source_site'
    )
    synchronization_route_steps_destination = relationship(
        'SynchronizationRouteStep',
        foreign_keys='SynchronizationRouteStep.destination_site_id',
        back_populates='destination_site'
    )


class Device(db.Model):
    """Model representing a network device."""
    __tablename__ = 'devices'
    device_id = db.Column(db.Integer, primary_key=True)
    site_id = db.Column(db.String, db.ForeignKey('sites.site_id'), nullable=False)
    device_type = db.Column(db.String(100), nullable=False)  # e.g., 'IPMPLS Device', 'Transmission Device'
    platform = db.Column(db.String(100), nullable=True)  # e.g., 'ASR-9922'
    layer = db.Column(db.String(100), nullable=True)  # e.g., 'PE-Agg22'

    # Relationships
    site = relationship('Site', back_populates='devices')
    synchronization_route_steps_source = relationship(
        'SynchronizationRouteStep',
        foreign_keys='SynchronizationRouteStep.source_device_id',
        back_populates='source_device'
    )
    synchronization_route_steps_destination = relationship(
        'SynchronizationRouteStep',
        foreign_keys='SynchronizationRouteStep.destination_device_id',
        back_populates='destination_device'
    )


class GrandMaster(db.Model):
    """Model representing a Grand Master device."""
    __tablename__ = 'grand_masters'
    gm_id = db.Column(db.Integer, primary_key=True)
    gm_name = db.Column(db.String(100), nullable=False)
    location_site_id = db.Column(db.String, db.ForeignKey('sites.site_id'), unique=True, nullable=False)
    status = db.Column(db.String(50), nullable=False)  # e.g., 'Active', 'Inactive'
    gm_type = db.Column(db.String(100), nullable=True)  # e.g., 'GM_ModelA'
    ip_address = db.Column(db.String(45), unique=True, nullable=True)  # IPv6 compatible
    installation_date = db.Column(db.Date, nullable=True)

    # Relationships
    location_site = relationship('Site', back_populates='grand_master')
    synchronization_routes = relationship('SynchronizationRoute', back_populates='grand_master')


class SynchronizationRoute(db.Model):
    """Model representing a synchronization route originating from a Grand Master."""
    __tablename__ = 'synchronization_routes'
    route_id = db.Column(db.Integer, primary_key=True)
    gm_id = db.Column(db.Integer, db.ForeignKey('grand_masters.gm_id'), nullable=False)
    destination_site_id = db.Column(db.String, db.ForeignKey('sites.site_id'), nullable=False)
    status = db.Column(db.String(50), nullable=True)  # e.g., 'Planned', 'In Progress', 'Completed'
    description = db.Column(db.String(255), nullable=True)

    # Relationships
    grand_master = relationship('GrandMaster', back_populates='synchronization_routes')
    destination_site = relationship('Site')
    route_steps = relationship('SynchronizationRouteStep', back_populates='route', cascade='all, delete-orphan')


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
    delivery_method = db.Column(db.String(100), nullable=False)  # e.g., 'Local Transmission', 'Dedicated Dark Fiber'
    delivery_network = db.Column(db.String(100), nullable=False)  # e.g., 'Transmission', 'IPMPLS'
    link_type = db.Column(db.String(100), nullable=True)  # e.g., 'Local Link', 'Dedicated DF Link'
    description = db.Column(db.String(255), nullable=True)
    owned_by = db.Column(db.String(100), nullable=False)  # 'Transmission Project', 'IPMPLS Project'

    # Relationships
    route = relationship('SynchronizationRoute', back_populates='route_steps')
    source_site = relationship('Site', foreign_keys=[source_site_id],
                               back_populates='synchronization_route_steps_source')
    destination_site = relationship('Site', foreign_keys=[destination_site_id],
                                    back_populates='synchronization_route_steps_destination')
    source_device = relationship('Device', foreign_keys=[source_device_id],
                                 back_populates='synchronization_route_steps_source')
    destination_device = relationship('Device', foreign_keys=[destination_device_id],
                                      back_populates='synchronization_route_steps_destination')

    # Dependencies
    dependencies = relationship(
        'SynchronizationStepDependency',
        foreign_keys=[SynchronizationStepDependency.step_id],
        back_populates='step',
        cascade='all, delete-orphan'
    )
    depended_on_by = relationship(
        'SynchronizationStepDependency',
        foreign_keys=[SynchronizationStepDependency.depends_on_step_id],
        back_populates='depends_on_step',
        cascade='all, delete-orphan'
    )

    # Unique constraint to ensure sequence_number uniqueness within a route
    __table_args__ = (
        UniqueConstraint('route_id', 'sequence_number', name='uix_route_sequence'),
    )


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
    description = db.Column(db.String(255), nullable=True)
    is_critical = db.Column(db.Boolean, default=False)
    dependency_level = db.Column(db.String(50), nullable=False)  # 'Local', 'Parent', 'Transmission'
    owned_by = db.Column(db.String(100), nullable=False)  # 'Transmission Project', 'IPMPLS Project'

    # Relationships
    site = relationship('Site', back_populates='dependencies', foreign_keys=[site_id])
    dependent_on_site = relationship('Site', foreign_keys=[dependent_on_site_id])
    dependent_on_gm = relationship('GrandMaster')

# Optional: Add more models or fields as necessary for your project's requirements
