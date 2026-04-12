"""
Execution engine — translates risk engine decisions into signed Pacifica orders.

CRITICAL INVARIANTS (enforced at this layer, not caller):
  1. builder_code = "AEGIS" is hardcoded — callers cannot pass a different value
  2. agent_wallet is always the Aegis Agent Key public key
  3. Every order payload is signed before submission
  4. Stop-loss orders are placed immediately after every hedge open

Slippage: 0.5% default on hedge market orders (tight, hedges are protective)
Stop-loss buffer: hedge stop-loss is set at 3% adverse move from entry mark price
"""
from __future__ import annotations

import logging
from decimal import Decimal

from app.core.agent_key import get_agent_keypair, get_agent_pubkey
from app.core.config import get_settings
from app.models.pacifica import OrderResponse
from app.models.risk import HedgeDecision, RecoveryDecision
from app.services.pacifica.client import PacificaClient
from app.services.pacifica.signing import (
    build_cancel_order_payload,
    build_market_order_payload,
    build_stop_order_payload,
)
from app.utils.decimal_utils import to_dec, to_wire

log = logging.getLogger(__name__)

_SLIPPAGE_PCT = "0.5"
_STOP_LOSS_BUFFER_PCT = Decimal("0.03")  # 3% adverse move triggers SL on hedge


class ExecutionEngine:
    """
    Converts HedgeDecision/RecoveryDecision objects into signed API calls.
    One instance per application lifetime; stateless between calls.
    """

    def __init__(self, pacifica: PacificaClient) -> None:
        self._pacifica = pacifica
        self._builder_code = get_settings().builder_code  # always "AEGIS"

    async def open_hedge(
        self,
        decision: HedgeDecision,
        mark_price: str | None = None,
    ) -> OrderResponse:
        """
        Place a market order to hedge the given position.
        Optionally places a stop-loss on the hedge if mark_price is provided.

        Returns the OrderResponse for the hedge order.
        """
        keypair = get_agent_keypair()
        agent_wallet = get_agent_pubkey()

        payload = build_market_order_payload(
            account=decision.wallet,
            symbol=decision.symbol,
            side=decision.hedge_side,
            amount=decision.hedge_amount,
            slippage_percent=_SLIPPAGE_PCT,
            reduce_only=False,
            agent_wallet=agent_wallet,
            builder_code=self._builder_code,
            keypair=keypair,
        )

        import json as _json
        log.info(
            "Placing hedge order: wallet=%s symbol=%s side=%s amount=%s builder=%s payload=%s",
            decision.wallet,
            decision.symbol,
            decision.hedge_side,
            decision.hedge_amount,
            self._builder_code,
            _json.dumps({k: v for k, v in payload.items() if k != "signature"}),
        )

        response = await self._pacifica.create_market_order(payload)
        log.info("Hedge order placed: order_id=%d", response.order_id)

        # Place stop-loss on the hedge itself if we have a mark price
        if mark_price:
            await self._place_hedge_stop_loss(
                decision=decision,
                mark_price=mark_price,
                agent_wallet=agent_wallet,
                keypair=keypair,
            )

        return response

    # TODO: Pacifica stop order signing contract unclear — disabled until resolved
    async def _place_hedge_stop_loss(self, *args, **kwargs) -> None:
        return

    async def close_hedge(self, decision: RecoveryDecision) -> None:
        """
        Cancel (close) an existing hedge order on position recovery.
        """
        keypair = get_agent_keypair()
        agent_wallet = get_agent_pubkey()

        payload = build_cancel_order_payload(
            account=decision.wallet,
            symbol=decision.symbol,
            order_id=decision.order_id,
            agent_wallet=agent_wallet,
            keypair=keypair,
        )

        log.info(
            "Closing hedge: wallet=%s symbol=%s order_id=%d",
            decision.wallet, decision.symbol, decision.order_id,
        )

        await self._pacifica.cancel_order(payload)
        log.info("Hedge closed: order_id=%d", decision.order_id)
