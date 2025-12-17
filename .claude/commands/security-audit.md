---
description: Comprehensive security audit (Cookbook pattern)
---

# Security Audit

Perform a thorough security review following OWASP Top 10 and cookbook security patterns:

## 1. Secrets & Credentials
- [ ] Check for hardcoded API keys, tokens, passwords
- [ ] Verify `.env` files are in `.gitignore`
- [ ] Ensure environment variables are used correctly
- [ ] Check for exposed credentials in comments or logs

## 2. Injection Vulnerabilities
- [ ] SQL Injection: Verify parameterized queries are used
- [ ] XSS: Check for proper input sanitization and output encoding
- [ ] Command Injection: Validate shell command construction
- [ ] Path Traversal: Check file path validation

## 3. Authentication & Authorization
- [ ] Verify JWT/session handling is secure
- [ ] Check for proper password hashing (bcrypt/argon2)
- [ ] Ensure authorization checks before sensitive operations
- [ ] Review role-based access control (RBAC)

## 4. Data Validation
- [ ] Input validation at all boundaries
- [ ] Type checking and sanitization
- [ ] File upload restrictions and validation
- [ ] API rate limiting implementation

## 5. Dependencies & Supply Chain
- [ ] Check for known vulnerabilities in dependencies
- [ ] Verify dependency versions are up to date
- [ ] Review third-party integrations

## 6. API Security
- [ ] CORS configuration review
- [ ] CSRF protection implementation
- [ ] API authentication and rate limiting
- [ ] Sensitive data exposure in responses

## Output Format
```
CRITICAL: [Issues that need immediate attention]
HIGH: [Important issues to fix soon]
MEDIUM: [Should be addressed]
LOW: [Nice to have improvements]
```

For each issue, provide:
- Location (file:line)
- Explanation
- Fix recommendation with code example
