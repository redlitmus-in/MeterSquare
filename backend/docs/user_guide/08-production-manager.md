# Production Manager (M2 Store)

The Production Manager runs the **M2 Store** warehouse. All purchased materials pass through the store for inspection before going to site. The Production Manager also manages returnable assets (tools and equipment) and the labour registry.

Production Manager menu:

- **Dashboard**
- **Inventory Management**: Materials Catalog, Stock In, Stock Out, Receive Returns, Repair, Disposal
- **Returnable Assets**: Asset Catalog, Stock In, Stock Out, Process Returns, Repair, Disposal
- **Labour**: Labour Registry, Assign Workers

## Material flow through the M2 Store

```flow
Procurement: Completes a purchase. The request is routed to the M2 Store
Vendor: Delivers the materials to the M2 Store
Production Manager: Inspects the delivery (Stock In, Vendor Deliveries)
Production Manager: Records Stock In for the accepted materials
Production Manager: Approves the material request and creates a Delivery Note
Production Manager: Issues and dispatches the Delivery Note to site
Site Engineer: Confirms receipt on site (Delivered)
Site Engineer: Sends unused material back with a Return Delivery Note
Production Manager: Receives the return: Good to stock, Damaged to repair, or Disposal
```

## Production Dashboard

The **Production Dashboard** shows the store at a glance.

- **Cards**: Total Materials, Inventory Value, Stock Alerts, Pending Actions, Delivery Notes (in transit), Material Requests (pending), Incoming Returns, Stock Movement (30 days).
- **Panels**:
  - Stock Health: healthy, low, critical, out of stock, and the backup stock value.
  - Delivery Notes by status.
  - Material Requests by status.
  - Top Categories.
  - Returns & Disposal.
  - Today's Activity.
  - Recent Delivery Notes and Recent Activity.

### What the stock colours mean

- **Out of stock**: the stock is 0.
- **Critical**: well below the minimum stock level.
- **Low**: at or below the minimum stock level.
- **Healthy**: above the minimum.

## Main stock and backup stock

Each material has two stock figures:

- **Current stock (main stock)**: usable stock.
  - Goes **up** with Stock In, buyer transfers received, good returns and repaired items.
  - Goes **down** when a material request is approved, and with TD-approved disposals.
- **Backup stock**: damaged or partly usable stock.
  - Goes **up** when returned items are sent for repair, or when the TD rejects a disposal.
  - Goes **down** when an item is marked repaired, which moves it to main stock.

The Materials Catalog shows backup stock as a blue **+N backup** badge.

## Materials Catalog

Open **Inventory Management** → **Materials Catalog**.

- Search by name, code or brand, and filter by category.
- **Columns**: Code, Name (and brand), Category, Availability, Current Stock (with **Min** underneath), Unit Price.
- Current stock is red at 0, orange at or below the minimum, and green otherwise.
- New materials are added automatically when you record a Stock In. There is no separate "add" button here.

### How to request disposal of a damaged or wasted material

1. Click the orange warning icon on the material's row. It is shown only when stock is above 0.
2. Enter the **Quantity to Dispose**. The estimated value is calculated.
3. Choose a **Reason for Disposal**: Damaged/Defective, Expired, Wasted, Obsolete, Lost/Missing or Other.
4. Add **Additional Notes**.
5. Click **Submit for TD Approval**.

Stock does not change until the Technical Director approves. On approval, current stock is reduced.

## Stock In (receiving into the store)

Open **Inventory Management** → **Stock In**. The page lists purchases received, grouped by material. Expand a material to see each receipt: date, quantity, price, reference, delivery note, driver, vehicle and transport fee.

There are three header buttons:

- **Buyer Transfers**
- **Vendor Deliveries** (the red badge shows how many deliveries are waiting for inspection)
- **Record Stock In**

### How to inspect a vendor delivery

1. Click **Vendor Deliveries**. The **Inspection Centre** opens.
2. In **Pending Inspections**, click **Inspect** on the delivery.
3. For each material, enter the **Accepted** quantity. The rejected quantity is calculated. Use **Accept All** or **Reject All** as shortcuts.
4. For anything rejected, choose a **Rejection Reason**: Quality Defect, Wrong Specification, Quantity Shortage, Damaged in Transit, Expired / Outdated or Other. Notes are optional.
5. Fill in **Transport Details**: Driver Name, Vehicle Number, Reference / PO Number.
6. Add **Overall Inspection Notes**.
7. Upload **Inspection Evidence**. This is required if anything is rejected. You can upload images (up to 2 MB), PDF (up to 10 MB) or video (up to 50 MB).
8. Click **Submit Inspection**.

