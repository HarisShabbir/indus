from __future__ import annotations

import hashlib
from datetime import datetime, timezone, date, timedelta
from statistics import mean
from typing import Iterable
import uuid

from ..models.atoms import (
    AtomAttribute,
    AtomDetailInfo,
    AtomExperienceResponse,
    AtomExecutionCallouts,
    AtomExecutionExperience,
    AtomExecutionMetric,
    AtomMobilizationExperience,
    AtomStatusTile,
    AtomTrendPointCompact,
    AtomTrendSeries,
    AtomMobilizationRecord,
)
from .atom_manager import get_atom_detail


def _series_from_values(values: list[float]) -> list[tuple[date, float]]:
    if not values:
        return []
    today = date.today()
    start = today - timedelta(days=len(values) - 1)
    return [(start + timedelta(days=index), float(value)) for index, value in enumerate(values)]


SYNTHETIC_DATA = {
    'synthetic::bulldozer-catd11': {
        'info': {
            'atomId': 'CATD11-RIPPER',
            'name': 'CAT D11 Dozer · Production Ripper',
            'category': 'machinery',
            'typeName': 'Bulldozer',
            'groupName': 'Earthmoving',
            'unit': 'unit',
            'contractor': 'Frontier Earthworks JV',
            'homeCode': 'mw-01-main-dam',
            'homeLevel': 'contract',
            'spec': {'role': 'Ripping & push dozer', 'assetTag': 'D11-PR-07'},
        },
        'attributes': [
            {'label': 'Operating Hours', 'value': {'total': 1840, 'unit': 'hrs'}},
            {'label': 'Last Service', 'value': {'date': '2025-04-12', 'type': '500 hr'}},
        ],
        'mobilization_records': [
            {
                'location': 'Quarry high wall',
                'start': date(2025, 1, 18),
                'end': None,
                'status': 'Active',
                'metadata': {'shift': 'Night crew'},
            },
            {
                'location': 'Borrow pit ripping',
                'start': date(2024, 10, 3),
                'end': date(2024, 12, 22),
                'status': 'Completed',
                'metadata': {'notes': 'Mobilised for ripper trials'},
            },
        ],
        'tiles': [
            {
                'id': 'fuel',
                'label': 'Fuel Reserve',
                'value': '68%',
                'caption': 'Projected runtime 5.5h',
                'change': -4.2,
                'changeDirection': 'down',
                'severity': 'warning',
            },
            {
                'id': 'readiness',
                'label': 'Readiness',
                'value': '88%',
                'caption': 'Auto diagnostics clear',
                'change': 2.0,
                'changeDirection': 'up',
                'severity': 'neutral',
            },
            {
                'id': 'utilization',
                'label': 'Utilization',
                'value': '74%',
                'caption': 'Rolling 7 day average',
                'change': 3.4,
                'changeDirection': 'up',
                'severity': 'neutral',
            },
        ],
        'trend_values': [58, 60, 62, 63, 65, 66, 68, 69, 70, 71, 72, 74, 75, 74],
        'execution': {
            'metrics': {
                'utilization': {'value': 74.0, 'change': 3.4, 'direction': 'up'},
                'availability': 89.0,
                'productivity': {'value': 540.0, 'unit': 'm³/day'},
                'quality': 96.0,
                'safety': 0.0,
                'maintenanceDue': 36.0,
                'operatingCost': 185.0,
                'energyRate': {'value': 52.0, 'unit': 'L/hr'},
            },
            'productivity_values': [480, 495, 505, 520, 528, 532, 540, 544, 548, 552, 555, 560, 562, 561],
            'callouts': {
                'positives': [
                    'Utilization increased 3% week-on-week after ripper depth tuning.',
                    'Quality of bench formation has remained above 95% tolerance.',
                ],
                'watch': [
                    'Fuel reserve trending low ahead of night shift—schedule refuel.',
                ],
            },
        },
    },
    'synthetic::stakeholder-wapda': {
        'info': {
            'atomId': 'CLIENT-WAPDA',
            'name': 'Water & Power Development Authority',
            'category': 'actors',
            'typeName': 'Client',
            'groupName': 'Stakeholders',
            'unit': 'organisation',
            'contractor': 'Owner Team',
            'homeCode': 'diamer-basha',
            'homeLevel': 'project',
            'spec': {'role': 'Owner representative', 'contact': 'Client controls team'},
        },
        'attributes': [
            {'label': 'Decision cadence', 'value': {'weeklyBoard': 'Tuesday'}},
            {'label': 'Escalation lead', 'value': {'name': 'Engr. Ahmed Khan'}},
        ],
        'mobilization_records': [
            {
                'location': 'Owner site office',
                'start': date(2024, 3, 1),
                'end': None,
                'status': 'Active',
                'metadata': {'timezone': 'PKT'},
            },
            {
                'location': 'Islamabad HQ',
                'start': date(2023, 7, 1),
                'end': date(2024, 2, 15),
                'status': 'Completed',
                'metadata': {'notes': 'Pre-construction oversight'},
            },
        ],
        'tiles': [
            {
                'id': 'approvals',
                'label': 'Change Approvals',
                'value': '92%',
                'caption': 'SLA met in last 30 days',
                'change': 1.5,
                'changeDirection': 'up',
                'severity': 'good',
            },
            {
                'id': 'availability',
                'label': 'Availability',
                'value': '95%',
                'caption': 'Owner reps onsite',
                'change': 0.0,
                'changeDirection': 'flat',
                'severity': 'good',
            },
            {
                'id': 'issues',
                'label': 'Open Issues',
                'value': '3',
                'caption': 'Awaiting owner input',
                'change': -1.0,
                'changeDirection': 'down',
                'severity': 'neutral',
            },
        ],
        'trend_values': [88, 89, 90, 90, 91, 91, 92, 92, 92, 93, 93, 93, 94, 95],
        'execution': {
            'metrics': {
                'utilization': {'value': 92.0, 'change': 1.5, 'direction': 'up'},
                'availability': 95.0,
                'productivity': {'value': 42.0, 'unit': 'approvals/mo'},
                'quality': 98.0,
                'safety': 0.0,
                'maintenanceDue': 168.0,
                'operatingCost': 0.0,
                'energyRate': {'value': 0.0, 'unit': 'kWh'},
            },
            'productivity_values': [34, 36, 37, 38, 39, 40, 40, 41, 41, 42, 42, 42, 43, 42],
            'callouts': {
                'positives': ['Change approval SLA maintained under 48h.', 'Client team present for all RAMS reviews.'],
                'watch': ['Three commercial issues require joint resolution this week.'],
            },
        },
    },
    'synthetic::stakeholder-dest': {
        'info': {
            'atomId': 'CLIENT-DEST',
            'name': 'Diamer Earthworks Special Team',
            'category': 'actors',
            'typeName': 'Client',
            'groupName': 'Stakeholders',
            'unit': 'organisation',
            'contractor': 'Owner Technical Wing',
            'homeCode': 'diamer-basha',
            'homeLevel': 'project',
            'spec': {'role': 'Technical steering', 'lead': 'Engr. Sana Malik'},
        },
        'attributes': [
            {'label': 'Discipline coverage', 'value': {'geotech': 'Lead', 'environment': 'Advisor'}},
        ],
        'mobilization_records': [
            {
                'location': 'DEST technical suite',
                'start': date(2024, 5, 6),
                'end': None,
                'status': 'Active',
                'metadata': {'mode': 'Hybrid'},
            },
            {
                'location': 'Geotech remote lab',
                'start': date(2023, 9, 1),
                'end': date(2024, 4, 15),
                'status': 'Completed',
                'metadata': {'focus': 'Core sampling'},
            },
        ],
        'tiles': [
            {
                'id': 'reviews',
                'label': 'Design Reviews',
                'value': '85%',
                'caption': 'On-time submissions',
                'change': 2.5,
                'changeDirection': 'up',
                'severity': 'neutral',
            },
            {
                'id': 'availability',
                'label': 'Availability',
                'value': '88%',
                'caption': 'Core specialists on call',
                'change': -1.0,
                'changeDirection': 'down',
                'severity': 'warning',
            },
            {
                'id': 'actions',
                'label': 'Open Actions',
                'value': '5',
                'caption': 'Structural mitigation actions',
                'change': 1.0,
                'changeDirection': 'up',
                'severity': 'warning',
            },
        ],
        'trend_values': [72, 73, 74, 74, 75, 75, 76, 77, 78, 79, 80, 81, 82, 82],
        'execution': {
            'metrics': {
                'utilization': {'value': 82.0, 'change': 2.2, 'direction': 'up'},
                'availability': 88.0,
                'productivity': {'value': 18.0, 'unit': 'reviews/mo'},
                'quality': 97.0,
                'safety': 0.0,
                'maintenanceDue': 720.0,
                'operatingCost': 0.0,
                'energyRate': {'value': 0.0, 'unit': 'kWh'},
            },
            'productivity_values': [14, 15, 16, 16, 17, 17, 17, 18, 18, 18, 19, 18, 18, 18],
            'callouts': {
                'positives': ['Design review backlog cleared last fortnight.'],
                'watch': ['Specialist availability dipped this week—confirm rosters.'],
            },
        },
    },
    'synthetic::stakeholder-contractor-aurora': {
        'info': {
            'atomId': 'CTR-AURORA',
            'name': 'Aurora Build Consortium',
            'category': 'actors',
            'typeName': 'Contractor',
            'groupName': 'Stakeholders',
            'unit': 'organisation',
            'contractor': 'Aurora Build',
            'homeCode': 'mw-01-main-dam',
            'homeLevel': 'contract',
            'spec': {'scope': 'Concrete & structural works', 'crews': 14},
        },
        'attributes': [
            {'label': 'Workface crews', 'value': {'count': 14, 'disciplines': 5}},
            {'label': 'Average daily hours', 'value': {'productive': 9.2}},
        ],
        'mobilization_records': [
            {
                'location': 'Main dam benches',
                'start': date(2024, 4, 1),
                'end': None,
                'status': 'Active',
                'metadata': {'shift': 'Day'},
            },
            {
                'location': 'Batch plant erection',
                'start': date(2024, 1, 10),
                'end': date(2024, 3, 20),
                'status': 'Completed',
                'metadata': {'output': 'Plant commissioned'},
            },
        ],
        'tiles': [
            {
                'id': 'hours-today',
                'label': 'Hours Today',
                'value': '9.1h',
                'caption': 'Average per crew',
                'change': 0.4,
                'changeDirection': 'up',
                'severity': 'neutral',
            },
            {
                'id': 'progress',
                'label': 'Concrete Progress',
                'value': '78%',
                'caption': 'Against monthly plan',
                'change': 4.0,
                'changeDirection': 'up',
                'severity': 'good',
            },
            {
                'id': 'readiness',
                'label': 'Crew Availability',
                'value': '92%',
                'caption': 'Across skilled trades',
                'change': -1.0,
                'changeDirection': 'down',
                'severity': 'neutral',
            },
        ],
        'trend_values': [68, 69, 70, 71, 72, 73, 74, 75, 76, 77, 78, 79, 80, 78],
        'execution': {
            'metrics': {
                'utilization': {'value': 78.0, 'change': 4.0, 'direction': 'up'},
                'availability': 92.0,
                'productivity': {'value': 1.8, 'unit': 'm³/hr'},
                'quality': 97.0,
                'safety': 0.0,
                'maintenanceDue': 120.0,
                'operatingCost': 142.0,
                'energyRate': {'value': 38.0, 'unit': 'kWh'},
            },
            'productivity_values': [1.4, 1.45, 1.5, 1.55, 1.6, 1.64, 1.68, 1.7, 1.72, 1.75, 1.78, 1.8, 1.82, 1.79],
            'callouts': {
                'positives': ['Concrete productivity beat target for three consecutive shifts.'],
                'watch': ['Crew availability slightly down—coordinate overtime roster.'],
            },
        },
    },
    'synthetic::stakeholder-contractor-frontier': {
        'info': {
            'atomId': 'CTR-FRONTIER',
            'name': 'Frontier Civil Partners',
            'category': 'actors',
            'typeName': 'Contractor',
            'groupName': 'Stakeholders',
            'unit': 'organisation',
            'contractor': 'Frontier Civil',
            'homeCode': 'mw-01-main-dam',
            'homeLevel': 'contract',
            'spec': {'scope': 'Quarry & haul roads', 'trucks': 32},
        },
        'attributes': [
            {'label': 'Fleet size', 'value': {'haulTrucks': 32, 'support': 14}},
            {'label': 'Haul distance', 'value': {'average_km': 5.6}},
        ],
        'mobilization_records': [
            {
                'location': 'Quarry haul network',
                'start': date(2023, 12, 1),
                'end': None,
                'status': 'Active',
                'metadata': {'shift': '24/7'},
            },
            {
                'location': 'River diversion access',
                'start': date(2023, 8, 15),
                'end': date(2023, 11, 30),
                'status': 'Completed',
                'metadata': {'notes': 'Temporary works completed'},
            },
        ],
        'tiles': [
            {
                'id': 'cycle-time',
                'label': 'Average Cycle',
                'value': '18.4 min',
                'caption': 'Last shift',
                'change': -0.6,
                'changeDirection': 'down',
                'severity': 'good',
            },
            {
                'id': 'fuel',
                'label': 'Fuel Efficiency',
                'value': '1.9 L/t',
                'caption': 'Haul trucks',
                'change': -0.1,
                'changeDirection': 'down',
                'severity': 'good',
            },
            {
                'id': 'utilization',
                'label': 'Truck Utilization',
                'value': '82%',
                'caption': 'Rolling 14 day',
                'change': 1.0,
                'changeDirection': 'up',
                'severity': 'neutral',
            },
        ],
        'trend_values': [74, 75, 76, 76, 77, 78, 79, 80, 81, 82, 82, 81, 82, 82],
        'execution': {
            'metrics': {
                'utilization': {'value': 82.0, 'change': 1.0, 'direction': 'up'},
                'availability': 90.0,
                'productivity': {'value': 1800.0, 'unit': 't/day'},
                'quality': 94.0,
                'safety': 1.0,
                'maintenanceDue': 60.0,
                'operatingCost': 118.0,
                'energyRate': {'value': 62.0, 'unit': 'L/hr'},
            },
            'productivity_values': [1500, 1520, 1560, 1600, 1650, 1700, 1720, 1750, 1775, 1790, 1800, 1810, 1820, 1815],
            'callouts': {
                'positives': ['Cycle times improved after traffic management tweak.'],
                'watch': ['One minor safety incident logged—reinforce spotter briefing.'],
            },
        },
    },
    'synthetic::workforce-electrical-engineer': {
        'info': {
            'atomId': 'ENG-EE-042',
            'name': 'Lead Electrical Engineer · Grid Integration',
            'category': 'actors',
            'typeName': 'Professional',
            'groupName': 'Workforce',
            'unit': 'person',
            'contractor': 'Aurora Build JV',
            'homeCode': 'mw-01-main-dam',
            'homeLevel': 'contract',
            'spec': {'discipline': 'High voltage', 'experienceYears': 11},
        },
        'attributes': [
            {'label': 'Licences', 'value': {'PE': True, 'NFPA70E': True}},
            {'label': 'Relay settings authored', 'value': {'count': 128, 'lastAudit': '2025-05-02'}},
            {'label': 'Crew size coached', 'value': {'engineers': 5, 'technicians': 18}},
        ],
        'mobilization_records': [
            {
                'location': 'Switchyard energisation cell',
                'start': date(2025, 2, 17),
                'end': None,
                'status': 'Active',
                'metadata': {'readinessKpi': '90% circuits released', 'shift': 'Day'},
            },
            {
                'location': 'Powerhouse GIS hall',
                'start': date(2024, 9, 1),
                'end': date(2025, 1, 26),
                'status': 'Completed',
                'metadata': {'readinessKpi': 'Punchlist at 4 items'},
            },
        ],
        'tiles': [
            {
                'id': 'readiness',
                'label': 'Readiness Score',
                'value': '92%',
                'caption': 'Skills + fatigue index',
                'change': 1.0,
                'changeDirection': 'up',
                'severity': 'good',
            },
            {
                'id': 'commissioning',
                'label': 'Commissioning Velocity',
                'value': '14 circuits/week',
                'caption': 'Rolling 4-week average',
                'change': 2.0,
                'changeDirection': 'up',
                'severity': 'good',
            },
            {
                'id': 'compliance',
                'label': 'Compliance Actions',
                'value': '0 overdue',
                'caption': 'Arc-flash & lockout-tagout',
                'change': 0.0,
                'changeDirection': 'flat',
                'severity': 'good',
            },
        ],
        'trend_values': [86, 87, 88, 89, 90, 91, 92],
        'execution': {
            'metrics': {
                'utilization': {'value': 87.0, 'change': 2.0, 'direction': 'up'},
                'availability': 94.0,
                'productivity': {'value': 0.78, 'unit': 'systems/day'},
                'quality': 99.0,
                'safety': 0.0,
                'maintenanceDue': 30.0,
                'operatingCost': 18.0,
                'energyRate': {'value': 0.0, 'unit': 'kWh'},
            },
            'productivity_values': [0.55, 0.6, 0.62, 0.68, 0.7, 0.74, 0.78],
            'callouts': {
                'positives': ['Commissioning documentation cleared without rework.', 'Mentored two junior engineers to PE readiness.'],
                'watch': ['Relay settings sync needs automation to avoid manual touches.'],
            },
        },
    },
    'synthetic::workforce-mechanical-engineer': {
        'info': {
            'atomId': 'ENG-ME-019',
            'name': 'Mechanical Engineer · Heavy Plant Reliability',
            'category': 'actors',
            'typeName': 'Professional',
            'groupName': 'Workforce',
            'unit': 'person',
            'contractor': 'HydroBuild Operations',
            'homeCode': 'mw-01-main-dam',
            'homeLevel': 'contract',
            'spec': {'discipline': 'Reliability', 'experienceYears': 9},
        },
        'attributes': [
            {'label': 'Critical assets', 'value': {'batchPlants': 2, 'gantryCranes': 4}},
            {'label': 'Predictive program', 'value': {'routesPerWeek': 6, 'alerts': 3}},
            {'label': 'Knowledge share', 'value': {'toolboxTalks': 8}},
        ],
        'mobilization_records': [
            {
                'location': 'Concrete batch plant A1',
                'start': date(2025, 4, 4),
                'end': None,
                'status': 'Active',
                'metadata': {'readinessKpi': 'MTBF 480 hrs', 'shift': 'Day'},
            },
            {
                'location': 'Fabrication shop',
                'start': date(2024, 11, 20),
                'end': date(2025, 3, 10),
                'status': 'Completed',
                'metadata': {'readinessKpi': 'Critical lifts zero delays'},
            },
        ],
        'tiles': [
            {
                'id': 'mtbf',
                'label': 'MTBF Trend',
                'value': '480 hrs',
                'caption': '↑ 12% vs baseline',
                'change': 12.0,
                'changeDirection': 'up',
                'severity': 'good',
            },
            {
                'id': 'alarms',
                'label': 'Condition Alerts',
                'value': '3 open',
                'caption': 'All within response SLA',
                'change': -1.0,
                'changeDirection': 'down',
                'severity': 'good',
            },
            {
                'id': 'training',
                'label': 'Crew Upskilling',
                'value': '18 techs',
                'caption': 'Certified on updated SOP',
                'change': 5.0,
                'changeDirection': 'up',
                'severity': 'good',
            },
        ],
        'trend_values': [72, 73, 74, 76, 78, 80, 82],
        'execution': {
            'metrics': {
                'utilization': {'value': 83.0, 'change': 3.0, 'direction': 'up'},
                'availability': 91.0,
                'productivity': {'value': 12.0, 'unit': 'PMs/week'},
                'quality': 96.0,
                'safety': 0.0,
                'maintenanceDue': 45.0,
                'operatingCost': 22.0,
                'energyRate': {'value': 0.0, 'unit': 'kWh'},
            },
            'productivity_values': [9.5, 10.0, 10.8, 11.2, 11.5, 11.7, 12.0],
            'callouts': {
                'positives': ['Predictive alerts caught impending gearbox failure.', 'Operator coaching reduced unplanned stoppages.'],
                'watch': ['Spare parts lead time trending up—align with procurement.'],
            },
        },
    },
    'synthetic::workforce-industrial-engineer': {
        'info': {
            'atomId': 'ENG-IE-027',
            'name': 'Industrial Engineer · Lean Delivery Strategist',
            'category': 'actors',
            'typeName': 'Professional',
            'groupName': 'Workforce',
            'unit': 'person',
            'contractor': 'Aurora Build JV',
            'homeCode': 'mw-01-main-dam',
            'homeLevel': 'contract',
            'spec': {'discipline': 'Lean delivery', 'experienceYears': 8},
        },
        'attributes': [
            {'label': 'Value streams', 'value': {'active': 3, 'stabilised': 7}},
            {'label': 'Improvement funnel', 'value': {'ideasOpen': 24, 'implemented': 16}},
            {'label': 'Digital twin inputs', 'value': {'taktModels': 5}},
        ],
        'mobilization_records': [
            {
                'location': 'Turbine hall installation flow',
                'start': date(2025, 1, 6),
                'end': None,
                'status': 'Active',
                'metadata': {'readinessKpi': 'Takt adherence 93%', 'cadence': 'Weekly Obeya'},
            },
            {
                'location': 'Aggregate logistics stream',
                'start': date(2024, 8, 5),
                'end': date(2024, 12, 20),
                'status': 'Completed',
                'metadata': {'readinessKpi': 'Queue time ↓26%'},
            },
        ],
        'tiles': [
            {
                'id': 'flow',
                'label': 'Flow Efficiency',
                'value': '68%',
                'caption': 'Across active value streams',
                'change': 6.0,
                'changeDirection': 'up',
                'severity': 'good',
            },
            {
                'id': 'constraints',
                'label': 'Critical Constraints',
                'value': '3 open',
                'caption': 'Tracked in Obeya',
                'change': -2.0,
                'changeDirection': 'down',
                'severity': 'good',
            },
            {
                'id': 'engagement',
                'label': 'Crew Engagement',
                'value': '87%',
                'caption': 'Pulse survey',
                'change': 4.0,
                'changeDirection': 'up',
                'severity': 'neutral',
            },
        ],
        'trend_values': [60, 62, 63, 64, 65, 66, 68],
        'execution': {
            'metrics': {
                'utilization': {'value': 85.0, 'change': 4.0, 'direction': 'up'},
                'availability': 95.0,
                'productivity': {'value': 5.6, 'unit': 'Kaizen/week'},
                'quality': 98.0,
                'safety': 0.0,
                'maintenanceDue': 0.0,
                'operatingCost': 14.0,
                'energyRate': {'value': 0.0, 'unit': 'kWh'},
            },
            'productivity_values': [4.2, 4.5, 4.9, 5.1, 5.4, 5.5, 5.6],
            'callouts': {
                'positives': ['Visual management reduced daily stand-up time by 18%.', 'Flow simulation identified crane clash before site impact.'],
                'watch': ['Sustainment plans for new takt zones need ownership mapped.'],
            },
        },
    },
    'synthetic::sensor-concrete-temp': {
        'info': {
            'atomId': 'SEN-CTS-500',
            'name': 'Concrete Temperature Sensor Array · CTS-500',
            'category': 'technologies',
            'typeName': 'Sensor',
            'groupName': 'Reality Capture',
            'unit': 'array',
            'contractor': 'Digital Twin Group',
            'homeCode': 'mw-01-rcc',
            'homeLevel': 'sow',
            'spec': {'nodes': 12, 'gateway': 'CTS Link v2'},
        },
        'attributes': [
            {'label': 'Calibration', 'value': {'last': '2025-05-10'}},
            {'label': 'Battery Health', 'value': {'status': 'Nominal', 'reserveDays': 38}},
        ],
        'mobilization_records': [
            {
                'location': 'RCC block lift L12',
                'start': date(2025, 5, 14),
                'end': None,
                'status': 'Active',
                'metadata': {'lift': 'L12'},
            },
            {
                'location': 'Test pour mock-up',
                'start': date(2025, 4, 20),
                'end': date(2025, 4, 25),
                'status': 'Completed',
                'metadata': {'result': 'Calibration validated'},
            },
        ],
        'tiles': [
            {
                'id': 'core-temp',
                'label': 'Core Temp',
                'value': '54°C',
                'caption': 'Peak in last 2h',
                'change': -1.2,
                'changeDirection': 'down',
                'severity': 'neutral',
            },
            {
                'id': 'differential',
                'label': 'Differential',
                'value': '16°C',
                'caption': 'Core vs surface',
                'change': -0.5,
                'changeDirection': 'down',
                'severity': 'warning',
            },
            {
                'id': 'uptime',
                'label': 'Uptime',
                'value': '99.8%',
                'caption': 'Telemetry availability',
                'change': 0.1,
                'changeDirection': 'up',
                'severity': 'good',
            },
        ],
        'trend_values': [48, 49, 50, 51, 52, 54, 55, 56, 55, 54, 53, 52, 51, 50],
        'execution': {
            'metrics': {
                'utilization': {'value': 92.0, 'change': 0.8, 'direction': 'up'},
                'availability': 99.8,
                'productivity': {'value': 96.0, 'unit': 'readings/hr'},
                'quality': 99.0,
                'safety': 0.0,
                'maintenanceDue': 720.0,
                'operatingCost': 12.0,
                'energyRate': {'value': 0.6, 'unit': 'kWh'},
            },
            'productivity_values': [88, 89, 90, 91, 93, 94, 95, 96, 96, 97, 97, 97, 96, 96],
            'callouts': {
                'positives': ['Telemetry uptime at 99% despite heavy rain.'],
                'watch': ['Differential approaching alarm band—consider insulation blankets.'],
            },
        },
    },
}

