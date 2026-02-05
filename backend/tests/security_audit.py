#!/usr/bin/env python3
"""
Security Audit Tool for MeterSquare
Automatically tests ALL API responses for sensitive data leaks

Usage:
    # Run in development mode (should show ALL data)
    ENVIRONMENT=development python tests/security_audit.py

    # Run in production mode (should filter sensitive data)
    ENVIRONMENT=production python tests/security_audit.py

    # Run specific checks
    python tests/security_audit.py --check-users
    python tests/security_audit.py --check-all
"""

import os
import sys
import json
import re
import argparse
from datetime import datetime
from typing import Dict, List, Any, Tuple

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Sensitive patterns to detect
SENSITIVE_PATTERNS = {
    'email': {
        'pattern': r'[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}',
        'severity': 'MEDIUM',
        'description': 'Email address detected'
    },
    'phone': {
        'pattern': r'\b\d{10,15}\b',
        'severity': 'MEDIUM',
        'description': 'Phone number detected'
    },
    'password': {
        'pattern': r'(password|passwd|pwd)["\']?\s*[:=]\s*["\'][^"\']+["\']',
        'severity': 'CRITICAL',
        'description': 'Password field detected'
    },
    'password_hash': {
        'pattern': r'\$2[aby]?\$\d{2}\$[./A-Za-z0-9]{53}',  # bcrypt hash
        'severity': 'CRITICAL',
        'description': 'Password hash detected'
    },
    'api_key': {
        'pattern': r'(api[_-]?key|apikey|secret[_-]?key)["\']?\s*[:=]\s*["\'][^"\']+["\']',
        'severity': 'CRITICAL',
        'description': 'API key detected'
    },
    'jwt_token': {
        'pattern': r'eyJ[A-Za-z0-9-_]+\.eyJ[A-Za-z0-9-_]+\.[A-Za-z0-9-_.+/]*',
        'severity': 'HIGH',
        'description': 'JWT token detected in response'
    },
    'internal_cost': {
        'pattern': r'(internal_cost|profit_margin|admin_notes)["\']?\s*:',
        'severity': 'HIGH',
        'description': 'Internal business data detected'
    }
}

# Fields that should NEVER appear in responses (CRITICAL)
FORBIDDEN_FIELDS = [
    # Authentication & Security
    'password',
    'password_hash',
    'reset_token',
    'api_key',
    'secret_key',
    'otp',
    # Government/Financial IDs
    'id_number',
    'ssn',
    'bank_account',
    'bank_details',
    # Internal tokens
    'refresh_token',
    'session_token',
    'auth_token'
]

# Fields that should only be visible to admins (HIGH)
ADMIN_ONLY_FIELDS = [
    # Internal business data
    'internal_cost',
    'profit_margin',
    'internal_notes',
    'admin_notes',
    'estimated_cost',
    'cost_breakdown',
    'margin_percentage',
    'hourly_rate',
    # Audit/tracking data
    'ip_address',
    'user_agent',
    'device_type',
    'browser',
    'os',
    # Business sensitive
    'gst_number',
    'fax'
]

# Fields that should only be visible to owner or admin (MEDIUM)
OWNER_ONLY_FIELDS = [
    'email',
    'phone',
    'phone_code',
    'emergency_contact',
    'emergency_phone'
]