What happens next:

- **Everything accepted**: the Record Stock In form opens pre-filled. You can stock in now, or later from the **Awaiting Stock In** tab.
- **Partly accepted**: the buyer is notified about the rejected items. Rejected quantities are listed under **Held Materials**. Stock in the accepted materials.
- **Everything rejected**: nothing enters stock and the buyer is notified to handle the return.

Submitting an inspection does **not** add stock. Stock is added when you complete **Record Stock In**.

**Other Inspection Centre tabs**:

- **Awaiting Stock In**: inspected deliveries not yet stocked in.
- **Inspection History**: filter by Fully Approved, Partially Approved or Fully Rejected.
- **Held Materials**: rejected quantities kept at the store until the buyer arranges the return, with refund or credit-note details.

### How to record Stock In

1. Click **Record Stock In**, or **Stock In** on an inspected delivery.
2. Select the **Project** and the **Material**. If the material is not in the catalog, choose **+ Create New Material**.
3. Enter **Quantity Received** and **Actual Purchase Price (AED)**. The total is calculated.
4. Optional: enter the **Reference Number (PO/Invoice)** and **Notes**.
5. Enter transport details: **Driver Name**, **Vehicle Number** and the transport fee (default 1.00 AED per unit).
   - Use **Recent Deliveries** or **Last Delivery** to reuse details from the same truck.
   - Materials from the same delivery share one batch reference. Only the first material should carry the transport fee.
6. Upload the **Delivery Note from Vendor** (PDF, JPG, PNG, DOC or DOCX, up to 10 MB).
7. Click **Confirm Stock In**, then **Confirm**.

Current stock increases by the quantity. For an inspected delivery with several materials, the form lists them all; click **Confirm Stock In (N materials)** and then **Confirm All**.

### How to add a new material

When **+ Create New Material** opens:

1. Enter **Material Name** and **Unit**. If you type a unit that does not exist, it is created.
2. Optional: **Brand**, **Size**, **Category**, **Min Stock Level** and **Description**.
3. Click **Create Material**.

The material starts with 0 stock. Its price is set on the first Stock In.

### How to receive a buyer transfer

Buyers can send materials to the M2 Store directly.

1. Click **Buyer Transfers**.
2. In the **Pending** tab, check the transfer and click **Receive**.

The materials are added to inventory. The **History** tab keeps received transfers, each with a PDF.

## Stock Out (material requests and delivery notes)

Open **Inventory Management** → **Stock Out**. Tabs: **Pending**, **Approved**, **Draft DN**, **Issued DN**, **Completed**, **Rejected**, **Delivered DN**.

### Material requests (IMR)

A material request is created automatically when **Procurement** completes a purchase that goes through the store, or routes a request to the store. One request covers all materials of a purchase.

The table shows Request #, Project, Requester, Material, Qty, Stock / Destination, Status, Date and Actions. A **Vendor Delivery** badge marks materials coming from a vendor, with the destination site shown.

### How to approve or reject a material request

1. In **Pending**, check the stock shown for the materials.
2. Click **Approve**. The button is disabled when stock is not enough.
3. Or click **Reject** and enter a **Rejection Reason**.

What happens:

- **Approve**: the stock is deducted from current stock and the request moves to **Approved**. The buyer is notified.
- **Reject**: the buyer is notified with the reason.
- For a vendor delivery, the button is **Confirm Receipt**. It does not change stock overall.

### How to create a Delivery Note (DN) to site

1. In **Approved**, click **Create DN** on the request. If the stock is not enough, the row shows **Awaiting Stock** instead.
2. Check the project and **Attention To (Site Engineer)**. This is pre-selected from the buyer's chosen recipient or the project's Site Engineer.
3. Enter:
   - **Delivery Date** (default today)
   - **Requested By** (pre-filled)
   - the transport fee (default 1.00 AED per unit, must be above 0)
   - **Driver Name** (letters only), **Vehicle Number** and **Driver Contact**
