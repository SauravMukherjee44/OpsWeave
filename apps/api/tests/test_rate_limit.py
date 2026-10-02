from opsweave_api.rate_limit import SignedClientId, policy_for


def test_signed_client_id_rejects_tampering():
    signer = SignedClientId("secret")
    token = signer.encode("a" * 32)
    assert signer.decode(token) == "a" * 32
    assert signer.decode(token + "changed") is None


def test_compilation_has_strict_daily_capacity():
    policy = policy_for("/v1/projects/p1/compilations", "POST")
    assert policy is not None
    assert policy.client[1].requests == 8
    assert policy.tenant[0].requests == 20
    assert policy.global_[0].requests == 40


def test_reads_use_layered_burst_and_abuse_protection():
    policy = policy_for("/v1/projects", "GET")
    assert policy is not None
    assert policy.client[0].requests == 300
    assert policy.client[0].window_seconds == 60
    assert policy.client[1].requests == 25_000
    assert policy.client[1].window_seconds == 86_400
    assert policy.ip[0].requests == 600
    assert policy.ip[1].requests == 50_000
    assert policy.tenant[0].requests == 250_000
    assert policy.global_[0].window_seconds == 60
    assert policy.global_[1].requests == 1_000_000
