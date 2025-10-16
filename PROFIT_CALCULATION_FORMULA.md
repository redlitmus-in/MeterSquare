# Overall Project Profit Calculation Formula

## Summary Formula

```
Total Actual Profit = SUM of (Actual Profit for each Item)
```

Where each item's actual profit is calculated based on the **consumption model**.

---

## Step-by-Step Calculation

### 1️⃣ For Each BOQ Item:

#### **Step A: Calculate Planned Values**
```
Planned Base Cost = Planned Material Cost + Planned Labour Cost
Planned Overhead = Planned Base Cost × Overhead %
Planned Profit = (Planned Base Cost + Planned Overhead) × Profit %
Planned Total = Planned Base Cost + Planned Overhead + Planned Profit
```

#### **Step B: Calculate Actual Base Cost**
```
Actual Material Cost = SUM of (Actual Material Purchases)
Actual Labour Cost = SUM of (Actual Labour Work Done)
Actual Base Cost = Actual Material Cost + Actual Labour Cost
```

#### **Step C: Calculate Extra Costs**
```
Material Variance = Actual Material Cost - Planned Material Cost
Labour Variance = Actual Labour Cost - Planned Labour Cost

Extra Costs = 0
IF Material Variance > 0 THEN Extra Costs += Material Variance
IF Labour Variance > 0 THEN Extra Costs += Labour Variance
```

> **Extra Costs** = Total amount overspent on materials and labour

#### **Step D: Consumption Model (The Key!)**

This is where overhead and profit are "consumed" by extra costs:

```python
# Start with full buffers
remaining_overhead = planned_overhead
remaining_profit = planned_profit
overhead_consumed = 0
profit_consumed = 0

IF extra_costs > 0:
    # Step 1: Extra costs consume OVERHEAD first
    overhead_consumed = min(extra_costs, planned_overhead)
    remaining_overhead = planned_overhead - overhead_consumed

    # Step 2: If extra costs exceed overhead, consume PROFIT
    IF extra_costs > planned_overhead:
        excess_costs = extra_costs - planned_overhead
        profit_consumed = min(excess_costs, planned_profit)
        remaining_profit = planned_profit - profit_consumed
```

**Visual Example:**
```
Scenario: Extra Costs = AED 400

Planned Overhead: AED 250
Planned Profit:   AED 150

Step 1: Overhead consumption
  Extra Costs = AED 400
  Overhead consumes = min(400, 250) = AED 250 ✅ (ALL overhead consumed)
  Remaining = 400 - 250 = AED 150

Step 2: Profit consumption
  Remaining Extra = AED 150
  Profit consumes = min(150, 150) = AED 150 ✅ (ALL profit consumed)

Final Result:
  Actual Overhead = 250 - 250 = AED 0
  Actual Profit = 150 - 150 = AED 0
  Loss = AED 0 (just broke even, but no profit!)
```

#### **Step E: Calculate Actual Profit**
```
Actual Overhead = remaining_overhead
Actual Profit = remaining_profit
```

---

### 2️⃣ For Overall Project:

```
Total Actual Profit = SUM of (Item 1 Actual Profit + Item 2 Actual Profit + ... + Item N Actual Profit)
```

---

## Real Example (Your BOQ #233)

### Item 1: Foundation
```
Planned:
  Material Cost: AED 600
  Labour Cost: AED 1,900
  Base Cost: AED 2,500
  Overhead (10%): AED 250
  Profit (5%): AED 125
  Total: AED 2,875

Actual:
  Material Cost: AED 600 (no purchases yet, assume planned)
  Labour Cost: AED 1,900 (no work done yet, assume planned)
  Base Cost: AED 2,500

  Extra Costs: AED 0 (nothing overspent)

  Consumption:
    Overhead consumed: AED 0
    Profit consumed: AED 0

  Actual Overhead: AED 250 (maintained)
  Actual Profit: AED 125 (maintained) ✅
```

