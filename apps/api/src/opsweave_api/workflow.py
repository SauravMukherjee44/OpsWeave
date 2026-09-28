from collections import deque
from enum import StrEnum
from typing import Any, Literal

from pydantic import BaseModel, Field, model_validator


class NodeType(StrEnum):
    TRIGGER = "trigger"
    EXTRACT = "extract"
    RETRIEVE = "retrieve"
    RULE = "rule"
    AGENT = "agent"
    TRANSFORM = "transform"
    TOOL = "tool"
    APPROVAL = "approval"
    WAIT_FOR_EVENT = "wait_for_event"
    NOTIFICATION = "notification"
    TERMINAL = "terminal"


class RetryPolicy(BaseModel):
    max_attempts: int = Field(default=1, ge=1, le=5)
    backoff_seconds: int = Field(default=1, ge=1, le=300)


class WorkflowNode(BaseModel):
    id: str = Field(pattern=r"^[a-z][a-z0-9_-]{1,63}$")
    type: NodeType
    name: str = Field(min_length=2, max_length=120)
    config: dict[str, Any] = Field(default_factory=dict)
    timeout_seconds: int = Field(default=60, ge=1, le=86_400)
    retry: RetryPolicy = Field(default_factory=RetryPolicy)


class WorkflowEdge(BaseModel):
    source: str
    target: str
    condition: str | None = None
    on: Literal["success", "failure", "timeout"] = "success"


class DeploymentGates(BaseModel):
    minimum_citation_accuracy: float = Field(default=.95, ge=0, le=1)
    minimum_escalation_recall: float = Field(default=.95, ge=0, le=1)
    maximum_unauthorized_actions: int = Field(default=0, ge=0)


class WorkflowDefinition(BaseModel):
    schema_version: Literal["1.0"] = "1.0"
    id: str = Field(pattern=r"^[a-z][a-z0-9_-]{2,79}$")
    version: int = Field(ge=1)
    name: str = Field(min_length=3, max_length=180)
    nodes: list[WorkflowNode] = Field(min_length=2)
    edges: list[WorkflowEdge] = Field(min_length=1)
    deployment_gates: DeploymentGates = Field(default_factory=DeploymentGates)

    @model_validator(mode="after")
    def validate_graph(self):
        node_by_id = {node.id: node for node in self.nodes}
        if len(node_by_id) != len(self.nodes):
            raise ValueError("Node ids must be unique")

        triggers = [node for node in self.nodes if node.type == NodeType.TRIGGER]
        if len(triggers) != 1:
            raise ValueError("A workflow must contain exactly one trigger")

        terminals = [node for node in self.nodes if node.type == NodeType.TERMINAL]
        if not terminals:
            raise ValueError("A workflow must contain at least one terminal node")

        outgoing: dict[str, list[str]] = {node.id: [] for node in self.nodes}
        for edge in self.edges:
            if edge.source not in node_by_id or edge.target not in node_by_id:
                raise ValueError(f"Edge references an unknown node: {edge.source} -> {edge.target}")
            outgoing[edge.source].append(edge.target)

        for terminal in terminals:
            if outgoing[terminal.id]:
                raise ValueError(f"Terminal node {terminal.id} cannot have outgoing edges")

        visited: set[str] = set()
        queue = deque([triggers[0].id])
        while queue:
            node_id = queue.popleft()
            if node_id in visited:
                continue
            visited.add(node_id)
            queue.extend(outgoing[node_id])
        unreachable = set(node_by_id) - visited
        if unreachable:
            raise ValueError(f"Unreachable nodes: {', '.join(sorted(unreachable))}")

        return self