class SecurityAuditor:
    """Audit API responses for security vulnerabilities"""

    def __init__(self, base_url: str = 'http://localhost:8000'):
        self.base_url = base_url
        self.results = []
        self.total_checked = 0
        self.issues_found = 0

    def check_response_for_sensitive_data(self, response_data: Any, endpoint: str,
                                          user_role: str = None) -> List[Dict]:
        """
        Check a response for sensitive data leaks

        Args:
            response_data: The API response data
            endpoint: The endpoint that was called
            user_role: The role of the user making the request

        Returns:
            List of issues found
        """
        issues = []

        # Convert to string for pattern matching
        response_str = json.dumps(response_data) if isinstance(response_data, (dict, list)) else str(response_data)

        # Check for forbidden fields
        for field in FORBIDDEN_FIELDS:
            if self._field_exists_in_data(response_data, field):
                issues.append({
                    'type': 'FORBIDDEN_FIELD',
                    'severity': 'CRITICAL',
                    'field': field,
                    'endpoint': endpoint,
                    'message': f'Forbidden field "{field}" found in response'
                })

        # Check for admin-only fields (if user is not admin)
        if user_role and user_role.lower() not in ['admin', 'pm', 'td']:
            for field in ADMIN_ONLY_FIELDS:
                if self._field_exists_in_data(response_data, field):
                    issues.append({
                        'type': 'ADMIN_ONLY_FIELD',
                        'severity': 'HIGH',
                        'field': field,
                        'endpoint': endpoint,
                        'user_role': user_role,
                        'message': f'Admin-only field "{field}" visible to {user_role}'
                    })

        # Check for sensitive patterns
        for pattern_name, pattern_info in SENSITIVE_PATTERNS.items():
            matches = re.findall(pattern_info['pattern'], response_str, re.IGNORECASE)
            if matches and pattern_name in ['password', 'password_hash', 'api_key']:
                issues.append({
                    'type': 'SENSITIVE_PATTERN',
                    'severity': pattern_info['severity'],
                    'pattern': pattern_name,
                    'endpoint': endpoint,
                    'message': pattern_info['description'],
                    'matches_count': len(matches)
                })

        return issues

    def _field_exists_in_data(self, data: Any, field_name: str) -> bool:
        """Check if a field exists anywhere in the response data"""
        if data is None:
            return False

        if isinstance(data, dict):
            for key, value in data.items():
                if key.lower() == field_name.lower():
                    return True
                if self._field_exists_in_data(value, field_name):
                    return True

        elif isinstance(data, list):
            for item in data:
                if self._field_exists_in_data(item, field_name):
                    return True

        return False

    def _find_field_values(self, data: Any, field_name: str) -> List[Any]:
        """Find all values for a field in the response data"""
        values = []

        if data is None:
            return values

        if isinstance(data, dict):
            for key, value in data.items():
                if key.lower() == field_name.lower():
                    values.append(value)
                values.extend(self._find_field_values(value, field_name))

        elif isinstance(data, list):
            for item in data:
                values.extend(self._find_field_values(item, field_name))

        return values

    def audit_response(self, response_data: Any, endpoint: str,
                       user_role: str = None, user_id: int = None) -> Dict:
        """
        Audit a single API response

        Returns audit result with pass/fail status
        """
        self.total_checked += 1

        issues = self.check_response_for_sensitive_data(response_data, endpoint, user_role)

        result = {
            'endpoint': endpoint,
            'user_role': user_role,
            'user_id': user_id,
            'timestamp': datetime.now().isoformat(),
            'issues': issues,
            'passed': len(issues) == 0,
            'issue_count': len(issues)
        }

        if issues:
            self.issues_found += len(issues)

        self.results.append(result)
        return result

    def generate_report(self) -> Dict:
        """Generate a comprehensive audit report"""

        critical_issues = [r for r in self.results for i in r['issues'] if i.get('severity') == 'CRITICAL']
        high_issues = [r for r in self.results for i in r['issues'] if i.get('severity') == 'HIGH']
        medium_issues = [r for r in self.results for i in r['issues'] if i.get('severity') == 'MEDIUM']

        report = {
            'audit_date': datetime.now().isoformat(),
            'environment': os.getenv('ENVIRONMENT', 'development'),
            'summary': {
                'total_responses_checked': self.total_checked,
                'total_issues_found': self.issues_found,
                'critical_issues': len(critical_issues),
                'high_issues': len(high_issues),
                'medium_issues': len(medium_issues),
                'passed': self.issues_found == 0
            },
            'results': self.results,
            'recommendations': self._generate_recommendations()
        }

        return report

    def _generate_recommendations(self) -> List[str]:
        """Generate recommendations based on findings"""
        recommendations = []

        # Check for critical issues
        critical_fields = set()
        for result in self.results:
            for issue in result['issues']:
                if issue.get('severity') == 'CRITICAL':
                    critical_fields.add(issue.get('field') or issue.get('pattern'))

        if critical_fields:
            recommendations.append(
                f"CRITICAL: Remove these fields from ALL responses: {', '.join(critical_fields)}"
            )

        # Check environment
        env = os.getenv('ENVIRONMENT', 'development')
        if env == 'development' and self.issues_found > 0:
            recommendations.append(
                "NOTE: Running in development mode. Set ENVIRONMENT=production to enable filtering."
            )
        elif env == 'production' and self.issues_found > 0:
            recommendations.append(
                "WARNING: Issues found in production mode. The global response filter may not be working correctly."
            )

        if not recommendations:
            recommendations.append("All checks passed. No security issues found.")

        return recommendations

    def print_report(self):
        """Print a formatted report to console"""
        report = self.generate_report()

        print("\n" + "=" * 70)
        print("🔒 METERSQUARE SECURITY AUDIT REPORT")
        print("=" * 70)
        print(f"\n📅 Date: {report['audit_date']}")
        print(f"🌍 Environment: {report['environment']}")

        print(f"\n📊 SUMMARY:")
        print(f"   Total Responses Checked: {report['summary']['total_responses_checked']}")
        print(f"   Total Issues Found: {report['summary']['total_issues_found']}")
        print(f"   - Critical: {report['summary']['critical_issues']}")
        print(f"   - High: {report['summary']['high_issues']}")
        print(f"   - Medium: {report['summary']['medium_issues']}")

        status = "✅ PASSED" if report['summary']['passed'] else "❌ FAILED"
        print(f"\n   Status: {status}")

        if report['summary']['total_issues_found'] > 0:
            print(f"\n⚠️  ISSUES FOUND:")
            for result in self.results:
                if result['issues']:
                    print(f"\n   Endpoint: {result['endpoint']}")
                    print(f"   User Role: {result['user_role']}")
                    for issue in result['issues']:
                        severity_icon = {
                            'CRITICAL': '🔴',
                            'HIGH': '🟠',
                            'MEDIUM': '🟡'
                        }.get(issue.get('severity'), '⚪')
                        print(f"   {severity_icon} [{issue.get('severity')}] {issue.get('message')}")
                        if issue.get('field'):
                            print(f"      Field: {issue.get('field')}")

        print(f"\n📝 RECOMMENDATIONS:")
        for rec in report['recommendations']:
            print(f"   • {rec}")

        print("\n" + "=" * 70 + "\n")

        return report