4. Check the items and add **Notes**.
5. Click **Create Delivery Note**.

The DN is created as **Draft** and appears in **Draft DN**. It is numbered MDN-<year>-<number>.

### How to issue and dispatch a Delivery Note

1. In **Draft DN**, click **Issue** and confirm. The DN becomes **Issued** and the buyer is notified that materials are being prepared. You can **Cancel** a DN only while it is a draft.
2. In **Issued DN**, click **Dispatch** and confirm. The DN becomes **In Transit**. The project's Site Engineers and the buyer are notified with the materials, vehicle and driver.
3. The Site Engineer confirms receipt on site. The DN becomes **Delivered** (or **Partial** if less arrived) and the request becomes **Fulfilled**. The buyer and the Production Managers are notified.

Every DN can be downloaded as a PDF or printed.

### Material request statuses

| Status | Meaning |
|---|---|
| Pending | Waiting for your approval, or waiting for the vendor delivery to arrive and be inspected |
| Approved | Approved and stock deducted. Ready for a Delivery Note. |
| DN Pending | Added to a draft Delivery Note |
| Dispatched | The Delivery Note was issued or dispatched |
| Fulfilled | The Site Engineer confirmed delivery |
| Rejected | Rejected by you (the buyer is told why), or the vendor delivery was fully rejected at inspection |

### Delivery Note statuses

| Status | Meaning |
|---|---|
| Draft | Created. Can be issued or cancelled. |
| Issued | Being prepared. Requests show Dispatched. |
| In Transit | On the way to site |
| Delivered | Site confirmed receipt of everything |
| Partial | Site received less than was sent |
| Cancelled | Cancelled while still a draft |

## Receive Returns (material returns from site)

Site Engineers return unused or damaged material with a **Return Delivery Note (RDN)**, numbered RDN-<year>-<number>. Open **Inventory Management** → **Receive Returns**.

- **In Transit**: returns on the way, or received but not fully processed.
- **Received**: fully processed returns.

### How to receive and process a return

1. When the RDN is **In Transit**, click **Confirm Receipt**. Later, use **Process Items** for anything left unprocessed.
2. Each item shows its condition from site (**Good**, **Damaged** or **Defective**) and the return reason. Choose the action:
   - **Good** → **Add to Stock**: added to current stock.
   - **Damaged/Defective** → **Send for Repair**: added to backup stock and listed under **Repair**.
   - **Damaged/Defective** → **Mark for Disposal**: sent to the TD for approval. A note explaining why is required.
3. Optional: add **General Acceptance Notes**.
4. Click **Process** on each item, or **Confirm & Process All**.

When every item is processed, the return is complete.

## Repair (materials)

Open **Inventory Management** → **Repair**. The tabs are **Pending Repair** and **Completed**. Click **View** on an item.

- **Mark as Repaired → Add to Stock**: then **Confirm Repair**. The quantity moves from backup stock to main stock.
- **Cannot Repair - Request Disposal**: add a reason. The request goes to the TD.

## Disposal (materials)

Open **Inventory Management** → **Disposal** to follow disposal requests. This page is for viewing only.

- **Pending TD Approval**: waiting for the Technical Director.
- **TD Approved - Ready for Disposal**: approved. Dispose of the material physically.

The TD either approves (stock is reduced) or rejects (the quantity goes to backup stock).

## Returnable Assets

Returnable assets are tools and equipment that go to site and come back.

### Asset Catalog

Open **Returnable Assets** → **Asset Catalog**. Each asset type shows its code, tracking type, and Available, Dispatched and Total quantities.

- **Quantity based** tracking counts the total number.
- **Individual** tracking records each item by serial number.

To dispose of an asset:

1. Click **Dispose**.
2. Enter the **Quantity to Dispose**.
3. Choose a reason: Damaged Beyond Repair, Obsolete / Outdated, End of Life, Lost / Missing, Safety Hazard or Other.
4. Add notes and click **Submit Request**.

The quantity is taken out of available stock straight away, and the request goes to the TD for approval.

### How to add assets (Asset Stock In)

