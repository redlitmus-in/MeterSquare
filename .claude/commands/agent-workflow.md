---
description: Design agent workflow (Cookbook agent patterns)
---

# Agent Workflow Design

Using cookbook agent patterns, design a workflow for complex task automation.

## Available Patterns

### Basic Building Blocks
1. **Prompt Chaining**: Sequential task breakdown
2. **Routing**: Conditional task distribution
3. **Parallelization**: Concurrent task execution

### Advanced Workflows
4. **Orchestrator-Subagents**: Central coordinator with specialized workers
5. **Evaluator-Optimizer**: Iterative improvement loop

## Workflow Design Process

### 1. Task Analysis
- What is the main objective?
- What are the subtasks?
- Which tasks depend on others?
- Which can run in parallel?

### 2. Pattern Selection
- Choose appropriate pattern(s) from above
- Consider scalability and complexity
- Evaluate error handling needs

### 3. Agent Definition
```
For each agent:
- Role and responsibility
- Input requirements
- Output format
- Error handling strategy
- Success criteria
```

### 4. Workflow Diagram
```
[Agent 1] → [Agent 2] → [Agent 3]
    ↓           ↓
[Agent 4]   [Agent 5]
    ↓           ↓
    → [Aggregator] →
```

### 5. Implementation Plan
- Tool requirements
- API integrations needed
- State management approach
- Monitoring and observability

## Output

Provide:
1. Workflow diagram (text-based)
2. Agent specifications
3. Sample implementation code
4. Test scenarios
5. Monitoring strategy

**Describe your workflow requirements below:**
