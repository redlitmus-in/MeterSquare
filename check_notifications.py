#!/usr/bin/env python
"""
Script to check notification system database values
"""
import os
import sys

# Add backend to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'backend'))

from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(__file__), 'backend', '.env'))

from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

# Get database URL
DATABASE_URL = os.getenv('DATABASE_URL')
if not DATABASE_URL:
    print("ERROR: DATABASE_URL not found in .env file")
    sys.exit(1)

# Create engine and session
engine = create_engine(DATABASE_URL)
Session = sessionmaker(bind=engine)
session = Session()

print("=" * 80)
print("NOTIFICATION SYSTEM DATABASE INVESTIGATION")
print("=" * 80)

# 1. Check all unique role names in users table
print("\n1. CHECKING USER ROLES IN DATABASE")
print("-" * 80)
result = session.execute(text("""
    SELECT DISTINCT r.role, COUNT(*) as count
    FROM users u
    JOIN roles r ON u.role_id = r.role_id
    GROUP BY r.role
    ORDER BY r.role
"""))
print("\nAll role values in database:")
for row in result:
    print(f"  - '{row[0]}' (Count: {row[1]})")

# 2. Check estimator users specifically
print("\n2. ESTIMATOR USERS")
print("-" * 80)
result = session.execute(text("""
    SELECT u.user_id, u.full_name, r.role, u.role_id, u.email
    FROM users u
    JOIN roles r ON u.role_id = r.role_id
    WHERE LOWER(r.role) LIKE '%estimat%'
    AND u.is_deleted = false
    ORDER BY u.user_id
"""))
rows = result.fetchall()
print(f"\nFound {len(rows)} estimator users:")
for row in rows:
    print(f"  User ID: {row[0]}")
    print(f"    Full Name: {row[1]}")
    print(f"    Role: '{row[2]}'")
    print(f"    Role ID: {row[3]}")
    print(f"    Email: {row[4]}")
    print()

# 3. Check recent TD approval notifications
print("\n3. RECENT TD APPROVAL NOTIFICATIONS")
print("-" * 80)
result = session.execute(text("""
    SELECT id, user_id, target_role, type, title, action_url, read, created_at
    FROM notifications
    WHERE title LIKE '%Technical Director%'
    OR title LIKE '%approved%'
    OR title LIKE '%rejected%'
    ORDER BY created_at DESC
    LIMIT 10
"""))
rows = result.fetchall()
print(f"\nFound {len(rows)} TD-related notifications:")
for row in rows:
    print(f"  Notification ID: {row[0][:20]}...")
    print(f"    User ID: {row[1]}")
    print(f"    Target Role: '{row[2]}' {'(NULL)' if row[2] is None else ''}")
    print(f"    Type: {row[3]}")
    print(f"    Title: {row[4][:60]}...")
    print(f"    Action URL: {row[5]}")
    print(f"    Read: {row[6]}")
    print(f"    Created: {row[7]}")
    print()

# 4. Check notifications with NULL target_role
print("\n4. NOTIFICATIONS WITH NULL target_role")
print("-" * 80)
result = session.execute(text("""
    SELECT COUNT(*) as null_count
    FROM notifications
    WHERE target_role IS NULL
"""))
null_count = result.fetchone()[0]
print(f"\nTotal notifications with NULL target_role: {null_count}")

result = session.execute(text("""
    SELECT COUNT(*) as total_count
    FROM notifications
"""))
total_count = result.fetchone()[0]
print(f"Total notifications: {total_count}")
print(f"Percentage NULL: {(null_count/total_count*100):.1f}%")

# 5. Check target_role distribution
print("\n5. target_role VALUE DISTRIBUTION")
print("-" * 80)
result = session.execute(text("""
    SELECT target_role, COUNT(*) as count
    FROM notifications
    GROUP BY target_role
    ORDER BY count DESC
"""))
print("\nAll target_role values:")
for row in result:
    role_value = row[0] if row[0] is not None else 'NULL'
    print(f"  '{role_value}': {row[1]} notifications")

# 6. Check if any estimator user has unread TD notifications
print("\n6. ESTIMATOR UNREAD TD NOTIFICATIONS")
print("-" * 80)
result = session.execute(text("""
    SELECT u.user_id, u.full_name, r.role,
           COUNT(n.id) as unread_td_notifications
    FROM users u
    JOIN roles r ON u.role_id = r.role_id
    LEFT JOIN notifications n ON u.user_id = n.user_id
    WHERE LOWER(r.role) LIKE '%estimat%'
    AND (n.title LIKE '%Technical Director%' OR n.title LIKE '%approved%')
    AND n.read = false
    AND n.deleted_at IS NULL
    GROUP BY u.user_id, u.full_name, r.role
    HAVING COUNT(n.id) > 0
    ORDER BY unread_td_notifications DESC
"""))
rows = result.fetchall()
print(f"\nEstimators with unread TD notifications: {len(rows)}")
for row in rows:
    print(f"  User ID {row[0]} ({row[1]}, role: '{row[2]}'): {row[3]} unread")

# 7. Sample notification for an estimator (if exists)
print("\n7. SAMPLE NOTIFICATION DETAILS FOR ESTIMATOR")
print("-" * 80)
result = session.execute(text("""
    SELECT n.id, n.user_id, n.target_role, n.type, n.title, n.message,
           n.action_url, n.read, n.category, n.metadata, u.full_name, r.role
    FROM notifications n
    JOIN users u ON n.user_id = u.user_id
    JOIN roles r ON u.role_id = r.role_id
    WHERE LOWER(r.role) LIKE '%estimat%'
    AND (n.title LIKE '%Technical Director%' OR n.title LIKE '%approved%')
    ORDER BY n.created_at DESC
    LIMIT 1
"""))
row = result.fetchone()
if row:
    print("\nMost recent TD notification for an estimator:")
    print(f"  Notification ID: {row[0]}")
    print(f"  User ID: {row[1]} ({row[10]}, role: '{row[11]}')")
    print(f"  Target Role: '{row[2]}'" + (" (NULL)" if row[2] is None else ""))
    print(f"  Type: {row[3]}")
    print(f"  Title: {row[4]}")
    print(f"  Message: {row[5][:100]}...")
    print(f"  Action URL: {row[6]}")
    print(f"  Read: {row[7]}")
    print(f"  Category: {row[8]}")
    print(f"  Metadata: {row[9]}")
else:
    print("\nNo TD notifications found for estimator users")

# 8. Check BOQ table for estimator assignments
print("\n8. RECENT BOQ RECORDS WITH ESTIMATOR INFO")
print("-" * 80)
result = session.execute(text("""
    SELECT boq_id, project_name, estimator_id, technical_director_status,
           created_at
    FROM boq
    WHERE technical_director_status IS NOT NULL
    ORDER BY created_at DESC
    LIMIT 5
"""))
rows = result.fetchall()
print(f"\nRecent BOQs with TD status:")
for row in rows:
    print(f"  BOQ ID: {row[0]}")
    print(f"    Project: {row[1]}")
    print(f"    Estimator ID: {row[2]}")
    print(f"    TD Status: {row[3]}")
    print(f"    Created: {row[4]}")
    print()

session.close()

print("=" * 80)
print("INVESTIGATION COMPLETE")
print("=" * 80)
