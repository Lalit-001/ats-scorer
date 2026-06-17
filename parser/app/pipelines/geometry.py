"""Axis-aligned bounding-box helpers used to match hyperlinks to image icons.

A box is a 4-tuple/list [x0, y0, x1, y1] in PDF point coordinates.
"""

Box = "list[float]"


def _area(b) -> float:
    return max(0.0, b[2] - b[0]) * max(0.0, b[3] - b[1])


def _intersection_area(a, b) -> float:
    x0 = max(a[0], b[0])
    y0 = max(a[1], b[1])
    x1 = min(a[2], b[2])
    y1 = min(a[3], b[3])
    if x1 <= x0 or y1 <= y0:
        return 0.0
    return (x1 - x0) * (y1 - y0)


def overlap_ratio(a, b) -> float:
    """Intersection area divided by the area of the smaller box.

    Using the smaller box as the denominator means a small link sitting on top
    of a large image icon scores ~1.0, which is what icon-link detection wants.
    """
    inter = _intersection_area(a, b)
    if inter == 0.0:
        return 0.0
    smaller = min(_area(a), _area(b))
    if smaller == 0.0:
        return 0.0
    return inter / smaller


def boxes_overlap(a, b, threshold: float = 0.5) -> bool:
    return overlap_ratio(a, b) >= threshold
