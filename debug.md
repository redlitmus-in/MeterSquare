[DEBUG] Total items in form state: 1 BOQCreationForm.tsx:1024:17
[DEBUG] Item names in form state: 
Array [ "paintingwork" ]
​
0: "paintingwork"
​
length: 1
​
<prototype>: Array []
BOQCreationForm.tsx:1025:17
[DEBUG] Processing item for payload: paintingwork BOQCreationForm.tsx:1040:21
[DEBUG] Final payload items count: 1 BOQCreationForm.tsx:1123:17
[DEBUG] Final payload item names: 
Array [ "paintingwork" ]
​
0: "paintingwork"
​
length: 1
​
<prototype>: Array []
BOQCreationForm.tsx:1124:17
[DEBUG] Full payload: {
  "project_id": 150,
  "boq_name": "BOQ for tuesdayf",
  "status": "Draft",
  "created_by": "Estimator",
  "preliminaries": {
    "items": [],
    "notes": "Note: All authority charges & deposit are excluded (Approximate cost 10,000/-)"
  },
  "items": [
    {
      "item_name": "paintingwork",
      "quantity": 1,
      "unit": "nos",
      "rate": 5000,
      "overhead_percentage": 10,
      "profit_margin_percentage": 15,
      "discount_percentage": 2,
      "vat_percentage": 2,
      "item_total": 200,
      "overhead_amount": 20,
      "profit_margin_amount": 30,
      "subtotal": 250,
      "discount_amount": 5,
      "after_discount": 245,
      "vat_amount": 4.9,
      "selling_price": 249.9,
      "sub_items": [
        {
          "sub_item_name": "Wall painting",
          "scope": "Wall painting",
          "size": "120cm*120cm",
          "location": "Living room",
          "brand": "RAK",
          "quantity": 1,
          "unit": "nos",
          "rate": 200,
          "per_unit_cost": 200,
          "sub_item_total": 200,
          "materials": [
            {
              "material_name": "paint",
              "quantity": 1,
              "unit": "nos",
              "unit_price": 200,
              "total_price": 200,
              "description": null,
              "vat_percentage": 0,
              "master_material_id": null
            },
            {
              "material_name": "Brush",
              "quantity": 1,
              "unit": "nos",
              "unit_price": 500,
              "total_price": 500,
              "description": null,
              "vat_percentage": 0,
              "master_material_id": null
            }
          ],
          "labour": [
            {
              "labour_role": "Painter",
              "work_type": "daily_wages",
              "hours": 8,
              "rate_per_hour": 5,
              "total_amount": 40,
              "master_labour_id": null
            }
          ]
        }
      ],
      "materials": [],
      "labour": [],
      "master_item_id": null,
      "is_new": true
    }
  ]
} BOQCreationForm.tsx:1125:17
Creating BOQ with payload: 
Object { project_id: 150, boq_name: "BOQ for tuesdayf", status: "Draft", created_by: "Estimator", preliminaries: {…}, items: (1) […] }
​
boq_name: "BOQ for tuesdayf"
​
created_by: "Estimator"
​
items: Array [ {…} ]
​​
0: Object { item_name: "paintingwork", quantity: 1, unit: "nos", … }
​​
length: 1
​​
<prototype>: Array []
​
preliminaries: Object { items: [], notes: "Note: All authority charges & deposit are excluded (Approximate cost 10,000/-)" }
​​
items: Array []
​​​
length: 0
​​​
<prototype>: Array []
​​
notes: "Note: All authority charges & deposit are excluded (Approximate cost 10,000/-)"
​​
<prototype>: Object { … }
​
project_id: 150
​
status: "Draft"
​
<prototype>: Object { … }
estimatorService.ts:80:15
Processed BOQ payload with totals: 
Object { project_id: 150, boq_name: "BOQ for tuesdayf", status: "Draft", created_by: "Estimator", preliminaries: {…}, items: (1) […] }
​
boq_name: "BOQ for tuesdayf"
​
created_by: "Estimator"
​
items: Array [ {…} ]
​​
0: Object { item_name: "paintingwork", quantity: 1, unit: "nos", … }
​​​
after_discount: 245
​​​
discount_amount: 5
​​​
discount_percentage: 2
​​​
is_new: true
​​​
item_name: "paintingwork"
​​​
item_total: 200
​​​
labour: Array []
​​​​
length: 0
​​​​
<prototype>: Array []
​​​
master_item_id: null
​​​
materials: Array []
​​​​
length: 0
​​​​
<prototype>: Array []
​​​
overhead_amount: 20
​​​
overhead_percentage: 10
​​​
profit_margin_amount: 30
​​​
profit_margin_percentage: 15
​​​
quantity: 1
​​​
rate: 5000
​​​
selling_price: 249.9
​​​
sub_items: Array [ {…} ]
​​​​
0: Object { sub_item_name: "Wall painting", scope: "Wall painting", size: "120cm*120cm", … }
​​​​​
brand: "RAK"
​​​​​
labour: Array [ {…} ]
​​​​​​
0: Object { labour_role: "Painter", work_type: "daily_wages", hours: 8, … }
​​​​​​​
hours: 8
​​​​​​​
labour_role: "Painter"
​​​​​​​
master_labour_id: null
​​​​​​​
rate_per_hour: 5
​​​​​​​
total_amount: 40
​​​​​​​
work_type: "daily_wages"
​​​​​​​
<prototype>: Object { … }
​​​​​​
length: 1
​​​​​​
<prototype>: Array []
​​​​​
location: "Living room"
​​​​​
materials: Array [ {…}, {…} ]
​​​​​​
0: Object { material_name: "paint", quantity: 1, unit: "nos", … }
​​​​​​​
description: null
​​​​​​​
master_material_id: null
​​​​​​​
material_name: "paint"
​​​​​​​
quantity: 1
​​​​​​​
total_price: 200
​​​​​​​
unit: "nos"
​​​​​​​
unit_price: 200
​​​​​​​
vat_percentage: 0
​​​​​​​
<prototype>: Object { … }
​​​​​​
1: Object { material_name: "Brush", quantity: 1, unit: "nos", … }
​​​​​​​
description: null
​​​​​​​
master_material_id: null
​​​​​​​
material_name: "Brush"
​​​​​​​
quantity: 1
​​​​​​​
total_price: 500
​​​​​​​
unit: "nos"
​​​​​​​
unit_price: 500
​​​​​​​
vat_percentage: 0
​​​​​​​
<prototype>: Object { … }
​​​​​​
length: 2
​​​​​​
<prototype>: Array []
​​​​​
per_unit_cost: 200
​​​​​
quantity: 1
​​​​​
rate: 200
​​​​​
scope: "Wall painting"
​​​​​
size: "120cm*120cm"
​​​​​
sub_item_name: "Wall painting"
​​​​​
sub_item_total: 200
​​​​​
unit: "nos"
​​​​​
<prototype>: Object { … }
​​​​
length: 1
​​​​
<prototype>: Array []
​​​
subtotal: 250
​​​
unit: "nos"
​​​
vat_amount: 4.9
​​​
vat_percentage: 2
​​​
<prototype>: Object { … }
​​
length: 1
​​
<prototype>: Array []
​
preliminaries: Object { items: [], notes: "Note: All authority charges & deposit are excluded (Approximate cost 10,000/-)" }
​​
items: Array []
​​​
length: 0
​​​
<prototype>: Array []
​​
notes: "Note: All authority charges & deposit are excluded (Approximate cost 10,000/-)"
​​
<prototype>: Object { … }
​
project_id: 150
​
status: "Draft"
​
<prototype>: Object { … }
estimatorService.ts:120:15
BOQ creation response: 
Object { boq: {…}, message: "BOQ created successfully" }
​
boq: Object { boq_id: 302, boq_name: "BOQ for tuesdayf", estimatedSellingPrice: 5279.799999999999, … }
​​
boq_id: 302
​​
boq_name: "BOQ for tuesdayf"
​​
estimatedSellingPrice: 5279.799999999999
​​
items_count: 2
​​
labour_count: 1
​​
materials_count: 2
​​
project_id: 150
​​
selling_price: 5279.799999999999
​​
status: "Draft"
​​
total_cost: 5279.799999999999
​​
<prototype>: Object { … }
​
message: "BOQ created successfully"

