# Procurement (Buyer)

Procurement buys the materials approved for projects:

- chooses vendors (the TD approves each vendor selection);
- sends the purchase order (LPO) to the vendor;
- completes the purchase so the vendor delivers to the M2 Store.

Procurement also manages vendors, browses store stock, transfers materials and handles vendor returns.

Procurement menu:

- **Dashboard**
- **Purchase Orders**
- **Vendors**
- **Store**: Store Items, Material Transfer, Raw Materials
- **Vendor Returns**: Rejected Deliveries, Return Requests

## From request to site: the purchase flow

```flow
Project Manager: Approves the material request and assigns it to a buyer (via the Estimator if materials are new)
Procurement: Selects a vendor for each material, or gets the materials from the M2 Store
Procurement: Submits the vendor selection for TD approval
Technical Director: Approves the vendor (the LPO is generated)
Procurement: Sends the LPO to the vendor by Email and/or WhatsApp
Procurement: Clicks Complete & Send to Store
Vendor: Delivers to the M2 Store
Production Manager: Inspects, stocks in and dispatches to site
Site Engineer: Confirms delivery on site
```

All purchased materials go to the **M2 Store** first, where they are inspected. They are never delivered straight to site.

## Buyer Dashboard

- **Top figures**: Completion Rate, Avg Processing (days), Total Completed Value.
- **Cards**:
  - Ongoing (pending purchase / store approved / vendor approved)
  - Pending Approval (store pending / vendor pending TD)
  - Completed (purchase orders / split POs)
  - Store Pipeline (pending vendor / at store)
  - Deliveries (in transit / delivered)
  - Vendors (active / inactive)
- **Attention Required**: orders that need action, rejected POs and pending deliveries.
- **Charts**: Purchase Order Pipeline, M2 Store Pipeline, Delivery Status, Purchase Activity.

## Purchase Orders

Open **Purchase Orders**. This is your main working page.

- Search by project, client, item or PO number.
- Switch between card and table view.
- A purchase is numbered **PO-<number>**. When it is split across vendors, each vendor's part is numbered **PO-<number>.1**, **.2** and so on.

### Tabs

| Tab | Sub-tab | What it shows |
|---|---|---|
| Ongoing | Pending Purchase | New purchases: choose a vendor or get from store |
| Ongoing | Store Approved | Store requests approved by the Production Manager |
| Ongoing | Vendor Approved | Vendor approved by the TD. Send the LPO and complete. |
| Pending Approval | Sent to Store | Waiting for the Production Manager to approve a store request |
| Pending Approval | Vendor Pending TD | Waiting for the TD to approve the vendor |
| Rejected | | Rejected by the TD (purchase or vendor), or by the store |
| Completed | | Completed purchases |

### What to do at each stage

1. **New purchase (no vendor yet)**: **Select Vendor**, **Get from Store**, **Edit Prices** or **View Details**.
2. **Waiting for the TD**: the card shows "Vendor Selection Pending – Waiting for TD approval".
3. **Vendor approved**: send the LPO with **Email** and/or **WhatsApp**, then click **Complete & Send to Store**.
4. **Rejected**:
   - **Select New Vendor** after the TD rejected the vendor.
   - **Select Vendor Instead** after the store rejected a store request.
   - **Resend** for a purchase the TD rejected.

## How to select a vendor and send for TD approval

1. Click **Select Vendor**. The **Select Vendors for Materials** window lists each material with how many vendors offer it.
2. Expand a material to compare vendors: their products, unit price and estimated total.
   - **Edit a vendor's price**: you can save it for this purchase only, or update the vendor's product price permanently.
   - **Compare with the BOQ estimate**: each price shows Over Budget, Under Budget or On Budget.
   - **Supplier notes**: add notes for the vendor (for example exact cut sizes) and click **Save**. Notes are highlighted in the LPO.
3. Choose a vendor for each material. To take a material from the M2 Store instead, click **Send to Store** on it.
4. Check the **Selection Summary**: totals by vendor, compared with the BOQ total.
5. Review the **LPO** (purchase order). Changes save automatically. You can edit:
   - Quotation Ref#, Subject, LPO Message;
   - VAT (on/off, percentage or amount);
   - Delivery Terms and Payment Terms;
   - whether to include the MD signature, company stamp and TD signature (uploaded by the Admin).
6. Submit:
   - **One vendor for everything**: click **Submit for TD Approval**, then **Confirm & Submit**.
   - **Several vendors**: click **Send This Vendor to TD** on each vendor group, check the LPO, and click **Confirm & Send to TD**. A separate PO (PO-x.1, PO-x.2…) is created for each vendor.

Once sent, you cannot add more materials to that vendor submission, so check carefully before sending.

The TD is notified.

- **Approved**: the purchase moves to **Ongoing → Vendor Approved**.
- **Rejected**: it moves to **Rejected**. Choose a new vendor.

## How to get materials from the M2 Store

If the store already has the materials, you can take them from stock instead of buying.

1. Click **Get from Store**. The window checks stock and shows:
   - **Available**: tick these (they are pre-selected).
   - **Already Sent to Store**.
   - **Not Available**: these must be bought from a vendor.
2. Click **Request Selected**.

The Production Manager is notified and approves or rejects the request.

- **Approved**: the item shows **Store Approved**. Click **Mark as Complete**.
- **Rejected**: it goes to **Rejected**. Click **Select Vendor Instead**.

Any remaining materials can still be bought from a vendor.

## How to edit negotiated prices

Click **Edit Prices** on a new purchase. Change the unit price per material and click **Save Changes**. The negotiated prices are used for vendor selection and in the LPO. The window shows the original total, the negotiated total and the difference.

## How to send the LPO to the vendor

You can send the LPO only after the TD approves the vendor.

