"""
Unit tests for the Fernet encryption layer.
Verifies encrypt/decrypt round-trip, tamper detection, and key validation.
"""
from __future__ import annotations

import os
from unittest.mock import patch

import pytest
from cryptography.fernet import Fernet


class TestEncryption:
    """Tests run with a real Fernet key (generated per test — no env dependency)."""

    @pytest.fixture(autouse=True)
    def _patch_settings(self):
        """Inject a fresh Fernet key for each test so tests are isolated."""
        from app.core import encryption
        key = Fernet.generate_key().decode()
        # Reset LRU cache so each test gets a fresh Fernet instance
        encryption._get_fernet.cache_clear()
        with patch("app.core.encryption.get_settings") as mock_settings:
            mock_settings.return_value.fernet_master_key = key
            yield
        encryption._get_fernet.cache_clear()

    def test_roundtrip_bytes(self):
        from app.core.encryption import decrypt, encrypt
        original = b"\x00\x01\x02hello world\xff"
        token = encrypt(original)
        assert decrypt(token) == original

    def test_token_is_string(self):
        from app.core.encryption import encrypt
        token = encrypt(b"test data")
        assert isinstance(token, str)

    def test_token_is_decodable_utf8(self):
        from app.core.encryption import encrypt
        token = encrypt(b"test")
        token.encode("utf-8")  # must not raise

    def test_different_plaintexts_different_tokens(self):
        from app.core.encryption import encrypt
        t1 = encrypt(b"aaa")
        t2 = encrypt(b"bbb")
        assert t1 != t2

    def test_same_plaintext_different_tokens_each_call(self):
        """Fernet uses a random IV — same plaintext produces different ciphertext."""
        from app.core.encryption import encrypt
        t1 = encrypt(b"same data")
        t2 = encrypt(b"same data")
        assert t1 != t2  # IVs differ

    def test_decrypt_tampered_token_raises(self):
        from app.core.encryption import decrypt, encrypt
        token = encrypt(b"secret")
        # Tamper: flip a character in the middle
        mid = len(token) // 2
        tampered = token[:mid] + ("X" if token[mid] != "X" else "Y") + token[mid + 1:]
        with pytest.raises(ValueError, match="Decryption failed"):
            decrypt(tampered)

    def test_decrypt_random_string_raises(self):
        from app.core.encryption import decrypt
        with pytest.raises(ValueError, match="Decryption failed"):
            decrypt("not-a-valid-fernet-token")

    def test_64_byte_agent_key_roundtrip(self):
        """Specifically test the 64-byte Ed25519 private key format Aegis uses."""
        from app.core.encryption import decrypt, encrypt
        private_key_bytes = os.urandom(64)
        token = encrypt(private_key_bytes)
        recovered = decrypt(token)
        assert recovered == private_key_bytes
        assert len(recovered) == 64

    def test_missing_fernet_key_raises_at_init(self):
        from app.core import encryption
        encryption._get_fernet.cache_clear()
        with patch("app.core.encryption.get_settings") as mock_settings:
            mock_settings.return_value.fernet_master_key = ""
            with pytest.raises(RuntimeError, match="FERNET_MASTER_KEY"):
                encryption._get_fernet()
        encryption._get_fernet.cache_clear()
