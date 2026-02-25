"""
Buyer Transfer Service - Business logic for buyer material transfers to M2 Store

This service handles the complete workflow of receiving buyer transfers:
- Validation of delivery notes and permissions
- Inventory stock updates
- Transaction recording
- Status management

Author: MeterSquare Team
Created: 2026-01-28
"""

from datetime import datetime
from typing import Dict, List, Optional, Tuple
from dataclasses import dataclass
from enum import Enum

from models.inventory import (
    MaterialDeliveryNote,
    DeliveryNoteItem,
    InventoryMaterial,
    InventoryTransaction
)
from app import db


class TransferStatus(Enum):
    """Valid delivery note statuses"""
    DRAFT = "DRAFT"
    ISSUED = "ISSUED"
    IN_TRANSIT = "IN_TRANSIT"
    DELIVERED = "DELIVERED"
    PARTIAL = "PARTIAL"
    CANCELLED = "CANCELLED"


class TransferType(Enum):
    """Types of material transfers"""
    BUYER_TO_STORE = "Buyer - Transfer to Store"
    BUYER_DIRECT_TO_SITE = "Buyer - Direct from Vendor"
    STORE_TO_SITE = "M2 Store"


@dataclass
class TransferValidationResult:
    """Result of transfer validation"""
    is_valid: bool
    error_message: Optional[str] = None
    error_code: Optional[str] = None


@dataclass
class MaterialProcessingResult:
    """Result of processing a single material"""
    material_name: str
    quantity_added: float
    new_stock: float
    unit: str


@dataclass
class TransferReceiptResult:
    """Complete result of receiving a transfer"""
    success: bool
    delivery_note_id: int
    delivery_note_number: str
    items_processed: List[Dict]
    received_by: str
    received_at: str
    batch_reference: str
    error_message: Optional[str] = None


class BuyerTransferValidator:
    """Validates buyer transfer operations"""

    ALLOWED_PENDING_STATUSES = [
        TransferStatus.DRAFT.value,
        TransferStatus.ISSUED.value,
        TransferStatus.IN_TRANSIT.value
    ]

    @staticmethod
    def validate_delivery_note_exists(dn: Optional[MaterialDeliveryNote]) -> TransferValidationResult:
        """Validate delivery note exists"""
        if not dn:
            return TransferValidationResult(
                is_valid=False,
                error_message="Delivery note not found",
                error_code="DN_NOT_FOUND"
            )
        return TransferValidationResult(is_valid=True)

    @staticmethod
    def validate_is_buyer_transfer(dn: MaterialDeliveryNote) -> TransferValidationResult:
        """Validate the delivery note is a buyer transfer to store"""
        if not dn.delivery_from or TransferType.BUYER_TO_STORE.value not in dn.delivery_from:
            return TransferValidationResult(
                is_valid=False,
                error_message="This is not a buyer transfer to store",
                error_code="INVALID_TRANSFER_TYPE"
            )
        return TransferValidationResult(is_valid=True)

    @staticmethod
    def validate_not_already_delivered(dn: MaterialDeliveryNote) -> TransferValidationResult:
        """Validate transfer hasn't been delivered already"""
        if dn.status == TransferStatus.DELIVERED.value:
            return TransferValidationResult(
                is_valid=False,
                error_message="This transfer has already been received",
                error_code="ALREADY_DELIVERED"
            )
        return TransferValidationResult(is_valid=True)

    @staticmethod
    def validate_status(dn: MaterialDeliveryNote) -> TransferValidationResult:
        """Validate delivery note status is acceptable for receiving"""
        if dn.status not in BuyerTransferValidator.ALLOWED_PENDING_STATUSES:
            return TransferValidationResult(
                is_valid=False,
                error_message=f"Cannot receive transfer with status: {dn.status}",
                error_code="INVALID_STATUS"
            )
        return TransferValidationResult(is_valid=True)

    @staticmethod
    def validate_items_have_materials(dn: MaterialDeliveryNote) -> TransferValidationResult:
        """Validate all items have inventory material IDs"""
        for item in dn.items:
            if not item.inventory_material_id:
                return TransferValidationResult(
                    is_valid=False,
                    error_message="Delivery note item is missing inventory_material_id",
                    error_code="MISSING_MATERIAL_ID"
                )
        return TransferValidationResult(is_valid=True)

    @staticmethod
    def validate_materials_exist(dn: MaterialDeliveryNote) -> TransferValidationResult:
        """Validate all referenced materials exist in inventory"""
        for item in dn.items:
            inv_material = InventoryMaterial.query.filter_by(
                inventory_material_id=item.inventory_material_id
            ).first()

            if not inv_material:
                return TransferValidationResult(
                    is_valid=False,
                    error_message=f"Inventory material {item.inventory_material_id} not found",
                    error_code="MATERIAL_NOT_FOUND"
                )
        return TransferValidationResult(is_valid=True)

    @classmethod
    def validate_transfer_for_receiving(cls, dn: Optional[MaterialDeliveryNote]) -> TransferValidationResult:
        """
        Comprehensive validation for receiving a buyer transfer

        Args:
            dn: Material delivery note to validate

        Returns:
            TransferValidationResult with validation outcome
        """
        # Chain validations
        validations = [
            cls.validate_delivery_note_exists(dn),
            cls.validate_is_buyer_transfer(dn) if dn else TransferValidationResult(is_valid=False),
            cls.validate_not_already_delivered(dn) if dn else TransferValidationResult(is_valid=False),
            cls.validate_status(dn) if dn else TransferValidationResult(is_valid=False),
            cls.validate_items_have_materials(dn) if dn else TransferValidationResult(is_valid=False),
            cls.validate_materials_exist(dn) if dn else TransferValidationResult(is_valid=False),
        ]

        for validation in validations:
            if not validation.is_valid:
                return validation

        return TransferValidationResult(is_valid=True)


