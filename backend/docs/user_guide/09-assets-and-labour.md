# Assets and Labour: End-to-End Flows

These processes involve several roles. This chapter shows who does what, in order. The detailed steps are in each role's chapter.

## Asset requisition: from request to return

```flow
Site Engineer: Requests assets (Site Assets, Request Asset) and clicks Send to PM
Project Manager: Approves in Asset Requisition Approvals (or rejects with a reason)
Production Manager: Approves after checking stock (Returnable Assets, Stock Out)
Production Manager: Creates the Asset Delivery Note (ADN) and dispatches it
Site Engineer: Receives the assets on site (Receive Selected or Receive All)
Site Engineer: Returns assets with a return note: Issue, then Dispatch
Production Manager: Receives and processes the return: stock, repair, or disposal
Technical Director: Approves any disposal
```

Key points:

- A request can be rejected by the PM or by the store. The Site Engineer can edit and resend it.
- Stock is checked when the Production Manager approves, and deducted when the ADN is dispatched.
- Returned assets are checked by condition: OK, Damaged, Needs Repair or Lost. Each is returned to stock, sent to repair, or sent to the TD for disposal.

## Labour: from requisition to payroll

```flow
Production Manager: Keeps the Labour Registry of workers up to date
Site Engineer: Creates a labour requisition and clicks Send to PM
Project Manager: Approves it (or rejects with a reason)
Production Manager: Assigns exactly the number of workers needed (Assign Workers)
System: Workers receive a WhatsApp message with the job details
Site Engineer: Marks arrivals (Arrived, Late Arrival, No Show) and clocks workers out
Project Manager: Reviews and locks the attendance (Attendance Lock)
Admin: Views and exports payroll for the period (Payroll Processing)
```

Key points:

- A Project Manager can also create a labour requisition and click **Send to Production** directly.
- Clocking a worker out creates their attendance record for the day.
- Only **locked** attendance reaches payroll.
- Overtime is time worked after the shift end time (or after 8 hours if no shift was set). It is paid at 1.5 times the hourly rate.
- The transport fee entered when workers are assigned is added to the project's labour cost.

## Material returns from site

```flow
Site Engineer: Selects returnable materials and splits them by condition (Good, Damaged, Defective)
Site Engineer: Creates the Return Delivery Note (RDN), issues and dispatches it
Production Manager: Confirms receipt at the M2 Store
Production Manager: Good items go to stock, Damaged or Defective items go to repair or disposal
Technical Director: Approves or rejects disposals (a rejected disposal goes to backup stock)
```

## Vendor delivery problems

```flow
Production Manager: Inspects the vendor delivery and rejects some or all materials with evidence
Procurement: Creates a return request: Refund, Replacement or New Vendor
Technical Director: Approves the return request
Procurement: Returns the material and confirms the refund, replacement, or new vendor purchase
```