1. Open **Returnable Assets** → **Stock In** and click **Add Stock**.
2. Choose or type the **Asset Category**, and enter the **Quantity**. For a new category, choose the **Tracking Mode**: Quantity Based or Individual.
3. Optional: **Vendor**, **Invoice Number**, **Purchase Date**, **Unit Cost**, **Total Cost**, **Condition** (New, Second Hand, Refurbished or Repaired) and **Notes**.
4. Attach the **DN/Invoice/Receipt** document. This is required.
5. For individual tracking, enter each item's **Serial Number**.
6. Click **Create Stock In**.

The available quantity increases. The **Stock In History** table lists every entry.

### Asset Dispatch (Stock Out)

Open **Returnable Assets** → **Stock Out**. Tabs: **Pending**, **Ready**, **Rejected**, **Draft ADN**, **Issued ADN**, **Delivered ADN**.

Asset requests come from Site Engineers after the Project Manager approves them.

**How to handle an asset request:**

1. In **Pending**, open **Details**.
2. Click **Approve**. Stock is checked; if it is not enough you see "Insufficient stock". Or click **Reject** and enter a reason.
3. The Site Engineer is notified.

**How to create and dispatch an Asset Delivery Note (ADN):**

1. In **Ready**, click **Create DN** on the request.
2. Check the project and site location. Choose **Attention To** (the Site Engineer).
3. Enter **Vehicle Number**, **Driver Name**, **Driver Contact** and the transport fee.
4. Select the items:
   - quantity-based assets with their quantity;
   - individual assets by serial number.
5. Add notes and click **Create Delivery Note**. The ADN is created as a draft and the request shows **Dispatched**.
6. Click **Dispatch** on the ADN and confirm. The ADN is **In Transit**, stock is deducted, and the Site Engineer is notified.
7. The Site Engineer receives the assets on site. The ADN becomes **Delivered** and the request **Completed**.

### How to process returned assets

1. Open **Returnable Assets** → **Process Returns**. The tabs are **Pending** and **History**.
2. When a return is **In Transit**, click **Receive**.
3. Click **Process**. For each item set the **Verified Condition** (OK, Damaged, Needs Repair or Lost), add notes, and choose the **Action**:
   - **Return to Stock**: available quantity goes up.
   - **Send to Repair**: listed under Repair.
   - **Dispose** or **Write Off**: sent to the TD for approval.
4. Click **Process All Items**.

### Asset Repair and Disposal

- **Repair** (Pending, History):
  - **Mark as Repaired** → **Confirm Repair** returns the asset to stock.
  - **Cannot Repair - Dispose** needs a reason and justification, with an optional photo. It is sent to the TD.
- **Disposal**: view-only. It shows **Pending TD Approval** and **TD Approved - Ready for Disposal**.
  - When the TD approves, the asset is removed from inventory.
  - When the TD rejects, it goes back to stock or to repair.

## Labour Registry

Open **Labour** → **Labour Registry** to manage workers.

- Search, and filter by status (Active, Inactive, On Leave) and skill.
- Click **Add Worker** and fill in:
  - **Worker Code** (leave blank to generate one, for example WRK-006)
  - **Full Name**
  - **Phone** (used for WhatsApp)
  - **Hourly Rate (AED)**
  - **Skills**
  - **Worker Type** (Regular, Contract or Temporary)
  - **Status**
  - ID Number, Emergency Contact and Notes
- Use the row icons to view, edit or delete a worker. Deleting marks the worker as terminated.

## Assign Workers

Open **Labour** → **Assign Workers**. The tabs are **Pending Assignment** and **Assigned**.

### How to assign workers to a labour requisition

1. Click **Assign** on an approved requisition.
2. Select **exactly** the number of workers required.
   - Preferred workers are selected automatically.
   - Shortcut buttons: **Low Rate**, **High Rate**, **Single Skill**, **Multi Skill**.
   - Workers already booked on another project are blocked.
   - Use **Add New Worker** to add someone on the spot.
3. Click **Assign Selected**.
4. Enter the transport details: **Driver Name**, **Driver Contact**, **Vehicle Number** and the transport fee.
5. Check the workers to be notified, then click **Confirm & Send**.

Each worker receives a WhatsApp message, and the Site Engineer can then confirm their arrival. The transport fee is added to payroll cost.

Choose a date and click **Download Daily Schedule** for a PDF of all assigned workers. Use **PDF** on a row for that requisition's report.