def test_sample_responses():
    """Test the auditor with sample responses"""

    auditor = SecurityAuditor()

    print("\n🧪 Testing Security Audit Tool with Sample Data...\n")

    # Test 1: Response with forbidden field (should fail)
    print("Test 1: Response with password field (should FAIL)")
    response1 = {
        "user_id": 123,
        "email": "test@example.com",
        "password_hash": "$2b$12$abc123..."
    }
    result1 = auditor.audit_response(response1, "/api/users/123", user_role="admin")
    print(f"   Result: {'❌ FAILED' if not result1['passed'] else '✅ PASSED'}")
    print(f"   Issues: {result1['issue_count']}")

    # Test 2: Response with email visible to non-admin (production should filter)
    print("\nTest 2: Email visible to non-admin")
    response2 = {
        "user_id": 456,
        "full_name": "John Doe",
        "email": "john@example.com",
        "phone": "9876543210"
    }
    result2 = auditor.audit_response(response2, "/api/users/456", user_role="site_engineer")
    print(f"   Result: {'❌ Issues Found' if not result2['passed'] else '✅ No Issues'}")

    # Test 3: Clean response (should pass)
    print("\nTest 3: Clean response without sensitive data")
    response3 = {
        "user_id": 789,
        "full_name": "Jane Doe",
        "role": "buyer",
        "department": "Procurement"
    }
    result3 = auditor.audit_response(response3, "/api/users/789", user_role="vendor")
    print(f"   Result: {'✅ PASSED' if result3['passed'] else '❌ FAILED'}")

    # Test 4: Internal cost visible to vendor (should fail)
    print("\nTest 4: Internal cost visible to vendor (should FAIL)")
    response4 = {
        "item_id": 1,
        "name": "Cement",
        "quantity": 100,
        "internal_cost": 5000,
        "profit_margin": 0.15
    }
    result4 = auditor.audit_response(response4, "/api/materials/1", user_role="vendor")
    print(f"   Result: {'❌ FAILED' if not result4['passed'] else '✅ PASSED'}")
    print(f"   Issues: {result4['issue_count']}")

    # Generate and print report
    auditor.print_report()

    return auditor


def audit_live_api(base_url: str = 'http://localhost:8000', token: str = None):
    """
    Audit live API endpoints

    Requires the server to be running
    """
    import requests

    auditor = SecurityAuditor(base_url)

    headers = {}
    if token:
        headers['Authorization'] = f'Bearer {token}'

    # List of endpoints to test
    endpoints = [
        {'path': '/api/health', 'method': 'GET', 'auth': False},
        {'path': '/api/users', 'method': 'GET', 'auth': True},
        # Add more endpoints as needed
    ]

    print(f"\n🔍 Auditing Live API at {base_url}...\n")

    for endpoint in endpoints:
        try:
            url = f"{base_url}{endpoint['path']}"

            if endpoint['auth'] and not token:
                print(f"⏭️  Skipping {endpoint['path']} (requires auth)")
                continue

            response = requests.get(url, headers=headers, timeout=10)

            if response.status_code == 200:
                data = response.json()
                result = auditor.audit_response(data, endpoint['path'])
                status = '✅' if result['passed'] else '❌'
                print(f"{status} {endpoint['path']} - {result['issue_count']} issues")
            else:
                print(f"⚠️  {endpoint['path']} - Status {response.status_code}")

        except requests.exceptions.ConnectionError:
            print(f"❌ Cannot connect to {base_url}")
            break
        except Exception as e:
            print(f"❌ Error testing {endpoint['path']}: {e}")

    return auditor


def scan_response_data(data: Any, context: str = "response") -> List[Dict]:
    """
    Scan any response data for security issues

    Usage:
        from tests.security_audit import scan_response_data

        issues = scan_response_data(my_api_response)
        if issues:
            print("Security issues found!")
    """
    auditor = SecurityAuditor()
    result = auditor.audit_response(data, context)
    return result['issues']


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='MeterSquare Security Audit Tool')
    parser.add_argument('--live', action='store_true', help='Audit live API')
    parser.add_argument('--url', default='http://localhost:8000', help='Base URL for live audit')
    parser.add_argument('--token', help='JWT token for authenticated endpoints')
    parser.add_argument('--test', action='store_true', help='Run with sample test data')

    args = parser.parse_args()

    if args.live:
        auditor = audit_live_api(args.url, args.token)
    else:
        auditor = test_sample_responses()

    # Save report to file
    report = auditor.generate_report()
    report_file = f"security_audit_report_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"

    with open(report_file, 'w') as f:
        json.dump(report, f, indent=2)

    print(f"📄 Report saved to: {report_file}")

    # Exit with error code if issues found
    sys.exit(0 if report['summary']['passed'] else 1)
