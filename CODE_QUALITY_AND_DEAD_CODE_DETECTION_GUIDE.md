# Comprehensive Guide: QA Testing and Dead Code Detection for MeterSquare

Based on industry best practices and analysis of your codebase (Python backend + React/TypeScript frontend), here are the **best practices and tools for 2025**:

---

## **Part 1: Dead Code Detection**

### **For Python Backend:**

#### **1. Vulture (Recommended - Best for Dead Code)**
```bash
# Install
pip install vulture

# Run on your backend
vulture /home/development1/Desktop/MeterSquare/backend --min-confidence 80

# Generate detailed report
vulture backend/ --exclude=node_modules,migrations > dead_code_report.txt
```

**What it finds:**
- Unused functions, classes, variables
- Unused imports
- Unreachable code
- Dead decorators

#### **2. Coverage.py (Find untested code)**
```bash
# Install
pip install coverage pytest

# Run with coverage
coverage run -m pytest
coverage report
coverage html  # Creates nice HTML report
```

### **For JavaScript/TypeScript Frontend:**

#### **1. ESLint with unused vars plugin** (Already configured)
```bash
cd frontend
npm run lint

# Find unused exports
npx eslint . --ext .ts,.tsx --no-eslintrc --plugin @typescript-eslint --rule '@typescript-eslint/no-unused-vars: error'
```

#### **2. ts-prune (TypeScript dead code detector)**
```bash
cd frontend
npm install -g ts-prune

# Find unused exports
ts-prune
```

#### **3. Depcheck (Find unused dependencies)**
```bash
cd frontend
npx depcheck

# This finds:
# - Unused dependencies in package.json
# - Missing dependencies
```

---

## **Part 2: Code Quality Analysis (QA)**

### **Multi-Language Platform: SonarQube (Highly Recommended)**

**Why SonarQube?**
- Supports both Python and JavaScript/TypeScript
- Detects bugs, vulnerabilities, code smells
- Free Community Edition
- CI/CD integration

```bash
# Install with Docker
docker run -d --name sonarqube -p 9000:9000 sonarqube:latest

# Install scanner
npm install -g sonarqube-scanner

# Create sonar-project.properties in your project root
```

**sonar-project.properties:**
```properties
sonar.projectKey=metersquare
sonar.projectName=MeterSquare ERP
sonar.projectVersion=1.2.1
sonar.sources=backend,frontend/src
sonar.exclusions=**/node_modules/**,**/migrations/**
sonar.python.coverage.reportPaths=coverage.xml
sonar.javascript.lcov.reportPaths=frontend/coverage/lcov.info
```

### **Python-Specific QA Tools:**

#### **1. Pylint** (Code quality + standards)
```bash
pip install pylint

# Run on backend
pylint backend/ --output-format=json > pylint_report.json

# Custom config (.pylintrc)
pylint --generate-rcfile > .pylintrc
```

#### **2. Bandit** (Security vulnerabilities)
```bash
pip install bandit

# Security scan
bandit -r backend/ -f json -o bandit_report.json

# Check for:
# - Hardcoded passwords
# - SQL injection
# - Insecure functions
```

#### **3. Ruff** (Modern, fast Python linter - 2025 trend)
```bash
pip install ruff

# Run checks
ruff check backend/

# Auto-fix issues
ruff check backend/ --fix
```

### **JavaScript/TypeScript QA Tools:**

#### **1. ESLint** (Already installed)
Your `package.json:13` has lint script configured.

```bash
cd frontend
npm run lint

# Fix auto-fixable issues
npm run lint -- --fix
```

#### **2. TypeScript Compiler** (Type checking)
Your `package.json:14` has type-check script.

```bash
cd frontend
npm run type-check
```

---

## **Part 3: Automated CI/CD Integration**

### **GitHub Actions Workflow** (Recommended)

Create `.github/workflows/code-quality.yml`:

