from __future__ import annotations

from typing import Dict, List, Optional

FALLBACK_PROJECTS: List[Dict[str, object]] = [
    {
        "id": "mohmand-dam",
        "name": "Mohmand Dam",
        "phase": "Construction",
        "status_pct": 43.0,
        "status_label": None,
        "alerts": 28,
        "address": "Mohmand Dam, Mohmand Agency, Pakistan",
        "lat": 34.755,
        "lng": 71.215,
        "image": "/images/ACCS/chashma.png",
        "geofence_radius_m": 1500.0,
    },
    {
        "id": "dasu-hpp",
        "name": "Dasu Hydropower Project",
        "phase": "Construction",
        "status_pct": 20.0,
        "status_label": None,
        "alerts": 22,
        "address": "Dasu Hydropower Project, Upper Kohistan, Pakistan",
        "lat": 35.291,
        "lng": 72.103,
        "image": "/images/ACCS/ghazi.png",
        "geofence_radius_m": 1800.0,
    },
    {
        "id": "diamer-basha",
        "name": "Diamer Basha Dam",
        "phase": "Construction",
        "status_pct": 20.0,
        "status_label": None,
        "alerts": 12,
        "address": "Diamer Basha Dam, Gilgit-Baltistan, Pakistan",
        "lat": 35.619,
        "lng": 74.616,
        "image": "/images/ACCS/mangla.png",
        "geofence_radius_m": 2000.0,
    },
    {
        "id": "ts-extension",
        "name": "Tarbela 5th Extension",
        "phase": "Construction",
        "status_pct": 47.5,
        "status_label": None,
        "alerts": 8,
        "address": "Tarbela Power Project, Haripur, Pakistan",
        "lat": 34.088,
        "lng": 72.693,
        "image": "/images/ACCS/tarbela.png",
        "geofence_radius_m": 1400.0,
    },
    {
        "id": "tarbela-4th",
        "name": "Tarbela 4th Extension",
        "phase": "O&M",
        "status_pct": 100.0,
        "status_label": "In-operation",
        "alerts": 22,
        "address": "Tarbela Dam, Haripur, Pakistan",
        "lat": 34.088,
        "lng": 72.693,
        "image": "/images/ACCS/tarbela.png",
        "geofence_radius_m": 1200.0,
    },
    {
        "id": "mangla",
        "name": "Mangla Dam",
        "phase": "O&M",
        "status_pct": 100.0,
        "status_label": "Maintenance",
        "alerts": 22,
        "address": "Mangla Dam, Mirpur, Azad Kashmir",
        "lat": 33.135,
        "lng": 73.640,
        "image": "/images/ACCS/mangla.png",
        "geofence_radius_m": 1600.0,
    },
    {
        "id": "ghazi-barotha",
        "name": "Ghazi-Barotha",
        "phase": "O&M",
        "status_pct": 100.0,
        "status_label": "In-operation",
        "alerts": 22,
        "address": "Ghazi Barotha Hydropower Project, Attock, Pakistan",
        "lat": 33.969,
        "lng": 72.708,
        "image": "/images/ACCS/ghazi.png",
        "geofence_radius_m": 1300.0,
    },
    {
        "id": "chashma",
        "name": "Chashma Hydropower Plant",
        "phase": "O&M",
        "status_pct": 100.0,
        "status_label": "Shutdown",
        "alerts": 22,
        "address": "Chashma Barrage, Mianwali, Pakistan",
        "lat": 32.390,
        "lng": 71.410,
        "image": "/images/ACCS/chashma.png",
        "geofence_radius_m": 1500.0,
    },
    {
        "id": "bungi-hpp",
        "name": "Bungi Hydropower Project",
        "phase": "Planning & Design",
        "status_pct": 12.0,
        "status_label": "Concept",
        "alerts": 5,
        "address": "Bunji, Gilgit-Baltistan, Pakistan",
        "lat": 35.680,
        "lng": 74.617,
        "image": "/images/ACCS/ghazi.png",
        "geofence_radius_m": 2100.0,
    },
    {
        "id": "harpo-hpp",
        "name": "Harpo Hydropower Project",
        "phase": "Planning & Design",
        "status_pct": 18.0,
        "status_label": "Feasibility",
        "alerts": 7,
        "address": "Harpo, Skardu, Gilgit-Baltistan",
        "lat": 35.330,
        "lng": 74.810,
        "image": "/images/ACCS/mangla.png",
        "geofence_radius_m": 1800.0,
    },
    {
        "id": "pattan-dam",
        "name": "Pattan Hydropower Project",
        "phase": "Planning & Design",
        "status_pct": 9.0,
        "status_label": "Pre-feasibility",
        "alerts": 6,
        "address": "Pattan, Kohistan, Pakistan",
        "lat": 35.030,
        "lng": 72.943,
        "image": "/images/ACCS/chashma.png",
        "geofence_radius_m": 1700.0,
    },
    {
        "id": "thakot-dam",
        "name": "Thakot Hydropower Project",
        "phase": "Planning & Design",
        "status_pct": 15.0,
        "status_label": "Design",
        "alerts": 4,
        "address": "Thakot, Batagram, Pakistan",
        "lat": 34.860,
        "lng": 72.915,
        "image": "/images/ACCS/tarbela.png",
        "geofence_radius_m": 1600.0,
    },
]


