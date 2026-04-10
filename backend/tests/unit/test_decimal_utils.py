"""Unit tests for decimal utility helpers."""
from __future__ import annotations

from decimal import Decimal

import pytest

from app.utils.decimal_utils import pct, to_dec, to_wire


class TestToDec:
    def test_from_string(self):
        assert to_dec("0.8432") == Decimal("0.8432")

    def test_from_int(self):
        assert to_dec(5) == Decimal("5")

    def test_from_float_safe(self):
        # Must convert via str to avoid float precision issues
        result = to_dec(0.1)
        assert result == Decimal("0.1")

    def test_large_value(self):
        assert to_dec("123456789.12345678") == Decimal("123456789.12345678")


class TestToWire:
    def test_rounds_down(self):
        # 1/3 should be truncated, not rounded up
        val = Decimal("1") / Decimal("3")
        result = to_wire(val, precision=8)
        assert Decimal(result) <= val

    def test_strips_trailing_zeros(self):
        result = to_wire(Decimal("1.50000000"))
        assert result == "1.5"

    def test_eight_decimal_precision(self):
        result = to_wire(Decimal("0.123456789"), precision=8)
        # Should be truncated to 8 decimal places
        assert len(result.split(".")[-1]) <= 8

    def test_hedge_amount_from_spec(self):
        """0.1 SOL * 0.75 = 0.075 exactly."""
        amount = Decimal("0.1") * Decimal("0.75")
        assert to_wire(amount) == "0.075"


class TestPct:
    def test_cross_mmr_to_percentage(self):
        assert pct("0.8432") == Decimal("84.32")

    def test_zero(self):
        assert pct("0") == Decimal("0")

    def test_one(self):
        assert pct("1.0") == Decimal("100.0")
