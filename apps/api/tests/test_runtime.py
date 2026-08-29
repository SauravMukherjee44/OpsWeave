from decimal import Decimal

from opsweave_api.runtime import build_evaluation_cases, dynamo_safe, json_safe


def test_json_safe_serializes_dynamodb_numbers_recursively():
    assert json_safe({"whole": Decimal("3"), "fraction": Decimal("0.96"), "items": [Decimal("2.5")]}) == {
        "whole": 3,
        "fraction": 0.96,
        "items": [2.5],
    }


def test_dynamo_safe_converts_nested_floats():
    assert dynamo_safe({"amount": 219.0, "scores": [0.96]}) == {
        "amount": Decimal("219.0"),
        "scores": [Decimal("0.96")],
    }


def test_evaluation_matrix_contains_60_labeled_cases():
    cases = build_evaluation_cases()
    assert len(cases) == 60
    assert {case["group"] for case in cases} == {"standard", "ambiguous", "incomplete", "adversarial"}
    assert sum(case["requires_escalation"] for case in cases) == 43