def _seeded_percent(atom_id: str, key: str, lower: int, upper: int) -> int:
    """Deterministically generate a pseudo-random percent-like value."""
    span = max(1, upper - lower)
    digest = hashlib.sha1(f"{atom_id}:{key}".encode("utf-8")).hexdigest()
    value = int(digest[:8], 16) % span
    return lower + value


def _trend_series_from_points(metric_id: str, label: str, unit: str | None, raw_points: Iterable[tuple]) -> AtomTrendSeries:
    points = [
        AtomTrendPointCompact(date=point_date, value=round(float(point_value), 2))
        for point_date, point_value in raw_points
    ]
    return AtomTrendSeries(id=metric_id, label=label, unit=unit, points=points)


def _format_value(value: float, unit: str | None) -> str:
    if unit == "%":
        return f"{value:.0f}%"
    if unit in ("hrs", "hours"):
        return f"{value:.1f}h"
    if unit in ("$/hr", "USD/hr"):
        return f"${value:,.0f}/hr"
    if unit in ("kWh", "L/hr"):
        return f"{value:,.1f} {unit}"
    return f"{value:,.1f}{unit or ''}".strip()


def _severity_from_percent(value: float) -> str:
    if value >= 75:
        return "good"
    if value >= 55:
        return "neutral"
    if value >= 40:
        return "warning"
    return "critical"