FALLBACK_CONTRACTS = {
    "diamer-basha": [
        {
            "id": "mw-01-main-dam",
            "project_id": "diamer-basha",
            "name": "MW-01 - Main Dam",
            "phase": "Phase-1 (Dam Part)",
            "discipline": "Civil",
            "lat": 35.6264,
            "lng": 74.6189,
            "status_pct": 74.0,
            "status_label": "Live",
            "alerts": 5,
            "image": "/images/contracts/blueprint.jpg",
        },
        {
            "id": "mw-02-rb-powerhouse",
            "project_id": "diamer-basha",
            "name": "MW-02 - RB Powerhouse",
            "phase": "Phase-1 (Dam Part)",
            "discipline": "Mechanical",
            "lat": 35.6248,
            "lng": 74.6236,
            "status_pct": 62.0,
            "status_label": "In Progress",
            "alerts": 3,
            "image": "/images/contracts/blueprint.jpg",
        },
        {
            "id": "mw-02-lb-powerhouse",
            "project_id": "diamer-basha",
            "name": "MW-02 - LB Powerhouse",
            "phase": "Phase-1 (Dam Part)",
            "discipline": "Mechanical",
            "lat": 35.6229,
            "lng": 74.6202,
            "status_pct": 54.0,
            "status_label": "Bidding",
            "alerts": 3,
            "image": "/images/contracts/blueprint.jpg",
        },
        {
            "id": "em-01-lb",
            "project_id": "diamer-basha",
            "name": "EM-01 - LB",
            "phase": "Phase-1 (Dam Part)",
            "discipline": "Electrical",
            "lat": 35.6215,
            "lng": 74.6207,
            "status_pct": 58.0,
            "status_label": "Bidding",
            "alerts": 2,
            "image": "/images/contracts/blueprint.jpg",
        },
        {
            "id": "em-01-rb",
            "project_id": "diamer-basha",
            "name": "EM-01 - RB",
            "phase": "Phase-1 (Dam Part)",
            "discipline": "Electrical",
            "lat": 35.6239,
            "lng": 74.6244,
            "status_pct": 52.0,
            "status_label": "In Progress",
            "alerts": 2,
            "image": "/images/contracts/blueprint.jpg",
        },
        {
            "id": "em-02-lb",
            "project_id": "diamer-basha",
            "name": "EM-02 - LB",
            "phase": "Phase-1 (Dam Part)",
            "discipline": "Electrical",
            "lat": 35.6226,
            "lng": 74.6185,
            "status_pct": 48.0,
            "status_label": "Pre-PQ",
            "alerts": 3,
            "image": "/images/contracts/blueprint.jpg",
        },
        {
            "id": "em-02-rb",
            "project_id": "diamer-basha",
            "name": "EM-02 - RB",
            "phase": "Phase-1 (Dam Part)",
            "discipline": "Electrical",
            "lat": 35.6234,
            "lng": 74.6279,
            "status_pct": 45.0,
            "status_label": "Pre-PQ",
            "alerts": 4,
            "image": "/images/contracts/blueprint.jpg",
        },
        {
            "id": "hm-01",
            "project_id": "diamer-basha",
            "name": "HM-1",
            "phase": "Phase-2 (Power Generation)",
            "discipline": "Hydro-Mechanical",
            "lat": 35.6258,
            "lng": 74.6138,
            "status_pct": 20.0,
            "status_label": "Construction",
            "alerts": 1,
            "image": "/images/contracts/blueprint.jpg",
        },
        {
            "id": "hm-02",
            "project_id": "diamer-basha",
            "name": "HM-2 - LB",
            "phase": "Phase-2 (Power Generation)",
            "discipline": "Hydro-Mechanical",
            "lat": 35.6268,
            "lng": 74.6109,
            "status_pct": 12.0,
            "status_label": "Pre-PQ",
            "alerts": 2,
            "image": "/images/contracts/blueprint.jpg",
        },
        {
            "id": "hm-02-rb",
            "project_id": "diamer-basha",
            "name": "HM-2 - RB",
            "phase": "Phase-2 (Power Generation)",
            "discipline": "Hydro-Mechanical",
            "lat": 35.6273,
            "lng": 74.6146,
            "status_pct": 10.0,
            "status_label": "Pre-PQ",
            "alerts": 2,
            "image": "/images/contracts/blueprint.jpg",
        },
    ],
}

