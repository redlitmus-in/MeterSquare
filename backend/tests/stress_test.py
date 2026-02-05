#!/usr/bin/env python3
"""
Stress/Load Testing for MeterSquare API
Tests API performance under heavy load

Usage:
    python tests/stress_test.py --url http://localhost:8000
    python tests/stress_test.py --url http://localhost:8000 --users 50 --duration 30
"""

import os
import sys
import json
import time
import argparse
import statistics
from datetime import datetime
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Dict, List, Tuple
import threading

try:
    import requests
except ImportError:
    print("Please install requests: pip install requests")
    sys.exit(1)

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


class StressTester:
    """Load/Stress testing tool for MeterSquare API"""

    def __init__(self, base_url: str = 'http://localhost:8000'):
        self.base_url = base_url.rstrip('/')
        self.results = []
        self.errors = []
        self.lock = threading.Lock()
        self.request_count = 0
        self.success_count = 0
        self.error_count = 0

    def make_request(self, endpoint: str, method: str = 'GET',
                     data: Dict = None, headers: Dict = None) -> Dict:
        """Make a single request and record timing"""
        start_time = time.time()
        result = {
            'endpoint': endpoint,
            'method': method,
            'timestamp': datetime.now().isoformat(),
            'success': False,
            'status_code': None,
            'response_time_ms': 0,
            'error': None
        }

        try:
            url = f"{self.base_url}{endpoint}"

            if method == 'GET':
                response = requests.get(url, headers=headers, timeout=30)
            elif method == 'POST':
                response = requests.post(url, json=data, headers=headers, timeout=30)
            else:
                response = requests.request(method, url, json=data, headers=headers, timeout=30)

            result['status_code'] = response.status_code
            result['success'] = response.status_code < 400
            result['response_size'] = len(response.content)

        except requests.exceptions.Timeout:
            result['error'] = 'TIMEOUT'
        except requests.exceptions.ConnectionError:
            result['error'] = 'CONNECTION_ERROR'
        except Exception as e:
            result['error'] = str(e)[:100]

        result['response_time_ms'] = (time.time() - start_time) * 1000

        with self.lock:
            self.results.append(result)
            self.request_count += 1
            if result['success']:
                self.success_count += 1
            else:
                self.error_count += 1

        return result

    def worker(self, endpoint: str, duration: int, request_delay: float = 0):
        """Worker function for concurrent load testing"""
        end_time = time.time() + duration

        while time.time() < end_time:
            self.make_request(endpoint)
            if request_delay > 0:
                time.sleep(request_delay)

    def run_load_test(self, endpoints: List[str], concurrent_users: int = 10,
                      duration: int = 10, ramp_up: int = 0) -> Dict:
        """
        Run load test with specified parameters

        Args:
            endpoints: List of endpoints to test
            concurrent_users: Number of concurrent users
            duration: Test duration in seconds
            ramp_up: Time to ramp up to full load (seconds)
        """
        print("\n" + "=" * 60)
        print("METERSQUARE LOAD/STRESS TEST")
        print("=" * 60)
        print(f"Target: {self.base_url}")
        print(f"Concurrent Users: {concurrent_users}")
        print(f"Duration: {duration}s")
        print(f"Endpoints: {len(endpoints)}")
        print(f"Started: {datetime.now().isoformat()}")
        print("=" * 60)

        # Reset counters
        self.results = []
        self.request_count = 0
        self.success_count = 0
        self.error_count = 0

        # Calculate delay between starting each user (ramp-up)
        user_delay = ramp_up / concurrent_users if ramp_up > 0 else 0

        print(f"\n[RUNNING] Starting {concurrent_users} concurrent users...")

        start_time = time.time()

        with ThreadPoolExecutor(max_workers=concurrent_users) as executor:
            futures = []

            for i in range(concurrent_users):
                # Each user tests random endpoints
                endpoint = endpoints[i % len(endpoints)]
                future = executor.submit(self.worker, endpoint, duration)
                futures.append(future)

                if user_delay > 0:
                    time.sleep(user_delay)
                    print(f"   User {i+1}/{concurrent_users} started")

            # Wait for all workers to complete
            for future in as_completed(futures):
                try:
                    future.result()
                except Exception as e:
                    print(f"   [ERROR] Worker failed: {e}")

        elapsed = time.time() - start_time

        # Generate report
        report = self._generate_report(elapsed)
        self._print_report(report)

        return report

    def run_spike_test(self, endpoint: str, spike_users: int = 100,
                       spike_duration: int = 5) -> Dict:
        """
        Run spike test - sudden burst of traffic

        Args:
            endpoint: Endpoint to test
            spike_users: Number of users in spike
            spike_duration: Duration of spike in seconds
        """
        print("\n" + "=" * 60)
        print("METERSQUARE SPIKE TEST")
        print("=" * 60)
        print(f"Target: {self.base_url}{endpoint}")
        print(f"Spike Users: {spike_users}")
        print(f"Spike Duration: {spike_duration}s")
        print("=" * 60)

        # Reset counters
        self.results = []
        self.request_count = 0
        self.success_count = 0
        self.error_count = 0

        print(f"\n[SPIKE] Sending {spike_users} concurrent requests...")

        start_time = time.time()

        with ThreadPoolExecutor(max_workers=spike_users) as executor:
            futures = []

            # Send all requests at once
            for i in range(spike_users):
                future = executor.submit(self.make_request, endpoint)
                futures.append(future)

            # Wait for completion
            for future in as_completed(futures):
                pass

        elapsed = time.time() - start_time

        report = self._generate_report(elapsed)
        self._print_report(report)

        return report

    def run_endurance_test(self, endpoints: List[str], users: int = 5,
                           duration: int = 60) -> Dict:
        """
        Run endurance test - sustained load over time

        Args:
            endpoints: Endpoints to test
            users: Number of concurrent users
            duration: Test duration in seconds
        """
        print("\n" + "=" * 60)
        print("METERSQUARE ENDURANCE TEST")
        print("=" * 60)
        print(f"Target: {self.base_url}")
        print(f"Users: {users}")
        print(f"Duration: {duration}s")
        print("=" * 60)

        return self.run_load_test(endpoints, users, duration)

    def _generate_report(self, elapsed: float) -> Dict:
        """Generate test report with statistics"""
        if not self.results:
            return {'error': 'No results collected'}

        response_times = [r['response_time_ms'] for r in self.results]
        success_times = [r['response_time_ms'] for r in self.results if r['success']]

        # Calculate percentiles
        sorted_times = sorted(response_times)
        p50 = sorted_times[int(len(sorted_times) * 0.50)] if sorted_times else 0
        p90 = sorted_times[int(len(sorted_times) * 0.90)] if sorted_times else 0
        p95 = sorted_times[int(len(sorted_times) * 0.95)] if sorted_times else 0
        p99 = sorted_times[int(len(sorted_times) * 0.99)] if sorted_times else 0

        # Requests per second
        rps = self.request_count / elapsed if elapsed > 0 else 0

        # Error breakdown
        error_types = {}
        for r in self.results:
            if r['error']:
                error_types[r['error']] = error_types.get(r['error'], 0) + 1

        return {
            'timestamp': datetime.now().isoformat(),
            'target': self.base_url,
            'duration_seconds': round(elapsed, 2),
            'summary': {
                'total_requests': self.request_count,
                'successful_requests': self.success_count,
                'failed_requests': self.error_count,
                'success_rate': round(self.success_count / self.request_count * 100, 2) if self.request_count > 0 else 0,
                'requests_per_second': round(rps, 2)
            },
            'response_times': {
                'min_ms': round(min(response_times), 2) if response_times else 0,
                'max_ms': round(max(response_times), 2) if response_times else 0,
                'avg_ms': round(statistics.mean(response_times), 2) if response_times else 0,
                'median_ms': round(statistics.median(response_times), 2) if response_times else 0,
                'std_dev_ms': round(statistics.stdev(response_times), 2) if len(response_times) > 1 else 0,
                'p50_ms': round(p50, 2),
                'p90_ms': round(p90, 2),
                'p95_ms': round(p95, 2),
                'p99_ms': round(p99, 2)
            },
            'errors': error_types,
            'status': self._get_status(rps, self.success_count / self.request_count if self.request_count > 0 else 0, p95)
        }

    def _get_status(self, rps: float, success_rate: float, p95: float) -> str:
        """Determine overall status based on metrics"""
        if success_rate < 0.9:
            return 'CRITICAL - High error rate'
        elif success_rate < 0.95:
            return 'WARNING - Elevated error rate'
        elif p95 > 5000:
            return 'WARNING - Slow response times'
        elif p95 > 2000:
            return 'ACCEPTABLE - Some slow responses'
        else:
            return 'GOOD - Performance within limits'

    def _print_report(self, report: Dict):
        """Print formatted report"""
        print("\n" + "=" * 60)
        print("TEST RESULTS")
        print("=" * 60)

        s = report.get('summary', {})
        print(f"\nRequests:")
        print(f"  Total: {s.get('total_requests', 0)}")
        print(f"  Successful: {s.get('successful_requests', 0)}")
        print(f"  Failed: {s.get('failed_requests', 0)}")
        print(f"  Success Rate: {s.get('success_rate', 0)}%")
        print(f"  Requests/sec: {s.get('requests_per_second', 0)}")

        rt = report.get('response_times', {})
        print(f"\nResponse Times:")
        print(f"  Min: {rt.get('min_ms', 0)}ms")
        print(f"  Max: {rt.get('max_ms', 0)}ms")
        print(f"  Avg: {rt.get('avg_ms', 0)}ms")
        print(f"  Median (p50): {rt.get('p50_ms', 0)}ms")
        print(f"  p90: {rt.get('p90_ms', 0)}ms")
        print(f"  p95: {rt.get('p95_ms', 0)}ms")
        print(f"  p99: {rt.get('p99_ms', 0)}ms")

        errors = report.get('errors', {})
        if errors:
            print(f"\nErrors:")
            for error, count in errors.items():
                print(f"  {error}: {count}")

        print(f"\nStatus: {report.get('status', 'UNKNOWN')}")
        print("=" * 60)


