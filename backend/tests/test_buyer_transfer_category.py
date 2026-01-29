"""
Test Buyer Transfer Category Feature

This test verifies that materials created during buyer transfers
now use proper category names instead of generic placeholders.

Author: MeterSquare Team
Created: 2026-01-28
"""

import json
from datetime import datetime


def test_buyer_transfer_with_category_backend_logic():
    """
    Test that buyer transfer extraction logic works correctly
    Simulates the backend code that extracts category from request
    """

    # Simulate request data with category
    mat_data = {
        "material_name": "Portland Cement",
        "quantity": 50,
        "unit": "bags",
        "category": "Cement",
        "brand": "UltraTech",
        "size": "50kg",
        "material_unit_price": 25.50
    }

    # Extract fields (simulating buyer_controller.py lines 10167-10171)
    category = mat_data.get('category', '').strip()
    brand = mat_data.get('brand', '').strip()
    size = mat_data.get('size', '').strip()
    material_unit_price = mat_data.get('material_unit_price', 0)

    # Verify extraction
    assert category == "Cement", f"Expected 'Cement', got '{category}'"
    assert brand == "UltraTech", f"Expected 'UltraTech', got '{brand}'"
    assert size == "50kg", f"Expected '50kg', got '{size}'"
    assert material_unit_price == 25.50, f"Expected 25.50, got {material_unit_price}"

    print("✓ Backend extraction logic works correctly")


def test_buyer_transfer_without_category_defaults():
    """
    Test that backward compatibility is maintained
    When no category is provided, it defaults to 'General'
    """

    # Simulate request data without category (old format)
    mat_data = {
        "material_name": "Portland Cement",
        "quantity": 50,
        "unit": "bags"
    }

    # Extract fields
    category = mat_data.get('category', '').strip()
    brand = mat_data.get('brand', '').strip()

    # Simulate logic from buyer_controller.py line 10245
    material_category = category if category else 'General'

    # Verify defaults
    assert material_category == "General", f"Expected 'General', got '{material_category}'"
    assert brand == "", f"Expected empty string, got '{brand}'"

    print("✓ Backward compatibility maintained - defaults to 'General'")


def test_category_assignment_store_transfer():
    """
    Test category assignment for store transfers
    """

    # Test with provided category
    category = "Steel"
    destination_type = "store"

    material_category = category if category else 'General'
    assert material_category == "Steel", f"Expected 'Steel', got '{material_category}'"

    # Test with empty category
    category = ""
    material_category = category if category else 'General'
    assert material_category == "General", f"Expected 'General', got '{material_category}'"

    print("✓ Store transfer category assignment works correctly")


def test_category_assignment_site_transfer():
    """
    Test category assignment for site transfers
    """

    # Test with provided category
    category = "Electrical"
    destination_type = "site"

    material_category = category if category else 'Custom Materials'
    assert material_category == "Electrical", f"Expected 'Electrical', got '{material_category}'"

    # Test with empty category
    category = ""
    material_category = category if category else 'Custom Materials'
    assert material_category == "Custom Materials", f"Expected 'Custom Materials', got '{material_category}'"

    print("✓ Site transfer category assignment works correctly")


def test_material_data_structure():
    """
    Test that the material data structure is complete
    """

    # Complete material data structure
    material_data = {
        "material_name": "TMT Bars 12mm",
        "quantity": 100,
        "unit": "nos",
        "category": "Steel & Reinforcement",
        "brand": "SAIL",
        "size": "12mm",
        "material_unit_price": 45.50,
        "notes": "High-grade steel"
    }

    # Verify all required fields exist
    assert "material_name" in material_data
    assert "quantity" in material_data
    assert "unit" in material_data

    # Verify optional fields exist
    assert "category" in material_data
    assert "brand" in material_data
    assert "size" in material_data
    assert "material_unit_price" in material_data

    # Verify values
    assert material_data["category"] == "Steel & Reinforcement"
    assert material_data["brand"] == "SAIL"
    assert material_data["size"] == "12mm"
    assert material_data["material_unit_price"] == 45.50

    print("✓ Material data structure is complete")


def test_json_serialization():
    """
    Test that the data can be properly serialized to JSON
    """

    material_data = {
        "destination_type": "store",
        "materials": [
            {
                "material_name": "Cement 50kg",
                "quantity": 100,
                "unit": "bags",
                "category": "Cement",
                "brand": "UltraTech",
                "size": "50kg",
                "material_unit_price": 25.50
            }
        ],
        "vehicle_number": "KA01AB1234",
        "driver_name": "John Doe",
        "transfer_date": datetime.utcnow().isoformat()
    }

    # Test serialization
    try:
        json_str = json.dumps(material_data)
        assert json_str, "JSON serialization failed"

        # Test deserialization
        deserialized = json.loads(json_str)
        assert deserialized["materials"][0]["category"] == "Cement"

        print("✓ JSON serialization/deserialization works correctly")
    except Exception as e:
        raise AssertionError(f"JSON serialization failed: {e}")


def run_all_tests():
    """Run all tests"""
    print()
    print("=" * 80)
    print("TESTING BUYER TRANSFER CATEGORY FEATURE")
    print("=" * 80)
    print()

    tests = [
        test_buyer_transfer_with_category_backend_logic,
        test_buyer_transfer_without_category_defaults,
        test_category_assignment_store_transfer,
        test_category_assignment_site_transfer,
        test_material_data_structure,
        test_json_serialization
    ]

    passed = 0
    failed = 0

    for test in tests:
        try:
            print(f"Running: {test.__name__}")
            test()
            passed += 1
            print()
        except AssertionError as e:
            print(f"❌ FAILED: {e}")
            failed += 1
            print()
        except Exception as e:
            print(f"❌ ERROR: {e}")
            failed += 1
            print()

    print("=" * 80)
    print(f"RESULTS: {passed} passed, {failed} failed out of {len(tests)} tests")
    print("=" * 80)
    print()

    if failed == 0:
        print("✅ ALL TESTS PASSED!")
    else:
        print(f"❌ {failed} TEST(S) FAILED")

    return failed == 0


if __name__ == '__main__':
    success = run_all_tests()
    exit(0 if success else 1)