def get_atom_experience(tenant_id: str, atom_id: str) -> AtomExperienceResponse:
    """Aggregate enriched atom detail for the modern Atom Detail experience."""
    synthetic_spec = SYNTHETIC_DATA.get(atom_id)
    if synthetic_spec:
        return _build_synthetic_response(synthetic_spec)

    detail = get_atom_detail(tenant_id=tenant_id, atom_id=atom_id)
    info: AtomDetailInfo = detail.info
    attributes: list[AtomAttribute] = detail.attributes

    productivity = sorted(detail.productivity, key=lambda item: item.log_date)
    util_points: list[tuple] = []
    productivity_points: list[tuple] = []

    for item in productivity[-14:]:
        total = (item.productive_hours or 0.0) + (item.idle_hours or 0.0)
        utilisation = (item.productive_hours / total * 100.0) if total else 0.0
        util_points.append((item.log_date, utilisation))
        base_output = item.output_quantity if item.output_quantity is not None else item.productive_hours
        productivity_points.append((item.log_date, base_output or 0.0))

    latest_util = util_points[-1][1] if util_points else 0.0
    prev_util = util_points[-2][1] if len(util_points) > 1 else latest_util
    util_delta = latest_util - prev_util
    util_direction = "up" if util_delta > 0.75 else "down" if util_delta < -0.75 else "flat"
    avg_util = mean(value for _, value in util_points) if util_points else latest_util

    active_records = [record for record in detail.mobilization if record.demobilized_on is None or record.status.lower() != "completed"]

    tiles: list[AtomStatusTile] = []
    category = info.category
    fuel_pct_value: float | None = None

    if category in ("machinery", "tools", "equipment"):
        fuel_pct = _seeded_percent(atom_id, "fuel", 38, 92)
        fuel_pct_value = float(fuel_pct)
        sensor_pct = _seeded_percent(atom_id, "sensor", 84, 99)
        utilisation_tile = AtomStatusTile(
            id="utilization",
            label="Utilization",
            value=f"{latest_util:.0f}%",
            caption="Based on productive vs idle hours",
            change=round(util_delta, 1) if util_points else None,
            changeDirection=util_direction,
            severity=_severity_from_percent(latest_util),
        )
        tiles.extend(
            [
                AtomStatusTile(
                    id="fuel",
                    label="Fuel Reserve",
                    value=f"{fuel_pct}%",
                    caption="Estimated runtime 6.5h",
                    change=round(fuel_pct - _seeded_percent(atom_id, "fuel-prev", 35, 90), 1),
                    changeDirection="down" if fuel_pct < 45 else "flat",
                    severity="warning" if fuel_pct < 35 else "neutral",
                ),
                AtomStatusTile(
                    id="sensors",
                    label="Sensor Health",
                    value=f"{sensor_pct}%",
                    caption="Diagnostics passed overnight",
                    change=None,
                    changeDirection="flat",
                    severity="good" if sensor_pct >= 90 else "warning",
                ),
                utilisation_tile,
            ]
        )
    elif category == "actors":
        todays_hours = productivity[-1].productive_hours if productivity else 0.0
        weekly_hours = sum(point.productive_hours for point in productivity[-7:])
        availability_pct = _seeded_percent(atom_id, "availability", 70, 98)
        tiles.extend(
            [
                AtomStatusTile(
                    id="hours-today",
                    label="Hours Today",
                    value=f"{todays_hours:.1f}h",
                    caption="Last shift update",
                    change=None,
                    changeDirection="flat",
                    severity="neutral",
                ),
                AtomStatusTile(
                    id="hours-week",
                    label="Week-to-date",
                    value=f"{weekly_hours:.1f}h",
                    caption="Rolling 7 days",
                    change=None,
                    changeDirection="flat",
                    severity="neutral",
                ),
                AtomStatusTile(
                    id="availability",
                    label="Availability",
                    value=f"{availability_pct}%",
                    caption="Fit-for-work checks",
                    change=None,
                    changeDirection="flat",
                    severity="good" if availability_pct >= 90 else "warning",
                ),
            ]
        )
    else:
        readiness = _seeded_percent(atom_id, "readiness", 60, 96)
        tiles.extend(
            [
                AtomStatusTile(
                    id="active-sites",
                    label="Active Sites",
                    value=str(len(active_records)),
                    caption="Currently mobilized",
                    change=None,
                    changeDirection="flat",
                    severity="neutral",
                ),
                AtomStatusTile(
                    id="readiness",
                    label="Readiness",
                    value=f"{readiness}%",
                    caption="Daily inspections",
                    change=None,
                    changeDirection="flat",
                    severity=_severity_from_percent(readiness),
                ),
                AtomStatusTile(
                    id="utilization",
                    label="Utilization",
                    value=f"{latest_util:.0f}%",
                    caption="Productive vs total hours",
                    change=round(util_delta, 1) if util_points else None,
                    changeDirection=util_direction,
                    severity=_severity_from_percent(latest_util),
                ),
            ]
        )

    utilisation_series = _trend_series_from_points("utilization", "Utilization", "%", util_points)
    productivity_series = _trend_series_from_points("productivity", "Productivity", info.unit or "hrs", productivity_points)

    mobilization_trend = None
    if util_points:
        mobilization_trend = utilisation_series

    mobilization = AtomMobilizationExperience(
        records=detail.mobilization,
        tiles=tiles,
        trend=mobilization_trend,
    )

    metrics: list[AtomExecutionMetric] = []

    availability_pct = _seeded_percent(atom_id, "availability-exec", 72, 99)
    productivity_avg = mean(value for _, value in productivity_points[-7:]) if productivity_points else 0.0
    quality_score = _seeded_percent(atom_id, "quality", 85, 99)
    safety_incidents = _seeded_percent(atom_id, "safety", 0, 3)
    maintenance_due = _seeded_percent(atom_id, "maintenance-due", 12, 120)
    cost_per_hour = float(_seeded_percent(atom_id, "cost", 120, 265))
    energy_rate = float(_seeded_percent(atom_id, "energy", 22, 68))
    energy_unit = "L/hr" if category in ("machinery", "consumables", "equipment") else "kWh"

    metrics.extend(
        [
            AtomExecutionMetric(
                id="utilization",
                label="Utilization",
                value=round(latest_util, 1),
                unit="%",
                formatted=_format_value(round(latest_util, 1), "%"),
                change=round(util_delta, 1) if util_points else None,
                changeDirection=util_direction,
                sparkline=utilisation_series,
            ),
            AtomExecutionMetric(
                id="availability",
                label="Availability",
                value=float(availability_pct),
                unit="%",
                formatted=_format_value(float(availability_pct), "%"),
                change=None,
                changeDirection="flat",
                sparkline=None,
            ),
            AtomExecutionMetric(
                id="productivity",
                label="Productivity",
                value=round(productivity_avg, 2),
                unit=info.unit or "hrs",
                formatted=_format_value(round(productivity_avg, 2), info.unit or "hrs"),
                change=None,
                changeDirection="flat",
                sparkline=productivity_series,
            ),
            AtomExecutionMetric(
                id="quality",
                label="Quality Score",
                value=float(quality_score),
                unit="%",
                formatted=_format_value(float(quality_score), "%"),
                change=None,
                changeDirection="flat",
                sparkline=None,
            ),
            AtomExecutionMetric(
                id="safety",
                label="Safety Incidents",
                value=float(safety_incidents),
                unit=None,
                formatted=f"{int(safety_incidents)}",
                change=None,
                changeDirection="flat",
                sparkline=None,
            ),
            AtomExecutionMetric(
                id="maintenance",
                label="Maintenance Due",
                value=float(maintenance_due),
                unit="hrs",
                formatted=_format_value(float(maintenance_due), "hrs"),
                change=None,
                changeDirection="flat",
                sparkline=None,
            ),
            AtomExecutionMetric(
                id="operating-cost",
                label="Operating Cost",
                value=cost_per_hour,
                unit="$/hr",
                formatted=_format_value(cost_per_hour, "$/hr"),
                change=None,
                changeDirection="flat",
                sparkline=None,
            ),
            AtomExecutionMetric(
                id="energy-rate",
                label="Energy Rate",
                value=energy_rate,
                unit=energy_unit,
                formatted=_format_value(energy_rate, energy_unit),
                change=None,
                changeDirection="flat",
                sparkline=None,
            ),
        ]
    )

    callouts = AtomExecutionCallouts()
    if latest_util >= 75:
        callouts.positives.append(f"Utilization holding strong at {latest_util:.0f}% across the past week.")
    if quality_score >= 95:
        callouts.positives.append("Quality metrics are exceeding target thresholds.")
    if safety_incidents == 0:
        callouts.positives.append("Zero safety incidents logged over the past 14 days.")

    if latest_util < 55:
        callouts.watch.append("Utilization dipped below 55% yesterday—verify deployment plan.")
    if maintenance_due < 24:
        callouts.watch.append("Maintenance interval due within the next 24 hours.")
    if fuel_pct_value is not None and fuel_pct_value < 35:
        callouts.watch.append("Fuel reserve trending low; schedule refuel with plant & fleet.")
    if availability_pct < 82:
        callouts.watch.append("Availability dipped this week—confirm standby resources.")

    execution = AtomExecutionExperience(
        metrics=metrics,
        trendHighlights=[series for series in (utilisation_series, productivity_series) if series],
        callouts=callouts,
    )

    return AtomExperienceResponse(
        asOf=datetime.now(timezone.utc),
        info=info,
        attributes=attributes,
        mobilization=mobilization,
        execution=execution,
    )


