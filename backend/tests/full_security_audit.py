#!/usr/bin/env python3
"""
FULL Security Audit - Tests EVERY API Response in Production Mode
This script checks ALL responses for sensitive data leaks

Usage:
    # Must set ENVIRONMENT=production for filtering to be active
    ENVIRONMENT=production python tests/full_security_audit.py --url http://localhost:8000

    # With authentication token
    ENVIRONMENT=production python tests/full_security_audit.py --url http://localhost:8000 --token <jwt>
"""

import os
import sys
import json
import re
import argparse
import requests
from datetime import datetime
from typing import Dict, List, Any, Tuple

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


class FullSecurityAuditor:
    """
    Comprehensive security auditor that checks EVERY response body
    for sensitive data exposure
    """

    def __init__(self, base_url: str = 'http://localhost:8000', token: str = None):
        self.base_url = base_url.rstrip('/')
        self.token = token
        self.session = requests.Session()
        if token:
            self.session.headers['Authorization'] = f'Bearer {token}'

        self.results = []
        self.endpoints_tested = 0
        self.issues_found = 0

        # CRITICAL: Fields that should NEVER appear in ANY response
        self.forbidden_fields = [
            'password', 'password_hash', 'reset_token', 'api_key',
            'secret_key', 'otp', 'id_number', 'ssn', 'bank_account',
            'bank_details', 'refresh_token', 'session_token', 'auth_token'
        ]

        # Patterns for sensitive data
        self.sensitive_patterns = {
            'bcrypt_hash': r'\$2[aby]?\$\d{2}\$[./A-Za-z0-9]{53}',
            'jwt_token': r'eyJ[A-Za-z0-9-_]+\.eyJ[A-Za-z0-9-_]+\.[A-Za-z0-9-_.+/]*',
            'api_key_pattern': r'(sk-|pk_|api[_-]?key)[A-Za-z0-9]{20,}',
            'aws_key': r'AKIA[0-9A-Z]{16}',
            'credit_card': r'\b(?:\d{4}[-\s]?){3}\d{4}\b'
        }

    def get_all_endpoints(self) -> List[Dict]:
        """
        Get list of ALL endpoints to test
        These are common MeterSquare API endpoints
        """
        return [
            # Health & Public
            {'path': '/api/health', 'method': 'GET', 'auth': False},

            # Users
            {'path': '/api/users', 'method': 'GET', 'auth': True},
            {'path': '/api/users/1', 'method': 'GET', 'auth': True},
            {'path': '/api/admin/users', 'method': 'GET', 'auth': True},

            # Projects
            {'path': '/api/projects', 'method': 'GET', 'auth': True},
            {'path': '/api/projects/1', 'method': 'GET', 'auth': True},
            {'path': '/api/my-projects', 'method': 'GET', 'auth': True},

            # BOQ
            {'path': '/api/boq', 'method': 'GET', 'auth': True},
            {'path': '/api/boq/1', 'method': 'GET', 'auth': True},

            # Vendors
            {'path': '/api/vendors', 'method': 'GET', 'auth': True},
            {'path': '/api/vendors/1', 'method': 'GET', 'auth': True},

            # Change Requests
            {'path': '/api/change-requests', 'method': 'GET', 'auth': True},
            {'path': '/api/change-requests/1', 'method': 'GET', 'auth': True},

            # Workers
            {'path': '/api/workers', 'method': 'GET', 'auth': True},
            {'path': '/api/workers/1', 'method': 'GET', 'auth': True},

            # Inventory
            {'path': '/api/inventory/materials', 'method': 'GET', 'auth': True},

            # Notifications
            {'path': '/api/notifications', 'method': 'GET', 'auth': True},

            # Login History (Admin only)
            {'path': '/api/login-history', 'method': 'GET', 'auth': True},
        ]

    def check_response_for_sensitive_data(self, response_data: Any,
                                          endpoint: str) -> List[Dict]:
        """
        Recursively check response data for ANY sensitive information
        """
        issues = []

        if response_data is None:
            return issues

        # Convert to string for pattern matching
        response_str = json.dumps(response_data) if isinstance(response_data, (dict, list)) else str(response_data)

        # Check forbidden fields in the data structure
        issues.extend(self._check_forbidden_fields(response_data, endpoint))

        # Check for sensitive patterns in the string representation
        for pattern_name, pattern in self.sensitive_patterns.items():
            matches = re.findall(pattern, response_str)
            if matches:
                issues.append({
                    'type': 'SENSITIVE_PATTERN',
                    'severity': 'CRITICAL',
                    'endpoint': endpoint,
                    'pattern': pattern_name,
                    'matches': len(matches),
                    'sample': matches[0][:50] + '...' if len(matches[0]) > 50 else matches[0]
                })

        return issues

    def _check_forbidden_fields(self, data: Any, endpoint: str,
                                 path: str = '') -> List[Dict]:
        """Recursively check for forbidden fields in data structure"""
        issues = []

        if data is None:
            return issues

        if isinstance(data, dict):
            for key, value in data.items():
                current_path = f"{path}.{key}" if path else key
                key_lower = key.lower()

                # Check if key is a forbidden field
                if key_lower in [f.lower() for f in self.forbidden_fields]:
                    issues.append({
                        'type': 'FORBIDDEN_FIELD',
                        'severity': 'CRITICAL',
                        'endpoint': endpoint,
                        'field': key,
                        'path': current_path,
                        'value_preview': str(value)[:30] + '...' if value and len(str(value)) > 30 else str(value)
                    })

                # Recursively check nested data
                issues.extend(self._check_forbidden_fields(value, endpoint, current_path))

        elif isinstance(data, list):
            for i, item in enumerate(data):
                current_path = f"{path}[{i}]"
                issues.extend(self._check_forbidden_fields(item, endpoint, current_path))

        return issues

    def test_endpoint(self, endpoint: Dict) -> Dict:
        """Test a single endpoint and check response for sensitive data"""
        path = endpoint['path']
        method = endpoint.get('method', 'GET')
        requires_auth = endpoint.get('auth', True)

        result = {
            'endpoint': path,
            'method': method,
            'tested': False,
            'issues': [],
            'status_code': None,
            'error': None
        }

        # Skip auth endpoints if no token provided
        if requires_auth and not self.token:
            result['error'] = 'SKIPPED - No auth token'
            return result

        try:
            url = f"{self.base_url}{path}"

            if method == 'GET':
                response = self.session.get(url, timeout=30)
            elif method == 'POST':
                response = self.session.post(url, json={}, timeout=30)
            else:
                response = self.session.request(method, url, timeout=30)

            result['status_code'] = response.status_code
            result['tested'] = True

            # Check response body for sensitive data
            if response.status_code == 200:
                try:
                    data = response.json()
                    result['issues'] = self.check_response_for_sensitive_data(data, path)
                except json.JSONDecodeError:
                    # Not JSON response
                    pass

        except requests.exceptions.ConnectionError:
            result['error'] = 'CONNECTION_ERROR'
        except requests.exceptions.Timeout:
            result['error'] = 'TIMEOUT'
        except Exception as e:
            result['error'] = str(e)[:100]

        return result

    def run_full_audit(self, custom_endpoints: List[Dict] = None) -> Dict:
        """Run full security audit on all endpoints"""
        print("\n" + "=" * 70)
        print("METERSQUARE FULL SECURITY AUDIT")
        print("=" * 70)
        print(f"Target: {self.base_url}")
        print(f"Environment: {os.getenv('ENVIRONMENT', 'NOT SET')}")
        print(f"Auth Token: {'Provided' if self.token else 'Not provided'}")
        print(f"Time: {datetime.now().isoformat()}")
        print("=" * 70)

        # Check environment
        env = os.getenv('ENVIRONMENT', 'development')
        if env != 'production':
            print("\n[WARNING] ENVIRONMENT is not 'production'!")
            print("          Security filtering may NOT be active!")
            print("          Set ENVIRONMENT=production for accurate results")

        endpoints = custom_endpoints or self.get_all_endpoints()
        print(f"\n[INFO] Testing {len(endpoints)} endpoints...\n")

        all_issues = []
        tested_count = 0
        skipped_count = 0

        for endpoint in endpoints:
            result = self.test_endpoint(endpoint)
            self.results.append(result)

            if result['tested']:
                tested_count += 1
                if result['issues']:
                    all_issues.extend(result['issues'])
                    for issue in result['issues']:
                        self._print_issue(issue)
                else:
                    print(f"   [OK] {endpoint['path']}")
            else:
                skipped_count += 1
                print(f"   [SKIP] {endpoint['path']} - {result.get('error', 'Unknown')}")

        # Generate report
        report = self._generate_report(all_issues, tested_count, skipped_count)
        self._print_summary(report)

        return report

    def _print_issue(self, issue: Dict):
        """Print a security issue"""
        severity = issue.get('severity', 'UNKNOWN')
        icons = {'CRITICAL': '[!!!]', 'HIGH': '[!!]', 'MEDIUM': '[!]', 'LOW': '[.]'}
        icon = icons.get(severity, '[?]')

        print(f"   {icon} {issue['endpoint']}")
        print(f"       Type: {issue['type']}")
        print(f"       Field: {issue.get('field') or issue.get('pattern')}")
        if issue.get('path'):
            print(f"       Path: {issue['path']}")
        if issue.get('value_preview'):
            print(f"       Value: {issue['value_preview']}")

    def _generate_report(self, issues: List[Dict], tested: int, skipped: int) -> Dict:
        """Generate audit report"""
        critical = len([i for i in issues if i.get('severity') == 'CRITICAL'])
        high = len([i for i in issues if i.get('severity') == 'HIGH'])
        medium = len([i for i in issues if i.get('severity') == 'MEDIUM'])
        low = len([i for i in issues if i.get('severity') == 'LOW'])

        # Group issues by type
        issues_by_type = {}
        for issue in issues:
            issue_type = issue.get('type', 'UNKNOWN')
            if issue_type not in issues_by_type:
                issues_by_type[issue_type] = []
            issues_by_type[issue_type].append(issue)

        # Group issues by field
        issues_by_field = {}
        for issue in issues:
            field = issue.get('field') or issue.get('pattern')
            if field:
                if field not in issues_by_field:
                    issues_by_field[field] = 0
                issues_by_field[field] += 1

        return {
            'timestamp': datetime.now().isoformat(),
            'target': self.base_url,
            'environment': os.getenv('ENVIRONMENT', 'development'),
            'summary': {
                'total_endpoints': tested + skipped,
                'endpoints_tested': tested,
                'endpoints_skipped': skipped,
                'total_issues': len(issues),
                'critical': critical,
                'high': high,
                'medium': medium,
                'low': low,
                'passed': len(issues) == 0
            },
            'issues_by_type': issues_by_type,
            'issues_by_field': dict(sorted(issues_by_field.items(), key=lambda x: -x[1])),
            'all_issues': issues,
            'results': self.results
        }

    def _print_summary(self, report: Dict):
        """Print audit summary"""
        print("\n" + "=" * 70)
        print("AUDIT SUMMARY")
        print("=" * 70)

        s = report['summary']
        print(f"\nEndpoints:")
        print(f"  Total: {s['total_endpoints']}")
        print(f"  Tested: {s['endpoints_tested']}")
        print(f"  Skipped: {s['endpoints_skipped']}")

        print(f"\nIssues Found: {s['total_issues']}")
        print(f"  Critical: {s['critical']}")
        print(f"  High: {s['high']}")
        print(f"  Medium: {s['medium']}")
        print(f"  Low: {s['low']}")

        if report['issues_by_field']:
            print(f"\nTop Exposed Fields:")
            for field, count in list(report['issues_by_field'].items())[:10]:
                print(f"  - {field}: {count} occurrences")

        status = "PASS" if s['passed'] else "FAIL"
        status_icon = "[OK]" if s['passed'] else "[!!!]"
        print(f"\nResult: {status_icon} {status}")

        if not s['passed']:
            print("\n[CRITICAL] Sensitive data is being exposed in responses!")
            print("           Check that ENVIRONMENT=production is set correctly")

        print("=" * 70)


def main():
    parser = argparse.ArgumentParser(description='MeterSquare Full Security Auditor')
    parser.add_argument('--url', default='http://localhost:8000', help='Target URL')
    parser.add_argument('--token', help='JWT auth token')
    parser.add_argument('--output', help='Output file for JSON report')

    args = parser.parse_args()

    # Check environment
    env = os.getenv('ENVIRONMENT', 'development')
    print(f"\n[ENV] ENVIRONMENT = {env}")

    if env != 'production':
        print("[WARN] For accurate security testing, run with:")
        print("       ENVIRONMENT=production python tests/full_security_audit.py --url ...")

    auditor = FullSecurityAuditor(args.url, args.token)
    report = auditor.run_full_audit()

    if args.output:
        with open(args.output, 'w') as f:
            json.dump(report, f, indent=2)
        print(f"\nReport saved to: {args.output}")

    # Exit with error if issues found
    if report['summary']['total_issues'] > 0:
        sys.exit(1)
    sys.exit(0)


if __name__ == '__main__':
    main()
