from opsweave_api.rate_limit import SignedClientId, policy_for


def test_signed_client_id_rejects_tampering():
    signer = SignedClientId("secret")
    token = signer.encode("a" * 32)
    assert signer.decode(token) == "a" * 32
    assert signer.decode(token + "changed") is None


def test_compilation_has_strict_daily_capacity():
    policy = policy_for("/v1/projects/p1/compilations", "POST")
    assert policy is not None
    assert policy.client[1].requests == 2
    assert policy.tenant[0].requests == 5
    assert policy.global_[0].requests == 8


def test_reads_use_layered_burst_and_abuse_protection():
    policy = policy_for("/v1/projects", "GET")
    assert policy is not None
    assert policy.client[0].requests == 300
    assert policy.client[0].window_seconds == 60
    assert policy.client[1].requests == 10_000
    assert policy.client[1].window_seconds == 86_400
    assert policy.ip[0].requests == 600
    assert policy.ip[1].requests == 50_000
    assert policy.tenant[0].requests == 100_000
    assert policy.global_[0].window_seconds == 60
    assert policy.global_[1].requests == 30_000


def test_public_static_and_health_reads_share_the_global_cost_guard():
    assert policy_for("/", "GET") is not None
    assert policy_for("/health", "GET") is not None
    assert policy_for("/_next/static/app.js", "GET") is not None


def test_expensive_io_has_free_tier_oriented_daily_caps():
    upload = policy_for("/v1/projects/p1/artifacts", "POST")
    preview = policy_for("/v1/artifacts/a1/preview-url", "GET")
    execution = policy_for("/v1/executions", "POST")
    evaluation = policy_for("/v1/workflows/w1/evaluations", "POST")
    assert upload and upload.global_[0].requests == 30
    assert preview and preview.global_[0].requests == 500
    assert execution and execution.global_[0].requests == 50
    assert evaluation and evaluation.global_[0].requests == 20
