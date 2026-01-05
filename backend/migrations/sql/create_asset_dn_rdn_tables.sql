-- =============================================================================
-- Migration: Create Asset DN/RDN Tables for Returnable Assets
-- Date: 2025-12-29
-- Description: Creates 5 tables for proper DN/RDN flow (like materials)
-- =============================================================================

-- 1. Asset Delivery Notes (ADN)
CREATE TABLE IF NOT EXISTS asset_delivery_notes (
    adn_id SERIAL PRIMARY KEY,
    adn_number VARCHAR(50) UNIQUE NOT NULL,
    project_id INTEGER NOT NULL REFERENCES project(project_id),
    site_location VARCHAR(255),
    delivery_date TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    -- Personnel
    attention_to VARCHAR(255),
    attention_to_id INTEGER REFERENCES users(user_id),
    delivery_from VARCHAR(255) DEFAULT 'M2 Store',
    prepared_by VARCHAR(255) NOT NULL,
    prepared_by_id INTEGER REFERENCES users(user_id),
    checked_by VARCHAR(255),

    -- Transport
    vehicle_number VARCHAR(100),
    driver_name VARCHAR(255),
    driver_contact VARCHAR(50),

    -- Status: DRAFT, ISSUED, IN_TRANSIT, DELIVERED, CANCELLED
    status VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
    notes TEXT,

    -- Delivery confirmation
    received_by VARCHAR(255),
    received_by_id INTEGER REFERENCES users(user_id),
    received_at TIMESTAMP,
    receiver_notes TEXT,

    -- Audit
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(255) NOT NULL,
    last_modified_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_modified_by VARCHAR(255),
    issued_at TIMESTAMP,
    issued_by VARCHAR(255),
    dispatched_at TIMESTAMP,
    dispatched_by VARCHAR(255)
);

-- 2. Asset Delivery Note Items
CREATE TABLE IF NOT EXISTS asset_delivery_note_items (
    item_id SERIAL PRIMARY KEY,
    adn_id INTEGER NOT NULL REFERENCES asset_delivery_notes(adn_id) ON DELETE CASCADE,
    category_id INTEGER NOT NULL REFERENCES returnable_asset_categories(category_id),
    asset_item_id INTEGER REFERENCES returnable_asset_items(item_id),
    quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
    condition_at_dispatch VARCHAR(20) DEFAULT 'good',
    notes TEXT,

    -- Return tracking
    quantity_returned INTEGER DEFAULT 0,
    status VARCHAR(20) DEFAULT 'dispatched'
);

-- 3. Asset Return Delivery Notes (ARDN)
CREATE TABLE IF NOT EXISTS asset_return_delivery_notes (
    ardn_id SERIAL PRIMARY KEY,
    ardn_number VARCHAR(50) UNIQUE NOT NULL,
    project_id INTEGER NOT NULL REFERENCES project(project_id),
    site_location VARCHAR(255),
    return_date TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    -- Link to original ADN (optional)
    original_adn_id INTEGER REFERENCES asset_delivery_notes(adn_id),

    -- Personnel
    returned_by VARCHAR(255) NOT NULL,
    returned_by_id INTEGER REFERENCES users(user_id),
    return_to VARCHAR(255) DEFAULT 'M2 Store',
    prepared_by VARCHAR(255) NOT NULL,
    prepared_by_id INTEGER REFERENCES users(user_id),
    checked_by VARCHAR(255),

    -- Transport
    vehicle_number VARCHAR(100),
    driver_name VARCHAR(255),
    driver_contact VARCHAR(50),

    -- Status: DRAFT, ISSUED, IN_TRANSIT, RECEIVED, PROCESSED, CANCELLED
    status VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
    return_reason VARCHAR(100),
    notes TEXT,

    -- Store acceptance
    accepted_by VARCHAR(255),
    accepted_by_id INTEGER REFERENCES users(user_id),
    accepted_at TIMESTAMP,
    acceptance_notes TEXT,

    -- Processing
    processed_by VARCHAR(255),
    processed_by_id INTEGER REFERENCES users(user_id),
    processed_at TIMESTAMP,

    -- Audit
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(255) NOT NULL,
    last_modified_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_modified_by VARCHAR(255),
    issued_at TIMESTAMP,
    issued_by VARCHAR(255),
    dispatched_at TIMESTAMP,
    dispatched_by VARCHAR(255)
);

