"""Deterministic experience-duration parsing from free-text date ranges.

Resumes write date ranges many ways:
  ``Mar 2022 - Present``, ``Sep 2020 – Feb 2022``, ``03/2020 - 06/2022``,
  ``01/03/2020 to 15/06/2022``, ``2018 - 2021``.

We only ever need **month + year** to total up experience, so the day in a
slash date is read but ignored (which also sidesteps the MM/DD vs DD/MM
ambiguity). Overlapping ranges are merged so concurrent roles aren't
double-counted.
"""
import re
from datetime import datetime

_YEAR = r"(?:19|20)\d{2}"
# Open-ended end markers; "date" covers "to date" / "till date".
_OPEN = r"present|current|now|ongoing|date"
_SEP = r"\s*(?:[-–—]|to|till|until)\s*"
_MONTH_NAME = (
    r"(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|"
    r"jul(?:y)?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?"
)
# First three letters of any month word -> month number (sept/september -> sep).
_MONTHS = {
    "jan": 1, "feb": 2, "mar": 3, "apr": 4, "may": 5, "jun": 6,
    "jul": 7, "aug": 8, "sep": 9, "oct": 10, "nov": 11, "dec": 12,
}

_MM = r"(?:0?[1-9]|1[0-2])"  # numeric month 1-12

# An endpoint is one of: a numeric/slash/ISO date, a month name + year
# ("Mar 2022"), or a bare year. Only month + year are ever used; the day in a
# full date is read but discarded. Numeric forms are listed first (most
# specific) so e.g. "2022-03" parses as ISO year-month, not the bare year 2022.
_NUM_DATE = (
    rf"{_YEAR}[/-]\d{{1,2}}[/-]\d{{1,2}}"    # yyyy/mm/dd
    rf"|\d{{1,2}}[/-]\d{{1,2}}[/-]{_YEAR}"   # dd/mm/yyyy or mm/dd/yyyy
    rf"|{_YEAR}[/-]{_MM}(?!\d)"              # yyyy-mm / yyyy/mm (ISO)
    rf"|{_MM}[/-]{_YEAR}"                    # mm/yyyy or mm-yyyy
)
_ENDPOINT = rf"(?:{_NUM_DATE}|(?:{_MONTH_NAME}\s+)?{_YEAR})"

# A range = start endpoint, separator, end endpoint. Endpoints are captured raw
# and resolved by ``_parse_endpoint``.
_RANGE_RE = re.compile(
    rf"({_ENDPOINT}){_SEP}({_ENDPOINT}|{_OPEN})",
    re.IGNORECASE,
)


def _index(year, month):
    """Absolute month index; month clamped to a valid 1-12 (else January)."""
    if not 1 <= month <= 12:
        month = 1
    return year * 12 + (month - 1)


def _year_month_from_numeric(parts):
    """(year, month) from the numeric components of a slash/ISO date.

    Three parts -> the 4-digit value is the year; of the remaining two, a value
    > 12 must be the day. When both are <= 12 the order is ambiguous, so we
    default to day/month (the day is discarded anyway). Two parts -> mm/yyyy or
    yyyy/mm.
    """
    nums = [int(p) for p in parts]
    if len(nums) == 3:
        if nums[0] > 31:  # yyyy/mm/dd
            return nums[0], nums[1]
        year, a, b = nums[2], nums[0], nums[1]
        if a > 12:        # a is the day, b the month
            return year, b
        if b > 12:        # b is the day, a the month
            return year, a
        return year, b    # ambiguous -> assume dd/mm
    # two parts
    if nums[0] > 31:      # yyyy-mm
        return nums[0], nums[1]
    return nums[1], nums[0]  # mm/yyyy


def _parse_endpoint(token):
    """A raw endpoint string -> absolute month index (year*12 + month-1), or None.

    Month is January when only a year is given. Open-ended markers resolve to
    the current month.
    """
    token = token.strip().lower()
    if not token:
        return None
    if re.fullmatch(_OPEN, token):
        now = datetime.now()
        return _index(now.year, now.month)
    parts = re.split(r"[/-]", token)
    if len(parts) > 1 and all(p.isdigit() for p in parts):
        year, month = _year_month_from_numeric(parts)
        return _index(year, month)
    ym = re.search(_YEAR, token)
    if not ym:
        return None
    year = int(ym.group())
    month = 1
    name = re.match(r"[a-z]+", token)
    if name:
        month = _MONTHS.get(name.group()[:3], 1)
    return _index(year, month)


def find_date_ranges(text):
    """All (start_month_index, end_month_index) ranges detected in ``text``."""
    ranges = []
    for m in _RANGE_RE.finditer(text):
        start = _parse_endpoint(m.group(1))
        end = _parse_endpoint(m.group(2))
        if start is None or end is None:
            continue
        ranges.append((start, end))
    return ranges


def _merge_months(ranges):
    """Total months covered by the ranges, merging overlaps. Drops bad spans."""
    intervals = sorted(
        (s, e) for s, e in ranges if 0 <= e - s <= 50 * 12
    )
    total = 0
    cur_start = cur_end = None
    for s, e in intervals:
        if cur_end is None or s > cur_end:
            if cur_end is not None:
                total += cur_end - cur_start
            cur_start, cur_end = s, e
        else:
            cur_end = max(cur_end, e)
    if cur_end is not None:
        total += cur_end - cur_start
    return total


def total_experience_years(text):
    """Rough total years of experience by merging detected date ranges."""
    if not text:
        return 0.0
    months = _merge_months(find_date_ranges(text))
    return round(months / 12.0, 1)
