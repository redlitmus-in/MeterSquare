#!/usr/bin/env python
"""
Script to update all hardcoded notification action URLs to dynamic ones
"""
import re

# Read the file
file_path = 'backend/utils/comprehensive_notification_service.py'
with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# Define replacements (pattern -> replacement)
replacements = [
    # BOQ sent to client / TD notifications (lines 236, 281, 328)
    (
        r"action_url=f'/technical-director/project-approvals\?tab=sent&boq_id=\{boq_id\}'",
        "action_url=build_notification_action_url(td_user_id, 'project-approvals', {'tab': 'sent', 'boq_id': boq_id}, 'technical-director')"
    ),

    # TD approval to estimator (lines 367, 383, 984, 1013, 1047, 1082)
    (
        r"action_url=f'/estimator/projects\?tab=(approved|rejected|revisions)&boq_id=\{boq_id\}'",
        lambda m: f"action_url=get_boq_view_url(estimator_user_id, boq_id, tab='{m.group(1)}')"
    ),

    # PM assigned to project (line 419)
    (
        r"action_url=f'/project-manager/my-projects\?project_id=\{project_id\}'",
        "action_url=get_project_url(pm_user_id, project_id)"
    ),

    # SE notifications (lines 454, 521, 1125)
    (
        r"action_url=f'/site-engineer/projects\?boq_id=\{boq_id\}'",
        "action_url=build_notification_action_url(se_user_id, 'projects', {'boq_id': boq_id}, 'site-engineer')"
    ),
    (
        r"action_url=f'/site-engineer/site-assets'",
        "action_url=build_notification_action_url(se_user_id, 'site-assets', None, 'site-engineer')"
    ),

    # PM completion/extension notifications (lines 488, 837, 871)
    (
        r"action_url=f'/project-manager/my-projects\?boq_id=\{boq_id\}'",
        "action_url=get_boq_approval_url(pm_user_id, boq_id)"
    ),

    # TD change request/extension (lines 729, 804)
    (
        r"action_url=f'/technical-director/change-requests\?cr_id=\{cr_id\}'",
        "action_url=get_change_request_url(td_user_id, cr_id)"
    ),
    (
        r"action_url=f'/technical-director/project-approvals\?tab=assigned&boq_id=\{boq_id\}'",
        "action_url=get_td_approval_url(td_user_id, boq_id, tab='assigned')"
    ),

    # TD revisions (line 953)
    (
        r"action_url=f'/technical-director/project-approvals\?tab=revisions&boq_id=\{boq_id\}'",
        "action_url=get_td_approval_url(td_user_id, boq_id, tab='revisions')"
    ),

    # Buyer vendor notifications (line 906)
    (
        r"action_url=f'/buyer/vendors\?vendor_id=\{vendor_id\}'",
        "action_url=build_notification_action_url(buyer_user_id, 'vendors', {'vendor_id': vendor_id}, 'buyer')"
    ),

    # Production manager returnable assets (lines 1173, 1214, 1254)
    (
        r"action_url=f'/production-manager/returnable-assets'",
        "action_url=build_notification_action_url(pm_user_id, 'returnable-assets', None, 'production-manager')"
    ),
]

# Apply replacements
for pattern, replacement in replacements:
    if callable(replacement):
        content = re.sub(pattern, replacement, content)
    else:
        content = re.sub(pattern, replacement, content)

# Write back
with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)

print("[OK] Updated all hardcoded notification URLs to dynamic ones!")
print("[INFO] Changes applied to:", file_path)
