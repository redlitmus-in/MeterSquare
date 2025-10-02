import re
from config.logging import get_logger

# Optional imports with fallbacks
try:
    import fitz  # PyMuPDF
    PYMUPDF_AVAILABLE = True
except ImportError:
    PYMUPDF_AVAILABLE = False

try:
    import pdfplumber
    PDFPLUMBER_AVAILABLE = True
except ImportError:
    PDFPLUMBER_AVAILABLE = False

log = get_logger()

class PDFExtractor:
    def __init__(self, pdf_path):
        self.pdf_path = pdf_path

    def check_if_scanned(self):
        """Check if PDF is scanned/image-based or has embedded text"""
        if not PYMUPDF_AVAILABLE:
            return False  # Assume it's not scanned if we can't check

        doc = fitz.open(self.pdf_path)
        text_found = False

        for page_num in range(min(3, doc.page_count)):  # Check first 3 pages
            page = doc[page_num]
            text = page.get_text().strip()
            if len(text) > 50:  # If substantial text found
                text_found = True
                break

        doc.close()
        return not text_found

    def extract_with_pdfplumber(self):
        """Extract text and tables using pdfplumber for digital PDFs"""
        if not PDFPLUMBER_AVAILABLE:
            return self.extract_with_pymupdf()

        extracted_data = {
            "pages": [],
            "is_ocr": False,
            "extraction_method": "pdfplumber"
        }

        with pdfplumber.open(self.pdf_path) as pdf:
            for i, page in enumerate(pdf.pages):
                page_data = {
                    "page_number": i + 1,
                    "text": page.extract_text() or "",
                    "tables": []
                }

                # Extract tables
                tables = page.extract_tables()
                if tables:
                    for j, table in enumerate(tables):
                        if table:
                            # Clean up the table data
                            cleaned_table = []
                            for row in table:
                                if row:
                                    cleaned_row = [str(cell).strip() if cell else "" for cell in row]
                                    if any(cleaned_row):  # Only add non-empty rows
                                        cleaned_table.append(cleaned_row)

                            if cleaned_table:
                                page_data["tables"].append({
                                    "table_index": j,
                                    "data": cleaned_table
                                })

                extracted_data["pages"].append(page_data)

        return extracted_data

    def extract_with_pymupdf(self):
        """Extract text using PyMuPDF"""
        if not PYMUPDF_AVAILABLE:
            return {"pages": [], "is_ocr": False, "extraction_method": "none", "error": "No PDF libraries available"}

        extracted_data = {
            "pages": [],
            "is_ocr": False,
            "extraction_method": "pymupdf"
        }

        doc = fitz.open(self.pdf_path)
        for i, page in enumerate(doc):
            page_text = page.get_text()

            page_data = {
                "page_number": i + 1,
                "text": page_text,
                "tables": []
            }

            extracted_data["pages"].append(page_data)

        doc.close()
        return extracted_data

    def extract_boq_structure(self, extracted_data):
        """Parse extracted data to identify BOQ structure"""
        boq_data = {
            "project_info": {},
            "sections": [],
            "summary": {},
            "terms": []
        }

        all_text = ""
        all_tables = []

        # Combine all pages
        for page in extracted_data.get("pages", []):
            all_text += page.get("text", "") + "\n"
            all_tables.extend(page.get("tables", []))

        # Extract project information
        boq_data["project_info"] = self.extract_project_info(all_text)

        # Extract BOQ items from tables
        boq_data["sections"] = self.extract_boq_items_from_tables(all_tables)

        # If no tables found, try to extract from text
        if not boq_data["sections"]:
            boq_data["sections"] = self.extract_boq_items_from_text(all_text)

        # Extract summary
        boq_data["summary"] = self.extract_summary(all_text, all_tables)

        # Extract terms and conditions
        boq_data["terms"] = self.extract_terms(all_text)

        return boq_data

    def extract_project_info(self, text):
        """Extract project information from text"""
        project_info = {}

        # Common patterns for project information
        patterns = {
            "project_name": r"(?:Project|Job|Work)[\s:]+([^\n]+)",
            "client": r"(?:Client|Customer|Owner|To)[\s:]+([^\n]+)",
            "date": r"(?:Date|Dated)[\s:]+([^\n]+)",
            "reference": r"(?:Ref|Reference|Quote|No\.)[\s:#]+([^\n]+)",
        }

        for key, pattern in patterns.items():
            match = re.search(pattern, text, re.IGNORECASE)
            if match:
                project_info[key] = match.group(1).strip()

        return project_info

    def extract_boq_items_from_tables(self, tables):
        """Extract BOQ items from tables"""
        sections = []
        current_section = None

        for table_data in tables:
            if not table_data.get("data"):
                continue

            table = table_data["data"]

            # Identify header row
            header_row = None
            for i, row in enumerate(table):
                # Look for common BOQ headers
                row_lower = [str(cell).lower() for cell in row]
                if any(keyword in " ".join(row_lower) for keyword in ["description", "quantity", "unit", "rate", "amount"]):
                    header_row = i
                    break

            if header_row is None:
                continue

            headers = table[header_row]

            # Map headers to standard fields
            field_mapping = self.map_headers_to_fields(headers)

            if not field_mapping:
                continue

            # Extract items
            for row_idx in range(header_row + 1, len(table)):
                row = table[row_idx]
                if not row or len(row) < len(headers):
                    continue

                item = {}
                for field, col_idx in field_mapping.items():
                    if col_idx < len(row):
                        value = str(row[col_idx]).strip()
                        if field in ["quantity", "rate", "amount"]:
                            # Try to extract numeric value
                            value = self.extract_numeric(value)
                        item[field] = value

                # Only add items with description
                if item.get("description"):
                    if not current_section:
                        current_section = {
                            "name": "General",
                            "category": "General",
                            "code": "G",
                            "items": []
                        }
                        sections.append(current_section)

                    # Auto-generate item number if not present
                    if not item.get("item_no"):
                        item["item_no"] = f"G{len(current_section['items']) + 1}"

                    current_section["items"].append(item)

        return sections

    def extract_boq_items_from_text(self, text):
        """Extract BOQ items from text when no tables are found"""
        sections = [{
            "name": "General",
            "category": "General",
            "code": "G",
            "items": []
        }]

        # Try to find lines that look like BOQ items
        lines = text.split('\n')
        item_counter = 1

        for line in lines:
            line = line.strip()
            if not line:
                continue

            # Look for patterns like "1. Description ... 10 Nos ... 1000"
            # or "Description ... Quantity ... Rate ... Amount"
            numeric_pattern = r'(\d+\.?\d*)\s*([A-Za-z]+)'
            numbers = re.findall(numeric_pattern, line)

            if len(numbers) >= 2:  # At least quantity and rate
                # Extract description (text before first number)
                desc_match = re.match(r'^(.*?)(?:\d|$)', line)
                description = desc_match.group(1).strip() if desc_match else line

                if description and len(description) > 5:
                    item = {
                        "item_no": f"G{item_counter}",
                        "description": description,
                        "quantity": self.extract_numeric(numbers[0][0]) if numbers else 1,
                        "unit": numbers[0][1] if numbers else "Nos",
                        "rate": self.extract_numeric(numbers[1][0]) if len(numbers) > 1 else 0,
                        "amount": 0
                    }
                    item["amount"] = item["quantity"] * item["rate"]
                    sections[0]["items"].append(item)
                    item_counter += 1

        return sections if sections[0]["items"] else []

    def map_headers_to_fields(self, headers):
        """Map table headers to BOQ fields"""
        field_mapping = {}

        header_patterns = {
            "item_no": r"(?:s\.?no|sr|item|#|sl)",
            "description": r"(?:description|details|particulars|item|work)",
            "quantity": r"(?:qty|quantity|quant)",
            "unit": r"(?:unit|uom|measurement)",
            "rate": r"(?:rate|price|cost|unit rate)",
            "amount": r"(?:amount|total|value)"
        }

        for field, pattern in header_patterns.items():
            for i, header in enumerate(headers):
                if header and re.search(pattern, str(header), re.IGNORECASE):
                    field_mapping[field] = i
                    break

        return field_mapping

    def extract_numeric(self, value):
        """Extract numeric value from string"""
        if not value:
            return 0

        # Remove currency symbols and commas
        value = re.sub(r'[^\d.-]', '', str(value))

        try:
            return float(value)
        except:
            return 0

    def extract_summary(self, text, tables):
        """Extract BOQ summary information"""
        summary = {
            "sub_total": 0,
            "tax": 0,
            "total": 0
        }

        # Look for summary in text
        patterns = {
            "sub_total": r"(?:sub[\s-]?total|subtotal)[\s:]+[\D]*([\d,]+\.?\d*)",
            "tax": r"(?:tax|vat|gst)[\s:]+[\D]*([\d,]+\.?\d*)",
            "total": r"(?:grand[\s-]?total|total[\s-]?amount|total)[\s:]+[\D]*([\d,]+\.?\d*)"
        }

        for key, pattern in patterns.items():
            match = re.search(pattern, text, re.IGNORECASE)
            if match:
                summary[key] = self.extract_numeric(match.group(1))

        return summary

    def extract_terms(self, text):
        """Extract terms and conditions"""
        terms = []

        # Look for terms section
        terms_match = re.search(r"(?:terms[\s&]*conditions?|conditions?|notes?)[\s:]*([^]+)", text, re.IGNORECASE)

        if terms_match:
            terms_text = terms_match.group(1)
            # Split by common delimiters
            term_lines = re.split(r'[\n•▪▫◦‣⁃]', terms_text)

            for line in term_lines[:10]:  # Limit to first 10 terms
                line = line.strip()
                if len(line) > 10:  # Filter out very short lines
                    terms.append(line)

        return terms

    def extract(self):
        """Main extraction method"""
        try:
            # Try pdfplumber first, then fall back to PyMuPDF
            if PDFPLUMBER_AVAILABLE:
                extracted_data = self.extract_with_pdfplumber()
            elif PYMUPDF_AVAILABLE:
                extracted_data = self.extract_with_pymupdf()
            else:
                return {
                    "success": False,
                    "error": "No PDF extraction libraries available. Please install pdfplumber or PyMuPDF."
                }

            # Parse BOQ structure
            boq_data = self.extract_boq_structure(extracted_data)

            return {
                "success": True,
                "boq_data": boq_data,
                "extraction_method": extracted_data.get("extraction_method", "unknown"),
                "is_ocr": extracted_data.get("is_ocr", False)
            }

        except Exception as e:
            log.error(f"Error extracting PDF: {str(e)}")
            return {
                "success": False,
                "error": str(e)
            }