DEBUG] Rendering existing item 0: gypsum partition master_item_id: undefined BOQDetailsModal.tsx:347:39
[DEBUG] Rendering existing item 1: gypsum partition master_item_id: 232 BOQDetailsModal.tsx:347:39
[DEBUG] BOQ data received from API: 
Object { boq_id: 302, boq_name: "BOQ for tuesdayf", combined_summary: {…}, created_at: "2025-10-16T12:00:57.065217", created_by: "Estimator", email_sent: false, existing_purchase: {…}, new_purchase: {…}, overhead_percentage: 10, preliminaries: {…}, … }
​
boq_id: 302
​
boq_name: "BOQ for tuesdayf"
​
combined_summary: Object { balance_amount: 5279.799999999999, estimatedSellingPrice: 5279.799999999999, existing_purchase_amount: 0, … }
​​
balance_amount: 5279.799999999999
​​
estimatedSellingPrice: 5279.799999999999
​​
existing_purchase_amount: 0
​​
new_purchase_amount: 0
​​
selling_price: 5279.799999999999
​​
total_cost: 5279.799999999999
​​
total_item_amount: 5279.799999999999
​​
total_items: 2
​​
total_labour: 0
​​
total_labour_cost: 80
​​
total_material_cost: 1400
​​
total_materials: 0
​​
total_purchased_amount: 0
​​
<prototype>: Object { … }
​
created_at: "2025-10-16T12:00:57.065217"
​
created_by: "Estimator"
​
email_sent: false
​
existing_purchase: Object { items: (2) […], summary: {…} }
​​
items: Array [ {…}, {…} ]
​​​
0: Object { actualItemCost: 740, after_discount: 245, base_cost: 740, … }
​​​​
actualItemCost: 740
​​​​
after_discount: 245
​​​​
base_cost: 740
​​​​
description: ""
​​​​
discount_amount: 5
​​​​
discount_percentage: 2
​​​​
estimatedSellingPrice: 249.9
​​​​
has_sub_items: true
​​​​
item_name: "paintingwork"
​​​​
item_total: 5000
​​​​
labour: Array []
​​​​​
length: 0
​​​​​
<prototype>: Array []
​​​​
materials: Array []
​​​​​
length: 0
​​​​​
<prototype>: Array []
​​​​
overhead_amount: 20
​​​​
overhead_percentage: 10
​​​​
profit_margin_amount: 30
​​​​
profit_margin_percentage: 15
​​​​
quantity: 1
​​​​
rate: 5000
​​​​
selling_price: 249.9
​​​​
sub_items: Array [ {…} ]
​​​​​
0: Object { after_discount: 245, base_total: 200, brand: "RAK", … }
​​​​​​
after_discount: 245
​​​​​​
base_total: 200
​​​​​​
brand: "RAK"
​​​​​​
description: ""
​​​​​​
discount_amount: 5
​​​​​​
discount_percentage: 2
​​​​​​
labour: Array [ {…} ]
​​​​​​​
0: Object { hours: 8, labour_role: "Painter", rate_per_hour: 5, … }
​​​​​​​​
hours: 8
​​​​​​​​
labour_role: "Painter"
​​​​​​​​
rate_per_hour: 5
​​​​​​​​
total_cost: 40
​​​​​​​​
<prototype>: Object { … }
​​​​​​​
length: 1
​​​​​​​
<prototype>: Array []
​​​​​​
labour_cost: 40
​​​​​​
location: "Living room"
​​​​​​
materials: Array [ {…}, {…} ]
​​​​​​​
0: Object { material_name: "paint", quantity: 1, total_price: 200, … }
​​​​​​​​
brand: ""
​​​​​​​​
description: null
​​​​​​​​
location: ""
​​​​​​​​
material_name: "paint"
​​​​​​​​
quantity: 1
​​​​​​​​
total_price: 200
​​​​​​​​
unit: "nos"
​​​​​​​​
unit_price: 200
​​​​​​​​
vat_percentage: 0
​​​​​​​​
<prototype>: Object { … }
​​​​​​​
1: Object { material_name: "Brush", quantity: 1, total_price: 500, … }
​​​​​​​​
brand: ""
​​​​​​​​
description: null
​​​​​​​​
location: ""
​​​​​​​​
material_name: "Brush"
​​​​​​​​
quantity: 1
​​​​​​​​
total_price: 500
​​​​​​​​
unit: "nos"
​​​​​​​​
unit_price: 500
​​​​​​​​
vat_percentage: 0
​​​​​​​​
<prototype>: Object { … }
​​​​​​​
length: 2
​​​​​​​
<prototype>: Array []
​​​​​​
materials_cost: 700
​​​​​​
overhead_amount: 20
​​​​​​
overhead_percentage: 10
​​​​​​
profit_margin_amount: 30
​​​​​​
profit_margin_percentage: 15
​​​​​​
quantity: 1
​​​​​​
rate: 200
​​​​​​
selling_price: 249.9
​​​​​​
sub_item_name: "Wall painting"
​​​​​​
subtotal: 250
​​​​​​
unit: "nos"
​​​​​​
vat_amount: 4.9
​​​​​​
vat_percentage: 2
​​​​​​
<prototype>: Object { … }
​​​​​
length: 1
​​​​​
<prototype>: Array []
​​​​
sub_items_cost: 740
​​​​
subtotal: 250
​​​​
totalLabourCost: 40
​​​​
totalMaterialCost: 700
​​​​
total_cost: 249.9
​​​​
total_labour: 1
​​​​
total_materials: 2
​​​​
total_selling_price: 249.9
​​​​
unit: "nos"
​​​​
vat_amount: 4.9
​​​​
vat_percentage: 2
​​​​
work_type: "contract"
​​​​
<prototype>: Object { … }
​​​
1: Object { actualItemCost: 740, base_cost: 740, discount_amount: 5, … }
​​​​
actualItemCost: 740
​​​​
base_cost: 740
​​​​
description: null
​​​​
discount_amount: 5
​​​​
discount_percentage: 2
​​​​
estimatedSellingPrice: 5029.9
​​​​
item_name: "paintingwork"
​​​​
item_total_cost: 5000
​​​​
labour: Array []
​​​​​
length: 0
​​​​​
<prototype>: Array []
​​​​
master_item_id: 242
​​​​
materials: Array []
​​​​​
length: 0
​​​​​
<prototype>: Array []
​​​​
miscellaneous_amount: 20
​​​​
miscellaneous_percentage: 10
​​​​
overhead_amount: 20
​​​​
overhead_percentage: 10
​​​​
per_unit_cost: 5000
​​​​
profit_margin_amount: 30
​​​​
profit_margin_percentage: 15
​​​​
quantity: 1
​​​​
rate: 5000
​​​​
selling_price: 5029.9
​​​​
selling_price_before_discount: 5030
​​​​
sub_items: Array [ {…} ]
​​​​​
0: Object { brand: "RAK", location: "Living room", master_sub_item_id: 21, … }
​​​​​​
brand: "RAK"
​​​​​​
description: ""
​​​​​​
labour: Array [ {…} ]
​​​​​​​
0: Object { hours: 8, labour_role: "Painter", rate_per_hour: 5, … }
​​​​​​​​
hours: 8
​​​​​​​​
labour_role: "Painter"
​​​​​​​​
rate_per_hour: 5
​​​​​​​​
total_cost: 40
​​​​​​​​
<prototype>: Object { … }
​​​​​​​
length: 1
​​​​​​​
<prototype>: Array []
​​​​​​
location: "Living room"
​​​​​​
master_sub_item_id: 21
​​​​​​
materials: Array [ {…}, {…} ]
​​​​​​​
0: Object { material_name: "paint", quantity: 1, total_price: 200, … }
​​​​​​​​
brand: ""
​​​​​​​​
description: null
​​​​​​​​
location: ""
​​​​​​​​
material_name: "paint"
​​​​​​​​
quantity: 1
​​​​​​​​
total_price: 200
​​​​​​​​
unit: "nos"
​​​​​​​​
unit_price: 200
​​​​​​​​
<prototype>: Object { … }
​​​​​​​
1: Object { material_name: "Brush", quantity: 1, total_price: 500, … }
​​​​​​​​
brand: ""
​​​​​​​​
description: null
​​​​​​​​
location: ""
​​​​​​​​
material_name: "Brush"
​​​​​​​​
quantity: 1
​​​​​​​​
total_price: 500
​​​​​​​​
unit: "nos"
​​​​​​​​
unit_price: 500
​​​​​​​​
<prototype>: Object { … }
​​​​​​​
length: 2
​​​​​​​
<prototype>: Array []
​​​​​​
per_unit_cost: 200
​​​​​​
quantity: 1
​​​​​​
sub_item_name: "Wall painting"
​​​​​​
total_cost: 740
​​​​​​
total_labour_cost: 40
​​​​​​
total_materials_cost: 700
​​​​​​
unit: "nos"
​​​​​​
<prototype>: Object { … }
​​​​​
length: 1
​​​​​
<prototype>: Array []
​​​​
sub_items_cost: 740
​​​​
totalLabourCost: 40
​​​​
totalMaterialCost: 700
​​​​
total_amount: null
​​​​
total_cost: 5030
​​​​
unit: "nos"
​​​​
vat_amount: 4.9
​​​​
vat_percentage: 2
​​​​
work_type: "contract"
​​​​
<prototype>: Object { … }
​​​
length: 2
​​​
<prototype>: Array []
​​
summary: Object { estimatedSellingPrice: 5279.799999999999, selling_price: 5279.799999999999, total_cost: 5279.799999999999, … }
​​​
estimatedSellingPrice: 5279.799999999999
​​​
selling_price: 5279.799999999999
​​​
total_cost: 5279.799999999999
​​​
total_items: 2
​​​
total_labour: 0
​​​
total_labour_cost: 80
​​​
total_material_cost: 1400
​​​
total_materials: 0
​​​
<prototype>: Object { … }
​​
<prototype>: Object { … }
​
new_purchase: Object { access_info: {…}, items: [], summary: {…} }
​​
access_info: Object { boq_status: "Draft", can_view: false, user_role: "estimator" }
​​​
boq_status: "Draft"
​​​
can_view: false
​​​
user_role: "estimator"
​​​
<prototype>: Object { … }
​​
items: Array []
​​​
length: 0
​​​
<prototype>: Array []
​​
summary: Object { estimatedSellingPrice: 0, selling_price: 0, total_cost: 0, … }
​​​
estimatedSellingPrice: 0
​​​
selling_price: 0
​​​
total_cost: 0
​​​
total_items: 0
​​​
total_material_cost: 0
​​​
total_materials: 0
​​​
<prototype>: Object { … }
​​
<prototype>: Object { … }
​
overhead_percentage: 10
​
preliminaries: Object { items: [], notes: "Note: All authority charges & deposit are excluded (Approximate cost 10,000/-)" }
​​
items: Array []
​​
notes: "Note: All authority charges & deposit are excluded (Approximate cost 10,000/-)"
​​
<prototype>: Object { … }
​
profit_margin: 15
​
profit_margin_percentage: 15
​
project_details: Object { floor: "dfsgh", hours: "dfsgh", location: "sadfg", … }
​​
floor: "dfsgh"
​​
hours: "dfsgh"
​​
location: "sadfg"
​​
project_name: "tuesdayf"
​​
status: "active"
​​
<prototype>: Object { … }
​
project_id: 150
​
status: "Draft"
​
total_labour_cost: 80
​
total_material_cost: 1400
​
user_id: null
​
<prototype>: Object { … }
BOQDetailsModal.tsx:67:17
[DEBUG] Items count in response: 0 BOQDetailsModal.tsx:68:17
[DEBUG] Item names in response: 
Array []
​
length: 0
​
<prototype>: Array []
BOQDetailsModal.tsx:69:17
[DEBUG] Existing purchase items: 2 BOQDetailsModal.tsx:70:17
[DEBUG] New purchase items: 0 BOQDetailsModal.tsx:71:17
[DEBUG] Rendering existing item 0: paintingwork master_item_id: undefined BOQDetailsModal.tsx:347:39
[DEBUG] Rendering existing item 1: paintingwork master_item_id: 242 BOQDetailsModal.tsx:347:39
[DEBUG] Rendering existing item 0: paintingwork master_item_id: undefined BOQDetailsModal.tsx:347:39
[DEBUG] Rendering existing item 1: paintingwork master_item_id: 242