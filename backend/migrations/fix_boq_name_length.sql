-- Migration: Increase boq_name column length from VARCHAR(100) to VARCHAR(255)
-- This fixes the "value too long for type character varying(100)" error

ALTER TABLE boq
ALTER COLUMN boq_name TYPE VARCHAR(255);
