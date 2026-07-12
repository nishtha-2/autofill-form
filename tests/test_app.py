import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app import get_server_port


def test_get_server_port_prefers_env(monkeypatch):
    monkeypatch.setenv("PORT", "5001")
    assert get_server_port() == 5001


def test_get_server_port_defaults_to_5001(monkeypatch):
    monkeypatch.delenv("PORT", raising=False)
    assert get_server_port() == 5001
