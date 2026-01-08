"""
Excel Parser for BOQ Bulk Import
Parses Excel files matching the actual BOQ template format
"""
import pandas as pd
import numpy as np
from typing import Dict, List, Any, Tuple


class BOQExcelParser:
    """Parse Excel files for BOQ bulk import - matches actual template format"""

    def __init__(self, file_path: str):
        """Initialize parser with file path"""
        self.file_path = file_path
        self.df = None
        self.errors = []
        self.warnings = []
        self.project_info = {}

    def parse(self) -> Tuple[bool, Dict[str, Any]]:
        """
        Parse the Excel file and return structured BOQ data

        Returns:
            Tuple of (success: bool, data: Dict)
        """
        xl_file = None
        try:
            # Read Excel file - try to find the data
            xl_file = pd.ExcelFile(self.file_path, engine='openpyxl')

            # Get the first sheet
            sheet_name = xl_file.sheet_names[0]
            self.df = pd.read_excel(xl_file, sheet_name=sheet_name, header=None)

            # Close immediately after first read
            xl_file.close()
            xl_file = None

            # Extract project information from top rows
            self._extract_project_info()

            # Find the header row (contains "Work type", "Item", etc.)
            header_row = self._find_header_row()

            if header_row is None:
                self.errors.append("Could not find header row with 'Work type', 'Item', 'Description'")
                return False, {'errors': self.errors, 'warnings': self.warnings}

            # Read data with found header
            xl_file = pd.ExcelFile(self.file_path, engine='openpyxl')
            self.df = pd.read_excel(
                xl_file,
                sheet_name=xl_file.sheet_names[0],
                header=header_row
            )
            # Close immediately after second read
            xl_file.close()
            xl_file = None

            # Clean column names
            self.df.columns = self.df.columns.str.strip()

            # Debug: Print found columns
            print(f"Found columns in Excel: {list(self.df.columns)}")

            # Validate required columns exist
            required_columns = {
                'Work type': ['Work type', 'work type', 'Work Type', 'Worktype'],
                'Item': ['Item', 'item'],
                'Sub Item': ['Sub Item', 'sub item', 'Sub item', 'SubItem'],
                'Description': ['Description', 'description'],
                'QTY': ['QTY', 'qty', 'Qty', 'Quantity', 'quantity'],
                'Unit': ['Unit', 'unit'],
                'Rate(AED)': ['Rate(AED)', 'rate(aed)', 'Rate (AED)', 'rate (aed)', 'Rate'],
                'Amount (AED)': ['Item Amount (AED)', 'Amount (AED)', 'amount (aed)', 'Amount(AED)', 'Amount (aed)', 'Item Amount', 'Amount(aed)'],
                'Labour Role': ['Labour Role', 'labour role', 'Labor Role', 'LabourRole'],
                'Working Hours': ['Working Hours', 'working hours', 'Hours', 'WorkingHours'],
                'Rate Per Hour': ['Rate Per Hour', 'rate per hour', 'Rate per Hour', 'RatePerHour', 'Rate Per Houe'],
                'Amount': ['Amount', 'amount', 'Labour Amount'],
                'profit_margin_percentage': ['profit_margin_percentage', 'Profit Margin %', 'Profit %'],
                'overhead_percentage': ['overhead_percentage', 'Overhead %', 'Overhead']
            }

            # Normalize column names - map all columns to their standard names
            column_mapping = {}

            for target_col, possible_names in required_columns.items():
                for col in self.df.columns:
                    if col in column_mapping:
                        continue  # Already mapped
                    if col in possible_names:
                        column_mapping[col] = target_col
                        break

            print(f"Column mapping: {column_mapping}")
            self.df.rename(columns=column_mapping, inplace=True)
            print(f"Columns after mapping: {list(self.df.columns)}")

            # Check if all required columns are present (exclude optional ones)
            optional_columns = ['profit_margin_percentage', 'overhead_percentage']
            missing_columns = []
            for required_col in required_columns.keys():
                if required_col in optional_columns:
                    continue  # Skip optional columns
                if required_col not in self.df.columns:
                    missing_columns.append(required_col)

            if missing_columns:
                print(f"Missing columns: {missing_columns}")
                print(f"Available columns: {list(self.df.columns)}")
                self.errors.append(f"Missing required columns: {', '.join(missing_columns)}")
                self.errors.append("Please ensure your Excel file matches the template format exactly")
                self.errors.append(f"Found columns: {', '.join(self.df.columns)}")
                return False, {
                    'errors': self.errors,
                    'warnings': self.warnings
                }

            # Remove empty rows
            self.df = self.df.dropna(how='all').reset_index(drop=True)

            # Parse into BOQ structure
            boq_items = self._parse_items()

            if not boq_items:
                self.errors.append("No valid BOQ items found in the file")
                return False, {
                    'errors': self.errors,
                    'warnings': self.warnings
                }

            return True, {
                'items': boq_items,
                'project_info': self.project_info,
                'total_items': len(boq_items),
                'errors': self.errors,
                'warnings': self.warnings
            }

        except Exception as e:
            self.errors.append(f"Failed to parse Excel file: {str(e)}")
            return False, {
                'errors': self.errors,
                'warnings': self.warnings
            }
        finally:
            # Ensure file is closed
            if xl_file is not None:
                try:
                    xl_file.close()
                except:
                    pass

    def _extract_project_info(self):
        """Extract project information from top rows"""
        try:
            # Look for project info in first few rows
            for idx in range(min(10, len(self.df))):
                row_text = ' '.join([str(cell) for cell in self.df.iloc[idx] if pd.notna(cell)])

                if 'Project name' in row_text or 'project name' in row_text.lower():
                    # Extract project info
                    for col_idx, cell in enumerate(self.df.iloc[idx]):
                        cell_str = str(cell) if pd.notna(cell) else ''
                        if 'Project name' in cell_str:
                            if col_idx + 1 < len(self.df.columns):
                                value = self.df.iloc[idx, col_idx + 1]
                                if pd.notna(value):
                                    parts = str(value).split(':')
                                    if len(parts) > 1:
                                        self.project_info['project_name'] = parts[1].strip()
                        elif 'Client' in cell_str:
                            parts = cell_str.split(':')
                            if len(parts) > 1:
                                self.project_info['client'] = parts[1].strip()
                        elif 'Location' in cell_str:
                            parts = cell_str.split(':')
                            if len(parts) > 1:
                                self.project_info['location'] = parts[1].strip()

                if 'Area' in row_text:
                    for col_idx, cell in enumerate(self.df.iloc[idx]):
                        cell_str = str(cell) if pd.notna(cell) else ''
                        if 'Area' in cell_str:
                            parts = cell_str.split(':')
                            if len(parts) > 1:
                                self.project_info['area'] = parts[1].strip()
        except Exception as e:
            print(f"Error extracting project info: {e}")

    def _find_header_row(self) -> int:
        """Find the row containing headers - must match exact template format"""
        required_columns = ['work type', 'item', 'sub item', 'description', 'qty', 'unit',
                          'rate(aed)', 'amount (aed)', 'labour role', 'working hours',
                          'rate per hour', 'amount']

        for idx in range(min(20, len(self.df))):
            row_values = [str(cell).lower().strip() for cell in self.df.iloc[idx] if pd.notna(cell)]

            # Check if this row contains the required columns
            if 'work type' in row_values and 'sub item' in row_values and 'labour role' in row_values:
                return idx

        return None

    def _parse_items(self) -> List[Dict[str, Any]]:
        """
        Parse DataFrame rows into BOQ items structure
        All rows must have: Work type, Item, Sub Item (material), Description, QTY, Unit, Rate, Amount, Labour details
        """
        items_dict = {}
        current_work_type = None
        current_main_item = None

        for idx, row in self.df.iterrows():
            row_num = idx + 2  # Accounting for header

            # Get work type
            work_type = self._get_string_value(row.get('Work type', ''))
            if work_type:
                current_work_type = work_type

            if not current_work_type:
                self.errors.append(f"Row {row_num}: Work type is required")
                continue

            # Get item information
            main_item = self._get_string_value(row.get('Item', ''))
            if main_item:
                current_main_item = main_item

            sub_item = self._get_string_value(row.get('Sub Item', ''))  # This is the material name
            description = self._get_string_value(row.get('Description', ''))

            # MANDATORY: Sub Item (material) must be present
            if not sub_item:
                self.errors.append(f"Row {row_num}: Sub Item (material name) is required")
                continue

            if not description:
                self.errors.append(f"Row {row_num}: Description is required")
                continue

            if not current_main_item:
                self.errors.append(f"Row {row_num}: Item is required")
                continue

            # Use main item as the BOQ item name, sub item as material
            item_name = current_main_item
            material_name = sub_item

            # Validate all required material fields
            qty = self._get_float_value(row.get('QTY', 0))
            if qty <= 0:
                self.errors.append(f"Row {row_num}: QTY must be greater than 0")
                continue

            unit = self._get_string_value(row.get('Unit', ''))
            if not unit:
                self.errors.append(f"Row {row_num}: Unit is required")
                continue

            rate = self._get_float_value(row.get('Rate(AED)', 0))
            if rate <= 0:
                self.errors.append(f"Row {row_num}: Rate(AED) must be greater than 0")
                continue

            amount_aed = self._get_float_value(row.get('Amount (AED)', 0))
            if amount_aed <= 0:
                self.errors.append(f"Row {row_num}: Amount (AED) must be greater than 0")
                continue

            # Validate labour fields - ALL are required
            labour_role = self._get_string_value(row.get('Labour Role', ''))
            if not labour_role:
                self.errors.append(f"Row {row_num}: Labour Role is required")
                continue

            working_hours = self._get_float_value(row.get('Working Hours', 0))
            if working_hours <= 0:
                self.errors.append(f"Row {row_num}: Working Hours must be greater than 0")
                continue

            rate_per_hour = self._get_float_value(row.get('Rate Per Hour', 0))
            if rate_per_hour <= 0:
                self.errors.append(f"Row {row_num}: Rate Per Hour must be greater than 0")
                continue

            labour_amount = self._get_float_value(row.get('Amount', 0))
            if labour_amount <= 0:
                self.errors.append(f"Row {row_num}: Labour Amount must be greater than 0")
                continue

            # Get profit and overhead percentages if provided
            profit_percent = self._get_float_value(row.get('profit_margin_percentage', 0))
            if profit_percent <= 0:
                profit_percent = 15.0  # Default

            overhead_percent = self._get_float_value(row.get('overhead_percentage', 0))
            if overhead_percent <= 0:
                overhead_percent = 10.0  # Default

            # Create unique key for grouping
            item_key = f"{current_work_type}::{item_name}"

            # Initialize item if not exists
            if item_key not in items_dict:
                items_dict[item_key] = {
                    'item_name': item_name,
                    'description': f"{current_main_item} - {description}",
                    'work_type': current_work_type.lower().replace(' ', '_'),
                    'materials': [],
                    'labour': [],
                    'overhead_percentage': overhead_percent,
                    'profit_margin_percentage': profit_percent
                }

            item = items_dict[item_key]

            # Add material (Sub Item)
            material = {
                'material_name': material_name,  # Sub Item
                'quantity': qty,
                'unit': unit.lower(),
                'unit_price': rate
            }

            # Avoid duplicates
            if not any(m['material_name'] == material_name for m in item['materials']):
                item['materials'].append(material)

            # Add labour (already validated above)
            labour = {
                'labour_role': labour_role,
                'hours': working_hours,
                'rate_per_hour': rate_per_hour
            }

            # Avoid duplicates
            if not any(l['labour_role'] == labour_role for l in item['labour']):
                item['labour'].append(labour)

        # Convert dict to list and validate
        items_list = []
        for item in items_dict.values():
            # All items must have both materials and labour (as per template)
            if not item['materials']:
                self.errors.append(f"Item '{item['item_name']}' has no materials")
            if not item['labour']:
                self.errors.append(f"Item '{item['item_name']}' has no labour")

            if item['materials'] and item['labour']:
                items_list.append(item)

        return items_list

    def _get_string_value(self, value, default='') -> str:
        """Safely get string value from cell"""
        if pd.isna(value) or value == 'nan':
            return default
        return str(value).strip()

    def _get_float_value(self, value, default=0.0) -> float:
        """Safely get float value from cell"""
        if pd.isna(value) or value == 'nan':
            return default
        try:
            # Handle string numbers with commas
            if isinstance(value, str):
                value = value.replace(',', '').strip()
            return float(value)
        except (ValueError, TypeError):
            return default


def parse_boq_excel(file_path: str) -> Tuple[bool, Dict[str, Any]]:
    """
    Convenience function to parse BOQ Excel file

    Args:
        file_path: Path to Excel file

    Returns:
        Tuple of (success: bool, result: Dict)
    """
    parser = BOQExcelParser(file_path)
    return parser.parse()