```yaml
name: Code Quality & Dead Code Check

on: [push, pull_request]

jobs:
  python-qa:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Set up Python
        uses: actions/setup-python@v4
        with:
          python-version: '3.11'

      - name: Install dependencies
        run: |
          cd backend
          pip install -r requirements.txt
          pip install pylint bandit vulture ruff pytest coverage

      - name: Run Ruff (Fast linting)
        run: ruff check backend/

      - name: Run Bandit (Security)
        run: bandit -r backend/ -f json -o bandit_report.json

      - name: Run Vulture (Dead code)
        run: vulture backend/ --min-confidence 80

      - name: Run Tests with Coverage
        run: |
          cd backend
          coverage run -m pytest
          coverage report
          coverage xml

  frontend-qa:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Set up Node
        uses: actions/setup-node@v3
        with:
          node-version: '18'

      - name: Install dependencies
        run: |
          cd frontend
          npm ci

      - name: Run ESLint
        run: cd frontend && npm run lint

      - name: Run TypeScript Check
        run: cd frontend && npm run type-check

      - name: Find unused dependencies
        run: cd frontend && npx depcheck

      - name: Find dead TypeScript exports
        run: |
          cd frontend
          npx ts-prune > ts-prune-report.txt || true
```

---

## **Part 4: Quick Implementation Plan for Your Project**

### **Immediate Actions (Do Today):**

1. **Install Python QA tools:**
```bash
cd /home/development1/Desktop/MeterSquare
pip install vulture ruff bandit pylint coverage
```

2. **Run quick dead code scan:**
```bash
# Python dead code
vulture backend/ --exclude=migrations --min-confidence 80 > dead_code_python.txt

# Frontend unused deps
cd frontend && npx depcheck > dead_code_frontend.txt
```

3. **Run security scan:**
```bash
bandit -r backend/ -ll -f json -o security_issues.json
```

### **Short-term Setup (This Week):**

1. **Create configuration files:**
   - `.pylintrc` for Python linting standards
   - Update ESLint config for stricter rules
   - Create `sonar-project.properties`

2. **Set up pre-commit hooks:**
```bash
pip install pre-commit

# Create .pre-commit-config.yaml
cat > .pre-commit-config.yaml << 'EOF'
repos:
  - repo: https://github.com/astral-sh/ruff-pre-commit
    rev: v0.1.9
    hooks:
      - id: ruff
        args: [--fix]

  - repo: https://github.com/pre-commit/mirrors-eslint
    rev: v8.53.0
    hooks:
      - id: eslint
        files: \.(js|ts|tsx)$
        args: [--fix]
EOF

pre-commit install
```

3. **Add npm scripts to frontend/package.json:**
```json
{
  "scripts": {
    "lint": "eslint . --ext ts,tsx --report-unused-disable-directives --max-warnings 0",
    "lint:fix": "eslint . --ext ts,tsx --fix",
    "dead-code": "ts-prune",
    "deps:check": "depcheck",
    "qa:full": "npm run lint && npm run type-check && npm run dead-code && npm run deps:check"
  }
}
```

---

## **Part 5: AI-Powered Solutions (2025 Cutting Edge)**

### **Modern AI-Based Tools:**

1. **CodeAnt.ai** - AI-powered PR reviews with dead code detection
2. **DeepSource** - Continuous code quality with auto-fixes
3. **Qodo (formerly Codium)** - AI test generation

These integrate with GitHub and provide:
- Automated PR reviews
- Security vulnerability detection
- Dead code identification
- Auto-generated tests

---

## **Part 6: Top Tools Summary**

### **Python-Specific Tools:**

| Tool | Purpose | Installation |
|------|---------|-------------|
| **Vulture** | Dead code detection | `pip install vulture` |
| **Pylint** | Code quality & standards | `pip install pylint` |
| **Ruff** | Fast modern linter | `pip install ruff` |
| **Bandit** | Security vulnerabilities | `pip install bandit` |
| **MyPy** | Static type checking | `pip install mypy` |
| **Coverage.py** | Test coverage | `pip install coverage` |

### **JavaScript/TypeScript Tools:**

| Tool | Purpose | Installation |
|------|---------|-------------|
| **ESLint** | Linting & code quality | Already installed |
| **ts-prune** | Dead TypeScript exports | `npm install -g ts-prune` |
| **Depcheck** | Unused dependencies | `npx depcheck` |
| **TypeScript** | Type checking | Already installed |

