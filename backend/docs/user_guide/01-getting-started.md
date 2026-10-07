# Getting Started

MeterSquare is the company's construction ERP. It covers the full life of a project: estimating and the Bill of Quantities (BOQ), approvals, project assignment, site material requests, purchasing from vendors, the M2 Store warehouse, deliveries to site, returns, assets, labour and payroll.

Each person signs in with a **role**. The role decides which menus, pages and approvals you see.

## Roles in MeterSquare

| Role | Main job in MeterSquare |
|---|---|
| Admin | Manages users, role access, signatures, email CC settings, security and payroll. Can view the app as any other role. |
| Technical Director (TD) | Approves BOQs, assigns Project Managers and MEP Supervisors to projects, approves vendors, vendor selections, disposals, returns and day extensions. |
| Estimator | Creates projects and BOQs, sends BOQs to the TD and to the client, handles revisions, approves purchase requests. |
| Project Manager (PM) | Runs assigned projects: assigns Site Engineers and BOQ items, approves material purchase requests from site, approves asset and labour requests, locks attendance. |
| MEP Supervisor | Same screens as the Project Manager, for MEP (mechanical, electrical, plumbing) scope on the projects they are assigned to. |
| Site Engineer (SE) | Works on site: views assigned items, requests materials, confirms deliveries, returns unused materials, requests labour and assets, records attendance. |
| Procurement (Buyer) | Buys materials: selects vendors, sends purchase orders (LPO), completes purchases, manages vendors and store items, handles vendor returns. |
| Production Manager | Runs the M2 Store: materials catalog, stock in/out, delivery notes to site, returns, repair and disposal, returnable assets, labour registry. |

## How the main process flows

The core project flow, from estimate to site:

```flow
Estimator: Creates the project and the BOQ, then sends it to the Technical Director
Technical Director: Approves the BOQ (or sends it back with a reason)
Estimator: Sends the approved BOQ to the client and records the client's decision
Technical Director: Assigns a Project Manager (and MEP Supervisor if needed)
Project Manager: Assigns Site Engineers and allocates BOQ items to them
Site Engineer: Requests extra materials when site needs them (Material Purchase)
Project Manager: Approves the request (the Estimator prices any new materials)
Procurement: Selects a vendor; the Technical Director approves the vendor
Procurement: Sends the purchase order (LPO) and completes the purchase
Production Manager: Inspects the delivery at the M2 Store and dispatches it to site
Site Engineer: Confirms delivery, and returns unused material to the store
```

Each step is described in detail in the chapter for that role.

## Signing in

There are no passwords. You sign in with a one-time code (OTP) sent to your email.

### How to sign in with email

1. Open MeterSquare. The page shows **Welcome to MeterSquare**.
2. In **Select Your Role**, choose your role (Admin, Technical Director, Estimator, Project Manager, Production Manager, MEP Supervisor, Site Engineer or Procurement).
3. Type your email in **Email Address**.
4. Click **Send OTP**. You will see **OTP Sent Successfully!**. Check your email.
5. On the **Enter OTP** screen, type the 6-digit code. It verifies automatically when all 6 digits are entered, or click **Verify & Login**.
6. You land on your role's dashboard.

To change the email, click **← Back to email**.

### Resending the code

After sending, the screen shows **Resend OTP in 30s**. When the countdown ends, click **Resend OTP**.

### Site Engineer: sign in with phone (SMS)

When you choose **Site Engineer**, a **Login Method** choice appears: **Phone (SMS)** or **Email** (Email is the default).

1. Choose **Phone (SMS)**.
2. Pick the country code (default +971 UAE) and type your phone number. The number of digits must match the country (for example 9 digits for UAE, 10 for India).
3. Click **Send OTP** and enter the code from the SMS.

### OTP rules

- The code is 6 digits and expires after **5 minutes**.
- After **5 wrong codes**, the account is locked for **30 minutes**: "Account temporarily locked due to too many failed attempts".
- A sign-in lasts **10 hours**. After that you are taken back to the login page.

