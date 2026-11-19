from __future__ import annotations

from app.features.lng_balance.schemas import FilterNode

# The tables only hold a country, so the regions in the filters are defined here. Each country sits
# in one region. A country that is in the data but not listed goes under "Unmapped" rather than
# being dropped, so it can still be filtered and added to the lists below.
Tree = dict[str, "list[str] | Tree"]

LOADING_TREE: Tree = {
    "Atlantic": [
        "Algeria",
        "Angola",
        "Argentina",
        "Belgium",
        "Brazil",
        "Cameroon",
        "Congo",
        "Congo, Democratic Republic of the",
        "Croatia",
        "Dominican Republic",
        "Egypt",
        "Equatorial Guinea",
        "Finland",
        "France",
        "Gabon",
        "Germany",
        "Greece",
        "Jamaica",
        "Libya",
        "Lithuania",
        "Mauritania",
        "Netherlands",
        "Nigeria",
        "Norway",
        "Panama",
        "Portugal",
        "Puerto Rico",
        "Russian Federation",
        "Senegal",
        "Spain",
        "Sweden",
        "Trinidad and Tobago",
        "Turkey",
        "United Kingdom",
        "United States",
        "United States Virgin Islands",
    ],
    "Middle East": ["Oman", "Qatar", "United Arab Emirates", "Yemen"],
    "Pacific": [
        "Australia",
        "Brunei Darussalam",
        "Canada",
        "Chile",
        "China",
        "India",
        "Indonesia",
        "Japan",
        "Malaysia",
        "Mexico",
        "Mozambique",
        "Myanmar",
        "Papua New Guinea",
        "Peru",
        "Singapore",
        "South Korea",
        "Tanzania",
        "Thailand",
    ],
}

DESTINATION_TREE: Tree = {
    "Africa": {
        "North Africa": ["Egypt", "Morocco"],
        "South Africa": ["South Africa"],
        "West Africa": [
            "Congo, Democratic Republic of the",
            "Ghana",
            "Mauritania",
            "Senegal",
        ],
    },
    "America": {
        "North America": [
            "Bahamas",
            "Canada",
            "Cuba",
            "Dominican Republic",
            "El Salvador",
            "Honduras",
            "Jamaica",
            "Mexico",
            "Nicaragua",
            "Panama",
            "Puerto Rico",
            "United States",
            "United States Virgin Islands",
        ],
        "South America": ["Argentina", "Brazil", "Chile", "Colombia", "Ecuador"],
    },
    "Asia Pacific": {
        "Northeast Asia": ["China", "Hong Kong", "Japan", "South Korea", "Taiwan"],
        "South Asia": ["Bangladesh", "India", "Pakistan", "Sri Lanka"],
        "Southeast Asia": [
            "Australia",
            "Indonesia",
            "Malaysia",
            "Myanmar",
            "Papua New Guinea",
            "Philippines",
            "Singapore",
            "Thailand",
            "Vietnam",
        ],
    },
    "Europe": {
        "Baltics": [
            "Estonia",
            "Finland",
            "Lithuania",
            "Poland",
            "Russian Federation",
            "Sweden",
        ],
        "Med Europe": [
            "Croatia",
            "Cyprus",
            "Gibraltar",
            "Greece",
            "Italy",
            "Malta",
            "Portugal",
            "Spain",
            "Turkey",
        ],
        "Northwest Europe": [
            "Belgium",
            "Denmark",
            "France",
            "Germany",
            "Iceland",
            "Netherlands",
            "Norway",
            "United Kingdom",
        ],
    },
    "Global": ["Other"],
    "Middle East": [
        "Bahrain",
        "Iraq",
        "Israel",
        "Jordan",
        "Kuwait",
        "Saudi Arabia",
        "United Arab Emirates",
    ],
}


def _build(tree: Tree, present: set[str], used: set[str]) -> list[FilterNode]:
    nodes: list[FilterNode] = []
    for name, children in tree.items():
        if isinstance(children, dict):
            kids = _build(children, present, used)
        else:
            kids = [FilterNode(name=c) for c in sorted(children) if c in present]
            used.update(c.name for c in kids)
        if kids:
            nodes.append(FilterNode(name=name, children=kids))
    return nodes


def build_filter_tree(tree: Tree, countries: set[str]) -> list[FilterNode]:
    """The tree limited to the countries in the data, with any unlisted country under "Unmapped"."""
    used: set[str] = set()
    nodes = _build(tree, countries, used)
    unmapped = sorted(countries - used)
    if unmapped:
        nodes.append(
            FilterNode(name="Unmapped", children=[FilterNode(name=c) for c in unmapped])
        )
    return nodes