### Item 2: Lighting Installation
```
Planned:
  Material Cost: AED 850
  Labour Cost: AED 0
  Base Cost: AED 850
  Overhead (10%): AED 85
  Profit (10%): AED 85
  Total: AED 1,020

Actual:
  Material Cost: AED 850 (no purchases yet, assume planned)
  Labour Cost: AED 0
  Base Cost: AED 850

  Extra Costs: AED 0

  Consumption:
    Overhead consumed: AED 0
    Profit consumed: AED 0

  Actual Overhead: AED 85 (maintained)
  Actual Profit: AED 85 (maintained) ✅
```

### Overall Project Total

**Overhead (Maintained):**
```
Total Actual Overhead = Item 1 Overhead + Item 2 Overhead
                      = AED 250 + AED 85
                      = AED 335.00 ✅ (MAINTAINED - not consumed)
```

**Profit (Maintained):**
```
Total Actual Profit = Item 1 Profit + Item 2 Profit
                    = AED 125 + AED 85
                    = AED 210.00 ✅ (MAINTAINED - not consumed)
```

**Complete Cost Structure:**
```
┌─────────────────────────────────────────┐
│ PLANNED                  ACTUAL         │
├─────────────────────────────────────────┤
│ Base Cost:  AED 3,350    AED 3,350 ✅   │
│ Overhead:   AED 335      AED 335   ✅   │
│ Profit:     AED 210      AED 210   ✅   │
├─────────────────────────────────────────┤
│ TOTAL:      AED 3,895    AED 3,895 ✅   │
└─────────────────────────────────────────┘
Status: ON BUDGET - All overhead and profit maintained!
```

---

## Example with Overruns

Let's say you buy extra materials for Foundation:

```
Item 1: Foundation (with overrun)

Planned Base Cost: AED 2,500
Actual Base Cost: AED 2,800 (bought extra cement)

Extra Costs = 2,800 - 2,500 = AED 300

Consumption:
  Overhead consumed = min(300, 250) = AED 250
  Remaining = 300 - 250 = AED 50

  Profit consumed = min(50, 125) = AED 50

Final:
  Actual Overhead = 250 - 250 = AED 0
  Actual Profit = 125 - 50 = AED 75

Overall Project:
  Total Profit = AED 75 (Foundation) + AED 85 (Lighting)
               = AED 160 (reduced from AED 210)
```

---

## Key Points

1. **Overhead is consumed FIRST** - It acts as the first buffer
2. **Profit is consumed SECOND** - It acts as the second buffer
3. **If both are consumed** - You have a loss
4. **Savings work in reverse** - If actual < planned, you save money and profit increases

---

## Code Reference

The calculation happens in:
- **File**: `backend/controllers/boq_tracking_controller.py`
- **Lines**: 546-572 (Consumption logic)
- **Line 569**: `actual_profit = remaining_profit`
- **Line 682**: `total_actual_profit = sum(float(item['actual']['profit_amount']) for item in comparison['items'])`

---

## Formula Summary Card

```
┌──────────────────────────────────────────────────────────────────────────┐
│  COMPLETE PROFIT CALCULATION FORMULA                                     │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                           │
│  STEP 1: Calculate Planned Values                                        │
│    Planned Total = Base Cost + Overhead + Profit                         │
│                                                                           │
│  STEP 2: Calculate Actual Costs                                          │
│    Actual Base Cost = Actual Materials + Actual Labour                   │
│    Extra Costs = Actual Base Cost - Planned Base Cost (if positive)      │
│                                                                           │
│  STEP 3: Apply Consumption Model                                         │
│    Overhead Consumed = min(Extra Costs, Planned Overhead)                │
│    Remaining Extra = max(0, Extra Costs - Planned Overhead)              │
│    Profit Consumed = min(Remaining Extra, Planned Profit)                │
│                                                                           │
│  STEP 4: Calculate Actual Profit                                         │
│    Actual Overhead = Planned Overhead - Overhead Consumed                │
│    Actual Profit = Planned Profit - Profit Consumed                      │
│                                                                           │
│  STEP 5: Verify Total (Should Match Planned Total if no loss)            │
│    Actual Total = Actual Base Cost + Actual Overhead + Actual Profit     │
│                                                                           │
│  STEP 6: Overall Project                                                 │
│    Total Actual Profit = SUM(All Item Actual Profits)                    │
│    Total Actual Overhead = SUM(All Item Actual Overheads)                │
│                                                                           │
└──────────────────────────────────────────────────────────────────────────┘
```