### Sign-in messages and what they mean

| Message | What to do |
|---|---|
| Please fill all fields | Choose a role and enter your email (or phone). |
| Invalid email / Invalid phone number | Check the format or number of digits. |
| Email not found / Phone not found | The email is wrong, **or the selected role is not your role**, or your account is inactive. Check the role you picked. |
| Invalid OTP | The code is wrong or expired. Request a new one. |
| Account Blocked | An administrator blocked your account. Contact your administrator. |

### Signing out

Open the account menu at the bottom of the sidebar and click **Sign Out**. Signing out in one browser tab signs you out of the other tabs too.

If an administrator ends your session, your next action takes you to the login page.

## Finding your way around

### The sidebar

- The sidebar on the left lists your role's menu. It always starts with **Dashboard**.
- Items with an arrow have sub-menus. Click to expand.
- Drag the sidebar edge to resize it; double-click the edge to reset. When it is narrow, it shows icons only and sub-menus open on hover.
- On mobile, open the sidebar with the menu button.

### Your dashboard

Every role has a dashboard with counters and charts for its own work (for example pending approvals, purchase orders, deliveries or stock alerts). A clock and today's date appear at the top right of dashboard pages.

### Sidebar menu by role

| Role | Menu |
|---|---|
| Admin | Dashboard, User Management, Role Access, Signature Upload (Signatures, CC & Email Settings), Payroll Processing, Security Dashboard, plus "view as" role links |
| Technical Director | Dashboard, Project Approvals, Disposal Approvals (Material Disposal, Asset Disposal), Vendor Management, Purchase Orders (All Orders, Return Approvals), Purchase Comparison, Profit Comparison, Role Access |
| Estimator | Dashboard, Projects, Purchase Request |
| Project Manager | Dashboard, My Projects, Material Purchase, Asset Requisition Approvals, Labour (Requisition Approvals, Attendance Lock) |
| MEP Supervisor | Same as Project Manager |
| Site Engineer | Dashboard, Projects, Site Assets, Material Receipts, Material Purchase, Labour (Labour Requisition, Arrival Confirmation, Attendance Logs) |
| Procurement | Dashboard, Purchase Orders, Vendors, Store (Store Items, Material Transfer, Raw Materials), Vendor Returns (Rejected Deliveries, Return Requests) |
| Production Manager | Dashboard, Inventory Management (Materials Catalog, Stock In, Stock Out, Receive Returns, Repair, Disposal), Returnable Assets (Asset Catalog, Stock In, Stock Out, Process Returns, Repair, Disposal), Labour (Labour Registry, Assign Workers) |

## Account menu

Click your name at the bottom of the sidebar to open the account menu:

- **Status**: switch between **Online** and **Offline**. You are set Online automatically when you sign in and Offline when you sign out. Others see this status (for example when choosing a buyer).
- **SWITCH ROLE**: only shown if you have been given extra roles (see below).
- **Profile Settings**: your profile page.
- **Support**: report a problem or request a change.
- **Sign Out**.

## Profile Settings

1. Open the account menu and click **Profile Settings**.
2. Click **Edit Profile**.
3. Update **Full Name**, **Email Address**, **Phone Number** or **Department**. Full name and email are required.
4. Click **Save Changes**.

The Profile tab also shows your role, account status and joined date. Sign-in is by email code only, so there is no password to change.

## Notifications

### The notification bell

- The bell at the top right shows a red number for unread notifications. An orange dot means something urgent is unread.
- Click the bell to open the **Notifications** panel. Use the **All** and **Unread** tabs.
- Click a notification to mark it read and open the related page.
- Buttons: **Mark all as read**, **Clear All**, **View All** (full page).
- Each notification shows its priority (urgent, high, medium, low), time and sender.

### The full Notifications page

Click **View All** in the panel to open it. You can:

- search, filter by priority and category, and sort.
- tick notifications and use **Mark as Read** or **Delete**.
- switch between the **All**, **Unread** and **Archived** (read) tabs.