def extract_boq_from_pdf(pdf_path):
    """Utility function to extract BOQ from PDF"""
    try:
        extractor = PDFExtractor(pdf_path)
        result = extractor.extract()

        if result["success"]:
            boq_data = result["boq_data"]

            # Format response for frontend
            formatted_data = {
                "title": boq_data["project_info"].get("project_name", "Untitled BOQ"),
                "client": boq_data["project_info"].get("client", ""),
                "date": boq_data["project_info"].get("date", ""),
                "reference": boq_data["project_info"].get("reference", ""),
                "sections": boq_data["sections"],
                "summary": boq_data["summary"],
                "terms": boq_data["terms"],
                "extraction_method": result.get("extraction_method"),
                "is_ocr": result.get("is_ocr", False)
            }

            # If no sections were extracted, create a default structure
            if not formatted_data["sections"]:
                formatted_data["sections"] = [{
                    "name": "General Items",
                    "category": "General",
                    "code": "G",
                    "items": []
                }]

            return formatted_data
        else:
            raise Exception(result.get("error", "Unknown error"))

    except Exception as e:
        log.error(f"Error in extract_boq_from_pdf: {str(e)}")
        # Return a basic structure even on error
        return {
            "title": "Manual Entry Required",
            "client": "",
            "date": "",
            "reference": "",
            "sections": [{
                "name": "General Items",
                "category": "General",
                "code": "G",
                "items": []
            }],
            "summary": {"sub_total": 0, "tax": 0, "total": 0},
            "terms": [],
            "extraction_method": "manual",
            "is_ocr": False,
            "error": str(e)
        }