class InventoryStockManager:
    """Manages inventory stock operations"""

    @staticmethod
    def add_stock(
        material: InventoryMaterial,
        quantity: float,
        modified_by: str
    ) -> float:
        """
        Add stock to a material

        Args:
            material: Inventory material to update
            quantity: Quantity to add
            modified_by: Name of user making the change

        Returns:
            New stock level
        """
        old_stock = material.current_stock or 0
        material.current_stock = old_stock + quantity
        material.last_modified_by = modified_by
        material.last_modified_at = datetime.utcnow()
        return material.current_stock

    @staticmethod
    def create_purchase_transaction(
        material_id: int,
        quantity: float,
        unit_price: float,
        reference_number: str,
        batch_ref: str,
        driver_name: Optional[str],
        vehicle_number: Optional[str],
        transport_fee: float,
        created_by: str,
        notes: str
    ) -> InventoryTransaction:
        """
        Create a purchase transaction record

        Args:
            material_id: Inventory material ID
            quantity: Quantity received
            unit_price: Price per unit
            reference_number: Delivery note number
            batch_ref: Batch reference for grouping
            driver_name: Driver name
            vehicle_number: Vehicle number
            transport_fee: Transportation cost
            created_by: User who created the transaction
            notes: Transaction notes

        Returns:
            Created InventoryTransaction object
        """
        transaction = InventoryTransaction(
            inventory_material_id=material_id,
            transaction_type='PURCHASE',
            quantity=quantity,
            unit_price=unit_price or 0,
            total_amount=(unit_price or 0) * quantity,
            reference_number=reference_number,
            notes=notes,
            delivery_batch_ref=batch_ref,
            driver_name=driver_name,
            vehicle_number=vehicle_number,
            transport_fee=transport_fee,
            created_by=created_by
        )
        db.session.add(transaction)
        db.session.flush()
        return transaction