def _build_synthetic_response(spec: dict) -> AtomExperienceResponse:
    info = AtomDetailInfo(**spec['info'])

    attributes = [
        AtomAttribute(id=str(uuid.uuid4()), label=row['label'], value=row['value'])
        for row in spec.get('attributes', [])
    ]

    records = [
        AtomMobilizationRecord(
            id=str(uuid.uuid4()),
            location=record['location'],
            status=record['status'],
            mobilizedOn=record['start'],
            demobilizedOn=record['end'],
            metadata=record.get('metadata', {}),
        )
        for record in spec.get('mobilization_records', [])
    ]

    tiles = [
        AtomStatusTile(
            id=tile['id'],
            label=tile['label'],
            value=tile['value'],
            caption=tile.get('caption'),
            change=tile.get('change'),
            changeDirection=tile.get('changeDirection', 'flat'),
            severity=tile.get('severity', 'neutral'),
        )
        for tile in spec.get('tiles', [])
    ]

    util_series = None
    if spec.get('trend_values'):
        util_series = _trend_series_from_points(
            'utilization',
            'Utilization',
            '%',
            _series_from_values(spec['trend_values']),
        )

    mobilization = AtomMobilizationExperience(records=records, tiles=tiles, trend=util_series)

    execution_spec = spec.get('execution', {})
    metrics_spec = execution_spec.get('metrics', {})

    productivity_series = None
    if execution_spec.get('productivity_values'):
        productivity_series = _trend_series_from_points(
            'productivity',
            'Productivity',
            execution_spec['metrics'].get('productivity', {}).get('unit', info.unit or 'hrs'),
            _series_from_values(execution_spec['productivity_values']),
        )

    def _metric(
        metric_id: str,
        label: str,
        value: float,
        unit: str | None,
        change: float | None = None,
        direction: str = 'flat',
        sparkline: AtomTrendSeries | None = None,
    ) -> AtomExecutionMetric:
        return AtomExecutionMetric(
            id=metric_id,
            label=label,
            value=value,
            unit=unit,
            formatted=_format_value(value, unit),
            change=change,
            changeDirection=direction,
            sparkline=sparkline,
        )

    util_spec = metrics_spec.get('utilization', {})
    productivity_spec = metrics_spec.get('productivity', {})
    energy_spec = metrics_spec.get('energyRate', {})

    metrics: list[AtomExecutionMetric] = [
        _metric(
            'utilization',
            'Utilization',
            float(util_spec.get('value', 0.0)),
            '%',
            change=util_spec.get('change'),
            direction=util_spec.get('direction', 'flat'),
            sparkline=util_series,
        ),
        _metric('availability', 'Availability', float(metrics_spec.get('availability', 0.0)), '%'),
        _metric(
            'productivity',
            'Productivity',
            float(productivity_spec.get('value', 0.0)),
            productivity_spec.get('unit') or info.unit or 'hrs',
            sparkline=productivity_series,
        ),
        _metric('quality', 'Quality Score', float(metrics_spec.get('quality', 0.0)), '%'),
        _metric('safety', 'Safety Incidents', float(metrics_spec.get('safety', 0.0)), None),
        _metric('maintenance', 'Maintenance Due', float(metrics_spec.get('maintenanceDue', 0.0)), 'hrs'),
        _metric('operating-cost', 'Operating Cost', float(metrics_spec.get('operatingCost', 0.0)), '$/hr'),
        _metric(
            'energy-rate',
            'Energy Rate',
            float(energy_spec.get('value', 0.0)),
            energy_spec.get('unit', 'kWh'),
        ),
    ]

    trend_highlights = [series for series in (util_series, productivity_series) if series]
    callouts_spec = execution_spec.get('callouts', {})
    callouts = AtomExecutionCallouts(
        positives=callouts_spec.get('positives', []),
        watch=callouts_spec.get('watch', []),
    )

    execution = AtomExecutionExperience(metrics=metrics, trendHighlights=trend_highlights, callouts=callouts)

    return AtomExperienceResponse(
        asOf=datetime.now(timezone.utc),
        info=info,
        attributes=attributes,
        mobilization=mobilization,
        execution=execution,
    )