### **Key Formula (The One You Asked For!):**

```
ACTUAL PROFIT FORMULA:

Actual Profit = (Planned Base Cost + Planned Overhead + Planned Profit)
                - Actual Base Cost
                - Overhead Consumed

OR Simplified:

Actual Profit = Planned Total - Actual Base Cost - Planned Overhead

WHERE:
  Overhead Consumed = Overhead used to cover extra costs
  Profit Consumed = Profit used to cover costs exceeding overhead

  Actual Overhead = Planned Overhead - Overhead Consumed
  Actual Profit = Planned Profit - Profit Consumed
```

---

## Complete Calculation Example (Step-by-Step)

### **Scenario: Foundation Item with AED 300 Overrun**

```
STEP 1: PLANNED VALUES
───────────────────────────────────────────
Planned Base Cost:     AED 2,500
Planned Overhead (10%): AED 250
Planned Profit (5%):   AED 125
───────────────────────────────────────────
Planned Total:         AED 2,875


STEP 2: ACTUAL COSTS (You bought extra materials)
───────────────────────────────────────────
Actual Materials:      AED 900  (was AED 600)
Actual Labour:         AED 1,900 (same as planned)
───────────────────────────────────────────
Actual Base Cost:      AED 2,800

Extra Costs = 2,800 - 2,500 = AED 300 ⚠️


STEP 3: CONSUMPTION MODEL
───────────────────────────────────────────
Extra Costs:           AED 300

Overhead Consumed = min(300, 250) = AED 250 ✅ (ALL overhead consumed)
Remaining Extra = 300 - 250 = AED 50

Profit Consumed = min(50, 125) = AED 50 ✅ (Part of profit consumed)


STEP 4: CALCULATE ACTUAL PROFIT
───────────────────────────────────────────
Actual Overhead = 250 - 250 = AED 0    ❌ (Fully consumed)
Actual Profit = 125 - 50 = AED 75      ⚠️ (Reduced)


STEP 5: VERIFY TOTAL & UNDERSTAND WHERE MONEY WENT
───────────────────────────────────────────────────────────────
CLIENT PAYMENT (Fixed):                    AED 2,875

HOW IT WAS ALLOCATED:
  Actual Base Cost (materials + labour):   AED 2,800
  Actual Overhead (remaining):              AED 0
  Actual Profit (remaining):                AED 75
  ───────────────────────────────────────────────
  Total:                                    AED 2,875 ✅


WHERE DID THE CONSUMED AMOUNTS GO?
───────────────────────────────────────────────────────────────
You overspent by AED 300 (2,800 - 2,500)

This AED 300 was COVERED BY:
  ✓ Overhead buffer:  AED 250 (used to pay for overrun)
  ✓ Profit buffer:    AED 50  (used to pay for overrun)
  ───────────────────────────────────────────────
  Total Coverage:     AED 300 ✅

These amounts were SPENT to cover the extra costs!
They are NOT "remainder" - they were USED UP.


FINAL BREAKDOWN:
───────────────────────────────────────────────────────────────
Planned Base Cost:              AED 2,500
Extra spending:                 AED 300 ⚠️
  └─ Paid from Overhead:        AED 250 (consumed)
  └─ Paid from Profit:          AED 50 (consumed)
───────────────────────────────────────────────
Actual Base Cost:               AED 2,800 ✅

Planned Overhead:               AED 250
  └─ Used to cover overrun:     AED 250 (consumed)
Actual Overhead:                AED 0 ❌

Planned Profit:                 AED 125
  └─ Used to cover overrun:     AED 50 (consumed)
Actual Profit (REMAINDER):      AED 75 ⚠️

Total Paid by Client:           AED 2,875 (unchanged)

Status: ON BUDGET (total matches), but profit reduced!
```