### **Multi-Language Platforms:**

| Tool | Purpose | Best For |
|------|---------|----------|
| **SonarQube** | Comprehensive code quality | Enterprise, CI/CD |
| **DeepSource** | AI-powered analysis | Modern teams |
| **Semgrep** | Custom rule scanning | Security-focused |
| **CodeAnt.ai** | AI PR reviews | GitHub integration |

---

## **Recommended Daily Workflow:**

```bash
# Daily: Quick checks
ruff check backend/ && cd frontend && npm run lint

# Before commit: Full QA
vulture backend/ && bandit -r backend/ -ll && cd frontend && npm run qa:full

# Weekly: Deep analysis
# Run SonarQube scan + review dead code reports

# Before release: Complete audit
# Use the codebase-auditor agent (as per your CLAUDE.md)
```

---

## **Key Metrics to Track:**

1. **Code Coverage** - Aim for >80%
2. **Code Duplication** - Keep below 5%
3. **Technical Debt** - Monitor and reduce monthly
4. **Security Vulnerabilities** - Zero high-severity issues
5. **Dead Code Percentage** - Track and remove quarterly
6. **Cyclomatic Complexity** - Keep functions below 10

---

## **Integration with Your Existing Tools:**

### **Pre-commit Hook Integration:**
```bash
# Add to .git/hooks/pre-commit
#!/bin/bash

echo "Running code quality checks..."

# Python checks
ruff check backend/ || exit 1
bandit -r backend/ -ll -f screen || exit 1

# Frontend checks
cd frontend
npm run lint || exit 1
npm run type-check || exit 1

echo "All checks passed!"
```

### **VS Code Integration:**
Add to `.vscode/settings.json`:
```json
{
  "python.linting.enabled": true,
  "python.linting.pylintEnabled": true,
  "python.linting.banditEnabled": true,
  "python.linting.ruffEnabled": true,
  "eslint.enable": true,
  "typescript.validate.enable": true
}
```

---

## **Sources:**

- [Top 20 Python Static Analysis Tools in 2025](https://www.in-com.com/blog/top-20-python-static-analysis-tools-in-2025-improve-code-quality-and-performance/)
- [15+ BEST Code Quality Tools For Error Free Coding In 2025](https://www.softwaretestinghelp.com/code-quality-tools/)
- [10 Powerful Code Quality Tools That Catch Bugs Before Deployment](https://www.greptile.com/content-library/code-quality-tools)
- [Top 10 Python Code Analysis Tools in 2026](https://www.jit.io/resources/appsec-tools/top-python-code-analysis-tools-to-improve-code-quality)
- [25 Best Code Quality Tools for 2025 (Ranked)](https://www.codeant.ai/blogs/best-code-quality-tools)
- [9 Best Automated Code Review Tools for Developers in 2025](https://www.qodo.ai/blog/automated-code-review/)
- [Best Automated Code Review Tools 2025](https://www.microtica.com/blog/automated-code-review-tools)
- [QA in CI/CD Pipeline – Best Practices](https://marutitech.com/qa-in-cicd-pipeline/)
- [Code Review Tool & Analysis Software Solution](https://www.sonarsource.com/solutions/code-review/)
- [The Best QA Automation Tools For Software Testing In 2025](https://thectoclub.com/tools/qa-automation-tools/)

---

## **Next Steps:**

1. ✅ Review this guide
2. ⬜ Install recommended tools (Vulture, Ruff, Bandit for Python; ts-prune for TypeScript)
3. ⬜ Run initial dead code scans
4. ⬜ Set up pre-commit hooks
5. ⬜ Configure CI/CD pipeline with GitHub Actions
6. ⬜ Schedule weekly SonarQube scans
7. ⬜ Integrate with VS Code for real-time feedback

---

**Last Updated:** December 16, 2025
**Project:** MeterSquare ERP v1.2.1
**Codebase:** Python (Flask) + React (TypeScript)