-- 4. Asset Return Delivery Note Items
CREATE TABLE IF NOT EXISTS asset_return_delivery_note_items (
    return_item_id SERIAL PRIMARY KEY,
    ardn_id INTEGER NOT NULL REFERENCES asset_return_delivery_notes(ardn_id) ON DELETE CASCADE,
    category_id INTEGER NOT NULL REFERENCES returnable_asset_categories(category_id),
    asset_item_id INTEGER REFERENCES returnable_asset_items(item_id),
    original_adn_item_id INTEGER REFERENCES asset_delivery_note_items(item_id),
    quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),

    -- SE reports condition
    reported_condition VARCHAR(20) NOT NULL,
    damage_description TEXT,
    photo_url TEXT,
    return_notes TEXT,

    -- PM verification
    verified_condition VARCHAR(20),
    pm_notes TEXT,
    action_taken VARCHAR(30),

    -- Acceptance
    quantity_accepted INTEGER,
    acceptance_status VARCHAR(20),

    -- Link to maintenance if sent for repair
    maintenance_id INTEGER REFERENCES asset_maintenance(maintenance_id)
);

-- 5. Asset Stock In (track new inventory additions)
CREATE TABLE IF NOT EXISTS asset_stock_in (
    stock_in_id SERIAL PRIMARY KEY,
    stock_in_number VARCHAR(50) UNIQUE NOT NULL,
    category_id INTEGER NOT NULL REFERENCES returnable_asset_categories(category_id),
    quantity INTEGER NOT NULL CHECK (quantity > 0),

    -- Purchase details
    purchase_date DATE,
    vendor_name VARCHAR(255),
    vendor_id INTEGER REFERENCES vendors(vendor_id),
    invoice_number VARCHAR(100),
    unit_cost DECIMAL(12,2) DEFAULT 0.00,
    total_cost DECIMAL(12,2) DEFAULT 0.00,

    -- Condition: new, good, fair, refurbished
    condition VARCHAR(20) DEFAULT 'new',
    notes TEXT,

    -- Audit
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(255) NOT NULL,
    created_by_id INTEGER REFERENCES users(user_id)
);

-- =============================================================================
-- INDEXES
-- =============================================================================

-- ADN indexes
CREATE INDEX IF NOT EXISTS idx_adn_project ON asset_delivery_notes(project_id);
CREATE INDEX IF NOT EXISTS idx_adn_status ON asset_delivery_notes(status);
CREATE INDEX IF NOT EXISTS idx_adn_date ON asset_delivery_notes(delivery_date);
CREATE INDEX IF NOT EXISTS idx_adn_project_status ON asset_delivery_notes(project_id, status);

-- ADN Items indexes
CREATE INDEX IF NOT EXISTS idx_adn_items_adn ON asset_delivery_note_items(adn_id);
CREATE INDEX IF NOT EXISTS idx_adn_items_category ON asset_delivery_note_items(category_id);

-- ARDN indexes
CREATE INDEX IF NOT EXISTS idx_ardn_project ON asset_return_delivery_notes(project_id);
CREATE INDEX IF NOT EXISTS idx_ardn_status ON asset_return_delivery_notes(status);
CREATE INDEX IF NOT EXISTS idx_ardn_date ON asset_return_delivery_notes(return_date);
CREATE INDEX IF NOT EXISTS idx_ardn_project_status ON asset_return_delivery_notes(project_id, status);

-- ARDN Items indexes
CREATE INDEX IF NOT EXISTS idx_ardn_items_ardn ON asset_return_delivery_note_items(ardn_id);
CREATE INDEX IF NOT EXISTS idx_ardn_items_action ON asset_return_delivery_note_items(action_taken);
CREATE INDEX IF NOT EXISTS idx_ardn_items_status ON asset_return_delivery_note_items(acceptance_status);

-- Stock In indexes
CREATE INDEX IF NOT EXISTS idx_stockin_category ON asset_stock_in(category_id);
CREATE INDEX IF NOT EXISTS idx_stockin_date ON asset_stock_in(created_at);

-- =============================================================================
-- ROLLBACK (Run to undo)
-- =============================================================================
-- DROP TABLE IF EXISTS asset_return_delivery_note_items CASCADE;
-- DROP TABLE IF EXISTS asset_return_delivery_notes CASCADE;
-- DROP TABLE IF EXISTS asset_delivery_note_items CASCADE;
-- DROP TABLE IF EXISTS asset_delivery_notes CASCADE;
-- DROP TABLE IF EXISTS asset_stock_in CASCADE;