FALLBACK_INSIGHTS = {
    "diamer-basha": {
        "alerts": 12,
        "physical": {"actual": 20.0, "planned": 59.3},
        "productivity": {
            "design": [
                {"label": "HM-1 Tender Drawings", "status": "Completed", "percent": 100},
                {"label": "MW-1 CFD Modelling Stage 3", "status": "In Progress", "percent": 65},
            ],
            "preparatory": [
                {"label": "MW-1 RCC Facilities", "status": "In Progress", "percent": 74},
                {"label": "Reservoir Slope Protection", "status": "In Progress", "percent": 48},
                {"label": "Service Buildings", "status": "Delayed", "percent": 32},
            ],
            "construction": [
                {"label": "MW-1 Dam Pit Excavation", "status": "Delayed", "actual": 74, "planned": 82},
                {"label": "MW-1 Right Bank Abutment", "status": "In Progress", "actual": 62, "planned": 62},
                {"label": "EM-02 RB Powerhouse", "status": "In Progress", "actual": 45, "planned": 50},
            ],
        },
        "milestones": [
            {"label": "Milestone A & B", "status": "Completed"},
            {"label": "Milestone C", "status": "Delayed"},
            {"label": "Milestone D", "status": "In Progress"},
        ],
        "quality": {
            "ncr": {"closed": 122, "open": 34, "issued": 156},
            "qaor": {"closed": 169, "open": 40, "issued": 209},
            "conformance": [
                {"label": "Excavation Tolerance", "status": "Within ±0.3%", "description": "Survey validated"},
                {"label": "Rebar Quality Audits", "status": "In Progress", "description": "Batch sampling underway"},
            ],
        },
        "workInProgress": [
            {"contract": "MW-01", "status": "Construction", "percent": 68},
            {"contract": "HM-01", "status": "Bidding", "percent": 34},
            {"contract": "MW-02", "status": "Bidding", "percent": 42},
            {"contract": "EM-01", "status": "Pre-PQ", "percent": 18},
            {"contract": "EM-02", "status": "Pre-PQ", "percent": 26},
            {"contract": "HM-02", "status": "PQ", "percent": 22},
        ],
        "spi": {
            "value": 0.75,
            "status": "Amber",
            "runway_days": 47,
            "burn_rate_days": 47,
            "cash_flow": 4838488,
            "tasks": [
                {"label": "Main Facilities for RCC", "impact": "5%", "status": "In Progress"},
                {"label": "Dam Pit Excavation", "impact": "4.8%", "status": "Delayed"},
                {"label": "MW-2 Commencement", "impact": "10%", "status": "In Progress"},
                {"label": "HM-1 Commissionment", "impact": "10%", "status": "In Progress"},
            ],
        },
    }
}