### Desktop notifications

- New notifications arrive instantly as a pop-up in the app, and as a desktop notification if your browser allows it.
- To turn desktop notifications on, click **Enable desktop notifications** (the bell icon in the panel) and allow it in the browser.
- High and urgent desktop notifications stay on screen until you click them.

### Email

Important events (approvals, assignments, purchase orders, role access) are also emailed.

## Support (Bug Register)

Use Support to report a problem or request a new feature.

### How to raise a support ticket

1. Open the account menu and click **Support**. The **Bug Register** page opens.
2. Click **New Ticket**. Your name, role and email are filled in automatically.
3. Choose a **Ticket Type**: Bug, Issue, Implementation or Feature Request.
4. Choose a **Priority**: Low, Medium, High or Critical.
5. Enter a **Title** and describe the problem in **Current Concern**.
6. Add at least one screenshot or file with **Upload Files** (required; up to 10 MB each; images, PDF, Word, Excel, text).
7. Optional: **Concern Implementation** (what you would like changed), **Implementation Files**, **Description**.
8. Click **Submit Ticket**. To finish later, click **Save as Draft** (only a title is needed).

### Following up a ticket

- Tickets with new replies show **N new** and appear first.
- Open a ticket to see the development team's updates, response and resolution.
- Once a ticket is approved, use **Comments & Follow-ups** to add comments and files.
- When a ticket is **Resolved**, check that it works and click **Confirm & Close**.
- Draft tickets can be edited, submitted or deleted.

### Ticket statuses

| Status | Meaning |
|---|---|
| Draft | Saved, not yet submitted |
| Submitted | Sent to the development team |
| In Review | Being looked at |
| Approved | Accepted for work |
| Rejected | Not accepted (reason shown) |
| In Progress | Being worked on |
| Pending Deployment | Fix ready, waiting for release |
| Resolved | Fixed. Please verify and close |
| Closed | Finished |

You are notified when your ticket is approved, rejected, resolved, put in review or in progress, or gets a comment.

## Working in more than one role

An Admin or Technical Director can give you **temporary access to another role**, for example an Estimator who also works as a Project Manager for two weeks. Your own role never changes.

### Two kinds of access

- **Fresh role**: you start as a new person in that role, with no projects. Projects are assigned to you in that role while your access is active, and you appear in that role's selection lists with a small **Granted · until <date>** tag.
- **Same as existing user**: you see and work on exactly what another holder of that role sees (their projects, BOQs, requests and approvals). Your actions in that role are recorded under that person's name.

### How to sign in with a granted role

On the login page, choose the granted role in **Select Your Role**, enter your usual email and complete the code.

If your granted role is **Site Engineer**, sign in with your own role and then switch roles from the account menu (the Site Engineer sign-in only accepts people whose own role is Site Engineer).

### How to switch roles while signed in

1. Open the account menu at the bottom of the sidebar.
2. Under **SWITCH ROLE** you see **Your role** and each granted role with its end date (for example "Granted · until 13 Oct"). The current one has a tick.
3. Click the role you want. You will see **Switching to <role>…**, then that role's dashboard opens.

### While you work in a granted role

- An amber banner at the top says **You're working as <role>** and when it ends.
- Click **Switch back to <your role>** in the banner to return to your own role at any time.

### When access ends

- Access ends automatically at **11:59 PM on the end date** (company time), or earlier if an Admin/TD revokes it.
- If you are using it at that moment, your next action shows **Your role access has ended. Returning to your role…** and you are moved back to your own role.
- The role disappears from the login role list and from **SWITCH ROLE**.

### Role access notifications you may receive

- **New <role> access** (or **access scheduled** if it starts later)
- **<role> access is now active** (on the start day of a scheduled access)
- **<role> access ends tomorrow**: finish or hand over open work
- **<role> access removed** (revoked)
- **<role> access has ended**

Notifications about a granted role have no link. Switch to that role to act on them.