def main():
    parser = argparse.ArgumentParser(description='MeterSquare Load/Stress Tester')
    parser.add_argument('--url', default='http://localhost:8000', help='Target URL')
    parser.add_argument('--users', type=int, default=10, help='Concurrent users')
    parser.add_argument('--duration', type=int, default=10, help='Test duration in seconds')
    parser.add_argument('--test', choices=['load', 'spike', 'endurance'], default='load',
                        help='Type of test to run')
    parser.add_argument('--output', help='Output file for JSON report')

    args = parser.parse_args()

    tester = StressTester(args.url)

    # Default endpoints to test
    endpoints = [
        '/api/health'
    ]

    if args.test == 'load':
        report = tester.run_load_test(
            endpoints=endpoints,
            concurrent_users=args.users,
            duration=args.duration
        )
    elif args.test == 'spike':
        report = tester.run_spike_test(
            endpoint='/api/health',
            spike_users=args.users
        )
    elif args.test == 'endurance':
        report = tester.run_endurance_test(
            endpoints=endpoints,
            users=args.users,
            duration=args.duration
        )

    if args.output:
        with open(args.output, 'w') as f:
            json.dump(report, f, indent=2)
        print(f"\nReport saved to: {args.output}")

    # Exit with error if high failure rate
    if report.get('summary', {}).get('success_rate', 0) < 90:
        sys.exit(1)
    sys.exit(0)


if __name__ == '__main__':
    main()
