"""
Helpers for working with Pacifica's string-decimal wire format.
All arithmetic uses Python's Decimal to avoid float precision errors.
"""
from __future__ import annotations

from decimal import ROUND_DOWN, Decimal


def to_dec(value: str | int | float) -> Decimal:
    """Convert any numeric input to Decimal safely."""
    return Decimal(str(value))


def to_wire(value: Decimal, precision: int = 8) -> str:
    """
    Convert a Decimal to Pacifica's wire format string.
    Strips trailing zeros, minimum 1 decimal place.
    """
    quantizer = Decimal(10) ** -precision
    rounded = value.quantize(quantizer, rounding=ROUND_DOWN)
    # Normalize and ensure at least one decimal digit
    normalized = rounded.normalize()
    if "." not in str(normalized):
        normalized = Decimal(str(normalized) + ".0")
    return str(normalized)


def pct(value: str) -> Decimal:
    """Parse a string decimal into a percentage as a fraction (e.g. '0.85' → 85%)."""
    return to_dec(value) * Decimal("100")
