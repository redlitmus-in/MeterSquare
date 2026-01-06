"""
Skill Matching Utility
Provides flexible skill matching for labour requisitions

Matches:
  "Carpenter - Professional" → Workers with skill "Carpenter"
  "Mason - Professional" → Workers with skill "Mason"
  "Electrician - Certified" → Workers with skill "Electrician"
"""


def extract_base_skill(skill_name):
    """
    Extract base skill from full role name

    Examples:
      "Carpenter - Professional" → "Carpenter"
      "Mason - Professional" → "Mason"
      "Electrician - Certified" → "Electrician"
      "General Helper - Standard" → "Helper"
      "Carpenter" → "Carpenter" (already base)
    """
    if not skill_name:
        return None

    # Split by " - " and take first part
    parts = skill_name.split(' - ')
    base = parts[0].strip()

    # Handle special cases
    if base.lower().startswith('general '):
        # "General Helper" → "Helper"
        return base.split(' ', 1)[1] if ' ' in base else base

    return base


def skill_matches(required_skill, worker_skills):
    """
    Check if worker skills match the required skill

    Uses flexible matching:
    - Exact match: "Carpenter" matches ["Carpenter"]
    - Base match: "Carpenter - Professional" matches ["Carpenter"]
    - Professional match: "Carpenter" matches ["Carpenter - Professional"]

    Args:
        required_skill (str): Skill required by requisition (e.g., "Carpenter - Professional")
        worker_skills (list): List of skills worker has (e.g., ["Carpenter", "Joinery"])

    Returns:
        bool: True if there's a match, False otherwise
    """
    if not required_skill or not worker_skills:
        return False

    # Normalize inputs
    required_skill = required_skill.strip()
    worker_skills = [s.strip() for s in worker_skills if s]

    # Extract base skill from required skill
    required_base = extract_base_skill(required_skill)

    # Check each worker skill
    for worker_skill in worker_skills:
        # Extract base from worker skill
        worker_base = extract_base_skill(worker_skill)

        # Match if:
        # 1. Exact match: "Carpenter" == "Carpenter"
        if required_skill.lower() == worker_skill.lower():
            return True

        # 2. Base match: "Carpenter - Professional" matches "Carpenter"
        if required_base and required_base.lower() == worker_skill.lower():
            return True

        # 3. Base to base match: "Carpenter - Professional" matches "Carpenter - Skilled"
        if required_base and worker_base and required_base.lower() == worker_base.lower():
            return True

        # 4. Worker has professional skill, requisition wants base
        if required_skill.lower() == worker_base.lower():
            return True

    return False


def get_matching_skills(required_skill, worker_skills):
    """
    Get list of worker skills that match the required skill

    Args:
        required_skill (str): Skill required
        worker_skills (list): Worker's skills

    Returns:
        list: Matching skills from worker's skill list
    """
    if not required_skill or not worker_skills:
        return []

    required_base = extract_base_skill(required_skill)
    matching = []

    for worker_skill in worker_skills:
        worker_base = extract_base_skill(worker_skill)

        if (required_skill.lower() == worker_skill.lower() or
            (required_base and required_base.lower() == worker_skill.lower()) or
            (required_base and worker_base and required_base.lower() == worker_base.lower()) or
            (required_skill.lower() == worker_base.lower())):
            matching.append(worker_skill)

    return matching
