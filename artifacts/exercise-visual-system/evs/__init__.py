"""Exercise visual system: reusable 3D exercise-demonstration pipeline.

Modules that import ``bpy`` only work inside Blender. ``evs.config`` and
``evs.validation`` are plain Python and are unit-tested outside Blender.
"""

PIPELINE_VERSION = "0.1.0"

# Statuses a validation check may report. Nothing else is allowed in a QA report.
PASS = "PASS"
FAIL = "FAIL"
NOT_TESTED = "NOT_TESTED"
REQUIRES_MANUAL_REVIEW = "REQUIRES_MANUAL_REVIEW"
UNVERIFIED = "UNVERIFIED"
CHECK_STATUSES = (PASS, FAIL, NOT_TESTED, REQUIRES_MANUAL_REVIEW, UNVERIFIED)

# Lifecycle of an exercise animation. Only APPROVED may be published.
EXERCISE_STATUSES = (
    "DRAFT",
    "CAPTURED",
    "RETARGETED",
    "NEEDS_CORRECTION",
    "TECHNICAL_QA_PASSED",
    "EXPERT_REVIEW_PENDING",
    "APPROVED",
    "REJECTED",
)
PUBLISHABLE_STATUS = "APPROVED"

UNVERIFIED_LABEL = "UNVERIFIED — NOT APPROVED FOR PRODUCTION"
