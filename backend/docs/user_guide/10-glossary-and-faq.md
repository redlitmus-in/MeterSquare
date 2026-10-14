# Glossary and FAQ

## Glossary

| Term | Meaning |
|---|---|
| BOQ | Bill of Quantities: the detailed list of items, materials, labour and prices for a project |
| Sub-item / Scope | A part of a BOQ item with its own quantity, unit and rate |
| Preliminaries | General project conditions and costs (approvals, site setup and similar) selected in the BOQ |
| Internal BOQ | The full BOQ with costs, overheads and profit margins (for internal use) |
| Client BOQ | The BOQ with final prices only, as sent to the client |
| O&P | Overhead and Profit percentage |
| Revision (R1, R2…) | A changed version of a BOQ requested by the client |
| Internal revision | A BOQ corrected after the TD rejected it |
| CR / Material Purchase / Purchase Request | A request for extra materials on an approved project (shown as PO-… or EM-…) |
| PO-x.1, PO-x.2 | Parts of one purchase split across different vendors |
| LPO | Local Purchase Order: the purchase order PDF sent to the vendor |
| VRR | Vendor Return Request: a request to return rejected materials to a vendor |
| M2 Store | The company warehouse. All purchased materials pass through it. |
| IMR | Internal Material Request: a request for materials from the M2 Store |
| DN / MDN | Material Delivery Note: the document for materials sent from the store to site |
| RDN | Return Delivery Note: the document for materials returned from site to the store |
| ADN | Asset Delivery Note: the document for assets sent to site |
| Current stock | Usable stock in the M2 Store |
| Backup stock | Damaged or partly usable stock, for example items waiting for repair |
| Returnable assets | Tools and equipment that go to site and come back |
| Fresh role | Temporary access to another role starting with no projects |
| Same as existing user | Temporary access with the same data as another holder of the role |

## Frequently asked questions

### I cannot sign in. It says "Email not found".

Check that you selected **your own role** in **Select Your Role**. The message also appears when the role does not match, or when your account is inactive. If you were given a temporary role, you can choose that role too (except Site Engineer: sign in with your own role and switch).

### I did not receive the OTP email.

Wait a minute and check your spam folder. After 30 seconds you can click **Resend OTP**. The code expires after 5 minutes.

### My account is locked.

After 5 wrong codes, the account is locked for 30 minutes. Wait and try again, or ask your Admin.

### Why did I get a notification but no email?

Emails for most workflow steps are sent only when you are **offline**. If you are online, you get the notification in the app. Set your status in the account menu.

### Where do I see what I need to do?

Your **Dashboard** shows pending items for your role, and the bell icon shows notifications. Click a notification to go to the related page.

### How do I switch to a role someone gave me?

Open the account menu at the bottom of the sidebar. Under **SWITCH ROLE**, click the role. See "Working in more than one role" in Getting Started.

### Why can't I see the Role Access menu?

Only users whose own role is Admin or Technical Director can use it. Admin and TD both find **Role Access** as its own item in their sidebar.

- A TD working in a granted role does not see the menu item.
- A user working in a granted Admin role still sees **Role Access** in the menu. The page itself is available only in your own Admin or Technical Director role.

Switch back to your own role from the amber banner to use it again.

### Why does a material request go to the Estimator?

The Estimator must price **new materials**. A request goes to the Estimator when:

- it has materials added with **Add New**, either **From Catalogue** or **Enter Manually**. Catalogue materials count as new because they are not in the BOQ.
- it has a BOQ material whose BOQ quantity is already used up or exceeded by earlier requests.
- the Project Manager chooses to send it to the Estimator.

Requests with only existing BOQ materials, within the BOQ quantity, go to a buyer.

One request holds either existing BOQ materials (**Select Material**) or new materials (**Add New**), not both. To request both kinds, create two requests.

### Why is the Approve button disabled on a material request?

There is not enough stock in the M2 Store for that request. Stock in the vendor delivery first, or wait for the purchase.

### Can materials be delivered directly from the vendor to site?

No. All purchased materials go to the M2 Store first, where the Production Manager inspects them and then dispatches them to site with a Delivery Note.

### What happens if the vendor delivers wrong or damaged material?

The Production Manager rejects it at inspection with evidence. Procurement then creates a return request (Refund, Replacement or New Vendor), which the TD approves.

### How do I return unused material from site?

The Site Engineer opens **Material Receipts** → the **Materials** tab → **Returnable Materials**. Click **Select Materials** on the project, split the quantities by condition, then click **Create RDN**. Issue and dispatch the RDN.

### Why doesn't attendance show in payroll?

Only attendance that the Project Manager has **locked** appears in **Payroll Processing**. Ask the PM to lock it in **Labour** → **Attendance Lock**.

### How do I report a problem with MeterSquare?

Open the account menu → **Support** → **New Ticket**, attach a screenshot, and submit.

### Can Structo (Ask AI) change my data?

No. Structo, opened with the **Ask AI** button, only answers questions about how to use MeterSquare, from this guide. It cannot see or change projects, BOQs or any records.