FALLBACK_SOWS = {
    "mw-01-main-dam": [
        {
            "id": "sow-mw01-prelim",
            "title": "Preliminary and General Item",
            "status": "Completed",
            "progress": 100,
            "clauses": [
                {
                    "id": "clause-mw01-prelim-1",
                    "title": "Site mobilisation",
                    "status": "Completed",
                    "lead": "Construction",
                    "start_date": "2024-01-05",
                    "due_date": "2024-02-20",
                    "progress": 100,
                },
                {
                    "id": "clause-mw01-prelim-2",
                    "title": "Temporary works setup",
                    "status": "Completed",
                    "lead": "Logistics",
                    "start_date": "2024-02-21",
                    "due_date": "2024-03-30",
                    "progress": 100,
                },
            ],
        },
        {
            "id": "sow-mw01-river",
            "title": "River diversion & care of water",
            "status": "In Progress",
            "progress": 65,
            "clauses": [
                {
                    "id": "clause-mw01-river-1",
                    "title": "Cofferdam installation",
                    "status": "In Progress",
                    "lead": "Hydraulics",
                    "start_date": "2024-04-01",
                    "due_date": "2024-07-30",
                    "progress": 70,
                },
                {
                    "id": "clause-mw01-river-2",
                    "title": "Diversion channel excavation",
                    "status": "In Progress",
                    "lead": "Earthworks",
                    "start_date": "2024-05-10",
                    "due_date": "2024-09-12",
                    "progress": 58,
                },
            ],
        },
        {
            "id": "sow-mw01-rcc",
            "title": "RCC Dam",
            "status": "In Progress",
            "progress": 74,
            "clauses": [
                {
                    "id": "clause-mw01-rcc-1",
                    "title": "Left bank RCC placements",
                    "status": "In Progress",
                    "lead": "Civil",
                    "start_date": "2024-06-01",
                    "due_date": "2024-11-15",
                    "progress": 68,
                },
                {
                    "id": "clause-mw01-rcc-2",
                    "title": "Instrumentation embeds",
                    "status": "Planned",
                    "lead": "QA",
                    "start_date": "2024-08-01",
                    "due_date": "2024-12-20",
                    "progress": 15,
                },
            ],
        },
        {
            "id": "sow-mw01-left-bank",
            "title": "Left bank - FT",
            "status": "In Progress",
            "progress": 58,
            "clauses": [
                {
                    "id": "clause-mw01-left-1",
                    "title": "Foundation treatment",
                    "status": "In Progress",
                    "lead": "GeoTech",
                    "start_date": "2024-05-12",
                    "due_date": "2024-08-30",
                    "progress": 54,
                }
            ],
        },
        {
            "id": "sow-mw01-right-bank",
            "title": "Right bank diversion & FT",
            "status": "In Progress",
            "progress": 51,
            "clauses": [
                {
                    "id": "clause-mw01-right-1",
                    "title": "Diversion gallery",
                    "status": "In Progress",
                    "lead": "Construction",
                    "start_date": "2024-04-18",
                    "due_date": "2024-09-05",
                    "progress": 48,
                }
            ],
        },
    ],
    "mw-02-rb-powerhouse": [
        {
            "id": "sow-mw02-turbine",
            "title": "Turbine hall excavation",
            "status": "In Progress",
            "progress": 55,
            "clauses": [
                {
                    "id": "clause-mw02-turbine-1",
                    "title": "Rock support works",
                    "status": "In Progress",
                    "lead": "Geotech",
                    "start_date": "2024-05-05",
                    "due_date": "2024-09-01",
                    "progress": 52,
                }
            ],
        },
        {
            "id": "sow-mw02-powerhouse-fitout",
            "title": "Powerhouse fit-out",
            "status": "In Progress",
            "progress": 47,
            "clauses": [],
        }
    ],
    "mw-02-lb-powerhouse": [
        {
            "id": "sow-mw02-mechanical",
            "title": "Mechanical assemblies",
            "status": "Bidding",
            "progress": 34,
            "clauses": [],
        }
    ],
    "em-01-lb": [
        {
            "id": "sow-em01-panels",
            "title": "Panel fabrication",
            "status": "Bidding",
            "progress": 18,
            "clauses": [],
        }
    ],
    "em-01-rb": [
        {
            "id": "sow-em01-cabling",
            "title": "Control cabling",
            "status": "In Progress",
            "progress": 42,
            "clauses": [],
        }
    ],
    "em-02-rb": [
        {
            "id": "sow-em02-switchyard",
            "title": "Switchyard equipment",
            "status": "Pre-PQ",
            "progress": 32,
            "clauses": [],
        }
    ],
    "hm-01": [
        {
            "id": "sow-hm01-gates",
            "title": "Gates fabrication",
            "status": "Bidding",
            "progress": 22,
            "clauses": [],
        },
        {
            "id": "sow-hm01-hydraulics",
            "title": "Hydraulic assemblies",
            "status": "Bidding",
            "progress": 16,
            "clauses": [],
        }
    ],
    "hm-02": [
        {
            "id": "sow-hm02-penstocks",
            "title": "Penstock alignment",
            "status": "Pre-PQ",
            "progress": 12,
            "clauses": [],
        }
    ],
}


def fallback_projects() -> List[Dict[str, object]]:
    return FALLBACK_PROJECTS.copy()


def fallback_project_by_id(project_id: str) -> Optional[Dict[str, object]]:
    for project in FALLBACK_PROJECTS:
        if project["id"] == project_id:
            return project
    return None


def fallback_contracts(project_id: str) -> List[Dict[str, object]]:
    return FALLBACK_CONTRACTS.get(project_id, [])


def fallback_insights(project_id: str) -> Optional[Dict[str, object]]:
    return FALLBACK_INSIGHTS.get(project_id)


def fallback_sows(project_id: str) -> List[Dict[str, object]]:
    results: List[Dict[str, object]] = []
    for contract in fallback_contracts(project_id):
        sections = FALLBACK_SOWS.get(contract["id"], [])
        if sections:
            results.append(
                {
                    "contract_id": contract["id"],
                    "contract_name": contract["name"],
                    "sections": sections,
                }
            )
    return results
