"""Names the frontend uses for rating factors and levels, and the pricing service's codes for them.

Only translation lives here. No rating logic.
"""

from dataclasses import dataclass

REGIONS = {"Northeast": "1", "Midwest": "2", "South": "3", "West": "4"}
REGION_NAMES = {code: name for name, code in REGIONS.items()}
CONDITION_LEVELS = {"absent": "0", "present": "1"}
CONDITION_NAMES = {code: name for name, code in CONDITION_LEVELS.items()}

# Words that must never be accepted as rating inputs (see AGENTS.md rules).
NOT_PERMITTED = {"sex", "gender", "race", "ethnicity", "income", "education", "smoking", "bmi"}


@dataclass(frozen=True)
class FactorDef:
    key: str  # frontend key
    code: str  # pricing service factor
    label: str
    group: str  # age, region or condition


FACTOR_DEFS = [
    FactorDef("age", "age", "Age band", "age"),
    FactorDef("region", "region", "Region", "region"),
    FactorDef("cond_hbp", "HIBPDX", "High blood pressure", "condition"),
    FactorDef("cond_chd", "CHDDX", "Coronary heart disease", "condition"),
    FactorDef("cond_ohd", "OHRTDX", "Other heart disease", "condition"),
    FactorDef("cond_chol", "CHOLDX", "High cholesterol", "condition"),
    FactorDef("cond_cancer", "CANCERDX", "Cancer", "condition"),
    FactorDef("cond_arthritis", "ARTHDX", "Arthritis", "condition"),
    FactorDef("cond_asthma", "ASTHDX", "Asthma", "condition"),
]
BY_KEY = {f.key: f for f in FACTOR_DEFS}
BY_CODE = {f.code: f for f in FACTOR_DEFS}


def key_for(code: str) -> str:
    return BY_CODE[code].key if code in BY_CODE else code


def level_to_ui(code: str, level: str) -> str:
    group = BY_CODE[code].group if code in BY_CODE else ""
    if group == "region":
        return REGION_NAMES.get(str(level), str(level))
    if group == "condition":
        return CONDITION_NAMES.get(str(level), str(level))
    return str(level)


def level_to_service(key: str, level: str) -> str:
    group = BY_KEY[key].group
    if group == "region":
        return REGIONS[level]
    if group == "condition":
        return CONDITION_LEVELS[level]
    return level