### **Visual Money Flow Diagram:**

```
┌─────────────────────────────────────────────────────────────────┐
│  CLIENT PAYS: AED 2,875 (Fixed - cannot change)                │
└─────────────────────────────────────────────────────────────────┘
                           │
                           ▼
         ┌─────────────────────────────────┐
         │   ORIGINAL PLAN (AED 2,875)     │
         ├─────────────────────────────────┤
         │  Base Cost:    AED 2,500        │
         │  Overhead:     AED 250          │
         │  Profit:       AED 125          │
         └─────────────────────────────────┘
                           │
                           ▼
         ┌─────────────────────────────────┐
         │   ACTUAL SPENDING               │
         ├─────────────────────────────────┤
         │  You spent: AED 2,800 ⚠️        │
         │  (AED 300 over budget!)         │
         └─────────────────────────────────┘
                           │
                           ▼
         ┌─────────────────────────────────┐
         │   CONSUMPTION (Covering Extra)  │
         ├─────────────────────────────────┤
         │  Extra: AED 300                 │
         │    ├─ From Overhead: 250 ❌     │
         │    └─ From Profit:   50 ❌      │
         └─────────────────────────────────┘
                           │
                           ▼
         ┌─────────────────────────────────┐
         │   FINAL ALLOCATION              │
         ├─────────────────────────────────┤
         │  Actual Base:     AED 2,800     │
         │  Actual Overhead: AED 0 ❌      │
         │  Actual Profit:   AED 75 ⚠️     │
         │  ─────────────────────────      │
         │  Total:           AED 2,875 ✅  │
         └─────────────────────────────────┘

KEY INSIGHT:
  Consumed amounts (250 + 50) = AED 300
  This AED 300 was ADDED to base cost (2,500 + 300 = 2,800)

  It's not "lost" - it was USED to pay for extra materials/labour!

  REMAINDER Profit = AED 75 (what you still earn)
```

### **Using Your Formula:**

```
Actual Profit = Planned Total - Actual Base Cost - Overhead Consumed
              = 2,875 - 2,800 - 250
              = AED -175 ❌ WRONG!

❌ This formula doesn't work because it doesn't account for
   the fact that overhead is already included in Planned Total.

✅ CORRECT FORMULA:

Actual Profit = Planned Profit - Profit Consumed
              = 125 - 50
              = AED 75 ✅ CORRECT!

OR using the full breakdown:

Actual Total = 2,875 (fixed - client pays this)
Actual Base Cost = 2,800
Available for Overhead+Profit = 2,875 - 2,800 = 75

Since Extra Costs (300) > Overhead (250):
  Overhead gets = 0 (all consumed covering extra costs)
  Profit gets = 75 (what's left after covering all costs)

Result: Actual Profit = AED 75 ✅
```

---

## Your Current Scenario

**BOQ #233 Result:**
```
STEP 1-2: COSTS
  Planned Base:  AED 3,350
  Actual Base:   AED 3,350 (no purchases yet, assume planned)
  Extra Costs:   AED 0 ✅

STEP 3: CONSUMPTION
  Overhead Consumed: AED 0
  Profit Consumed:   AED 0

STEP 4: ACTUAL AMOUNTS
  Actual Overhead: 335 - 0 = AED 335 ✅
  Actual Profit:   210 - 0 = AED 210 ✅

STEP 5: VERIFY
  Actual Total = 3,350 + 335 + 210 = AED 3,895 ✅

Status: PERFECT - Everything maintained!
```
