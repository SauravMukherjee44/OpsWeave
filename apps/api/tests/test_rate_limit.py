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


def test_reads_are_not_counted_as_expensive_actions():
    assert policy_for("/v1/projects", "GET") is None
