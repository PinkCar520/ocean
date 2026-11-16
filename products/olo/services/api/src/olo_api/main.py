from contextlib import asynccontextmanager

from fastapi import FastAPI, Header, HTTPException, Response

from .migrations import apply_migrations
from .models import (
    ActionCreateModel,
    ActionResultModel,
    CapabilityModel,
    IntentModel,
    ObservationModel,
    PermissionDecisionModel,
)
from .repository import (
    InMemoryControlPlaneRepository,
    PostgresControlPlaneRepository,
    RepositoryConflict,
    RepositoryNotFound,
    RepositoryPermissionDenied,
    build_repository,
)

repository = build_repository()


@asynccontextmanager
async def lifespan(_app: FastAPI):
    if isinstance(repository, PostgresControlPlaneRepository):
        apply_migrations(repository.database_url)
    yield


app = FastAPI(title="OLO Control Plane API", version="0.1.0", lifespan=lifespan)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "repository": type(repository).__name__}


@app.post("/v1/observations", status_code=201)
def ingest_observation(
    model: ObservationModel,
    response: Response,
    idempotency_key: str = Header(alias="Idempotency-Key"),
) -> dict[str, object]:
    try:
        identifier, created = repository.ingest_observation(model, idempotency_key)
    except RepositoryConflict as error:
        raise HTTPException(status_code=409, detail=str(error)) from error
    if not created:
        response.status_code = 200
    return {"id": identifier, "created": created}


@app.get("/v1/context/views/current")
def current_context(subjectId: str) -> dict[str, object]:
    return repository.current_context(subjectId)


@app.post("/v1/intents", status_code=201)
def create_intent(
    model: IntentModel,
    response: Response,
    idempotency_key: str = Header(alias="Idempotency-Key"),
) -> dict[str, object]:
    try:
        task, created = repository.create_intent(model, idempotency_key)
    except RepositoryConflict as error:
        raise HTTPException(status_code=409, detail=str(error)) from error
    if not created:
        response.status_code = 200
    return {"id": task["id"], "status": task["status"], "created": created}


@app.get("/v1/tasks/{task_id}")
def get_task(task_id: str) -> dict[str, object]:
    try:
        return repository.get_task(task_id)
    except RepositoryNotFound as error:
        raise HTTPException(status_code=404, detail=str(error)) from error


@app.post("/v1/bodies/{body_id}/capabilities", status_code=201)
def register_capability(body_id: str, model: CapabilityModel) -> dict[str, object]:
    repository.register_capability(body_id, model)
    return {"bodyId": body_id, "capability": model.capability, "available": True}


@app.post("/v1/plans/{plan_id}/decisions")
def decide_plan(plan_id: str, model: PermissionDecisionModel) -> dict[str, object]:
    try:
        repository.decide_plan(plan_id, model)
    except RepositoryConflict as error:
        raise HTTPException(status_code=409, detail=str(error)) from error
    return {
        "planId": plan_id,
        "planRevision": model.planRevision,
        "decision": model.decision,
        "reason": model.reason,
    }


@app.post("/v1/actions", status_code=201)
def create_action(
    model: ActionCreateModel,
    response: Response,
    idempotency_key: str = Header(alias="Idempotency-Key"),
) -> dict[str, object]:
    if idempotency_key != model.requestId:
        raise HTTPException(status_code=400, detail="idempotency key must equal requestId")
    try:
        action, created = repository.create_action(model)
    except RepositoryPermissionDenied as error:
        raise HTTPException(status_code=403, detail=str(error)) from error
    except RepositoryNotFound as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    except RepositoryConflict as error:
        raise HTTPException(status_code=409, detail=str(error)) from error
    if not created:
        response.status_code = 200
    return {**action, "created": created}


@app.post("/v1/actions/{action_id}/results")
def record_action_result(action_id: str, model: ActionResultModel) -> dict[str, object]:
    try:
        return repository.transition_action(action_id, model)
    except RepositoryNotFound as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    except RepositoryConflict as error:
        raise HTTPException(status_code=409, detail=str(error)) from error


@app.get("/v1/actions/{action_id}/receipt")
def get_action_receipt(action_id: str) -> dict[str, object]:
    try:
        return repository.action_receipt(action_id)
    except RepositoryNotFound as error:
        raise HTTPException(status_code=404, detail=str(error)) from error


def reset_in_memory_repository_for_testing() -> None:
    if not isinstance(repository, InMemoryControlPlaneRepository):
        raise TypeError("test reset is only available for the in-memory repository")
    repository.reset()