class BuyerTransferService:
    """
    Service for handling buyer material transfers

    This service orchestrates the complete workflow of receiving
    buyer transfers into M2 Store inventory.
    """

    def __init__(self):
        self.validator = BuyerTransferValidator()
        self.stock_manager = InventoryStockManager()

    @staticmethod
    def generate_batch_reference() -> str:
        """Generate a unique batch reference for the transfer"""
        return f"BTR-{datetime.utcnow().strftime('%Y%m%d-%H%M%S')}"

    def receive_transfer(
        self,
        delivery_note_id: int,
        receiver_name: str,
        receiver_notes: Optional[str] = None
    ) -> TransferReceiptResult:
        """
        Receive a buyer transfer into M2 Store inventory

        This method:
        1. Validates the delivery note
        2. Updates inventory stock for each material
        3. Creates purchase transactions
        4. Links transactions to delivery note items
        5. Updates delivery note status to DELIVERED

        Args:
            delivery_note_id: ID of the delivery note to receive
            receiver_name: Full name of the receiving user (PM)
            receiver_notes: Optional notes from receiver

        Returns:
            TransferReceiptResult with operation outcome
        """
        try:
            # Fetch delivery note
            dn = MaterialDeliveryNote.query.filter_by(
                delivery_note_id=delivery_note_id
            ).first()

            # Validate transfer
            validation = self.validator.validate_transfer_for_receiving(dn)
            if not validation.is_valid:
                db.session.rollback()
                return TransferReceiptResult(
                    success=False,
                    delivery_note_id=delivery_note_id,
                    delivery_note_number="",
                    items_processed=[],
                    received_by="",
                    received_at="",
                    batch_reference="",
                    error_message=validation.error_message
                )

            # Generate batch reference
            batch_ref = self.generate_batch_reference()

            # Process each item
            items_processed = []
            for item in dn.items:
                # Fetch material
                inv_material = InventoryMaterial.query.filter_by(
                    inventory_material_id=item.inventory_material_id
                ).first()

                # Update stock
                new_stock = self.stock_manager.add_stock(
                    material=inv_material,
                    quantity=item.quantity,
                    modified_by=receiver_name
                )

                # Calculate transport fee allocation
                transport_fee_per_item = 0
                if dn.transport_fee and len(dn.items) > 0:
                    if len(dn.items) == 1:
                        transport_fee_per_item = dn.transport_fee
                    else:
                        transport_fee_per_item = dn.transport_fee / len(dn.items)

                # Create transaction
                transaction = self.stock_manager.create_purchase_transaction(
                    material_id=inv_material.inventory_material_id,
                    quantity=item.quantity,
                    unit_price=item.unit_price,
                    reference_number=dn.delivery_note_number,
                    batch_ref=batch_ref,
                    driver_name=dn.driver_name,
                    vehicle_number=dn.vehicle_number,
                    transport_fee=transport_fee_per_item,
                    created_by=receiver_name,
                    notes=f"Received from buyer transfer: {dn.delivery_note_number}"
                )

                # Link transaction to delivery note item
                item.inventory_transaction_id = transaction.inventory_transaction_id

                # Track processed item
                items_processed.append({
                    "material_name": inv_material.material_name,
                    "material_code": inv_material.material_code,
                    "quantity_added": item.quantity,
                    "unit": inv_material.unit,
                    "new_stock": new_stock,
                    "old_stock": new_stock - item.quantity
                })

            # Update delivery note status
            dn.status = TransferStatus.DELIVERED.value
            dn.received_by = receiver_name
            dn.received_at = datetime.utcnow()
            dn.receiver_notes = receiver_notes or ''
            dn.last_modified_by = receiver_name
            dn.last_modified_at = datetime.utcnow()

            # Commit transaction
            db.session.commit()

            return TransferReceiptResult(
                success=True,
                delivery_note_id=dn.delivery_note_id,
                delivery_note_number=dn.delivery_note_number,
                items_processed=items_processed,
                received_by=receiver_name,
                received_at=dn.received_at.isoformat(),
                batch_reference=batch_ref
            )

        except Exception as e:
            db.session.rollback()
            return TransferReceiptResult(
                success=False,
                delivery_note_id=delivery_note_id,
                delivery_note_number="",
                items_processed=[],
                received_by="",
                received_at="",
                batch_reference="",
                error_message=f"Failed to receive transfer: {str(e)}"
            )

    def get_pending_transfers(self) -> List[Dict]:
        """
        Get all pending buyer transfers awaiting receipt

        Returns:
            List of pending transfer delivery notes
        """
        pending_transfers = MaterialDeliveryNote.query.filter(
            MaterialDeliveryNote.delivery_from.like(f'%{TransferType.BUYER_TO_STORE.value}%'),
            MaterialDeliveryNote.status.in_(self.validator.ALLOWED_PENDING_STATUSES)
        ).order_by(MaterialDeliveryNote.created_at.desc()).all()

        return [dn.to_dict() for dn in pending_transfers]