### By email

1. Click **Email**.
2. Confirm the vendor's email address. You can enter several, separated by commas.
3. Add **CC Recipients** if needed. The Admin's default CC addresses are included; untick any you do not want.
4. Optional: add attachments.
5. The **LPO PDF** is attached automatically. Click **Preview** to check it. It cannot be edited after TD approval, so make LPO changes during vendor selection.
6. Click **Preview Email**, adjust the greeting, message, instructions and delivery requirements, then click **Send Email**.

### By WhatsApp

1. Click **WhatsApp**. It shows **No Phone** if the vendor has no phone number saved.
2. Check the preview and the LPO PDF.
3. Click **Send WhatsApp**.

The card then shows **Sent to Vendor**.

## How to complete a purchase

After sending the LPO, click **Complete & Send to Store**.

- **For a split PO** (PO-x.1): first choose the **Site Engineer / Recipient** who will receive the materials on site.
- The purchase becomes **Routed to M2 Store** and moves to **Pending Approval → Sent to Store**.
- A material request is created for the M2 Store automatically, one per purchase.
- The Production Manager is told a vendor delivery is coming, and the requester is told the purchase was routed to the store.

Next, the vendor delivers to the M2 Store.

1. The Production Manager inspects the delivery. You are notified if it was **fully approved**, **partially approved** or **fully rejected**.
2. The Production Manager stocks it in and dispatches it to site. You are notified when it is dispatched and when the Site Engineer confirms delivery.

A purchase split across several vendors is complete when all its vendor POs are complete.

## Vendor Returns

When the Production Manager rejects delivered materials at inspection, you arrange the return.

### How to create a return request

1. Open **Vendor Returns** → **Rejected Deliveries**. Search by CR ID or vendor.
2. Click **Create Return Request** on the delivery. Review the rejected materials (quantity, price, reason) and the inspection evidence.
3. Choose the **Resolution Type**:
   - **Refund**: the vendor refunds or issues a credit note.
   - **Replacement**: the vendor replaces the material.
   - **New Vendor**: buy from another vendor. Select it.
4. Optional: set an **SLA Deadline**, **SLA Notes** and **Notes**.
5. Click **Create Return Request**.

The return request (VRR) goes to the TD for approval.

### How to follow a return request

Open **Vendor Returns** → **Return Requests**. Filter by All, Pending Approval, TD Approved, In Progress, Completed or Rejected. Expand a request to act on it:

- **Edit & Resubmit**: when the TD rejected it. The rejection reason is shown.
- **Initiate Return to Vendor**: after TD approval, for a refund or replacement.
- **Confirm Refund Received**: enter the **Credit Note Number** and **Credit Note Amount (AED)** and upload proof. The request is completed.
- **Confirm Replacement at Store**: enter an optional vendor reference and proof. The Production Manager inspects the replacement, and the request completes when they approve it.
- **Select New Vendor**: for a new-vendor resolution. The TD approves the new vendor, then click **Generate LPO for New Vendor**. The new purchase appears in Purchase Orders.
- **View Full Timeline**: see the inspection history.

### Return statuses

| Status | Meaning |
|---|---|
| Pending TD Approval | Waiting for the TD |
| TD Approved / TD Rejected | TD decision |
| Return In Progress / Return Initiated | Material being returned to the vendor |
| Refund Confirmed | Refund or credit note received |
| Awaiting PM Inspection | Replacement delivered, waiting for inspection |
| Replacement Ordered | Replacement requested |
| Vendor Pending TD Approval | New vendor waiting for TD approval |
| New Vendor Selected / New Vendor Approved | New vendor chosen or approved |
| Completed / Closed | Finished |

## Vendors

Open **Vendors** (Vendor Management). Search vendors and filter by category and status (Active or Inactive).

### How to add a vendor

1. Click **Add Vendor**.
2. Enter:
   - **Company Name** and **Email** (required);
   - Category (or **+ Add New Category**) and Status (**Active** or **Inactive**);
   - Contact Person, Country, Phone and the tax number (TRN or GST, depending on the country);
   - optionally the address.
3. Click **Add Vendor**.

Only **Active** vendors are offered when selecting vendors. Use **Edit** to update a vendor and **Delete** to remove one.

### How to add a vendor's products

1. Click **View** on the vendor.
2. Under **Products & Services**, click **Add Product**.
3. Enter the **Product/Service Name**, Category, Description, Unit and **Unit Price (AED)**.
4. Click **Add Product**.

Vendor product prices are used to compare vendors when you select one.

## Store

### Store Items

Open **Store** → **Store Items** to browse M2 Store stock: material, description, category, unit price, unit, available stock and status. This page is read-only.

### Material Transfer

Use this to transfer materials yourself, either to a site or to the M2 Store.

1. Open **Store** → **Material Transfer** → **Create Transfer**.
2. Choose the **Transfer Destination**:
   - **Construction Site (Direct)**: also select the **Site Engineer** and **Project**.
   - **M2 Store (Warehouse)**.
3. Click **Add Material** for each material (name, quantity, unit).
4. Enter the **Transfer Date**, vehicle, driver, driver contact, transfer fee and notes.
5. Click **Create Delivery Note**. It is created as a draft.
6. In **Transfer History**, click **Dispatch**, then **Dispatch Now**. The delivery is **In Transit**. A PDF is available.

Transfers to the M2 Store are received by the Production Manager under **Stock In → Buyer Transfers**.

### Raw Materials

Open **Store** → **Raw Materials** to manage the raw materials catalog used in BOQs.

- **Materials** tab: click **Add Material** and enter the name, description, brand, size, specification, unit, **Unit Price (AED)** and category.
- **Items & Sub-Items** tab: link materials to items with **Link Material**.
