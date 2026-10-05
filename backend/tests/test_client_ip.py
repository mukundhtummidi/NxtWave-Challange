"""Rate-limit key must not be spoofable via a client-supplied X-Forwarded-For prefix."""
from types import SimpleNamespace

import server


def _req(xff=None, host="10.4.0.1"):
    headers = {"x-forwarded-for": xff} if xff else {}
    return SimpleNamespace(headers=headers, client=SimpleNamespace(host=host))


def test_real_client_through_cloudflare_and_lb():
    assert server.client_ip(_req("8.234.132.150,172.68.138.241,34.8.246.104")) == "8.234.132.150"


def test_extra_lb_hop():
    assert server.client_ip(_req("8.234.132.150,172.68.245.222,34.8.246.104, 35.191.126.82")) == "8.234.132.150"


def test_spoofed_prefix_is_ignored():
    assert server.client_ip(_req("1.2.3.4, 5.5.5.5,8.234.132.150,104.22.100.168,34.8.246.104")) == "8.234.132.150"


def test_no_header_uses_socket_peer():
    assert server.client_ip(_req(None, host="127.0.0.1")) == "127.0.0.1"
